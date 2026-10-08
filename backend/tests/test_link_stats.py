"""Behavioral coverage for minimized click analytics and authorization."""
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from test_link_qr import _create, _domain, _login


def _db(client, operation):
    from app.core.database import async_session

    async def run():
        async with async_session() as db:
            value = await operation(db)
            await db.commit()
            return value
    return client.portal.call(run)


def _rows(client):
    from app.models.link_stats import LinkClickDaily, LinkClickEvent

    async def read(db):
        events = (await db.execute(select(LinkClickEvent))).scalars().all()
        daily = (await db.execute(select(LinkClickDaily))).scalars().all()
        return ([{col.name: getattr(row, col.name) for col in row.__table__.columns} for row in events],
                [{col.name: getattr(row, col.name) for col in row.__table__.columns} for row in daily])
    return _db(client, read)


def _redirect(client, slug="print-me", **headers):
    return client.get(f"/{slug}", headers={"host": "brevl.ink", "user-agent": "Mozilla/5.0 (X11; Linux x86_64)", **headers}, follow_redirects=False)


def test_deduplication_hits_country_and_minimized_row(client):
    owner = _login(client)
    _create(client, owner)
    from app.core.config import settings
    settings.trusted_proxy_headers = True
    headers = {"cf-connecting-ip": "203.0.113.42", "cf-ipcountry": "it", "referer": "https://News.Example.com/private/path?token=sensitive"}
    assert _redirect(client, **headers).status_code == 307
    events, daily = _rows(client)
    assert len(events) == 1
    assert events[0]["hits"] == daily[0]["clicks"] == daily[0]["visitors"] == 1
    assert _redirect(client, **headers).headers["location"] == "https://example.com/destination"
    events, daily = _rows(client)
    assert events[0]["hits"] == daily[0]["clicks"] == 2
    assert daily[0]["visitors"] == 1
    row = events[0]
    assert row["country"] == "IT"
    assert row["referrer_host"] == "news.example.com"
    assert row["device"] == "desktop"
    assert len(row["visitor_hash"]) == 32
    assert set(row) == {"id", "link_id", "occurred_at", "day", "country", "referrer_host", "device", "visitor_hash", "hits"}
    for sensitive in ("203.0.113.42", "Mozilla", "private/path", "token=sensitive"):
        assert sensitive not in str(row)
    assert client.get("/api/v1/links", headers=owner).json()["items"][0]["clicks"] == 2
    stats = client.get("/api/v1/links/print-me/stats?range=7d", headers=owner).json()
    assert stats["totals"] == {"clicks": 2, "visitors": 1}
    assert stats["countries"] == [{"name": "IT", "clicks": 2}]
    assert stats["referrers"] == [{"name": "news.example.com", "clicks": 2}]


@pytest.mark.parametrize("headers", [
    {"user-agent": "Googlebot/2.1"}, {"user-agent": "facebookexternalhit/1.1"},
    {"user-agent": "Slackbot-LinkExpanding"}, {"purpose": "prefetch"},
    {"sec-purpose": "prefetch;prerender"}, {"purpose": "PREFETCH"},
])
def test_bots_and_prefetch_do_not_count(client, headers):
    owner = _login(client)
    _create(client, owner)
    assert _redirect(client, **headers).status_code == 307
    assert _rows(client) == ([], [])
    assert client.get("/api/v1/links", headers=owner).json()["items"][0]["clicks"] == 0


@pytest.mark.parametrize("ua,expected", [("Mozilla iPhone Mobile", "mobile"), ("Mozilla iPad", "tablet"), ("Mozilla Android", "tablet"), ("custom-client", "other")])
def test_device_categories_and_missing_country(client, ua, expected):
    owner = _login(client)
    _create(client, owner)
    _redirect(client, **{"user-agent": ua, "cf-ipcountry": "XX", "referer": "not-a-url"})
    row = _rows(client)[0][0]
    assert row["device"] == expected
    assert row["country"] is None
    assert row["referrer_host"] is None
    assert row["visitor_hash"] is None  # testclient peer is not an IP


def test_pruning_preserves_daily_totals_and_configurable_window(client):
    owner = _login(client)
    _create(client, owner)
    from app.core.config import settings
    from app.models.link import Link
    from app.services.link_stats import prune_click_events, record_click
    from starlette.requests import Request
    now = datetime.now(UTC)
    request = Request({"type": "http", "headers": [(b"user-agent", b"Mozilla Linux")], "client": ("203.0.113.1", 123)})

    async def seed(db):
        link = (await db.execute(select(Link))).scalar_one()
        for age in (91, 31, 8, 1, 0):
            await record_click(db, link, request, now - timedelta(days=age))
    _db(client, seed)
    async def prune(db):
        return await prune_click_events(db, now)
    assert _db(client, prune) == 1
    assert len(_rows(client)[0]) == 4
    assert len(_rows(client)[1]) == 5
    for period, count in (("7d", 2), ("30d", 3), ("90d", 4)):
        response = client.get(f"/api/v1/stats/summary?range={period}", headers=owner)
        assert response.status_code == 200
        assert response.json()["totals"] == {"clicks": count, "visitors": count}
        assert len(response.json()["series"]) == int(period[:-1])
        assert response.json()["top_links"][0]["clicks"] == count
    settings.click_event_retention_days = 7
    assert _db(client, prune) == 2
    assert len(_rows(client)[0]) == 2
    assert client.get("/api/v1/stats/summary?range=90d", headers=owner).json()["totals"]["clicks"] == 4


def test_fingerprints_rotate_daily_and_unidentifiable_visits_remain_separate(client):
    owner = _login(client)
    _create(client, owner)
    from app.models.link import Link
    from app.services.link_stats import record_click
    from starlette.requests import Request
    now = datetime.now(UTC)
    request = Request({"type": "http", "headers": [(b"user-agent", b"Mozilla Linux")], "client": ("203.0.113.1", 123)})
    async def seed(db):
        link = (await db.execute(select(Link))).scalar_one()
        for when in (now, now - timedelta(days=1)):
            await record_click(db, link, request, when)
    _db(client, seed)
    hashes = [row["visitor_hash"] for row in _rows(client)[0]]
    assert len(set(hashes)) == 2
    assert all(hashes)
    _redirect(client)
    _redirect(client)
    assert len(_rows(client)[0]) == 4
    assert sum(row["visitors"] for row in _rows(client)[1]) == 4


def test_stats_routes_auth_ownership_ranges_and_empty_state(client):
    owner = _login(client)
    _create(client, owner)
    _redirect(client)
    other = _login(client, "stats-other@example.com")
    for suffix in ("", "?host=brevl.ink"):
        assert client.get(f"/api/v1/links/print-me/stats{suffix}", headers=other).status_code == 404
    assert client.get("/api/v1/stats/summary", headers=other).json()["totals"] == {"clicks": 0, "visitors": 0}
    for path in ("/api/v1/stats/summary", "/api/v1/links/print-me/stats"):
        for invalid in ("1d", "all", "", "30", "365d"):
            response = client.get(path, params={"range": invalid}, headers=owner)
            assert response.status_code == 422
            assert response.json()["detail"][0]["loc"] == ["query", "range"]
        client.cookies.clear()
        assert client.get(path).status_code == 401


@pytest.mark.parametrize("stage", ["record", "commit"])
def test_recording_failure_never_blocks_redirect_and_rolls_back(client, monkeypatch, stage):
    owner = _login(client)
    _create(client, owner)
    if stage == "record":
        from app.api.v1 import redirect
        from app.services.link_stats import record_click
        async def fail(db, link, request):
            await record_click(db, link, request)
            raise RuntimeError("analytics failure")
        monkeypatch.setattr(redirect, "record_click", fail)
    else:
        from sqlalchemy.ext.asyncio import AsyncSession
        original = AsyncSession.commit
        calls = 0
        async def fail_once(db):
            nonlocal calls
            calls += 1
            if calls == 1:
                raise RuntimeError("commit failed")
            await original(db)
        monkeypatch.setattr(AsyncSession, "commit", fail_once)
    response = _redirect(client)
    assert response.status_code == 307
    assert response.headers["location"] == "https://example.com/destination"
    assert _rows(client) == ([], [])
    assert client.get("/api/v1/links", headers=owner).json()["items"][0]["clicks"] == 0


def test_stats_and_qr_host_disambiguation(client, monkeypatch):
    owner = _login(client)
    domain_id = _domain(client, owner, monkeypatch)
    default = _create(client, owner)
    custom = _create(client, owner, domain_id=domain_id)
    from app.services.qr import generate_qr_svg
    for link in (default, custom):
        from urllib.parse import urlsplit
        host = urlsplit(link["short_url"]).hostname
        response = client.get("/api/v1/links/print-me/qr.svg", params={"host": host}, headers=owner)
        assert response.status_code == 200
        assert response.content == generate_qr_svg(link["short_url"])
        _redirect(client, host=host)
        stats = client.get("/api/v1/links/print-me/stats", params={"host": host}, headers=owner)
        assert stats.status_code == 200
        assert stats.json()["link"]["short_url"] == link["short_url"]
        assert stats.json()["totals"]["clicks"] == 1
    for endpoint in ("qr.svg", "stats"):
        path = f"/api/v1/links/print-me/{endpoint}"
        assert client.get(path, headers=owner).status_code == 409
        assert client.get(path, params={"host": "unavailable.example.com"}, headers=owner).status_code == 404
        other = _login(client, f"host-other-{endpoint}@example.com")
        assert client.get(path, params={"host": "go.example.com"}, headers=other).status_code == 404


def test_stats_domain_sharing_requires_accepted_membership(client, monkeypatch):
    owner = _login(client)
    domain_id = _domain(client, owner, monkeypatch)
    _create(client, owner, domain_id=domain_id)
    member = _login(client, "stats-member@example.com")
    from app.services import domain_sharing
    monkeypatch.setattr(domain_sharing, "mailer", client.test_mailer)
    assert client.post(f"/api/v1/domains/{domain_id}/members", headers=owner, json={"email": "stats-member@example.com"}).status_code == 201
    path = "/api/v1/links/print-me/stats?host=go.example.com"
    assert client.get(path, headers=member).status_code == 404
    token = client.test_mailer.messages[-1].text.split("token=")[1].split()[0]
    assert client.post("/api/v1/domains/invites/accept", headers=member, json={"token": token}).status_code == 200
    assert client.get(path, headers=member).status_code == 200
    members = client.get(f"/api/v1/domains/{domain_id}/members", headers=owner).json()["items"]
    assert client.delete(f"/api/v1/domains/{domain_id}/members/{members[0]['id']}", headers=owner).status_code == 204
    assert client.get(path, headers=member).status_code == 404


def test_slow_analytics_is_cancelled_without_changing_redirect(client, monkeypatch):
    import asyncio
    from app.api.v1 import redirect
    owner = _login(client)
    _create(client, owner)
    async def slow(db, link, request):
        await asyncio.sleep(2)
        raise AssertionError("Recording should have been cancelled")
    monkeypatch.setattr(redirect, "record_click", slow)
    response = _redirect(client)
    assert response.status_code == 307
    assert response.headers["location"] == "https://example.com/destination"
    assert _rows(client) == ([], [])


def test_analytics_session_cleanup_failure_does_not_block_redirect(client, monkeypatch):
    from app.api.v1 import redirect
    owner = _login(client)
    _create(client, owner)
    class FailedSession:
        async def __aenter__(self):
            return self
        async def __aexit__(self, *args):
            raise RuntimeError("Analytics connection close failed")
    async def fail(db, link, request):
        raise RuntimeError("Analytics write failed")
    monkeypatch.setattr(redirect, "async_session", FailedSession)
    monkeypatch.setattr(redirect, "record_click", fail)
    response = _redirect(client)
    assert response.status_code == 307
    assert response.headers["location"] == "https://example.com/destination"
    assert _rows(client) == ([], [])
