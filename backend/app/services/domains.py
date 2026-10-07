"""Domain service — manage custom domains per user."""

from __future__ import annotations

import logging
import secrets
import uuid
from datetime import UTC, datetime

import dns.resolver
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import HTTPException, status

from app.core.config import settings
from app.models.domain import Domain
from app.models.user import User
from app.schemas.domain import DomainCreate, DomainOut
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


def _domain_to_out(domain: Domain) -> DomainOut:
    return DomainOut(
        id=str(domain.id),
        user_id=str(domain.user_id),
        domain=domain.domain,
        is_verified=domain.is_verified,
        verification_token=domain.verification_token,
        verification_dns_name=domain.verification_dns_name,
        verified_at=domain.verified_at,
        last_checked_at=domain.last_checked_at,
        created_at=domain.created_at,
        cname_target=settings.cname_target,
        cloudflare_status=domain.cloudflare_status,
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
