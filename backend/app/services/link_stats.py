"""Click recording: no raw IP, user agent, or referrer URL reaches storage."""
from datetime import UTC, datetime, timedelta
import hashlib
import hmac
import ipaddress
import re
import uuid
from urllib.parse import urlsplit

from fastapi import Request
from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.link import Link
from app.models.link_stats import LinkClickDaily, LinkClickEvent
from app.services.links import _link_to_out, increment_clicks

BOT = re.compile(r"bot|crawler|spider|slurp|bingpreview|facebookexternalhit|facebot|twitterbot|linkedinbot|whatsapp|telegrambot|discordbot|slackbot|googleother|headlesschrome|lighthouse|monitor|uptimerobot", re.I)


def _device(ua: str) -> str:
    if re.search(r"ipad|tablet|kindle|silk|android(?!.*mobile)", ua, re.I):
        return "tablet"
    if re.search(r"mobile|iphone|ipod|android", ua, re.I):
        return "mobile"
    if re.search(r"windows|macintosh|x11|linux|cros", ua, re.I):
        return "desktop"
    return "other"


def _visitor_hash(request: Request, day) -> str | None:
    ua = request.headers.get("user-agent", "")
    # Proxy headers are accepted only when this deployment trusts its ingress.
    ip = request.headers.get("cf-connecting-ip") if settings.trusted_proxy_headers else None
    ip = ip or (request.client.host if request.client else None)
    try:
        ip = str(ipaddress.ip_address(ip))
    except (ValueError, TypeError):
        return None
    if not ua:
        return None
    salt = hmac.digest(settings.jwt_secret.encode(), f"brev-clicks:{day.isoformat()}".encode(), "sha256")
    return hmac.new(salt, (ip + ua).encode(), hashlib.sha256).hexdigest()[:32]


def _referrer_host(value: str | None) -> str | None:
    try:
        parsed = urlsplit(value or "")
        host = parsed.hostname
        if parsed.scheme not in {"http", "https"} or not host:
            return None
        return host.encode("idna").decode().lower()[:253]
    except (ValueError, UnicodeError):
        return None


async def record_click(db: AsyncSession, link: Link, request: Request, now: datetime | None = None) -> bool:
    ua = request.headers.get("user-agent", "")
    if BOT.search(ua) or any(
        "prefetch" in request.headers.get(header, "").lower()
        for header in ("purpose", "sec-purpose")
    ):
        return False
    now = (now or datetime.now(UTC)).astimezone(UTC)
    country = request.headers.get("cf-ipcountry", "").upper()
    if not re.fullmatch(r"[A-Z]{2}", country) or country in {"XX", "T1"}:
        country = None
    insert = sqlite_insert if db.get_bind().dialect.name == "sqlite" else pg_insert
    # Lock/update the link first: concurrent visits serialize all three writes.
    await increment_clicks(db, link)
    event = insert(LinkClickEvent).values(
        id=uuid.uuid4(), link_id=link.id, occurred_at=now, day=now.date(),
        country=country, referrer_host=_referrer_host(request.headers.get("referer")),
        device=_device(ua), visitor_hash=_visitor_hash(request, now.date()), hits=1,
    ).on_conflict_do_update(
        index_elements=["link_id", "day", "visitor_hash"],
        set_={"hits": LinkClickEvent.hits + 1},
    ).returning(LinkClickEvent.hits)
    hits = (await db.execute(event)).scalar_one()
    new_visitor = int(hits == 1)
    daily = insert(LinkClickDaily).values(link_id=link.id, day=now.date(), clicks=1, visitors=new_visitor)
    await db.execute(daily.on_conflict_do_update(
        index_elements=["link_id", "day"],
        set_={"clicks": LinkClickDaily.clicks + 1, "visitors": LinkClickDaily.visitors + new_visitor},
    ))
    return True


async def prune_click_events(db: AsyncSession, now: datetime | None = None) -> int:
    """Caller commits; daily aggregates are deliberately preserved."""
    cutoff = (now or datetime.now(UTC)) - timedelta(days=settings.click_event_retention_days)
    result = await db.execute(delete(LinkClickEvent).where(LinkClickEvent.occurred_at < cutoff))
    return result.rowcount


async def read_stats(db: AsyncSession, user_id: uuid.UUID, days: int, link: Link | None = None):
    today = datetime.now(UTC).date()
    start = today - timedelta(days=days - 1)
    scope = Link.id == link.id if link else Link.user_id == user_id
    daily = (await db.execute(
        select(LinkClickDaily.day, func.sum(LinkClickDaily.clicks), func.sum(LinkClickDaily.visitors))
        .join(Link, Link.id == LinkClickDaily.link_id)
        .where(scope, LinkClickDaily.day >= start, LinkClickDaily.day <= today)
        .group_by(LinkClickDaily.day).order_by(LinkClickDaily.day)
    )).all()
    by_day = {day: (int(clicks), int(visitors)) for day, clicks, visitors in daily}
    series = []
    for offset in range(days):
        day = start + timedelta(days=offset)
        clicks, visitors = by_day.get(day, (0, 0))
        series.append({"day": day.isoformat(), "clicks": clicks, "visitors": visitors})
    result = {
        "range": f"{days}d", "start": start.isoformat(), "end": today.isoformat(),
        "totals": {"clicks": sum(row["clicks"] for row in series), "visitors": sum(row["visitors"] for row in series)},
        "series": series,
        "visitor_definition": "Sum of daily distinct visitors per link; not deduplicated across days or links. Unidentifiable visits count separately.",
        "breakdown_retention_days": settings.click_event_retention_days,
        "breakdown_attribution": "Country, referrer and device of the visitor's first click on that link each UTC day.",
    }
    for name, column in (("countries", LinkClickEvent.country), ("referrers", LinkClickEvent.referrer_host), ("devices", LinkClickEvent.device)):
        rows = (await db.execute(
            select(column, func.sum(LinkClickEvent.hits).label("clicks"))
            .join(Link, Link.id == LinkClickEvent.link_id)
            .where(scope, LinkClickEvent.day >= start, LinkClickEvent.day <= today)
            .group_by(column).order_by(func.sum(LinkClickEvent.hits).desc(), column).limit(10)
        )).all()
        result[name] = [{"name": name, "clicks": int(clicks)} for name, clicks in rows]
    if link:
        result["link"] = _link_to_out(link).model_dump(mode="json")
    else:
        ranks = (await db.execute(
            select(LinkClickDaily.link_id, func.sum(LinkClickDaily.clicks).label("clicks"))
            .join(Link, Link.id == LinkClickDaily.link_id)
            .where(scope, LinkClickDaily.day >= start, LinkClickDaily.day <= today)
            .group_by(LinkClickDaily.link_id).order_by(func.sum(LinkClickDaily.clicks).desc(), LinkClickDaily.link_id).limit(10)
        )).all()
        from sqlalchemy.orm import selectinload
        links = (await db.execute(select(Link).options(selectinload(Link.domain)).where(Link.id.in_([row[0] for row in ranks])))).scalars().all()
        urls = {item.id: _link_to_out(item) for item in links}
        result["top_links"] = [{"slug": urls[id].slug, "short_url": urls[id].short_url, "clicks": int(clicks)} for id, clicks in ranks]
    return result
