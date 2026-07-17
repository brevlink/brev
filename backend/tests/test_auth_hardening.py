from __future__ import annotations

from urllib.parse import parse_qs, urlsplit

from fastapi.testclient import TestClient


PASSWORD = "Correct-Horse-Battery-1"


def _register(client: TestClient, email: str = "hardening@example.com") -> None:
    response = client.post("/api/v1/auth/register", json={"email": email, "password": PASSWORD})
    assert response.status_code == 201, response.text


def _login(client: TestClient, email: str = "hardening@example.com") -> dict:
    response = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return response.json()


def _mail_token(client: TestClient, purpose: str) -> str:
    message = client.test_mailer.messages[-1]
    assert purpose in message.text or purpose == "verification"
    link = next(line.strip() for line in message.text.splitlines() if line.startswith("http"))
    parsed = urlsplit(link)
    token = parse_qs(parsed.fragment).get("token", [None])[0]
    assert token
    return token


def test_password_policy_rejects_short_and_common_passwords(client):
    for password in ("asd12345", "password123", "Password", "short"):
        response = client.post(
            "/api/v1/auth/register",
            json={"email": f"{password}@example.com", "password": password},
        )
        assert response.status_code == 422


def test_unconfigured_email_provider_fails_without_exposing_token(client, monkeypatch):
    from app.services import auth as auth_service
    from app.services.mailer import UnconfiguredMailer

    monkeypatch.setattr(auth_service, "mailer", UnconfiguredMailer())
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "no-mail@example.com", "password": PASSWORD},
    )
    assert response.status_code == 503
    assert "token" not in response.text.lower()


def test_cookie_csrf_requires_allowed_origin_and_bearer_is_unchanged(client):
    _register(client)
    _login(client)

    blocked = client.post(
        "/api/v1/links",
        json={"url": "https://example.com/csrf", "slug": "csrf"},
    )
    assert blocked.status_code == 403

    allowed = client.post(
        "/api/v1/links",
        headers={"Origin": "http://testserver"},
        json={"url": "https://example.com/csrf", "slug": "csrf"},
    )
    assert allowed.status_code == 201

    bearer = _login(client)["access_token"]
    api_request = client.post(
        "/api/v1/links",
        headers={"Authorization": f"Bearer {bearer}"},
        json={"url": "https://example.com/bearer", "slug": "bearer"},
    )
    assert api_request.status_code == 201


def test_security_headers_only_send_hsts_for_https(client, monkeypatch):
    response = client.get("/health")
    assert "strict-transport-security" not in response.headers

    from app.core.config import settings

    monkeypatch.setattr(settings, "trusted_proxy_headers", True)
    response = client.get("/health", headers={"X-Forwarded-Proto": "https"})
    assert response.headers["strict-transport-security"].startswith("max-age=")


def test_logout_revokes_persistent_session(client):
    _register(client)
    login = _login(client)
    token = login["access_token"]

    response = client.post("/api/v1/auth/logout", headers={"Origin": "http://testserver"})
    assert response.status_code == 204
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 401


def test_change_password_revokes_all_sessions(client):
    _register(client)
    first = _login(client)["access_token"]
    second = _login(client)["access_token"]

    response = client.post(
        "/api/v1/auth/password/change",
        headers={"Authorization": f"Bearer {first}"},
        json={"current_password": PASSWORD, "new_password": "New-Correct-Battery-2"},
    )
    assert response.status_code == 200
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {first}"}).status_code == 401
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {second}"}).status_code == 401

    new_login = client.post(
        "/api/v1/auth/login",
        json={"email": "hardening@example.com", "password": "New-Correct-Battery-2"},
    )
    assert new_login.status_code == 200


def test_reset_password_is_non_enumerating_and_single_use(client):
    _register(client)
    old_session = _login(client)["access_token"]
    unknown = client.post(
        "/api/v1/auth/password-reset/request",
        json={"email": "missing@example.com"},
    )
    known = client.post(
        "/api/v1/auth/password-reset/request",
        json={"email": "hardening@example.com"},
    )
    assert unknown.status_code == known.status_code == 202
    assert unknown.json() == known.json()

    reset_link = next(line.strip() for line in client.test_mailer.messages[-1].text.splitlines() if line.startswith("http"))
    assert urlsplit(reset_link).path == "/reset-password"
    token = _mail_token(client, "Reset")
    bootstrap = client.get(
        "/api/v1/auth/password-reset/confirm",
        params={"token": token},
    )
    assert bootstrap.status_code == 200
    assert bootstrap.json()["valid"] is True
    assert token not in bootstrap.text
    response = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": token, "new_password": "Reset-Correct-Battery-3"},
    )
    assert response.status_code == 200
    reused = client.post(
        "/api/v1/auth/password-reset/confirm",
        json={"token": token, "new_password": "Reset-Correct-Battery-4"},
    )
    assert reused.status_code == 404

    login = client.post(
        "/api/v1/auth/login",
        json={"email": "hardening@example.com", "password": "Reset-Correct-Battery-3"},
    )
    assert login.status_code == 200
    assert client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {old_session}"}).status_code == 401


def test_require_verified_email_keeps_resend_and_login_available(client, monkeypatch):
    _register(client, "admin@example.com")
    _register(client, "hardening@example.com")

    from app.core.config import settings

    monkeypatch.setattr(settings, "require_verified_email", True)
    login = _login(client)
    me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {login['access_token']}"})
    assert me.status_code == 200
    assert me.json()["is_verified"] is False
    resend = client.post(
        "/api/v1/auth/resend-verification",
        headers={"Origin": "http://testserver"},
    )
    assert resend.status_code == 200
    login_while_unverified = _login(client)
    assert login_while_unverified["access_token"]
    blocked = client.post(
        "/api/v1/links",
        headers={"Authorization": f"Bearer {login_while_unverified['access_token']}"},
        json={"url": "https://example.com/unverified", "slug": "unverified"},
    )
    assert blocked.status_code == 403
