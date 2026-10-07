"""Custom domains and the Cloudflare for SaaS integration.

The invariant that matters: what the dashboard shows matches what Cloudflare
knows. A domain is never stored locally when Cloudflare refused to create its
hostname, because that slot would then be taken by a domain nobody can activate.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    monkeypatch.setenv("JWT_SECRET", "test-secret-that-is-long-enough-for-dev")
    monkeypatch.setenv("CORS_ORIGINS", '["http://testserver"]')
    monkeypatch.setenv("FRONTEND_VERIFICATION_URL", "http://testserver/verify-email")
    monkeypatch.setenv("FRONTEND_PASSWORD_RESET_URL", "http://testserver/reset-password")
    monkeypatch.setenv("DEBUG", "false")
    for name in list(sys.modules):
        if name == "app" or name.startswith("app."):
            sys.modules.pop(name)

    from app.main import app
    from app.services import auth as auth_service
    from app.services.mailer import InMemoryMailer

    test_mailer = InMemoryMailer()
    monkeypatch.setattr(auth_service, "mailer", test_mailer)
    with TestClient(app) as test_client:
        test_client.test_mailer = test_mailer
        yield test_client


def _headers(client: TestClient) -> dict[str, str]:
    client.post(
        "/api/v1/auth/register",
        json={"email": "domains@example.com", "password": "Correct-Horse-Battery-1"},
    )
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "domains@example.com", "password": "Correct-Horse-Battery-1"},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _configure_cloudflare(monkeypatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "cloudflare_api_token", "token-di-prova", raising=False)
    monkeypatch.setattr(settings, "cloudflare_zone_id", "zona-di-prova", raising=False)


def _stub_cloudflare(monkeypatch, *, created=None, error=None, status=None):
    """Swap the Cloudflare calls for recorders; nothing leaves the process."""
    from app.services import cloudflare

    calls = {"create": [], "delete": [], "status": []}

    async def fake_create(hostname: str) -> dict:
        calls["create"].append(hostname)
        if error:
            raise cloudflare.CloudflareError(error)
        return created or {"id": "cf-1", "status": "pending", "ssl_status": "pending"}

    async def fake_status(hostname_id: str) -> dict:
        calls["status"].append(hostname_id)
        return status or {"id": hostname_id, "status": "active", "ssl_status": "active"}

    async def fake_delete(hostname_id: str) -> None:
        calls["delete"].append(hostname_id)

    monkeypatch.setattr(cloudflare, "create_custom_hostname", fake_create)
    monkeypatch.setattr(cloudflare, "get_custom_hostname", fake_status)
    monkeypatch.setattr(cloudflare, "delete_custom_hostname", fake_delete)
    return calls


def test_domain_is_local_only_without_cloudflare(client):
    """A self-hosted deployment that terminates customer TLS itself is untouched."""
    headers = _headers(client)
    response = client.post("/api/v1/domains", json={"domain": "go.example.com"}, headers=headers)
    assert response.status_code == 201
    assert response.json()["cloudflare_status"] is None


def test_domain_creates_the_cloudflare_hostname(client, monkeypatch):
    _configure_cloudflare(monkeypatch)
    calls = _stub_cloudflare(
        monkeypatch, created={"id": "cf-1", "status": "active", "ssl_status": "active"}
    )
    headers = _headers(client)

    response = client.post("/api/v1/domains", json={"domain": "go.example.com"}, headers=headers)

    assert response.status_code == 201
    assert calls["create"] == ["go.example.com"]
    assert response.json()["cloudflare_status"] == "active"


def test_domain_reports_pending_until_the_certificate_is_live(client, monkeypatch):
    """Hostname active but certificate still pending is not "active" for the user."""
    _configure_cloudflare(monkeypatch)
    _stub_cloudflare(
        monkeypatch, created={"id": "cf-2", "status": "active", "ssl_status": "pending"}
    )
    headers = _headers(client)

    response = client.post("/api/v1/domains", json={"domain": "go.example.com"}, headers=headers)

    assert response.status_code == 201
    assert response.json()["cloudflare_status"] == "pending"


def test_nothing_is_stored_when_cloudflare_refuses(client, monkeypatch):
    """The failure mode this guards: a local domain whose Cloudflare hostname was
    never created, so the customer could never activate it."""
    _configure_cloudflare(monkeypatch)
    _stub_cloudflare(monkeypatch, error="hostname already exists")
    headers = _headers(client)

    response = client.post("/api/v1/domains", json={"domain": "go.example.com"}, headers=headers)

    assert response.status_code == 502
    assert "already exists" in response.json()["detail"]
    listed = client.get("/api/v1/domains", headers=headers)
    assert listed.json()["total"] == 0


def test_verify_refreshes_the_cloudflare_status(client, monkeypatch):
    _configure_cloudflare(monkeypatch)
    _stub_cloudflare(monkeypatch)
    headers = _headers(client)
    created = client.post("/api/v1/domains", json={"domain": "go.example.com"}, headers=headers)
    assert created.json()["cloudflare_status"] == "pending"

    from app.services import domains as domains_service

    monkeypatch.setattr(domains_service, "_dns_txt_contains", lambda name, token: True)
    verified = client.post(
        f"/api/v1/domains/{created.json()['id']}/verify", headers=headers
    )

    assert verified.status_code == 200
    assert verified.json()["is_verified"] is True
    assert verified.json()["cloudflare_status"] == "active"


def test_delete_removes_the_cloudflare_hostname(client, monkeypatch):
    _configure_cloudflare(monkeypatch)
    calls = _stub_cloudflare(monkeypatch)
    headers = _headers(client)
    created = client.post("/api/v1/domains", json={"domain": "go.example.com"}, headers=headers)

    response = client.delete(f"/api/v1/domains/{created.json()['id']}", headers=headers)

    assert response.status_code == 204
    assert calls["delete"] == ["cf-1"]


def test_delete_survives_a_cloudflare_failure(client, monkeypatch):
    """A leftover hostname is a nuisance, a domain the customer cannot remove is
    worse: the local removal must still go through."""
    _configure_cloudflare(monkeypatch)
    _stub_cloudflare(monkeypatch)
    headers = _headers(client)
    created = client.post("/api/v1/domains", json={"domain": "go.example.com"}, headers=headers)

    from app.services import cloudflare

    async def fake_delete(hostname_id: str) -> None:
        raise cloudflare.CloudflareError("Cloudflare unreachable")

    monkeypatch.setattr(cloudflare, "delete_custom_hostname", fake_delete)

    response = client.delete(f"/api/v1/domains/{created.json()['id']}", headers=headers)

    assert response.status_code == 204
    assert client.get("/api/v1/domains", headers=headers).json()["total"] == 0


def test_pending_certificate_blocks_publishing_until_rechecked(client, monkeypatch):
    _configure_cloudflare(monkeypatch)
    calls = _stub_cloudflare(monkeypatch, status={
        "id": "cf-1", "status": "active", "ssl_status": "pending",
    })
    headers = _headers(client)
    created = client.post("/api/v1/domains", json={"domain": "go.example.com"}, headers=headers)
    domain_id = created.json()["id"]
    from app.services import domains as domains_service
    monkeypatch.setattr(domains_service, "_dns_txt_contains", lambda name, token: True)
    verified = client.post(f"/api/v1/domains/{domain_id}/verify", headers=headers)
    assert verified.json()["is_verified"] is True
    assert verified.json()["cloudflare_status"] == "pending"
    body = {"url": "https://example.org", "slug": "ready", "domain_id": domain_id}
    refused = client.post("/api/v1/links", json=body, headers=headers)
    assert refused.status_code == 422
    assert "certificate" in refused.json()["detail"]
    _stub_cloudflare(monkeypatch)
    checked = client.post(f"/api/v1/domains/{domain_id}/verify", headers=headers)
    assert checked.json()["cloudflare_status"] == "active"
    assert calls["status"] == ["cf-1"]
    assert client.post("/api/v1/links", json=body, headers=headers).status_code == 201
