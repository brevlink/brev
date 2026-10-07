"""Sharing a custom domain with other accounts.

The rules being pinned down here are the ones a mistake would silently break:

- only the owner can share, remove the domain, or see who it is shared with;
- a member can publish links on it, and nothing else;
- an invitation is addressed, so it only works for the account holding that
  address, and only once.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

PASSWORD = "Correct-Horse-Battery-1"


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
    from app.services import domain_sharing as sharing_service
    from app.services.mailer import InMemoryMailer

    test_mailer = InMemoryMailer()
    # Both modules hold the mailer in their own namespace: patch both, or an
    # invite would go out through the real provider.
    monkeypatch.setattr(auth_service, "mailer", test_mailer)
    monkeypatch.setattr(sharing_service, "mailer", test_mailer)
    with TestClient(app) as test_client:
        test_client.test_mailer = test_mailer
        yield test_client


def _register_and_login(client: TestClient, email: str) -> dict[str, str]:
    client.post("/api/v1/auth/register", json={"email": email, "password": PASSWORD})
    response = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _create_verified_domain(
    client: TestClient, headers: dict[str, str], monkeypatch, name: str = "go.example.com"
) -> dict:
    created = client.post("/api/v1/domains", json={"domain": name}, headers=headers)
    assert created.status_code == 201, created.text

    from app.services import domains as domains_service

    monkeypatch.setattr(domains_service, "_dns_txt_contains", lambda name, token: True)
    verified = client.post(
        f"/api/v1/domains/{created.json()['id']}/verify", headers=headers
    )
    assert verified.status_code == 200, verified.text
    return verified.json()


def _invite(client: TestClient, headers: dict[str, str], domain_id: str, email: str) -> str:
    """Share a domain and hand back the token that went out by email."""
    response = client.post(
        f"/api/v1/domains/{domain_id}/members", json={"email": email}, headers=headers
    )
    assert response.status_code == 201, response.text
    inviti = [m for m in client.test_mailer.messages if "invited" in m.subject]
    assert inviti, "no invitation email was sent"
    return inviti[-1].text.split("token=")[1].split()[0]


def _domains(client: TestClient, headers: dict[str, str]) -> dict[str, dict]:
    listed = client.get("/api/v1/domains", headers=headers)
    assert listed.status_code == 200, listed.text
    return {item["domain"]: item for item in listed.json()["items"]}


def test_the_email_names_the_domain_and_the_invitee(client, monkeypatch):
    headers = _register_and_login(client, "owner@example.com")
    domain = _create_verified_domain(client, headers, monkeypatch)

    client.post(
        f"/api/v1/domains/{domain['id']}/members",
        json={"email": "Brother@Example.com"},
        headers=headers,
    )

    messaggio = [m for m in client.test_mailer.messages if "invited" in m.subject][-1]
    # The address is normalized before it is stored, so the message matches it.
    assert messaggio.recipient == "brother@example.com"
    assert domain["domain"] in messaggio.text
    assert "token=" in messaggio.text


def test_only_the_owner_manages_sharing(client, monkeypatch):
    owner = _register_and_login(client, "owner@example.com")
    altro = _register_and_login(client, "other@example.com")
    domain = _create_verified_domain(client, headers=owner, monkeypatch=monkeypatch)

    assert (
        client.post(
            f"/api/v1/domains/{domain['id']}/members",
            json={"email": "whoever@example.com"},
            headers=altro,
        ).status_code
        == 403
    )
    assert client.get(f"/api/v1/domains/{domain['id']}/members", headers=altro).status_code == 403
    # The domain stays invisible to someone it was never shared with.
    assert _domains(client, altro) == {}


def test_inviting_the_owner_or_a_member_twice_is_refused(client, monkeypatch):
    owner = _register_and_login(client, "owner@example.com")
    domain = _create_verified_domain(client, owner, monkeypatch)

    se_stesso = client.post(
        f"/api/v1/domains/{domain['id']}/members",
        json={"email": "owner@example.com"},
        headers=owner,
    )
    assert se_stesso.status_code == 422

    _invite(client, owner, domain["id"], "brother@example.com")
    doppio = client.post(
        f"/api/v1/domains/{domain['id']}/members",
        json={"email": "brother@example.com"},
        headers=owner,
    )
    assert doppio.status_code == 409


def test_a_member_uses_the_domain_without_seeing_the_dns_token(client, monkeypatch):
    owner = _register_and_login(client, "owner@example.com")
    domain = _create_verified_domain(client, owner, monkeypatch)
    token = _invite(client, owner, domain["id"], "brother@example.com")

    brother = _register_and_login(client, "brother@example.com")
    accepted = client.post(
        "/api/v1/domains/invites/accept", json={"token": token}, headers=brother
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["status"] == "active"

    condivisi = _domains(client, brother)
    assert set(condivisi) == {"go.example.com"}
    assert condivisi["go.example.com"]["role"] == "member"
    assert condivisi["go.example.com"]["owner_email"] == "owner@example.com"
    # Setting the DNS record is the owner's job, and the token is what proves
    # the domain is his.
    assert condivisi["go.example.com"]["verification_token"] == ""
    # The owner still sees it as his own, token included.
    assert _domains(client, owner)["go.example.com"]["verification_token"] == domain["verification_token"]


def test_a_member_can_publish_links_on_the_domain(client, monkeypatch):
    owner = _register_and_login(client, "owner@example.com")
    domain = _create_verified_domain(client, owner, monkeypatch)
    token = _invite(client, owner, domain["id"], "brother@example.com")
    brother = _register_and_login(client, "brother@example.com")
    client.post("/api/v1/domains/invites/accept", json={"token": token}, headers=brother)

    creato = client.post(
        "/api/v1/links",
        json={"url": "https://example.org/landing", "slug": "fratello", "domain_id": domain["id"]},
        headers=brother,
    )
    assert creato.status_code == 201, creato.text
    # A stranger on the same domain is still refused.
    estraneo = _register_and_login(client, "stranger@example.com")
    negato = client.post(
        "/api/v1/links",
        json={"url": "https://example.org/landing", "slug": "estraneo", "domain_id": domain["id"]},
        headers=estraneo,
    )
    assert negato.status_code == 404


def test_a_member_cannot_delete_the_domain(client, monkeypatch):
    owner = _register_and_login(client, "owner@example.com")
    domain = _create_verified_domain(client, owner, monkeypatch)
    token = _invite(client, owner, domain["id"], "brother@example.com")
    brother = _register_and_login(client, "brother@example.com")
    client.post("/api/v1/domains/invites/accept", json={"token": token}, headers=brother)

    assert client.delete(f"/api/v1/domains/{domain['id']}", headers=brother).status_code == 404
    # And the owner's copy is untouched.
    assert client.get("/api/v1/domains", headers=owner).json()["total"] == 1


def test_an_invitation_only_works_for_the_address_it_was_sent_to(client, monkeypatch):
    owner = _register_and_login(client, "owner@example.com")
    domain = _create_verified_domain(client, owner, monkeypatch)
    token = _invite(client, owner, domain["id"], "brother@example.com")

    sbagliato = _register_and_login(client, "someone-else@example.com")
    rifiutato = client.post(
        "/api/v1/domains/invites/accept", json={"token": token}, headers=sbagliato
    )
    assert rifiutato.status_code == 403
    assert _domains(client, sbagliato) == {}

    # The invitation is still usable by the right account, and then only once.
    brother = _register_and_login(client, "brother@example.com")
    assert (
        client.post("/api/v1/domains/invites/accept", json={"token": token}, headers=brother).status_code
        == 200
    )
    ripetuto = client.post(
        "/api/v1/domains/invites/accept", json={"token": token}, headers=brother
    )
    # The invitation is spent the moment it is accepted: the token hash is
    # cleared, so nothing stays usable — not even for the account that used it.
    assert ripetuto.status_code == 404
    # And nobody else can pick the link up either.
    altro = _register_and_login(client, "late@example.com")
    assert (
        client.post("/api/v1/domains/invites/accept", json={"token": token}, headers=altro).status_code
        == 404
    )


def test_an_expired_invitation_is_refused(client, monkeypatch):
    from app.services import domain_sharing as sharing_service

    owner = _register_and_login(client, "owner@example.com")
    domain = _create_verified_domain(client, owner, monkeypatch)
    # Negative lifetime: the invitation is already expired when it is created.
    monkeypatch.setattr(sharing_service, "INVITE_EXPIRE_DAYS", -1)
    token = _invite(client, owner, domain["id"], "brother@example.com")

    lettura = client.get(f"/api/v1/domains/invites/accept?token={token}")
    assert lettura.status_code == 200
    assert lettura.json()["valid"] is False

    brother = _register_and_login(client, "brother@example.com")
    risposta = client.post(
        "/api/v1/domains/invites/accept", json={"token": token}, headers=brother
    )
    assert risposta.status_code == 422


def test_the_acceptance_page_can_name_the_domain_before_signing_in(client, monkeypatch):
    owner = _register_and_login(client, "owner@example.com")
    domain = _create_verified_domain(client, owner, monkeypatch)
    token = _invite(client, owner, domain["id"], "brother@example.com")

    # No credentials: the page has to say what is being accepted and to whom.
    lettura = client.get(f"/api/v1/domains/invites/accept?token={token}")
    assert lettura.status_code == 200
    corpo = lettura.json()
    assert corpo["valid"] is True
    assert corpo["domain"] == "go.example.com"
    assert corpo["email"] == "brother@example.com"
    assert corpo["invited_by"] == "owner@example.com"

    # An unknown token reveals nothing.
    ignoto = client.get(f"/api/v1/domains/invites/accept?token={'x' * 43}")
    assert ignoto.json()["valid"] is False
    assert ignoto.json()["domain"] is None


def test_the_owner_removes_a_member_and_a_member_can_leave(client, monkeypatch):
    owner = _register_and_login(client, "owner@example.com")
    domain = _create_verified_domain(client, owner, monkeypatch)

    token_a = _invite(client, owner, domain["id"], "a@example.com")
    a = _register_and_login(client, "a@example.com")
    client.post("/api/v1/domains/invites/accept", json={"token": token_a}, headers=a)
    token_b = _invite(client, owner, domain["id"], "b@example.com")
    b = _register_and_login(client, "b@example.com")
    client.post("/api/v1/domains/invites/accept", json={"token": token_b}, headers=b)

    elenco = client.get(f"/api/v1/domains/{domain['id']}/members", headers=owner).json()
    assert elenco["total"] == 2
    membro_a = next(m for m in elenco["items"] if m["email"] == "a@example.com")

    # A member cannot remove another member.
    assert (
        client.delete(
            f"/api/v1/domains/{domain['id']}/members/{membro_a['id']}", headers=b
        ).status_code
        == 403
    )
    # The owner can.
    assert (
        client.delete(
            f"/api/v1/domains/{domain['id']}/members/{membro_a['id']}", headers=owner
        ).status_code
        == 204
    )
    assert _domains(client, a) == {}

    # And a member can walk away on his own.
    mio = next(
        m
        for m in client.get(f"/api/v1/domains/{domain['id']}/members", headers=owner).json()["items"]
        if m["email"] == "b@example.com"
    )
    assert (
        client.delete(
            f"/api/v1/domains/{domain['id']}/members/{mio['id']}", headers=b
        ).status_code
        == 204
    )
    assert _domains(client, b) == {}
    # The domain itself survives every share being dropped.
    assert client.get("/api/v1/domains", headers=owner).json()["total"] == 1
