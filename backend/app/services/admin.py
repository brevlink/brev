"""Admin and moderation helpers."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.billing import CloudEntitlement
from app.models.domain import Domain
from app.models.link import Link
from app.models.user import User
from app.schemas.admin import AdminDomainOut, AdminLinkOut, AdminUserOut
from app.services.billing import ONE_TIME_ENTITLEMENT_KEY, has_cloud_entitlement


async def list_users(db: AsyncSession, skip: int = 0, limit: int = 100) -> tuple[list[AdminUserOut], int]:
    total = await db.scalar(select(func.count(User.id))) or 0
    result = await db.execute(select(User).order_by(User.created_at.desc()).offset(skip).limit(limit))
    return [await _user_out(db, user) for user in result.scalars().all()], total


async def set_cloud_entitlement(db: AsyncSession, user_id: uuid.UUID, active: bool) -> AdminUserOut:
    # Lock the user so concurrent admin changes cannot create duplicate entitlements.
    user = await db.scalar(select(User).where(User.id == user_id).with_for_update())
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    entitlement = await db.scalar(
        select(CloudEntitlement).where(
            CloudEntitlement.user_id == user.id,
            CloudEntitlement.entitlement_key == ONE_TIME_ENTITLEMENT_KEY,
        )
    )
    state = "active" if active else "revoked"
    if entitlement is None:
        entitlement = CloudEntitlement(user_id=user.id, status=state)
        db.add(entitlement)
    elif entitlement.status != state:
        entitlement.status = state
        if active:
            entitlement.granted_at = datetime.now(UTC)
    # Preserve purchase provenance; an admin change is not a new Stripe payment.
    await db.flush()
    return await _user_out(db, user)


async def set_user_active(db: AsyncSession, user_id: str, active: bool) -> AdminUserOut:
    user = await db.get(User, uuid.UUID(user_id))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.is_active = active
    await db.flush()
    return await _user_out(db, user)


async def list_links(db: AsyncSession, skip: int = 0, limit: int = 100) -> list[AdminLinkOut]:
    result = await db.execute(select(Link).order_by(Link.created_at.desc()).offset(skip).limit(limit))
    return [_link_out(link) for link in result.scalars().all()]


async def set_link_flagged(db: AsyncSession, link_id: str, flagged: bool) -> AdminLinkOut:
    link = await db.get(Link, uuid.UUID(link_id))
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")
    link.is_flagged = flagged
    if flagged:
        link.is_active = False
    await db.flush()
    return _link_out(link)


async def list_domains(db: AsyncSession, skip: int = 0, limit: int = 100) -> list[AdminDomainOut]:
    result = await db.execute(select(Domain).order_by(Domain.created_at.desc()).offset(skip).limit(limit))
    return [_domain_out(domain) for domain in result.scalars().all()]


async def set_domain_suspended(db: AsyncSession, domain_id: str, suspended: bool) -> AdminDomainOut:
    domain = await db.get(Domain, uuid.UUID(domain_id))
    if domain is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")
    domain.is_suspended = suspended
    await db.flush()
    return _domain_out(domain)


async def _user_out(db: AsyncSession, user: User) -> AdminUserOut:
    return AdminUserOut(
        id=str(user.id),
        email=user.email,
        is_active=user.is_active,
        is_admin=user.is_admin,
        is_verified=user.is_verified,
        created_at=user.created_at,
        has_cloud_entitlement=await has_cloud_entitlement(db, user),
    )


def _link_out(link: Link) -> AdminLinkOut:
    return AdminLinkOut(
        id=str(link.id),
        user_id=str(link.user_id),
        slug=link.slug,
        url=link.url,
        is_active=link.is_active,
        is_flagged=link.is_flagged,
        clicks=link.clicks,
        created_at=link.created_at,
    )


def _domain_out(domain: Domain) -> AdminDomainOut:
    return AdminDomainOut(
        id=str(domain.id),
        user_id=str(domain.user_id),
        domain=domain.domain,
        is_verified=domain.is_verified,
        is_suspended=domain.is_suspended,
        created_at=domain.created_at,
    )
