"""Shared authentication dependencies."""

from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.auth import Session
from app.models.user import User
from app.services.api_keys import get_user_id_for_api_key
from app.services.auth import get_session_by_jti, get_user_by_id, revoke_session


@dataclass
class AuthContext:
    user_id: str
    session: Session | None
    is_api_key: bool = False


async def authenticate_request(request: Request, db: AsyncSession) -> AuthContext:
    """Resolve API keys and JWT sessions, preserving the CLI bearer contract."""
    auth = request.headers.get("authorization", "")
    token: str | None = None
    if auth.lower().startswith("bearer "):
        token = auth.split(" ", 1)[1].strip()
        api_key_user_id = await get_user_id_for_api_key(db, token)
        if api_key_user_id:
            context = AuthContext(api_key_user_id, None, is_api_key=True)
            request.state.auth_context = context
            return context

    if token is None:
        token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    payload = decode_access_token(token)
    session = await get_session_by_jti(db, payload.jti)
    if session is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session revoked or expired")
    context = AuthContext(payload.sub, session)
    request.state.auth_context = context
    return context


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    context = await authenticate_request(request, db)
    user = await get_user_by_id(db, context.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")
    return user


async def get_current_feature_user(
    user: User = Depends(get_current_user),
) -> User:
    """Require verification for product features when the setting is enabled.

    Authentication itself stays available so an unverified user can resend
    the verification email. Admins retain access for recovery/moderation.
    """
    if settings.require_verified_email and not user.is_verified and not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Verify your email before using this feature",
        )
    return user


async def get_current_admin_user(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


async def revoke_authenticated_session(request: Request, db: AsyncSession) -> None:
    """Best-effort logout: invalid cookies are still cleared by the route."""
    try:
        context = await authenticate_request(request, db)
    except HTTPException:
        return
    if context.session is not None:
        await revoke_session(db, context.session)
