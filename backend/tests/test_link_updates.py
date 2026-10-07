"""Customer edits preserve public URLs and pause/resume controls redirects."""

import uuid

import pytest


def _login(client, email="links@example.com"):
    credentials = {"email": email, "password": "Correct-Horse-Battery-1"}
    assert client.post("/api/v1/auth/register", json=credentials).status_code == 201
    response = client.post("/api/v1/auth/login", json=credentials)
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _create(client, headers, **extra):
    response = client.post(
        "/api/v1/links",
        headers=headers,
        json={"url": "https://example.com/original", "slug": "stable", "title": "Original", **extra},
    )
    assert response.status_code == 201
    return response.json()


@pytest.mark.parametrize("method", ["put", "patch"])
def test_edit_pause_resume_preserves_public_url(client, method):
    headers = _login(client)
    link = _create(client, headers)
    path = f"/api/v1/links/{link['id']}"
    update = getattr(client, method)

    edited = update(path, headers=headers, json={"url": "https://example.com/corrected", "title": "Corrected"})
    assert edited.status_code == 200
    assert edited.json()["url"] == "https://example.com/corrected"
    assert edited.json()["title"] == "Corrected"
    assert edited.json()["slug"] == link["slug"]
    assert edited.json()["short_url"] == link["short_url"]
    assert edited.json()["is_active"] is True

    paused = update(path, headers=headers, json={"is_active": False})
    assert paused.status_code == 200
    assert paused.json()["is_active"] is False
    assert paused.json()["title"] == "Corrected"
    assert client.get("/stable", headers={"Host": "brevl.ink"}, follow_redirects=False).status_code == 404
    assert client.get("/api/v1/links", headers=headers).json()["items"][0]["clicks"] == 0

    resumed = update(path, headers=headers, json={"is_active": True})
    assert resumed.status_code == 200
    assert resumed.json()["short_url"] == link["short_url"]
    redirect = client.get("/stable", headers={"Host": "brevl.ink"}, follow_redirects=False)
    assert redirect.status_code == 307
    assert redirect.headers["location"] == "https://example.com/corrected"
    stored = client.get("/api/v1/links", headers=headers).json()["items"][0]
    assert stored["is_active"] is True
    assert stored["title"] == "Corrected"
    assert stored["clicks"] == 1


def test_title_can_be_cleared_without_changing_other_fields(client):
    headers = _login(client)
    link = _create(client, headers)
    response = client.put(f"/api/v1/links/{link['id']}", headers=headers, json={"title": None})
    assert response.status_code == 200
    assert response.json()["title"] is None
    assert response.json()["url"] == link["url"]
    assert response.json()["short_url"] == link["short_url"]


@pytest.mark.parametrize("changes", [{"url": "not-a-url"}, {"title": "x" * 257}])
def test_invalid_edits_do_not_modify_link(client, changes):
    headers = _login(client)
    link = _create(client, headers)
    response = client.put(f"/api/v1/links/{link['id']}", headers=headers, json=changes)
    assert response.status_code == 422
    stored = client.get("/api/v1/links", headers=headers).json()["items"][0]
    assert stored["url"] == link["url"]
    assert stored["title"] == link["title"]


@pytest.mark.parametrize("method", ["put", "patch"])
def test_updates_enforce_ownership_and_missing_ids(client, method):
    owner = _login(client)
    other = _login(client, "other@example.com")
    link = _create(client, owner)
    update = getattr(client, method)
    for link_id, headers in [(link["id"], other), (str(uuid.uuid4()), owner), ("invalid-id", owner)]:
        response = update(f"/api/v1/links/{link_id}", headers=headers, json={"url": "https://example.com/stolen", "is_active": False})
        assert response.status_code == 404
    stored = client.get("/api/v1/links", headers=owner).json()["items"][0]
    assert stored["url"] == link["url"]
    assert stored["is_active"] is True


def test_edit_on_custom_domain_keeps_its_public_host(client, monkeypatch):
    headers = _login(client)
    domain = client.post("/api/v1/domains", headers=headers, json={"domain": "go.example.com"})
    assert domain.status_code == 201
    from app.services import domains

    monkeypatch.setattr(domains, "_dns_txt_contains", lambda name, token: True)
    verified = client.post(f"/api/v1/domains/{domain.json()['id']}/verify", headers=headers)
    assert verified.status_code == 200
    link = _create(client, headers, domain_id=domain.json()["id"])
    response = client.put(f"/api/v1/links/{link['id']}", headers=headers, json={"title": "New title", "is_active": False})
    assert response.status_code == 200
    assert response.json()["short_url"] == "https://go.example.com/stable"
    assert response.json()["domain_id"] == domain.json()["id"]
