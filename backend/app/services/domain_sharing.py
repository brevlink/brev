"""Sharing a custom domain with other accounts.

An invitation belongs to an email, not to a user: that is what makes it possible
to share a domain with someone who has no Brev account yet. It becomes usable
only when a session with that same address accepts it, and the token is cleared
on acceptance so a spent link stops working.
"""

from __future__ import annotations

import logging
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import quote, urlsplit, urlunsplit

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_opaque_token
from app.models.domain import Domain, DomainMember
from app.models.user import User
from app.schemas.domain import (
    DomainInviteBootstrap,
    DomainMemberCreate,
    DomainMemberOut,
)
from app.services.mailer import MailDeliveryError, mailer

logger = logging.getLogger(__name__)

INVITE_EXPIRE_DAYS = 14


def _email(value: str) -> str:
    """The same normalization the auth service applies to accounts."""
    return value.strip().casefold()


def _invite_url(token: str) -> str:
    """Put the token in the fragment, exactly like the auth emails do.

    The frontend can read a fragment; HTTP requests do not carry it, so it never
    reaches application or proxy access logs. An unconfigured deployment fails
    here with a clear message instead of emailing a link nobody can open.
    """
    base_url = settings.frontend_domain_invite_url or settings.app_base_url
    if not base_url or not base_url.startswith(("http://", "https://")):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Domain invitation URL is not configured",
        )
    parsed = urlsplit(base_url)
    if parsed.fragment:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Domain invitation URL must not contain a fragment",
        )
    return urlunsplit(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            parsed.query,
            f"token={quote(token, safe='')}",
        )
    )


def _expired(member: DomainMember) -> bool:
    """Compare in UTC, tolerating a naive value.

    SQLite — the database the tests run on — has no timezone support and hands
    datetimes back naive; PostgreSQL returns them aware. Normalizing here keeps
    the check from depending on which one is underneath.
    """
    expires = member.invite_expires_at
    if expires is None:
        return False
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=UTC)
    return expires <= datetime.now(UTC)


def _member_to_out(member: DomainMember) -> DomainMemberOut:
    if member.accepted_at is not None:
        stato = "active"
    elif _expired(member):
        stato = "expired"
    else:
        stato = "pending"
    return DomainMemberOut(
        id=str(member.id),
        email=member.email,
        user_id=str(member.user_id) if member.user_id else None,
        accepted_at=member.accepted_at,
        invite_expires_at=member.invite_expires_at,
        created_at=member.created_at,
        status=stato,
    )


def _uuid_or_404(value: str, detail: str = "Domain not found") -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail) from exc


async def _domain_for_owner(db: AsyncSession, domain_id: str, user: User) -> Domain:
    """The domain, only when this account owns it.

    A member can see the domain in their list, so denying with 403 tells the
    truth where 404 would only be confusing.
    """
    result = await db.execute(select(Domain).where(Domain.id == _uuid_or_404(domain_id)))
    domain = result.scalar_one_or_none()
    if domain is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")
    if domain.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner can share this domain",
        )
    return domain


async def _domain_visible_to(db: AsyncSession, domain_id: str, user: User) -> Domain:
    """The domain when the account owns it or has an accepted share on it."""
    result = await db.execute(select(Domain).where(Domain.id == _uuid_or_404(domain_id)))
    domain = result.scalar_one_or_none()
    if domain is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")
    if domain.user_id == user.id:
        return domain
    membro = await db.scalar(
        select(DomainMember).where(
            DomainMember.domain_id == domain.id,
            DomainMember.user_id == user.id,
            DomainMember.accepted_at.is_not(None),
        )
    )
    if membro is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")
    return domain


async def _member_by_token(db: AsyncSession, token: str) -> DomainMember | None:
    result = await db.execute(
        select(DomainMember).where(
            DomainMember.invite_token_hash == hash_opaque_token(token)
        )
    )
    return result.scalar_one_or_none()


async def list_members(
    db: AsyncSession, user: User, domain_id: str
) -> tuple[list[DomainMemberOut], int]:
    """Who a domain is shared with. Owner only: members just use it."""
    domain = await _domain_for_owner(db, domain_id, user)
    result = await db.execute(
        select(DomainMember)
        .where(DomainMember.domain_id == domain.id)
        .order_by(DomainMember.created_at.asc())
    )
    members = result.scalars().all()
    return [_member_to_out(m) for m in members], len(members)


async def invite_member(
    db: AsyncSession, user: User, domain_id: str, body: DomainMemberCreate
) -> DomainMemberOut:
    """Share a domain with an address, whether or not it has an account yet."""
    domain = await _domain_for_owner(db, domain_id, user)
    address = _email(body.email)
    if address == _email(user.email):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="That address already owns this domain",
        )
    existing = await db.scalar(
        select(DomainMember).where(
            DomainMember.domain_id == domain.id,
            DomainMember.email == address,
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Already shared with that address",
        )

    token = secrets.token_urlsafe(32)
    member = DomainMember(
        id=uuid.uuid4(),
        domain_id=domain.id,
        email=address,
        invited_by=user.id,
        invite_token_hash=hash_opaque_token(token),
        invite_expires_at=datetime.now(UTC) + timedelta(days=INVITE_EXPIRE_DAYS),
    )
    db.add(member)
    await db.flush()

    # The message goes out inside the same transaction: if the provider refuses,
    # nothing is left behind, so the dashboard never shows a pending member whose
    # invitation email never arrived.
    try:
        mailer.ensure_available()
        await mailer.send(
            recipient=address,
            subject=f"You have been invited to use {domain.domain} on Brev",
            text=(
                f"{user.email} invited you to use {domain.domain} for short links on Brev.\n"
                f"Accept the invitation using this link:\n{_invite_url(token)}\n\n"
                f"The invitation is for {address}. If you do not have a Brev account "
                "yet, create one with this address and the invitation will be waiting.\n"
                f"This link expires in {INVITE_EXPIRE_DAYS} days and can only be used once."
            ),
        )
    except MailDeliveryError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Transactional email is not configured",
        ) from exc

    await db.flush()
    await db.refresh(member)
    return _member_to_out(member)


async def inspect_invite(db: AsyncSession, token: str) -> DomainInviteBootstrap:
    """Read-only: what the acceptance page shows before anyone has signed in."""
    member = await _member_by_token(db, token)
    if member is None:
        return DomainInviteBootstrap(valid=False)
    domain = await db.get(Domain, member.domain_id)
    inviter = await db.get(User, member.invited_by) if member.invited_by else None
    return DomainInviteBootstrap(
        valid=member.accepted_at is None and not _expired(member),
        domain=domain.domain if domain is not None else None,
        email=member.email,
        invited_by=inviter.email if inviter is not None else None,
        expires_at=member.invite_expires_at,
    )


async def accept_invite(db: AsyncSession, user: User, token: str) -> DomainMemberOut:
    """Accept an invitation as the address it was sent to."""
    member = await _member_by_token(db, token)
    if member is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found or already used",
        )
    if _expired(member):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="This invitation has expired",
        )
    if member.accepted_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This invitation has already been accepted",
        )
    if member.email != _email(user.email):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Sign in with the address the invitation was sent to",
        )

    member.user_id = user.id
    member.accepted_at = datetime.now(UTC)
    # A spent invitation must not stay usable.
    member.invite_token_hash = None
    member.invite_expires_at = None
    await db.flush()
    await db.refresh(member)
    return _member_to_out(member)


async def remove_member(
    db: AsyncSession, user: User, domain_id: str, member_id: str
) -> None:
    """Drop a share. The owner can drop anyone; a member can only drop himself."""
    domain = await _domain_visible_to(db, domain_id, user)
    result = await db.execute(
        select(DomainMember).where(
            DomainMember.id == _uuid_or_404(member_id, "Member not found"),
            DomainMember.domain_id == domain.id,
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if domain.user_id != user.id and member.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner can remove other members",
        )
    await db.delete(member)
