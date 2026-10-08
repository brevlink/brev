"""Authenticated, printable QR codes use the link's canonical hostname."""

from xml.etree import ElementTree

import pytest


def _login(client, email="qr-owner@example.com"):
    credentials = {"email": email, "password": "Correct-Horse-Battery-1"}
    assert client.post("/api/v1/auth/register", json=credentials).status_code == 201
    response = client.post("/api/v1/auth/login", json=credentials)
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def _create(client, headers, **extra):
    response = client.post(
        "/api/v1/links", headers=headers,
        json={"slug": "print-me", "url": "https://example.com/destination", **extra},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _domain(client, headers, monkeypatch):
    from app.services import domains

    monkeypatch.setattr(domains, "_dns_txt_contains", lambda name, token: True)
    response = client.post(
        "/api/v1/domains", headers=headers, json={"domain": "go.example.com"},
    )
    assert response.status_code == 201
    domain_id = response.json()["id"]
    assert client.post(f"/api/v1/domains/{domain_id}/verify", headers=headers).status_code == 200
    return domain_id


@pytest.mark.parametrize("size", [None, 64, 512, 4096])
def test_own_link_returns_svg_using_session_cookie(client, size):
    headers = _login(client)
    link = _create(client, headers)
    # Login sets the same cookie used by the dashboard's img and download link.
    response = client.get(
        f"/api/v1/links/{link['slug']}/qr.svg",
        params={} if size is None else {"size": size},
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/svg+xml"
    assert response.headers["cache-control"] == "private, no-store"
    assert response.content.startswith(b"<?xml")
    root = ElementTree.fromstring(response.content)
    assert root.tag == "{http://www.w3.org/2000/svg}svg"
    assert "viewBox" in root.attrib
    assert root.attrib["width"] == root.attrib["height"] == str(size or 256)
    assert root.find("{http://www.w3.org/2000/svg}path") is not None
    from app.services.qr import generate_qr_svg

    assert response.content == generate_qr_svg(link["short_url"], size or 256)


def test_other_users_link_and_missing_slug_have_the_same_error(client):
    owner = _login(client)
    link = _create(client, owner)
    other = _login(client, "qr-other@example.com")
    for slug in (link["slug"], "nonexistent-slug"):
        response = client.get(f"/api/v1/links/{slug}/qr.svg", headers=other)
        assert response.status_code == 404
        assert response.headers["content-type"] == "application/json"
        assert response.json() == {"detail": "Link not found"}


def test_qr_requires_authentication(client):
    owner = _login(client)
    link = _create(client, owner)
    client.cookies.clear()
    assert client.get(f"/api/v1/links/{link['slug']}/qr.svg").status_code == 401


@pytest.mark.parametrize("size", [0, 63, 4097, "not-a-number", "256.5"])
def test_invalid_sizes_are_rejected(client, size):
    owner = _login(client)
    link = _create(client, owner)
    response = client.get(f"/api/v1/links/{link['slug']}/qr.svg", params={"size": size})
    assert response.status_code == 422
    assert response.json()["detail"][0]["loc"] == ["query", "size"]


def test_custom_domain_qr_encodes_the_canonical_short_url(client, monkeypatch):
    owner = _login(client)
    domain_id = _domain(client, owner, monkeypatch)
    link = _create(client, owner, domain_id=domain_id)
    assert link["short_url"] == "https://go.example.com/print-me"
    from app.services.qr import generate_qr_svg

    response = client.get(f"/api/v1/links/{link['slug']}/qr.svg")
    assert response.status_code == 200
    assert response.content == generate_qr_svg(link["short_url"])
    assert response.content != generate_qr_svg("https://brevl.ink/print-me")


def test_domain_member_access_requires_acceptance_and_ends_on_removal(client, monkeypatch):
    owner = _login(client)
    domain_id = _domain(client, owner, monkeypatch)
    link = _create(client, owner, domain_id=domain_id)
    member = _login(client, "qr-member@example.com")
    from app.services import domain_sharing

    monkeypatch.setattr(domain_sharing, "mailer", client.test_mailer)
    invitation = client.post(
        f"/api/v1/domains/{domain_id}/members", headers=owner,
        json={"email": "qr-member@example.com"},
    )
    assert invitation.status_code == 201
    path = f"/api/v1/links/{link['slug']}/qr.svg"
    assert client.get(path, headers=member).status_code == 404
    token = client.test_mailer.messages[-1].text.split("token=")[1].split()[0]
    accepted = client.post(
        "/api/v1/domains/invites/accept", headers=member, json={"token": token},
    )
    assert accepted.status_code == 200
    assert client.get(path, headers=member).status_code == 200
    # The domain owner can also obtain the QR of a link created by a member.
    member_link = _create(client, member, slug="member-print", domain_id=domain_id)
    assert client.get(f"/api/v1/links/{member_link['slug']}/qr.svg", headers=owner).status_code == 200
    members = client.get(f"/api/v1/domains/{domain_id}/members", headers=owner).json()["items"]
    assert client.delete(
        f"/api/v1/domains/{domain_id}/members/{members[0]['id']}", headers=owner,
    ).status_code == 204
    assert client.get(path, headers=member).status_code == 404


def test_same_slug_on_multiple_accessible_domains_is_not_guessed(client, monkeypatch):
    owner = _login(client)
    domain_id = _domain(client, owner, monkeypatch)
    _create(client, owner)
    _create(client, owner, domain_id=domain_id)
    response = client.get("/api/v1/links/print-me/qr.svg")
    assert response.status_code == 409
    assert response.json() == {
        "detail": "Multiple accessible links have this slug on different domains",
    }
