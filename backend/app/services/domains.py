"""Domain service - manage custom domains per user."""

from __future__ import annotations

import logging
import secrets
import uuid
from datetime import UTC, datetime

import dns.resolver
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import HTTPException, status

from app.core.config import settings
from app.models.domain import Domain, DomainMember
from app.models.link import Link
from app.models.user import User
from app.schemas.domain import DomainCreate, DomainDeletionImpact, DomainOut
from app.services import cloudflare
from app.services.billing import user_has_cloud_entitlement

logger = logging.getLogger(__name__)


async def create_domain(db: AsyncSession, user: User, body: DomainCreate) -> DomainOut:
    """Add a custom domain for a user. Raises 409 if already taken."""
    await _ensure_domain_entitlement(db, user)
    domain_name = body.domain.lower().strip()
    if domain_name == settings.default_domain:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
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

    token = secrets.token_urlsafe(32)
    domain = Domain(
        id=uuid.uuid4(),
        user_id=user.id,
        domain=domain_name,
        verification_token=token,
        verification_dns_name=f"_brev.{domain_name}",
    )
    db.add(domain)
    await db.flush()
    await db.refresh(domain)

    # Cloudflare for SaaS: the hostname has to exist there before the customer
    # can point anything at us. If Cloudflare refuses, the domain is not left
    # half-registered: the request fails, the session rolls back, and what the
    # dashboard shows always matches what Cloudflare knows.
    if cloudflare.is_configured():
        try:
            hostname = await cloudflare.create_custom_hostname(domain_name)
        except cloudflare.CloudflareError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Cloudflare did not accept the domain: {exc}",
            ) from exc
        domain.cloudflare_hostname_id = hostname.get("id")
        domain.cloudflare_status = _cloudflare_state(hostname)
        await db.flush()
        await db.refresh(domain)

    return _domain_to_out(domain)


async def verify_domain(db: AsyncSession, domain_id: str, user_id: str) -> DomainOut:
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

    domain.last_checked_at = datetime.now(UTC)
    if not _dns_txt_contains(domain.verification_dns_name, domain.verification_token):
        await db.flush()
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=(
                "Domain verification failed. Add a TXT record at "
                f"{domain.verification_dns_name} with value {domain.verification_token}."
            ),
        )

    domain.is_verified = True
    domain.verified_at = datetime.now(UTC)

    # The DNS check above is Brev's own; the certificate is Cloudflare's. Refresh
    # its status so the dashboard can tell "waiting" from "serving". A hiccup
    # here is not fatal: the domain is verified either way.
    if domain.cloudflare_hostname_id:
        try:
            stato = await cloudflare.get_custom_hostname(domain.cloudflare_hostname_id)
        except cloudflare.CloudflareError as exc:
            logger.warning("Cloudflare status check failed for %s: %s", domain.domain, exc)
        else:
            domain.cloudflare_status = _cloudflare_state(stato)

    await db.flush()
    await db.refresh(domain)
    return _domain_to_out(domain)


async def get_user_domains(
    db: AsyncSession, user_id: str
) -> tuple[list[DomainOut], int]:
    """List every domain the account can use: its own plus the shared ones.

    Members get the domain without the DNS token: that one belongs to the owner.
    """
    uid = uuid.UUID(user_id)

    owned = (
        await db.execute(select(Domain).where(Domain.user_id == uid))
    ).scalars().all()
    shared = (
        await db.execute(
            select(Domain)
            .join(DomainMember, DomainMember.domain_id == Domain.id)
            .where(
                DomainMember.user_id == uid,
                DomainMember.accepted_at.is_not(None),
            )
        )
    ).scalars().all()

    owners: dict[uuid.UUID, str] = {}
    if shared:
        righe = await db.execute(
            select(User.id, User.email).where(User.id.in_({d.user_id for d in shared}))
        )
        owners = {row[0]: row[1] for row in righe.all()}

    # One grouped query for every domain at once, instead of a count per domain.
    counts: dict[uuid.UUID, int] = {}
    ids = [d.id for d in owned + shared]
    if ids:
        righe = await db.execute(
            select(DomainMember.domain_id, func.count(DomainMember.id))
            .where(DomainMember.domain_id.in_(ids))
            .group_by(DomainMember.domain_id)
        )
        counts = {row[0]: row[1] for row in righe.all()}

    items = [
        _domain_to_out(d, role="owner", member_count=counts.get(d.id, 0))
        for d in owned
    ] + [
        _domain_to_out(
            d,
            role="member",
            owner_email=owners.get(d.user_id),
            member_count=counts.get(d.id, 0),
            hide_verification_token=True,
        )
        for d in shared
    ]
    items.sort(key=lambda item: item.created_at, reverse=True)
    return items, len(items)


async def get_deletion_impact(
    db: AsyncSession, domain_id: str, user_id: str
) -> DomainDeletionImpact:
    """Count all affected links, including members' links, for the owner only."""
    uid = uuid.UUID(user_id)
    domain = await db.scalar(
        select(Domain).where(Domain.id == uuid.UUID(domain_id), Domain.user_id == uid)
    )
    if domain is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Domain not found")
    # Counting the owner's visible links would miss links published by members,
    # including former members whose links still live on this domain.
    total, others = (await db.execute(
        select(
            func.count(Link.id),
            func.coalesce(func.sum(case((Link.user_id != uid, 1), else_=0)), 0),
        ).where(Link.domain_id == domain.id)
    )).one()
    return DomainDeletionImpact(total_links=total, other_users_links=others)


async def delete_domain(db: AsyncSession, domain_id: str, user_id: str) -> None:
    """Permanently delete a domain and all its links, including members’ links."""
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
    # Best effort: a leftover hostname would occupy one of the zone's custom
    # hostnames, but the customer is already leaving, so a failure here must not
    # block the removal.
    if domain.cloudflare_hostname_id:
        try:
            await cloudflare.delete_custom_hostname(domain.cloudflare_hostname_id)
        except cloudflare.CloudflareError as exc:
            logger.warning("Cloudflare delete failed for %s: %s", domain.domain, exc)

    await db.delete(domain)


async def _ensure_domain_entitlement(db: AsyncSession, user: User) -> None:
    if user.is_admin:
        return
    if settings.require_verified_email and not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Verify your email before adding custom domains",
        )
    if not settings.cloud_mode:
        return
    current_domains = await db.scalar(select(func.count(Domain.id)).where(Domain.user_id == user.id)) or 0
    if current_domains < settings.free_custom_domains:
        return
    if not await user_has_cloud_entitlement(db, user):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail="A Brev Cloud entitlement is required for additional custom domains",
        )


def _domain_to_out(
    domain: Domain,
    *,
    role: str = "owner",
    owner_email: str | None = None,
    member_count: int = 0,
    hide_verification_token: bool = False,
) -> DomainOut:
    return DomainOut(
        id=str(domain.id),
        user_id=str(domain.user_id),
        domain=domain.domain,
        is_verified=domain.is_verified,
        # A member never receives the DNS challenge token: setting the record is
        # the owner's job, and the token is what proves the domain is his.
        verification_token="" if hide_verification_token else domain.verification_token,
        verification_dns_name=domain.verification_dns_name,
        verified_at=domain.verified_at,
        last_checked_at=domain.last_checked_at,
        created_at=domain.created_at,
        cname_target=settings.cname_target,
        cloudflare_status=domain.cloudflare_status,
        role=role,
        owner_email=owner_email,
        member_count=member_count,
    )


def _cloudflare_state(payload: dict) -> str:
    """Return "active" only when the hostname and its certificate are both live."""
    attivo = payload.get("status") == "active" and payload.get("ssl_status") == "active"
    return "active" if attivo else "pending"


def _dns_txt_contains(name: str, expected: str) -> bool:
    resolvers = [dns.resolver.Resolver(configure=True)]
    public_resolver = dns.resolver.Resolver(configure=False)
    public_resolver.nameservers = ["1.1.1.1", "8.8.8.8"]
    resolvers.append(public_resolver)

    for resolver in resolvers:
        resolver.lifetime = 5
        resolver.timeout = 2
        if _resolver_txt_contains(resolver, name, expected):
            return True
    return False


def _resolver_txt_contains(resolver: dns.resolver.Resolver, name: str, expected: str) -> bool:
    try:
        answers = resolver.resolve(name, "TXT")
    except Exception:
        return False
    for answer in answers:
        chunks = [raw.decode().strip().strip('"') for raw in answer.strings]
        if "".join(chunks) == expected:
            return True
        if expected in chunks:
            return True
    return False
