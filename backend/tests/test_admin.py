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
        response = client.put(path, headers=admin_headers, json={"active": active})
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
        json={"active": active},
    )
    assert response.status_code == 403
    assert _users(client, admin_headers)[user_id]["has_cloud_entitlement"] is False


def test_cloud_entitlement_update_validates_user_and_body(client):
    user_id, headers = _register_and_login(client, "admin@example.com")
    response = client.put(
        f"/api/v1/admin/users/{uuid.uuid4()}/cloud-entitlement",
        headers=headers,
        json={"active": True},
    )
    assert response.status_code == 404
    assert client.put(
        "/api/v1/admin/users/invalid/cloud-entitlement", headers=headers, json={"active": True}
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
    assert client.put(path, headers=headers, json={"active": False}).json()["has_cloud_entitlement"] is False
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
    assert client.put(path, headers=headers, json={"active": True}).status_code == 200
    assert client.put(path, headers=headers, json={"active": False}).status_code == 200

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
        headers=second_headers, json={"active": True},
    ).status_code == 200
