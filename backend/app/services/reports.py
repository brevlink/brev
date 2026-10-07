"""Resolve reports by domain and slug, including paused or blocked links."""
from urllib.parse import urlsplit

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.domain import Domain
from app.models.link import Link
from app.models.report import Report
from app.schemas.report import ReportCreate


async def create_report(db: AsyncSession, body: ReportCreate) -> None:
    value = body.short_url
    # A bare slug refers to the default domain, never an arbitrary custom domain.
    if "/" not in value and ":" not in value:
        host, slug = settings.default_domain, value
        short_url = f"https://{host}/{slug}" if len(slug) <= 64 else value
    else:
        try:
            parsed = urlsplit(value if "://" in value else f"https://{value}")
            host, slug = (parsed.hostname or "").lower(), parsed.path.lstrip("/")
        except ValueError:
            # Even a malformed address can be evidence; keep it unresolved.
            host, slug = "", ""
        short_url = value
    query = select(Link).where(Link.slug == slug)
    if host == settings.default_domain:
        query = query.where(Link.domain_id.is_(None))
    else:
        query = query.join(Domain).where(Domain.domain == host)
    link = await db.scalar(query)
    db.add(Report(short_url=short_url, reason=body.reason,
                  reporter_email=str(body.reporter_email) if body.reporter_email else None,
                  link_id=link.id if link else None))
    await db.flush()
