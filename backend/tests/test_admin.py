from __future__ import annotations

import uuid

import pytest


PASSWORD = "Correct-Horse-Battery-1"


def _register_and_login(client, email):
    response = client.post("/api/v1/auth/register", json={"email": email, "password": PASSWORD})
    assert response.status_code == 201, response.text
    user_id = response.json()["id"]
    response = client.post("/api/v1/auth/login", json={"email": email, "password": PASSWORD})
    assert response.status_code == 200, response.text
    return user_id, {"Authorization": f"Bearer {response.json()['access_token']}"}


def _users(client, headers):
    response = client.get("/api/v1/admin/users", headers=headers)
    assert response.status_code == 200, response.text
    return {user["id"]: user for user in response.json()["items"]}


def test_admin_grants_revokes_and_regrants_persisted_cloud_access(client, monkeypatch):
    from app.core.database import async_session
    from app.models.billing import CloudEntitlement
    from app.models.user import User
    from app.services import billing
    from sqlalchemy import select

    monkeypatch.setattr(billing.settings, "cloud_mode", True)
    _, admin_headers = _register_and_login(client, "admin@example.com")
    user_id, user_headers = _register_and_login(client, "member@example.com")
    path = f"/api/v1/admin/users/{user_id}/cloud-entitlement"
    assert _users(client, admin_headers)[user_id]["has_cloud_entitlement"] is False

    async def persisted():
        async with async_session() as db:
            rows = (await db.scalars(select(CloudEntitlement))).all()
            assert len(rows) == 1
            user = await db.get(User, uuid.UUID(user_id))
            return rows[0].id, rows[0].granted_at, await billing.user_has_cloud_entitlement(db, user)

    for active in (True, True, False, False, True):
        response = client.put(path, headers=admin_headers, json={"active": active, "reason": "Operator test decision"})
        assert response.status_code == 200, response.text
        assert response.json()["has_cloud_entitlement"] is active
        assert _users(client, admin_headers)[user_id]["has_cloud_entitlement"] is active
        assert client.get("/api/v1/billing/status", headers=user_headers).json()["active"] is active
        _, granted_at, has_access = client.portal.call(persisted)
        assert granted_at is not None
        assert has_access is active


@pytest.mark.parametrize("active", [True, False])
def test_non_admin_cannot_change_cloud_entitlements(client, active):
    _, admin_headers = _register_and_login(client, "admin@example.com")
    user_id, headers = _register_and_login(client, "member@example.com")
    response = client.put(
        f"/api/v1/admin/users/{user_id}/cloud-entitlement",
        headers=headers,
        json={"active": active, "reason": "Operator test decision"},
    )
    assert response.status_code == 403
    assert _users(client, admin_headers)[user_id]["has_cloud_entitlement"] is False


def test_cloud_entitlement_update_validates_user_and_body(client):
    user_id, headers = _register_and_login(client, "admin@example.com")
    response = client.put(
        f"/api/v1/admin/users/{uuid.uuid4()}/cloud-entitlement",
        headers=headers,
        json={"active": True, "reason": "Operator test grant"},
    )
    assert response.status_code == 404
    assert client.put(
        "/api/v1/admin/users/invalid/cloud-entitlement", headers=headers, json={"active": True, "reason": "Operator test grant"}
    ).status_code == 422
    assert client.put(
        f"/api/v1/admin/users/{user_id}/cloud-entitlement", headers=headers, json={}
    ).status_code == 422


def test_revocation_overrides_legacy_access_without_changing_purchase_history(client, monkeypatch):
    from app.core.database import async_session
    from app.models.billing import CloudEntitlement, CloudPurchase
    from app.models.subscription import Subscription
    from app.models.user import User
    from app.services import billing

    monkeypatch.setattr(billing.settings, "cloud_mode", True)
    _, headers = _register_and_login(client, "admin@example.com")
    user_id, user_headers = _register_and_login(client, "legacy@example.com")
    purchase_id = uuid.uuid4()

    async def seed():
        async with async_session() as db:
            db.add(Subscription(user_id=uuid.UUID(user_id), status="active"))
            db.add(CloudPurchase(
                id=purchase_id, user_id=uuid.UUID(user_id), stripe_checkout_session_id="cs_admin_test",
                stripe_price_id="price_admin_test", status="paid",
            ))
            await db.commit()

    client.portal.call(seed)
    assert _users(client, headers)[user_id]["has_cloud_entitlement"] is True
    path = f"/api/v1/admin/users/{user_id}/cloud-entitlement"
    assert client.put(path, headers=headers, json={"active": False, "reason": "Operator test revocation"}).json()["has_cloud_entitlement"] is False
    assert client.get("/api/v1/billing/status", headers=user_headers).json()["active"] is False

    async def check():
        from sqlalchemy import select

        async with async_session() as db:
            user = await db.get(User, uuid.UUID(user_id))
            assert await billing.user_has_cloud_entitlement(db, user) is False
            entitlement = await db.scalar(select(CloudEntitlement).where(CloudEntitlement.user_id == user.id))
            entitlement.source_purchase_id = purchase_id
            await db.commit()

    client.portal.call(check)
    assert client.put(path, headers=headers, json={"active": True, "reason": "Operator test grant"}).status_code == 200
    assert client.put(path, headers=headers, json={"active": False, "reason": "Operator test revocation"}).status_code == 200

    async def check_provenance():
        from sqlalchemy import select

        async with async_session() as db:
            entitlement = await db.scalar(select(CloudEntitlement).where(CloudEntitlement.user_id == uuid.UUID(user_id)))
            assert entitlement.source_purchase_id == purchase_id
            assert (await db.get(CloudPurchase, purchase_id)).status == "paid"

    client.portal.call(check_provenance)


def test_multiple_admins_and_first_admin_bootstrap(client):
    from app.core.database import async_session
    from app.models.user import User

    first_id, first_headers = _register_and_login(client, "first@example.com")
    second_id, second_headers = _register_and_login(client, "second@example.com")
    users = _users(client, first_headers)
    assert users[first_id]["is_admin"] is True
    assert users[second_id]["is_admin"] is False

    async def promote():
        async with async_session() as db:
            user = await db.get(User, uuid.UUID(second_id))
            user.is_admin = True
            await db.commit()

    client.portal.call(promote)
    users = _users(client, second_headers)
    assert users[first_id]["is_admin"] is True
    assert users[second_id]["is_admin"] is True
    third_id, _ = _register_and_login(client, "third@example.com")
    assert _users(client, first_headers)[third_id]["is_admin"] is False
    assert client.put(
        f"/api/v1/admin/users/{third_id}/cloud-entitlement",
        headers=second_headers, json={"active": True, "reason": "Operator test grant"},
    ).status_code == 200


def test_admin_action_history_requires_reason_and_records_actor(client):
    admin_id, headers = _register_and_login(client, "ops@example.com")
    user_id, _ = _register_and_login(client, "target@example.com")
    path = f"/api/v1/admin/users/{user_id}"
    assert client.post(f"{path}/suspend", headers=headers).status_code == 422
    assert client.post(f"{path}/suspend", headers=headers, json={"reason": "  "}).status_code == 422
    assert client.post(f"{path}/suspend", headers=headers, json={"reason": "Confirmed account abuse"}).status_code == 200
    assert client.post(f"{path}/activate", headers=headers, json={"reason": "Appeal accepted"}).status_code == 200
    assert client.put(f"{path}/cloud-entitlement", headers=headers, json={"active": True, "reason": "Access recovery"}).status_code == 200
    details = client.get(path, headers=headers).json()
    assert details["entitlement_source"] == "manual grant"
    assert details["entitlement_granted_at"]
    assert details["entitlement_updated_at"]
    assert [a["action"] for a in details["actions"]] == ["grant_cloud", "activate", "suspend"]
    for action in details["actions"]:
        assert action["actor_id"] == admin_id
        assert action["actor_email"] == "ops@example.com"
        assert action["target_id"] == user_id
        assert action["reason"] and action["created_at"]


def test_admin_cannot_suspend_self_and_last_active_admin(client):
    from app.core.database import async_session
    from app.models.user import User
    from app.services import admin
    from fastapi import HTTPException

    admin_id, headers = _register_and_login(client, "last@example.com")
    second_id, _ = _register_and_login(client, "former@example.com")
    response = client.post(f"/api/v1/admin/users/{admin_id}/suspend", headers=headers, json={"reason": "Test"})
    assert response.status_code == 409
    assert "own account" in response.text

    async def stale_request():
        async with async_session() as db:
            actor = await db.get(User, uuid.UUID(second_id))
            actor.is_admin = True
            actor.is_active = False
            await db.commit()
            # Simulate an actor whose request passed auth before suspension.
            with pytest.raises(HTTPException, match="last active admin"):
                await admin.set_user_active(db, admin_id, False, actor, "Stale request")
            await db.rollback()

    client.portal.call(stale_request)
    assert _users(client, headers)[admin_id]["is_active"] is True
    assert client.get(f"/api/v1/admin/users/{admin_id}", headers=headers).json()["actions"] == []


def test_admin_domains_diagnostics_and_moderation_history(client, monkeypatch):
    from app.core.database import async_session
    from app.models.domain import Domain
    from app.models.billing import StripeEvent
    from app.models.link import Link
    from datetime import UTC, datetime

    _, headers = _register_and_login(client, "ops@example.com")
    user_id, member = _register_and_login(client, "owner@example.com")
    domain_id, link_id = uuid.uuid4(), uuid.uuid4()

    async def seed():
        async with async_session() as db:
            db.add(Domain(id=domain_id, user_id=uuid.UUID(user_id), domain="pending.example.com",
                          verification_token="test-verification-placeholder", verification_dns_name="_brev.pending.example.com",
                          cloudflare_status="pending", last_checked_at=datetime.now(UTC)))
            db.add(Link(id=link_id, user_id=uuid.UUID(user_id), slug="audit", url="https://example.com"))
            db.add(StripeEvent(stripe_event_id="evt_ops_test", event_type="checkout.session.completed",
                               status="rejected", failure_reason="price_id metadata does not match configuration",
                               processed_at=datetime.now(UTC)))
            await db.commit()

    client.portal.call(seed)
    domains = client.get("/api/v1/admin/domains?q=pending.example", headers=headers).json()
    assert domains["total"] == 1
    assert domains["items"][0]["owner_email"] == "owner@example.com"
    assert domains["items"][0]["certificate_state"] == "pending"
    assert client.get("/api/v1/admin/domains?q=%", headers=headers).json()["total"] == 0
    for action in ("suspend", "restore"):
        assert client.post(f"/api/v1/admin/domains/{domain_id}/{action}", headers=headers,
                           json={"reason": f"Investigated domain: {action}"}).status_code == 200
    for action in ("flag", "clear"):
        assert client.post(f"/api/v1/admin/links/{link_id}/{action}", headers=headers,
                           json={"reason": "Moderation decision"}).status_code == 200
    details = client.get(f"/api/v1/admin/users/{user_id}", headers=headers).json()
    assert {a["action"] for a in details["actions"]} == {"suspend_domain", "restore_domain", "block_link", "clear_link"}
    diagnostics = client.get("/api/v1/admin/diagnostics", headers=headers).json()
    assert diagnostics["database_verified_at"] and diagnostics["observed_at"]
    assert diagnostics["pending_certificates_total"] == 1
    assert diagnostics["recent_webhooks"][0]["status"] == "rejected"
    assert diagnostics["recent_webhooks"][0]["processed_at"]
    for integration in diagnostics["integrations"]:
        assert isinstance(integration["configured"], bool)
        assert integration["health"] == "Not verified"
        assert integration["observed_at"]
    assert client.get("/api/v1/admin/diagnostics", headers=member).status_code == 403
    assert client.get(f"/api/v1/admin/users/{user_id}", headers=member).status_code == 403
    assert client.post(f"/api/v1/admin/domains/{domain_id}/suspend", headers=member,
                       json={"reason": "Unauthorized"}).status_code == 403
