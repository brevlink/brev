"""Authentication, email verification, password recovery, and sessions."""

from __future__ import annotations

import secrets
import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import quote, urlsplit, urlunsplit

from fastapi import HTTPException, status
from sqlalchemy import exists, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_opaque_token,
    hash_password,
    hash_session_jti,
    verify_password,
)
from app.models.auth import AuthToken, Session
from app.models.user import User
from app.schemas.auth import (
    LoginResponse,
    MessageResponse,
    PasswordChangeRequest,
    PasswordResetConfirm,
    RegisterRequest,
    RegisterResponse,
)
from app.services.mailer import MailDeliveryError, mailer

EMAIL_VERIFICATION = "email_verification"
PASSWORD_RESET = "password_reset"


def _email(value: str) -> str:
    return value.strip().casefold()


def _frontend_token_url(base_url: str | None, token: str) -> str:
    if not base_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Frontend authentication URLs are not configured",
        )
    parsed = urlsplit(base_url)
    if parsed.fragment:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Frontend authentication URLs must not contain a fragment",
        )
    # Fragments are available to the frontend but are not sent in HTTP
    # requests, avoiding token disclosure in application/proxy access logs.
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, parsed.query, f"token={quote(token, safe='')}"))


def _require_frontend_auth_urls() -> None:
    if not settings.frontend_verification_url or not settings.frontend_password_reset_url:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Frontend authentication URLs are not configured",
        )


def _hash_new_password(password: str) -> str:
    try:
        return hash_password(password)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


async def _ensure_mailer() -> None:
    try:
        mailer.ensure_available()
    except MailDeliveryError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Transactional email is not configured",
        ) from exc


async def _send_mail(*, recipient: str, subject: str, text: str) -> None:
    try:
        await mailer.send(recipient=recipient, subject=subject, text=text)
    except MailDeliveryError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Transactional email is temporarily unavailable",
        ) from exc
    except Exception:
        # Do not leak provider details or token contents to clients/logging.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Transactional email is temporarily unavailable",
        ) from None


async def _issue_token(
    db: AsyncSession,
    user: User,
    *,
    purpose: str,
    ttl_minutes: int,
) -> str:
    now = datetime.now(UTC)
    await db.execute(
        update(AuthToken)
        .where(
            AuthToken.user_id == user.id,
            AuthToken.purpose == purpose,
            AuthToken.used_at.is_(None),
        )
        .values(used_at=now)
    )
    token = secrets.token_urlsafe(32)
    db.add(
        AuthToken(
            user_id=user.id,
            purpose=purpose,
            token_hash=hash_opaque_token(token),
            expires_at=now + timedelta(minutes=ttl_minutes),
        )
    )
    await db.flush()
    return token


async def _consume_token(db: AsyncSession, token: str, purpose: str) -> AuthToken:
    now = datetime.now(UTC)
    result = await db.execute(
        select(AuthToken)
        .where(
            AuthToken.purpose == purpose,
            AuthToken.token_hash == hash_opaque_token(token),
            AuthToken.used_at.is_(None),
            AuthToken.expires_at > now,
        )
        .with_for_update()
    )
    auth_token = result.scalar_one_or_none()
    if auth_token is None:
        raise HTTPException(status_code=404, detail="Invalid or expired token")
    auth_token.used_at = now
    await db.flush()
    return auth_token


async def _inspect_token(db: AsyncSession, token: str, purpose: str) -> AuthToken:
    """Validate a token without consuming it; used only by safe GET bootstrap."""
    result = await db.execute(
        select(AuthToken).where(
            AuthToken.purpose == purpose,
            AuthToken.token_hash == hash_opaque_token(token),
            AuthToken.used_at.is_(None),
            AuthToken.expires_at > datetime.now(UTC),
        )
    )
    auth_token = result.scalar_one_or_none()
    if auth_token is None:
        raise HTTPException(status_code=404, detail="Invalid or expired token")
    return auth_token


async def _revoke_user_sessions(db: AsyncSession, user_id: uuid.UUID) -> None:
    await db.execute(
        update(Session)
        .where(Session.user_id == user_id, Session.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )


async def _bootstrap_admin_lock(db: AsyncSession) -> bool:
    """Serialize first-admin selection on PostgreSQL and use a unique index backstop."""
    bind = db.sync_session.get_bind()
    if bind.dialect.name == "postgresql":
        await db.execute(text("SELECT pg_advisory_xact_lock(8247351)"))
    return not bool(await db.scalar(select(exists().where(User.is_admin.is_(True)))))


async def register(db: AsyncSession, body: RegisterRequest) -> RegisterResponse:
    await _ensure_mailer()
    _require_frontend_auth_urls()
    email = _email(body.email)
    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already registered")

    is_first_user = await _bootstrap_admin_lock(db)
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=_hash_new_password(body.password),
        display_name=body.display_name,
        is_admin=is_first_user,
    )
    db.add(user)
    await db.flush()
    token = await _issue_token(
        db, user, purpose=EMAIL_VERIFICATION,
        ttl_minutes=settings.email_verification_expire_minutes,
    )
    await _send_mail(
        recipient=user.email,
        subject="Verify your Brev email",
        text=(
            "Verify your Brev email using this link:\n"
            f"{_frontend_token_url(settings.frontend_verification_url, token)}\n\n"
            "This link expires soon and can only be used once."
        ),
    )
    return RegisterResponse(id=str(user.id), email=user.email, display_name=user.display_name)


async def login(db: AsyncSession, email: str, password: str) -> LoginResponse:
    result = await db.execute(select(User).where(User.email == _email(email)))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(str(user.id))
    payload = decode_access_token(token)
    db.add(
        Session(
            user_id=user.id,
            jti_hash=hash_session_jti(payload.jti),
            expires_at=payload.exp,
        )
    )
    await db.flush()
    return LoginResponse(
        access_token=token,
        user=RegisterResponse(id=str(user.id), email=user.email, display_name=user.display_name),
    )


async def get_user_by_id(db: AsyncSession, user_id: str) -> User | None:
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        return None
    result = await db.execute(select(User).where(User.id == uid))
    return result.scalar_one_or_none()


async def get_session_by_jti(db: AsyncSession, jti: str) -> Session | None:
    result = await db.execute(
        select(Session).where(
            Session.jti_hash == hash_session_jti(jti),
            Session.revoked_at.is_(None),
            Session.expires_at > datetime.now(UTC),
        )
    )
    return result.scalar_one_or_none()


async def revoke_session(db: AsyncSession, session: Session) -> None:
    if session.revoked_at is None:
        session.revoked_at = datetime.now(UTC)
        await db.flush()


async def verify_email(db: AsyncSession, token: str) -> User:
    auth_token = await _consume_token(db, token, EMAIL_VERIFICATION)
    user = await db.get(User, auth_token.user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="Invalid or expired token")
    user.is_verified = True
    user.email_verified_at = datetime.now(UTC)
    await db.flush()
    return user


async def inspect_email_verification(db: AsyncSession, token: str) -> datetime:
    auth_token = await _inspect_token(db, token, EMAIL_VERIFICATION)
    return auth_token.expires_at


async def resend_verification(db: AsyncSession, user: User) -> None:
    if user.is_verified:
        return
    _require_frontend_auth_urls()
    token = await _issue_token(
        db, user, purpose=EMAIL_VERIFICATION,
        ttl_minutes=settings.email_verification_expire_minutes,
    )
    await _send_mail(
        recipient=user.email,
        subject="Verify your Brev email",
        text=f"Verify your Brev email:\n{_frontend_token_url(settings.frontend_verification_url, token)}",
    )


async def request_password_reset(db: AsyncSession, email: str) -> MessageResponse:
    await _ensure_mailer()
    _require_frontend_auth_urls()
    result = await db.execute(select(User).where(User.email == _email(email), User.is_active.is_(True)))
    user = result.scalar_one_or_none()
    if user is not None:
        token = await _issue_token(
            db, user, purpose=PASSWORD_RESET,
            ttl_minutes=settings.password_reset_expire_minutes,
        )
        await _send_mail(
            recipient=user.email,
            subject="Reset your Brev password",
            text=(
                "Reset your Brev password using this link:\n"
                f"{_frontend_token_url(settings.frontend_password_reset_url, token)}\n\n"
                "This link expires soon and can only be used once."
            ),
        )
    return MessageResponse(message="If the account exists, reset instructions have been sent")


async def inspect_password_reset(db: AsyncSession, token: str) -> datetime:
    auth_token = await _inspect_token(db, token, PASSWORD_RESET)
    return auth_token.expires_at


async def reset_password(db: AsyncSession, body: PasswordResetConfirm) -> MessageResponse:
    auth_token = await _consume_token(db, body.token, PASSWORD_RESET)
    user = await db.get(User, auth_token.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=404, detail="Invalid or expired token")
    user.password_hash = _hash_new_password(body.new_password)
    await _revoke_user_sessions(db, user.id)
    await db.flush()
    return MessageResponse(message="Password updated")


async def change_password(db: AsyncSession, user: User, body: PasswordChangeRequest) -> MessageResponse:
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = _hash_new_password(body.new_password)
    await _revoke_user_sessions(db, user.id)
    await db.flush()
    return MessageResponse(message="Password updated")
