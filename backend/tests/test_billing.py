from __future__ import annotations

import json

from fastapi.testclient import TestClient


PASSWORD = "Correct-Horse-Battery-1"


def _register_and_login(client: TestClient, email: str = "billing@example.com") -> str:
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
