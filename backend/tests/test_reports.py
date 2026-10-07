from __future__ import annotations

import uuid

from test_admin import _register_and_login


def _link(client, headers, slug="reported"):
    response = client.post("/api/v1/links", headers=headers,
                           json={"slug": slug, "url": "https://example.com/destination"})
    assert response.status_code == 201, response.text
    return response.json()


def test_public_reports_resolve_without_account_and_keep_unknown_links(client):
    _, headers = _register_and_login(client, "admin@example.com")
    link = _link(client, headers)
    client.cookies.clear()
    for short_url, reason, email in [(link["short_url"], "First reason", None),
                                     (link["slug"], "Latest reason", "reporter@example.com"),
                                     ("https://brevl.ink/missing", "I saw this link", None)]:
        response = client.post("/api/v1/reports", json={"short_url": short_url, "reason": reason, "reporter_email": email})
        assert response.status_code == 201, response.text
        assert set(response.json()) == {"message"}
    reports = client.get("/api/v1/admin/reports", headers=headers).json()
    assert reports["total"] == 3
    unknown, latest, first = reports["items"]
    assert unknown["link"] is None
    assert unknown["short_url"] == "https://brevl.ink/missing"
    assert latest["created_at"]
    assert latest["reporter_email"] == "reporter@example.com"
    assert latest["link"]["id"] == first["link"]["id"] == link["id"]
    assert latest["link"]["report_count"] == 2
    assert latest["link"]["latest_report_reason"] == "Latest reason"
    assert client.post(f"/api/v1/admin/reports/{unknown['id']}/review", headers=headers, json={"reason": "Investigated report"}).status_code == 204
    assert client.get("/api/v1/admin/reports", headers=headers).json()["total"] == 2
    history = client.get("/api/v1/admin/reports?open_only=false&limit=1&skip=0", headers=headers).json()
    assert history["total"] == 3 and len(history["items"]) == 1
    assert history["items"][0]["reviewed_at"]
    assert client.post(f"/api/v1/admin/reports/{latest['id']}/review", headers=headers,
                       json={"reason": "Reviewed the owner report"}).status_code == 204
    user_id = client.get("/api/v1/auth/me", headers=headers).json()["id"]
    actions = client.get(f"/api/v1/admin/users/{user_id}", headers=headers).json()["actions"]
    assert actions[0]["action"] == "review_report"
    assert actions[0]["target_id"] == latest["id"]
    assert actions[0]["reason"] == "Reviewed the owner report"


def test_report_validation_rate_limit_and_admin_guards(client):
    for body in [{"short_url": "   ", "reason": "why"},
                 {"short_url": "slug", "reason": "  "},
                 {"short_url": "slug", "reason": "x" * 2001},
                 {"short_url": "slug", "reason": "why", "reporter_email": "invalid"}]:
        assert client.post("/api/v1/reports", json=body).status_code == 422
    # Invalid requests also spend the rate-limit budget, bounding spam attempts.
    assert client.post("/api/v1/reports", json={"short_url": "slug", "reason": "why"}).status_code == 201
    assert client.post("/api/v1/reports", json={"short_url": "slug", "reason": "why"}).status_code == 429
    client.cookies.clear()
    assert client.get("/api/v1/admin/reports").status_code == 401
    _register_and_login(client, "admin@example.com")
    _, member = _register_and_login(client, "member@example.com")
    assert client.get("/api/v1/admin/reports", headers=member).status_code == 403
    assert client.post(f"/api/v1/admin/reports/{uuid.uuid4()}/review", headers=member).status_code == 403


def test_flag_blocks_active_link_and_clear_preserves_owner_pause(client):
    _, admin = _register_and_login(client, "admin@example.com")
    link = _link(client, admin)
    moderation = f"/api/v1/admin/links/{link['id']}"
    owner = f"/api/v1/links/{link['id']}"

    def redirect_status():
        return client.get(f"/{link['slug']}", headers={"Host": "brevl.ink"}, follow_redirects=False).status_code

    assert redirect_status() == 307
    flagged = client.post(f"{moderation}/flag", headers=admin, json={"reason": "Confirmed abuse"}).json()
    assert flagged["is_flagged"] is True and flagged["is_active"] is True
    assert redirect_status() == 404
    assert client.patch(owner, headers=admin, json={"is_active": True}).status_code == 200
    assert redirect_status() == 404
    assert client.post(f"{moderation}/clear", headers=admin, json={"reason": "Cleared after review"}).status_code == 200
    assert redirect_status() == 307
    assert client.patch(owner, headers=admin, json={"is_active": False}).status_code == 200
    assert client.post(f"{moderation}/flag", headers=admin, json={"reason": "Confirmed abuse"}).status_code == 200
    cleared = client.post(f"{moderation}/clear", headers=admin, json={"reason": "Cleared after review"}).json()
    assert cleared["is_flagged"] is False and cleared["is_active"] is False
    assert redirect_status() == 404
    # Pausing while blocked also remains an owner decision after clearing.
    client.patch(owner, headers=admin, json={"is_active": True})
    client.post(f"{moderation}/flag", headers=admin, json={"reason": "Confirmed abuse"})
    client.patch(owner, headers=admin, json={"is_active": False})
    client.post(f"{moderation}/clear", headers=admin, json={"reason": "Cleared after review"})
    assert redirect_status() == 404


def test_domain_aware_resolution_search_and_pagination(client):
    from app.core.database import async_session
    from app.models.domain import Domain
    from app.models.link import Link

    user_id, admin = _register_and_login(client, "owner@example.com")
    default = _link(client, admin, "same-slug")
    custom_id = uuid.uuid4()

    async def seed():
        async with async_session() as db:
            domain = Domain(user_id=uuid.UUID(user_id), domain="custom.example", is_verified=True,
                            verification_token="test-token", verification_dns_name="_brev.custom.example")
            db.add(domain)
            await db.flush()
            db.add(Link(id=custom_id, user_id=uuid.UUID(user_id), domain_id=domain.id,
                        slug="same-slug", url="https://different.example/path", is_flagged=True))
            await db.commit()

    client.portal.call(seed)
    response = client.post("/api/v1/reports", json={"short_url": "https://custom.example/same-slug", "reason": "Problem"})
    assert response.status_code == 201
    reports = client.get("/api/v1/admin/reports", headers=admin).json()
    assert reports["items"][0]["link"]["id"] == str(custom_id)
    queue = client.get("/api/v1/admin/links", headers=admin).json()
    assert queue["total"] == 1 and queue["items"][0]["short_url"] == "https://custom.example/same-slug"
    for q, expected in [("owner@example.com", 2), ("same-slug", 2), ("https://custom.example/same-slug", 1), ("different.example", 1), ("not-present", 0)]:
        links = client.get("/api/v1/admin/links", headers=admin, params={"queue": "false", "q": q, "limit": 1}).json()
        assert links["total"] == expected
        assert len(links["items"]) == min(expected, 1)
    links = client.get("/api/v1/admin/links?queue=false&skip=1&limit=1", headers=admin).json()
    assert links["total"] == 2 and links["items"][0]["id"] == default["id"]
    for q in ["owner@example.com", "different.example", "https://custom.example/same-slug"]:
        result = client.get("/api/v1/admin/reports", headers=admin, params={"q": q}).json()
        assert result["total"] == 1
    users = client.get("/api/v1/admin/users?q=owner&limit=1&skip=1", headers=admin).json()
    assert users["total"] == 1 and users["items"] == []
