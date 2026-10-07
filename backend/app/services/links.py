"""Link service — CRUD for short links."""

from __future__ import annotations

import secrets
import string
import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.domain import Domain, DomainMember
from app.models.link import Link
from app.schemas.link import LinkCreate, LinkOut, LinkUpdate

ALPHABET = string.ascii_lowercase + string.digits


def _random_slug(length: int = 8) -> str:
    return "".join(secrets.choice(ALPHABET) for _ in range(length))


async def _accessible_domain(
    db: AsyncSession, domain_id: uuid.UUID, user_id: uuid.UUID
) -> Domain | None:
    """The domain when the account owns it, or when it was shared and accepted.

    Sharing lets someone publish links on a domain; it does not let them touch
    the DNS, verify it, or remove it.
    """
    result = await db.execute(select(Domain).where(Domain.id == domain_id))
    domain = result.scalar_one_or_none()
    if domain is None or domain.user_id == user_id:
        return domain
    membro = await db.scalar(
        select(DomainMember).where(
            DomainMember.domain_id == domain.id,
            DomainMember.user_id == user_id,
            DomainMember.accepted_at.is_not(None),
        )
    )
    return domain if membro is not None else None


async def create_link(
    db: AsyncSession, user_id: str, body: LinkCreate
) -> LinkOut:
    """Create a new short link."""
    slug = body.slug or _random_slug()

    # The domain has to be one this account can use: its own, or one shared with
    # it and accepted.
    domain_obj: Domain | None = None
    if body.domain_id:
        try:
            domain_uuid = uuid.UUID(body.domain_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid domain id",
            )
        domain_obj = await _accessible_domain(db, domain_uuid, uuid.UUID(user_id))
        if domain_obj is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Domain not found or not yours",
            )
        if not domain_obj.is_verified:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Domain must be verified before it can be used for links",
            )

        # TXT ownership alone does not mean Cloudflare can serve HTTPS.
        # Null means this deployment handles customer TLS without Cloudflare.
        if domain_obj.cloudflare_status not in (None, "active"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Domain certificate is pending. Check status before publishing links",
            )

    await _ensure_slug_available(db, slug, domain_obj.id if domain_obj else None)

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
        .options(selectinload(Link.domain))
        .where(Link.user_id == uid)
        .order_by(Link.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    links = result.scalars().all()
    return [_link_to_out(l) for l in links], total


async def get_user_link_by_slug(db: AsyncSession, slug: str, user_id: str) -> Link | None:
    result = await db.execute(
        select(Link)
        .options(selectinload(Link.domain))
        .where(Link.slug == slug, Link.user_id == uuid.UUID(user_id))
    )
    return result.scalar_one_or_none()


async def get_link_by_id(db: AsyncSession, link_id: str, user_id: str) -> Link | None:
    try:
        link_uuid = uuid.UUID(link_id)
    except ValueError:
        return None
    result = await db.execute(
        select(Link)
        .options(selectinload(Link.domain))
        .where(Link.id == link_uuid, Link.user_id == uuid.UUID(user_id))
    )
    return result.scalar_one_or_none()


async def get_redirect_link(db: AsyncSession, host: str, slug: str) -> Link | None:
    normalized_host = host.lower().split(":", 1)[0]
    # Resolution must respect moderation even if an owner re-enables the link.
    query = select(Link).options(selectinload(Link.domain)).where(
        Link.slug == slug, Link.is_flagged.is_(False)
    )
    if normalized_host == settings.default_domain:
        query = query.where(Link.domain_id.is_(None))
    else:
        query = query.join(Domain).where(
            Domain.domain == normalized_host,
            Domain.is_verified.is_(True),
            Domain.is_suspended.is_(False),
        )
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def update_link(
    db: AsyncSession, link_id: str, user_id: str, body: LinkUpdate
) -> LinkOut:
    """Update a link's fields. Raises 404 if not found or not owner."""
    # Eagerly load the domain: async serialization must not trigger lazy SQL.
    link = await get_link_by_id(db, link_id, user_id)
    if link is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Link not found",
        )

    if body.url is not None:
        link.url = str(body.url)
    if body.slug is not None and body.slug != link.slug:
        await _ensure_slug_available(db, body.slug, link.domain_id, exclude_id=link.id)
        link.slug = body.slug
    # An explicit null clears a title; omission leaves the existing title alone.
    if "title" in body.model_fields_set:
        link.title = body.title
    if body.is_active is not None:
        # Owners control pauses; the independent moderation flag still blocks redirects.
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


async def _ensure_slug_available(
    db: AsyncSession,
    slug: str,
    domain_id: uuid.UUID | None,
    exclude_id: uuid.UUID | None = None,
) -> None:
    query = select(Link).where(Link.slug == slug)
    if domain_id is None:
        query = query.where(Link.domain_id.is_(None))
    else:
        query = query.where(Link.domain_id == domain_id)
    if exclude_id is not None:
        query = query.where(Link.id != exclude_id)
    existing = await db.execute(query)
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Slug already taken",
        )
