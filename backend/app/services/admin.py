"""Admin and moderation helpers."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.models.billing import AdminAction, CloudEntitlement, CloudPurchase, StripeEvent
from app.models.subscription import Subscription
from app.models.domain import Domain
from app.models.link import Link
from app.models.report import Report
from app.models.user import User
from app.schemas.admin import (AdminDomainOut, AdminLinkOut, AdminUserOut, AdminReportOut,
    AdminActionOut, AdminUserDetails, AdminPurchaseOut, AdminDiagnostics, AdminIntegrationOut, AdminWebhookOut)
from app.services.billing import ONE_TIME_ENTITLEMENT_KEY, has_cloud_entitlement, user_has_cloud_entitlement


async def list_users(db: AsyncSession, skip: int = 0, limit: int = 100, q: str = "") -> tuple[list[AdminUserOut], int]:
    query = select(User).where(User.email.ilike(_search_pattern(q), escape="\\")) if q else select(User)
    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0
    result = await db.execute(query.order_by(User.created_at.desc(), User.id).offset(skip).limit(limit))
    return [await _user_out(db, user) for user in result.scalars().all()], total


async def set_cloud_entitlement(db: AsyncSession, user_id: uuid.UUID, active: bool, actor: User, reason: str) -> AdminUserOut:
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
    _record_action(db, actor, "grant_cloud" if active else "revoke_cloud", "user", user.id, user.id, reason)
    # Preserve purchase provenance; an admin change is not a new Stripe payment.
    await db.flush()
    return await _user_out(db, user)


async def set_user_active(db: AsyncSession, user_id: uuid.UUID, active: bool, actor: User, reason: str) -> AdminUserOut:
    # Lock every admin in a stable order before checking the last-admin invariant.
    # On SQLite the initial write acquires the database write lock instead.
    if db.get_bind().dialect.name == "sqlite":
        await db.execute(User.__table__.update().where(User.id == actor.id).values(is_admin=actor.is_admin))
    admins = (await db.scalars(select(User).where(User.is_admin.is_(True)).order_by(User.id).with_for_update().execution_options(populate_existing=True))).all()
    user = await db.get(User, uuid.UUID(str(user_id)))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not active:
        if user.id == actor.id:
            raise HTTPException(status_code=409, detail="You cannot suspend your own account")
        if user.is_admin and user.is_active and sum(admin.is_active for admin in admins) <= 1:
            raise HTTPException(status_code=409, detail="You cannot suspend the last active admin")
    user.is_active = active
    _record_action(db, actor, "activate" if active else "suspend", "user", user.id, user.id, reason)
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


async def review_report(db: AsyncSession, report_id: uuid.UUID, actor: User, reason: str) -> None:
    report = await db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    link = await db.get(Link, report.link_id) if report.link_id else None
    _record_action(db, actor, "review_report", "report", report.id, link.user_id if link else None, reason)
    report.reviewed_at = datetime.now(UTC)
    await db.flush()


async def set_link_flagged(db: AsyncSession, link_id: uuid.UUID, flagged: bool, actor: User, reason: str) -> AdminLinkOut:
    link = await db.scalar(_link_query().where(Link.id == uuid.UUID(str(link_id))))
    if link is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Link not found")
    link.is_flagged = flagged
    _record_action(db, actor, "block_link" if flagged else "clear_link", "link", link.id, link.user_id, reason)
    # Moderation owns only the flag; owner pauses remain intact when cleared.
    await db.flush()
    return await _link_with_reports(db, link)


async def list_domains(db: AsyncSession, skip: int = 0, limit: int = 100, q: str = "") -> tuple[list[AdminDomainOut], int]:
    query = select(Domain).options(selectinload(Domain.user))
    if q:
        query = query.where(Domain.domain.ilike(_search_pattern(q), escape="\\"))
    total = await db.scalar(select(func.count()).select_from(query.subquery())) or 0
    result = await db.scalars(query.order_by(Domain.created_at.desc(), Domain.id).offset(skip).limit(limit))
    return [_domain_out(domain) for domain in result.all()], total


async def set_domain_suspended(db: AsyncSession, domain_id: uuid.UUID, suspended: bool, actor: User, reason: str) -> AdminDomainOut:
    domain = await db.scalar(select(Domain).where(Domain.id == uuid.UUID(str(domain_id))).options(selectinload(Domain.user)))
    if domain is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")
    domain.is_suspended = suspended
    _record_action(db, actor, "suspend_domain" if suspended else "restore_domain", "domain", domain.id, domain.user_id, reason)
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
        owner_email=domain.user.email,
        verified_at=domain.verified_at,
        certificate_state=domain.cloudflare_status or "Not observed (TLS managed externally)",
        last_checked_at=domain.last_checked_at,
        updated_at=domain.updated_at,
        is_verified=domain.is_verified,
        is_suspended=domain.is_suspended,
        created_at=domain.created_at,
    )



def _record_action(db, actor, action, target_type, target_id, account_id, reason):
    db.add(AdminAction(actor_id=actor.id, actor_email=actor.email, action=action,
                       target_type=target_type, target_id=target_id, account_id=account_id, reason=reason))


async def user_details(db: AsyncSession, user_id: uuid.UUID) -> AdminUserDetails:
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    entitlement = await db.scalar(select(CloudEntitlement).where(
        CloudEntitlement.user_id == user_id, CloudEntitlement.entitlement_key == ONE_TIME_ENTITLEMENT_KEY))
    purchases = (await db.scalars(select(CloudPurchase).where(CloudPurchase.user_id == user_id)
                                 .order_by(CloudPurchase.created_at.desc()).limit(100))).all()
    subscription = await db.scalar(select(Subscription).where(Subscription.user_id == user_id))
    actions = (await db.scalars(select(AdminAction).where(AdminAction.account_id == user_id)
                               .order_by(AdminAction.created_at.desc(), AdminAction.id).limit(100))).all()
    return AdminUserDetails(
        user=await _user_out(db, user), effective_access=user.is_active and (user.is_admin or await user_has_cloud_entitlement(db, user)),
        cloud_mode=settings.cloud_mode,
        entitlement_status=entitlement.status if entitlement else None,
        entitlement_source=("purchase" if entitlement.source_purchase_id else "manual grant" if entitlement.status == "active" else "manual decision") if entitlement else "none",
        entitlement_granted_at=entitlement.granted_at if entitlement else None,
        entitlement_updated_at=entitlement.updated_at if entitlement else None,
        source_purchase_id=str(entitlement.source_purchase_id) if entitlement and entitlement.source_purchase_id else None,
        purchases=[AdminPurchaseOut(id=str(p.id), status=p.status, created_at=p.created_at, paid_at=p.paid_at, updated_at=p.updated_at) for p in purchases],
        legacy_status=subscription.status if subscription else None,
        legacy_current_period_end=subscription.current_period_end if subscription else None,
        actions=[AdminActionOut(actor_id=str(a.actor_id), actor_email=a.actor_email, action=a.action,
                               target_type=a.target_type, target_id=str(a.target_id), reason=a.reason, created_at=a.created_at) for a in actions],
        observed_at=datetime.now(UTC),
    )


async def diagnostics(db: AsyncSession) -> AdminDiagnostics:
    # This query verifies only database availability. Configuration is not a probe.
    await db.scalar(select(func.count(User.id)))
    now = datetime.now(UTC)
    configured = {
        "Stripe checkout": bool(settings.stripe_secret_key and settings.stripe_price_id),
        "Stripe webhooks": bool(settings.stripe_webhook_secret),
        "Cloudflare for SaaS": bool(settings.cloudflare_api_token and settings.cloudflare_zone_id),
        "Email": bool(settings.email_from and (
            (settings.email_provider == "smtp" and settings.smtp_host) or
            (settings.email_provider == "api" and settings.email_api_url and settings.email_api_token))),
        "Caddy admin API": bool(settings.caddy_admin_api),
    }
    events = (await db.scalars(select(StripeEvent).order_by(StripeEvent.created_at.desc(), StripeEvent.id).limit(30))).all()
    # Stored Cloudflare state combines hostname and SSL activation; other TLS
    # providers have no persisted certificate observation and cannot be counted.
    pending_query = select(Domain).where(Domain.cloudflare_status.is_not(None), Domain.cloudflare_status != "active")
    total = await db.scalar(select(func.count()).select_from(pending_query.subquery())) or 0
    pending = (await db.scalars(pending_query.options(selectinload(Domain.user))
                               .order_by(Domain.updated_at.desc(), Domain.id).limit(30))).all()
    return AdminDiagnostics(cloud_mode=settings.cloud_mode, observed_at=now, database_verified_at=now,
        integrations=[AdminIntegrationOut(name=name, configured=value, observed_at=now) for name, value in configured.items()],
        recent_webhooks=[AdminWebhookOut(event_type=e.event_type, status=e.status, failure_reason=e.failure_reason,
                                        created_at=e.created_at, processed_at=e.processed_at) for e in events],
        pending_certificates=[_domain_out(d) for d in pending], pending_certificates_total=total)
