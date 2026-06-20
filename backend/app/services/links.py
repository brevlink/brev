"""Link service — CRUD for short links."""

from __future__ import annotations

import random
import string
import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.domain import Domain
from app.models.link import Link
from app.schemas.link import LinkCreate, LinkOut, LinkUpdate

ALPHABET = string.ascii_lowercase + string.digits


def _random_slug(length: int = 6) -> str:
    return "".join(random.choices(ALPHABET, k=length))


async def create_link(
    db: AsyncSession, user_id: str, body: LinkCreate
) -> LinkOut:
    """Create a new short link."""
    slug = body.slug or _random_slug()

    # Check slug uniqueness
    existing = await db.execute(select(Link).where(Link.slug == slug))
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Slug already taken",
        )

    # Validate domain ownership if domain_id provided
    domain_obj: Domain | None = None
    if body.domain_id:
        result = await db.execute(
            select(Domain).where(
                Domain.id == uuid.UUID(body.domain_id),
                Domain.user_id == uuid.UUID(user_id),
            )
        )
        domain_obj = result.scalar_one_or_none()
        if domain_obj is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Domain not found or not yours",
            )

    link = Link(
        id=uuid.uuid4(),
        user_id=uuid.UUID(user_id),
        domain_id=domain_obj.id if domain_obj else None,
        slug=slug,
        url=str(body.url),
        title=body.title,
    )
    db.add(link)
    await db.flush()
    await db.refresh(link)

    return _link_to_out(link)


async def get_user_links(
    db: AsyncSession, user_id: str, skip: int = 0, limit: int = 50
) -> tuple[list[LinkOut], int]:
    """Paginated list of user's links."""
    uid = uuid.UUID(user_id)
    total_q = select(func.count(Link.id)).where(Link.user_id == uid)
    total = await db.scalar(total_q) or 0

    result = await db.execute(
        select(Link)
        .where(Link.user_id == uid)
        .order_by(Link.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    links = result.scalars().all()
    return [_link_to_out(l) for l in links], total


async def get_link_by_slug(db: AsyncSession, slug: str) -> Link | None:
    """Fetch a single link by slug (for redirect)."""
    result = await db.execute(select(Link).where(Link.slug == slug))
    return result.scalar_one_or_none()


async def update_link(
    db: AsyncSession, link_id: str, user_id: str, body: LinkUpdate
) -> LinkOut:
    """Update a link's fields. Raises 404 if not found or not owner."""
    result = await db.execute(
        select(Link).where(
            Link.id == uuid.UUID(link_id),
            Link.user_id == uuid.UUID(user_id),
        )
    )
    link = result.scalar_one_or_none()
    if link is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Link not found",
        )

    if body.url is not None:
        link.url = str(body.url)
    if body.slug is not None:
        # Check new slug uniqueness
        existing = await db.execute(
            select(Link).where(Link.slug == body.slug, Link.id != link.id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Slug already taken",
            )
        link.slug = body.slug
    if body.title is not None:
        link.title = body.title
    if body.is_active is not None:
        link.is_active = body.is_active

    await db.flush()
    await db.refresh(link)
    return _link_to_out(link)


async def delete_link(db: AsyncSession, link_id: str, user_id: str) -> None:
    """Delete a link. Raises 404 if not found or not owner."""
    result = await db.execute(
        select(Link).where(
            Link.id == uuid.UUID(link_id),
            Link.user_id == uuid.UUID(user_id),
        )
    )
    link = result.scalar_one_or_none()
    if link is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Link not found",
        )
    await db.delete(link)


async def increment_clicks(db: AsyncSession, link: Link) -> None:
    """Atomically increment the click counter."""
    link.clicks = (link.clicks or 0) + 1
    await db.flush()


def _link_to_out(link: Link) -> LinkOut:
    domain = link.domain.domain if link.domain else settings.default_domain
    return LinkOut(
        id=str(link.id),
        user_id=str(link.user_id),
        domain_id=str(link.domain_id) if link.domain_id else None,
        slug=link.slug,
        url=link.url,
        title=link.title,
        is_active=link.is_active,
        clicks=link.clicks or 0,
        created_at=link.created_at,
        updated_at=link.updated_at,
        short_url=f"https://{domain}/{link.slug}",
    )