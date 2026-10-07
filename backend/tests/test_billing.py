from __future__ import annotations

import json

import pytest

from fastapi.testclient import TestClient


PASSWORD = "Correct-Horse-Battery-1"


def _register_and_login(client: TestClient, email: str = "billing@example.com") -> str:
    client.post("/api/v1/auth/register", json={"email": "billing-bootstrap@example.com", "password": PASSWORD})
    response = client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": PASSWORD},
    )
    assert response.status_code == 201, response.text
    response = client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": PASSWORD},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def _configure_stripe(monkeypatch, price_id: str = "price_test_cloud"):
    from app.services import billing

    monkeypatch.setattr(billing.settings, "cloud_mode", True)
    monkeypatch.setattr(billing.settings, "stripe_secret_key", "sk_test_placeholder")
    monkeypatch.setattr(billing.settings, "stripe_webhook_secret", "whsec_test_placeholder")
    monkeypatch.setattr(billing.settings, "stripe_price_id", price_id)
    return billing


def _event(user_id: str, price_id: str, *, event_id: str = "evt_test_1", payment_status: str = "paid"):
    return {
        "id": event_id,
        "type": "checkout.session.completed",
        "created": 1_700_000_000,
        "data": {
            "object": {
                "id": "cs_test_123",
                "mode": "payment",
                "payment_status": payment_status,
                "payment_intent": "pi_test_123",
                "customer": "cus_test_123",
                "client_reference_id": user_id,
                "metadata": {"user_id": user_id, "price_id": price_id},
                "line_items": {"data": [{"price": {"id": price_id}}]},
            }
        },
    }


def _post_event(client: TestClient, event, monkeypatch):
    from app.services import billing

    monkeypatch.setattr(
        billing.stripe.Webhook,
        "construct_event",
        lambda payload, signature, secret: event,
    )
    return client.post(
        "/api/v1/billing/webhook",
        content=json.dumps(event).encode(),
        headers={"Stripe-Signature": "sig_test"},
    )


def test_checkout_uses_one_time_mode_and_configured_price(client, monkeypatch):
    billing = _configure_stripe(monkeypatch)
    token = _register_and_login(client)
    captured = {}

    def create(**kwargs):
        captured.update(kwargs)
        return {
            "id": "cs_test_123",
            "url": "https://checkout.stripe.test/cs_test_123",
            "payment_intent": "pi_test_123",
            "customer": "cus_test_123",
        }

    monkeypatch.setattr(billing.stripe.checkout.Session, "create", create)
    response = client.post("/api/v1/billing/checkout", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert captured["mode"] == "payment"
    assert captured["line_items"] == [{"price": "price_test_cloud", "quantity": 1}]
    assert captured["metadata"]["user_id"]
    assert captured["metadata"]["price_id"] == "price_test_cloud"
    assert captured["client_reference_id"] == captured["metadata"]["user_id"]


def test_checkout_returns_503_when_stripe_is_not_configured(client, monkeypatch):
    from app.services import billing

    monkeypatch.setattr(billing.settings, "cloud_mode", True)
    monkeypatch.setattr(billing.settings, "stripe_secret_key", None)
    monkeypatch.setattr(billing.settings, "stripe_price_id", None)
    token = _register_and_login(client)

    response = client.post("/api/v1/billing/checkout", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 503
    assert "Stripe is not configured" in response.text


def test_webhook_signature_is_checked_against_raw_body(client, monkeypatch):
    billing = _configure_stripe(monkeypatch)
    seen = {}

    def construct(payload, signature, secret):
        seen.update(payload=payload, signature=signature, secret=secret)
        raise ValueError("bad signature")

    monkeypatch.setattr(billing.stripe.Webhook, "construct_event", construct)
    raw = b'{"type":"checkout.session.completed"}'
    response = client.post(
        "/api/v1/billing/webhook",
        content=raw,
        headers={"Stripe-Signature": "sig_test"},
    )

    assert response.status_code == 400
    assert seen == {
        "payload": raw,
        "signature": "sig_test",
        "secret": "whsec_test_placeholder",
    }


def test_webhook_with_session_cookie_reaches_signature_verifier(client, monkeypatch):
    billing = _configure_stripe(monkeypatch)
    _register_and_login(client)
    raw = b'{"type":"checkout.session.completed"}'
    seen = {}

    def construct(payload, signature, secret):
        seen.update(payload=payload, signature=signature, secret=secret)
        raise ValueError("bad signature")

    monkeypatch.setattr(billing.stripe.Webhook, "construct_event", construct)
    response = client.post(
        "/api/v1/billing/webhook",
        content=raw,
        headers={"Stripe-Signature": "sig_test"},
    )

    assert response.status_code == 400
    assert seen == {
        "payload": raw,
        "signature": "sig_test",
        "secret": "whsec_test_placeholder",
    }


def test_paid_checkout_grants_persistent_one_time_entitlement(client, monkeypatch):
    billing = _configure_stripe(monkeypatch)
    token = _register_and_login(client)
    user_id = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).json()["id"]

    response = _post_event(client, _event(user_id, "price_test_cloud"), monkeypatch)
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

    status_response = client.get("/api/v1/billing/status", headers={"Authorization": f"Bearer {token}"})
    assert status_response.json()["status"] == "paid"
    assert status_response.json()["plan"] == "cloud-one-time"
    assert status_response.json()["billing_type"] == "one_time"
    assert status_response.json()["active"] is True


def test_duplicate_webhook_event_is_idempotent(client, monkeypatch):
    billing = _configure_stripe(monkeypatch)
    token = _register_and_login(client)
    user_id = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).json()["id"]
    event = _event(user_id, "price_test_cloud")

    first = _post_event(client, event, monkeypatch)
    duplicate = _post_event(client, event, monkeypatch)

    assert first.status_code == 200
    assert duplicate.status_code == 200
    assert duplicate.json() == {"status": "duplicate"}
    assert client.get(
        "/api/v1/billing/status", headers={"Authorization": f"Bearer {token}"}
    ).json()["active"] is True


def test_webhook_price_mismatch_does_not_grant_access(client, monkeypatch):
    _configure_stripe(monkeypatch)
    token = _register_and_login(client)
    user_id = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).json()["id"]

    response = _post_event(client, _event(user_id, "price_wrong"), monkeypatch)

    assert response.status_code == 200
    billing_status = client.get(
        "/api/v1/billing/status", headers={"Authorization": f"Bearer {token}"}
    ).json()
    assert billing_status["active"] is False
    assert billing_status["billing_type"] == "none"


def test_unpaid_checkout_does_not_grant_access(client, monkeypatch):
    _configure_stripe(monkeypatch)
    token = _register_and_login(client)
    user_id = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).json()["id"]

    response = _post_event(
        client,
        _event(user_id, "price_test_cloud", event_id="evt_unpaid", payment_status="unpaid"),
        monkeypatch,
    )

    assert response.status_code == 200
    assert client.get(
        "/api/v1/billing/status", headers={"Authorization": f"Bearer {token}"}
    ).json()["active"] is False


def test_one_time_entitlement_grants_cloud_access(client, monkeypatch):
    billing = _configure_stripe(monkeypatch)
    monkeypatch.setattr(billing.settings, "cloud_mode", True)
    _register_and_login(client, "admin-billing@example.com")
    token = _register_and_login(client, "cloud-billing@example.com")
    user_id = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"}).json()["id"]

    assert _post_event(client, _event(user_id, "price_test_cloud", event_id="evt_access"), monkeypatch).status_code == 200

    response = client.post(
        "/api/v1/domains",
        headers={"Authorization": f"Bearer {token}"},
        json={"domain": "paid.example.com"},
    )
    assert response.status_code == 201, response.text


def test_self_hosted_checkout_never_calls_stripe(client, monkeypatch):
    billing = _configure_stripe(monkeypatch)
    monkeypatch.setattr(billing.settings, "cloud_mode", False)
    token = _register_and_login(client)
    monkeypatch.setattr(billing.stripe.checkout.Session, "create", lambda **kwargs: pytest.fail("Unexpected Stripe call"))
    response = client.post("/api/v1/billing/checkout", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 409


def test_checkout_reuses_open_session_and_blocks_completed_session(client, monkeypatch):
    billing = _configure_stripe(monkeypatch)
    token = _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    created = []

    def create(**kwargs):
        created.append(kwargs)
        return {"id": "cs_guard", "url": "https://checkout.stripe.test/guard"}

    monkeypatch.setattr(billing.stripe.checkout.Session, "create", create)
    monkeypatch.setattr(billing.stripe.checkout.Session, "retrieve", lambda _: {"status": "open", "payment_status": "unpaid"})
    first = client.post("/api/v1/billing/checkout", headers=headers)
    assert first.status_code == 200, first.text
    assert client.post("/api/v1/billing/checkout", headers=headers).json() == first.json()
    assert len(created) == 1
    assert created[0]["idempotency_key"]
    monkeypatch.setattr(billing.stripe.checkout.Session, "retrieve", lambda _: {"status": "complete", "payment_status": "paid"})
    assert client.post("/api/v1/billing/checkout", headers=headers).status_code == 409
    assert len(created) == 1


def test_checkout_blocks_paid_account_even_after_admin_revocation(client, monkeypatch):
    _configure_stripe(monkeypatch)
    token = _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    user_id = client.get("/api/v1/auth/me", headers=headers).json()["id"]
    assert _post_event(client, _event(user_id, "price_test_cloud"), monkeypatch).status_code == 200
    assert client.post("/api/v1/billing/checkout", headers=headers).status_code == 409
    admin_token = client.post("/api/v1/auth/login", json={"email": "billing-bootstrap@example.com", "password": PASSWORD}).json()["access_token"]
    assert client.put(f"/api/v1/admin/users/{user_id}/cloud-entitlement", headers={"Authorization": f"Bearer {admin_token}"},
                      json={"active": False, "reason": "Operator revocation"}).status_code == 200
    response = client.post("/api/v1/billing/checkout", headers=headers)
    assert response.status_code == 409
    assert "already paid" in response.text


@pytest.mark.parametrize("access", ["manual", "legacy"])
def test_checkout_blocks_existing_access(client, monkeypatch, access):
    import uuid
    from app.core.database import async_session
    from app.models.billing import CloudEntitlement
    from app.models.subscription import Subscription

    _configure_stripe(monkeypatch)
    token = _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    user_id = client.get("/api/v1/auth/me", headers=headers).json()["id"]

    async def seed():
        async with async_session() as db:
            model = CloudEntitlement if access == "manual" else Subscription
            db.add(model(user_id=uuid.UUID(user_id), status="active"))
            await db.commit()

    client.portal.call(seed)
    assert client.post("/api/v1/billing/checkout", headers=headers).status_code == 409


def test_expired_checkout_can_start_a_new_attempt(client, monkeypatch):
    billing = _configure_stripe(monkeypatch)
    token = _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    keys = []

    def create(**kwargs):
        keys.append(kwargs["idempotency_key"])
        return {"id": f"cs_expiry_{len(keys)}", "url": f"https://checkout.stripe.test/{len(keys)}"}

    monkeypatch.setattr(billing.stripe.checkout.Session, "create", create)
    monkeypatch.setattr(billing.stripe.checkout.Session, "retrieve", lambda _: {"status": "expired", "payment_status": "unpaid"})
    assert client.post("/api/v1/billing/checkout", headers=headers).status_code == 200
    assert client.post("/api/v1/billing/checkout", headers=headers).status_code == 200
    assert len(keys) == 2 and keys[0] != keys[1]


def test_unknown_checkout_attempt_retries_same_key_and_fails_closed_after_window(client, monkeypatch):
    import uuid
    from datetime import UTC, datetime, timedelta
    from app.core.database import async_session
    from app.models.billing import CheckoutGuard

    billing = _configure_stripe(monkeypatch)
    token = _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    user_id = client.get("/api/v1/auth/me", headers=headers).json()["id"]
    keys = []

    def incomplete(**kwargs):
        keys.append(kwargs["idempotency_key"])
        return {"id": "cs_missing_url"}

    monkeypatch.setattr(billing.stripe.checkout.Session, "create", incomplete)
    assert client.post("/api/v1/billing/checkout", headers=headers).status_code == 502
    assert client.post("/api/v1/billing/checkout", headers=headers).status_code == 502
    assert keys[0] == keys[1]

    async def age():
        async with async_session() as db:
            guard = await db.get(CheckoutGuard, uuid.UUID(user_id))
            guard.attempted_at = datetime.now(UTC) - timedelta(hours=24)
            await db.commit()

    client.portal.call(age)
    assert client.post("/api/v1/billing/checkout", headers=headers).status_code == 409
    assert len(keys) == 2


def test_concurrent_checkout_requests_create_one_session(client, monkeypatch, tmp_path):
    import asyncio
    import uuid
    from sqlalchemy import func, select
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
    from app.core.database import Base
    from app.models.billing import CloudPurchase
    from app.models.user import User

    billing = _configure_stripe(monkeypatch)
    calls = []

    def create(**kwargs):
        calls.append(kwargs)
        return {"id": "cs_concurrent", "url": "https://checkout.stripe.test/concurrent"}

    monkeypatch.setattr(billing.stripe.checkout.Session, "create", create)
    monkeypatch.setattr(billing.stripe.checkout.Session, "retrieve", lambda _: {"status": "open", "payment_status": "unpaid"})

    async def run():
        # Separate file-backed connections exercise the database lock, rather
        # than sharing TestClient's in-memory connection between both requests.
        engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path}/checkout.db")
        sessions = async_sessionmaker(engine, expire_on_commit=False)
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            user_id = uuid.uuid4()
            async with sessions() as db:
                db.add(User(id=user_id, email="concurrent@example.com", password_hash="not-a-real-password-hash"))
                await db.commit()

            async def checkout():
                async with sessions() as db:
                    user = await db.get(User, user_id)
                    url = await billing.create_checkout_session(db, user)
                    await db.commit()
                    return url

            urls = await asyncio.gather(checkout(), checkout())
            assert urls == ["https://checkout.stripe.test/concurrent"] * 2
            async with sessions() as db:
                assert await db.scalar(select(func.count(CloudPurchase.id))) == 1
        finally:
            await engine.dispose()

    client.portal.call(run)
    assert len(calls) == 1


def test_payment_date_survives_a_second_event_for_the_same_payment(client, monkeypatch):
    _configure_stripe(monkeypatch)
    token = _register_and_login(client)
    headers = {"Authorization": f"Bearer {token}"}
    user_id = client.get("/api/v1/auth/me", headers=headers).json()["id"]
    assert _post_event(client, _event(user_id, "price_test_cloud", event_id="evt_first_date"), monkeypatch).status_code == 200
    admin_token = client.post("/api/v1/auth/login", json={"email": "billing-bootstrap@example.com", "password": PASSWORD}).json()["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    before = client.get(f"/api/v1/admin/users/{user_id}", headers=admin_headers).json()
    assert _post_event(client, _event(user_id, "price_test_cloud", event_id="evt_second_date"), monkeypatch).status_code == 200
    after = client.get(f"/api/v1/admin/users/{user_id}", headers=admin_headers).json()
    assert len(after["purchases"]) == 1
    assert after["purchases"][0]["paid_at"] == before["purchases"][0]["paid_at"]
    assert after["entitlement_source"] == "purchase"
    assert after["source_purchase_id"] == after["purchases"][0]["id"]
    assert after["effective_access"] is True
