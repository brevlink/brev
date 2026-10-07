"""Admin and moderation helpers."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.billing import CloudEntitlement
from app.models.domain import Domain
from app.models.link import Link
from app.models.report import Report
from app.models.user import User
from app.schemas.admin import AdminDomainOut, AdminLinkOut, AdminUserOut, AdminReportOut
from app.services.billing import ONE_TIME_ENTITLEMENT_KEY, has_cloud_entitlement


async def list_users(db: AsyncSession, skip: int = 0, limit: int = 100, q: str = "") -> tuple[list[AdminUserOut], int]:
    query = select(User).where(User.email.ilike(_search_pattern(q), escape="\\")) if q else select(User)
    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0
    result = await db.execute(query.order_by(User.created_at.desc(), User.id).offset(skip).limit(limit))
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


def _search_pattern(q: str) -> str:
    # Searches are literal substrings, so pasted URL wildcards cannot broaden them.
    return "%" + q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_") + "%"


def _link_query(q: str = ""):
    short_url = "https://" + func.coalesce(Domain.domain, settings.default_domain) + "/" + Link.slug
    query = select(Link).join(User, Link.user_id == User.id).outerjoin(Domain, Link.domain_id == Domain.id).options(selectinload(Link.domain), selectinload(Link.user))
    if q:
        pattern = _search_pattern(q)
        query = query.where(or_(short_url.ilike(pattern, escape="\\"), Link.url.ilike(pattern, escape="\\"), User.email.ilike(pattern, escape="\\")))
    return query


async def list_links(db: AsyncSession, skip: int = 0, limit: int = 100,
                     q: str = "", queue: bool = True) -> tuple[list[AdminLinkOut], int]:
    query = _link_query(q)
    if queue:
        query = query.where(Link.is_flagged.is_(True))
    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0
    links = (await db.scalars(query.order_by(Link.is_flagged.desc(), Link.created_at.desc(), Link.id).offset(skip).limit(limit))).all()
    return [await _link_with_reports(db, link) for link in links], total


async def _link_with_reports(db: AsyncSession, link: Link) -> AdminLinkOut:
    count = await db.scalar(select(func.count(Report.id)).where(Report.link_id == link.id)) or 0
    latest = await db.scalar(select(Report.reason).where(Report.link_id == link.id).order_by(Report.created_at.desc(), Report.id).limit(1))
    result = _link_out(link)
    result.report_count = count
    result.latest_report_reason = latest
    return result


async def list_reports(db: AsyncSession, skip: int = 0, limit: int = 100,
                       q: str = "", open_only: bool = True) -> tuple[list[AdminReportOut], int]:
    query = select(Report).outerjoin(Link, Report.link_id == Link.id).outerjoin(Domain, Link.domain_id == Domain.id).outerjoin(User, Link.user_id == User.id)
    if open_only:
        query = query.where(Report.reviewed_at.is_(None))
    if q:
        pattern = _search_pattern(q)
        short_url = "https://" + func.coalesce(Domain.domain, settings.default_domain) + "/" + Link.slug
        query = query.where(or_(Report.short_url.ilike(pattern, escape="\\"), short_url.ilike(pattern, escape="\\"), Link.url.ilike(pattern, escape="\\"), User.email.ilike(pattern, escape="\\")))
    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0
    reports = (await db.scalars(query.order_by(Report.created_at.desc(), Report.id).offset(skip).limit(limit))).all()
    items = []
    for report in reports:
        link = await db.scalar(_link_query().where(Link.id == report.link_id)) if report.link_id else None
        items.append(AdminReportOut(id=str(report.id), short_url=report.short_url, reason=report.reason,
                                   reporter_email=report.reporter_email, created_at=report.created_at,
                                   reviewed_at=report.reviewed_at, link=await _link_with_reports(db, link) if link else None))
    return items, total


async def review_report(db: AsyncSession, report_id: uuid.UUID) -> None:
    report = await db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    report.reviewed_at = datetime.now(UTC)
    await db.flush()


async def set_link_flagged(db: AsyncSession, link_id: str, flagged: bool) -> AdminLinkOut:
    link = await db.scalar(_link_query().where(Link.id == uuid.UUID(link_id)))
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")
    link.is_flagged = flagged
    # Moderation owns only the flag; owner pauses remain intact when cleared.
    await db.flush()
    return await _link_with_reports(db, link)


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
        short_url=f"https://{link.domain.domain if link.domain else settings.default_domain}/{link.slug}",
        owner_email=link.user.email,
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
