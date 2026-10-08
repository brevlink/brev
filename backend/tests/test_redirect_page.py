"""Public unavailable pages preserve privacy and the redirect/API contracts."""

from __future__ import annotations

import uuid

import pytest

from test_admin import _register_and_login


@pytest.fixture()
def short_links(client):
    from app.core.database import async_session
    from app.models.domain import Domain
    from app.models.link import Link

    user_id, _ = _register_and_login(client, "page-owner@example.com")
    ids = {}

    async def seed():
        async with async_session() as db:
            domain = Domain(
                user_id=uuid.UUID(user_id), domain="go.example.com", is_verified=True,
                verification_token="test-token", verification_dns_name="_brev.go.example.com",
            )
            db.add(domain)
            await db.flush()
            for host, domain_id in [("brevl.ink", None), (domain.domain, domain.id)]:
                for slug in ("paused", "flagged", "valid"):
                    link = Link(
                        id=uuid.uuid4(), user_id=uuid.UUID(user_id), domain_id=domain_id,
                        slug=slug, url="https://example.com/destination",
                        is_active=slug != "paused", is_flagged=slug == "flagged",
                    )
                    db.add(link)
                    ids[host, slug] = link.id
            await db.commit()

    client.portal.call(seed)
    client.cookies.clear()
    return ids


def _get(client, slug, host="brevl.ink", accept="text/html"):
    headers = {"Host": host}
    if accept is not None:
        headers["Accept"] = accept
    return client.get(f"/{slug}", headers=headers, follow_redirects=False)


def _assert_page(response):
    assert response.status_code == 404
    assert response.headers["content-type"] == "text/html; charset=utf-8"
    assert response.headers["cache-control"] == "no-store"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert "<h1>This link is unavailable</h1>" in response.text
    assert 'href="https://brevl.ink"' in response.text


def test_missing_link_serves_html(client):
    _assert_page(_get(client, "missing"))


@pytest.mark.parametrize("host", ["brevl.ink", "go.example.com"])
def test_unavailable_bodies_are_identical(client, short_links, host):
    missing = _get(client, "missing")
    for slug in ("missing", "paused", "flagged"):
        response = _get(client, slug, host)
        _assert_page(response)
        assert response.content == missing.content

    from app.core.database import async_session
    from app.models.link import Link

    async def clicks():
        async with async_session() as db:
            return [(await db.get(Link, short_links[host, slug])).clicks
                    for slug in ("paused", "flagged")]

    assert client.portal.call(clicks) == [0, 0]


@pytest.mark.parametrize("accept", ["application/json", "*/*", None])
@pytest.mark.parametrize("host", ["brevl.ink", "go.example.com"])
def test_api_unavailable_response_is_unchanged(client, short_links, accept, host):
    for slug in ("missing", "paused", "flagged"):
        response = _get(client, slug, host, accept)
        assert response.status_code == 404
        assert response.headers["content-type"] == "application/json"
        assert response.content == b'{"detail":"Link not found"}'


def test_browser_accept_list_serves_html(client):
    _assert_page(_get(client, "missing", accept="text/html,application/xhtml+xml,*/*;q=0.8"))


@pytest.mark.parametrize("host", ["brevl.ink", "go.example.com"])
@pytest.mark.parametrize("accept", ["text/html", "application/json"])
def test_valid_link_still_redirects_and_counts_click(client, short_links, host, accept):
    response = _get(client, "valid", host, accept)
    assert response.status_code == 307
    assert response.headers["location"] == "https://example.com/destination"

    from app.core.database import async_session
    from app.models.link import Link

    async def clicks():
        async with async_session() as db:
            return (await db.get(Link, short_links[host, "valid"])).clicks

    assert client.portal.call(clicks) == 1
