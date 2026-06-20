"""Domain service — manage custom domains per user."""

from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import HTTPException, status

from app.models.domain import Domain
from app.schemas.domain import DomainCreate, DomainOut


async def create_domain(
    db: AsyncSession, user_id: str, body: DomainCreate
) -> DomainOut:
    """Add a custom domain for a user. Raises 409 if already taken."""
    domain_name = body.domain.lower().strip()
    if domain_name == "brevl.ink":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Cannot add the default domain",
        )

    result = await db.execute(
        select(Domain).where(Domain.domain == domain_name)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Domain already registered",
        )

    domain = Domain(
        id=uuid.uuid4(),
        user_id=uuid.UUID(user_id),
        domain=domain_name,
    )
    db.add(domain)
    await db.flush()
    await db.refresh(domain)
    return _domain_to_out(domain)


async def get_user_domains(
    db: AsyncSession, user_id: str
) -> tuple[list[DomainOut], int]:
    """List all domains owned by a user."""
    uid = uuid.UUID(user_id)
    total_q = select(func.count(Domain.id)).where(Domain.user_id == uid)
    total = await db.scalar(total_q) or 0

    result = await db.execute(
        select(Domain).where(Domain.user_id == uid).order_by(Domain.created_at.desc())
    )
    domains = result.scalars().all()
    return [_domain_to_out(d) for d in domains], total


async def delete_domain(db: AsyncSession, domain_id: str, user_id: str) -> None:
    """Remove a domain. Raises 404 if not found or not owner."""
    result = await db.execute(
        select(Domain).where(
            Domain.id == uuid.UUID(domain_id),
            Domain.user_id == uuid.UUID(user_id),
        )
    )
    domain = result.scalar_one_or_none()
    if domain is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Domain not found",
        )
    await db.delete(domain)


def _domain_to_out(domain: Domain) -> DomainOut:
    return DomainOut(
        id=str(domain.id),
        user_id=str(domain.user_id),
        domain=domain.domain,
        is_verified=domain.is_verified,
        verified_at=domain.verified_at,
        created_at=domain.created_at,
    )