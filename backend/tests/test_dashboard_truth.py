"""Account metrics and search must stay independent of the displayed page."""

from datetime import UTC, datetime
import uuid

import pytest


PASSWORD = "Correct-Horse-Battery-1"


def login(client, email):
    response = client.post("/api/v1/auth/register", json={"email": email, "password": PASSWORD})
    assert response.status_code == 201, response.text
    user_id = uuid.UUID(response.json()["id"])
    response = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return user_id, {"Authorization": f"Bearer {response.json()['access_token']}"}


@pytest.fixture()
def account_links(client):
    from app.core.database import async_session
    from app.models.domain import Domain
    from app.models.link import Link

    owner, headers = login(client, "owner@example.com")
    other, other_headers = login(client, "other@example.com")

    async def seed():
        async with async_session() as db:
            domain = Domain(
                user_id=owner, domain="go.example.org", is_verified=True,
                verification_token="test-domain-token",
                verification_dns_name="_brev.go.example.org",
            )
            db.add(domain)
            await db.flush()
            # Equal timestamps exercise the tie-breaker used by offset pagination.
            created = datetime(2020, 1, 1, tzinfo=UTC)
            for i in range(80):
                db.add(Link(
                    id=uuid.UUID(int=i + 1), user_id=owner,
                    domain_id=domain.id if i == 79 else None,
                    slug=f"link-{i:03}", url=f"https://example.com/destination-{i}",
                    title=f"Campaign {i}" + (" Legacy 100%_report" if i == 0 else ""),
                    clicks=i, is_active=i % 3 != 0, created_at=created,
                ))
            db.add(Link(user_id=other, slug="private-campaign", url="https://other.example.com",
                        title="Campaign Legacy 100%_report", clicks=999))
            await db.commit()

    client.portal.call(seed)
    return headers, other_headers


def list_links(client, headers, **params):
    response = client.get("/api/v1/links", headers=headers, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def test_account_aggregates_pagination_and_deletion(client, account_links):
    headers, other_headers = account_links
    expected = {"total_links": 80, "total_clicks": 3160, "active_links": 53}
    first = list_links(client, headers)
    second = list_links(client, headers, skip=50)
    assert first["total"] == second["total"] == 80
    assert len(first["items"]) == 50
    assert len(second["items"]) == 30
    assert first["summary"] == second["summary"] == expected
    ids = [item["id"] for item in first["items"] + second["items"]]
    assert len(set(ids)) == 80
    assert ids == [str(uuid.UUID(int=i)) for i in range(80, 0, -1)]
    assert list_links(client, headers)["items"] == first["items"]
    past_end = list_links(client, headers, skip=80)
    assert past_end["items"] == []
    assert past_end["total"] == 80
    assert past_end["summary"] == expected
    assert list_links(client, other_headers)["summary"] == {
        "total_links": 1, "total_clicks": 999, "active_links": 1,
    }

    # The metric deliberately describes current links, rather than lifetime traffic.
    deleted = first["items"][0]
    response = client.delete(f"/api/v1/links/{deleted['id']}", headers=headers)
    assert response.status_code == 204
    assert list_links(client, headers)["summary"] == {
        "total_links": 79, "total_clicks": 3081, "active_links": 52,
    }


@pytest.mark.parametrize("search, slugs", [
    ("  LEGACY  ", ["link-000"]),
    ("link-001", ["link-001"]),
    ("destination-42", ["link-042"]),
    ("https://go.example.org/link-079", ["link-079"]),
    ("https://brevl.ink/link-002", ["link-002"]),
    ("100%_report", ["link-000"]),
    ("%", ["link-000"]),
    ("_", ["link-000"]),
    ("private-campaign", []),
    ("no-match", []),
])
def test_search_is_literal_case_insensitive_and_account_scoped(client, account_links, search, slugs):
    headers, _ = account_links
    data = list_links(client, headers, search=search)
    assert [item["slug"] for item in data["items"]] == slugs
    assert data["total"] == len(slugs)
    assert data["summary"] == {"total_links": 80, "total_clicks": 3160, "active_links": 53}


def test_search_paginates_the_full_matching_set(client, account_links):
    headers, _ = account_links
    first = list_links(client, headers, search="campaign", limit=2)
    second = list_links(client, headers, search="campaign", limit=2, skip=2)
    assert first["total"] == second["total"] == 80
    assert [item["slug"] for item in first["items"]] == ["link-079", "link-078"]
    assert [item["slug"] for item in second["items"]] == ["link-077", "link-076"]
    assert list_links(client, headers, search="   ")["total"] == 80


def test_empty_account_has_real_zero_aggregates(client):
    _, headers = login(client, "empty@example.com")
    assert list_links(client, headers) == {
        "items": [], "total": 0,
        "summary": {"total_links": 0, "total_clicks": 0, "active_links": 0},
    }


@pytest.mark.parametrize("params", [{"skip": -1}, {"limit": 0}, {"limit": 101}, {"search": "x" * 257}])
def test_invalid_pagination_and_search_are_rejected(client, params):
    _, headers = login(client, "validation@example.com")
    assert client.get("/api/v1/links", headers=headers, params=params).status_code == 422


@pytest.mark.parametrize("required", [False, True])
@pytest.mark.parametrize("admin", [False, True])
@pytest.mark.parametrize("verified", [False, True])
def test_effective_capability_matches_enforcement(client, monkeypatch, required, admin, verified):
    from app.core.config import settings
    from app.core.database import async_session
    from app.models.user import User

    monkeypatch.setattr(settings, "require_verified_email", required)
    admin_id, admin_headers = login(client, "admin@example.com")
    member_id, member_headers = login(client, "member@example.com")
    user_id, headers = (admin_id, admin_headers) if admin else (member_id, member_headers)

    async def set_verified():
        async with async_session() as db:
            user = await db.get(User, user_id)
            user.is_verified = verified
            await db.commit()

    client.portal.call(set_verified)
    response = client.get("/api/v1/auth/me", headers=headers)
    assert response.status_code == 200
    assert response.json()["is_admin"] is admin
    assert response.json()["is_verified"] is verified
    allowed = not required or admin or verified
    assert response.json()["can_use_features"] is allowed
    for path in ("links", "domains", "api-keys"):
        assert client.get(f"/api/v1/{path}", headers=headers).status_code == (200 if allowed else 403)


def test_redirects_count_owner_and_repeat_visits(client):
    _, headers = login(client, "clicks@example.com")
    response = client.post("/api/v1/links", headers=headers,
                           json={"url": "https://example.com", "slug": "counted"})
    assert response.status_code == 201
    for _ in range(2):
        response = client.get("/counted", headers={**headers, "Host": "brevl.ink"}, follow_redirects=False)
        assert response.status_code == 307
    assert client.get("/missing", headers={"Host": "brevl.ink"}).status_code == 404
    assert list_links(client, headers)["summary"]["total_clicks"] == 2
