"""Brev Cloud one-time billing and entitlement helpers."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import stripe
from fastapi import HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.billing import CloudEntitlement, CloudPurchase, StripeEvent
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.billing import BillingStatus

ACTIVE_STATUSES = {"active", "trialing", "paid"}
ONE_TIME_ENTITLEMENT_KEY = "cloud"
SUPPORTED_NON_PAYMENT_EVENTS = {
    "checkout.session.async_payment_failed": "failed",
    "checkout.session.expired": "expired",
    "payment_intent.payment_failed": "failed",
}


async def get_or_create_subscription(db: AsyncSession, user: User) -> Subscription:
    """Keep the legacy row available for old installations and API clients."""
    result = await db.execute(select(Subscription).where(Subscription.user_id == user.id))
    subscription = result.scalar_one_or_none()
    if subscription:
        return subscription
    subscription = Subscription(user_id=user.id)
    db.add(subscription)
    await db.flush()
    await db.refresh(subscription)
    return subscription


async def get_billing_status(db: AsyncSession, user: User) -> BillingStatus:
    entitlement = await db.scalar(
        select(CloudEntitlement).where(
            CloudEntitlement.user_id == user.id,
            CloudEntitlement.entitlement_key == ONE_TIME_ENTITLEMENT_KEY,
            CloudEntitlement.status == "active",
        )
    )
    if entitlement:
        return BillingStatus(
            status="paid",
            plan="cloud-one-time",
            active=True,
            current_period_end=None,
            billing_type="one_time",
            cloud_mode=settings.cloud_mode,
            included_custom_domains=settings.free_custom_domains,
        )

    # Do not remove or reinterpret the legacy table: existing installations
    # can still report old subscription state while no subscription flow is
    # used for new purchases.
    subscription = await get_or_create_subscription(db, user)
    return BillingStatus(
        status=subscription.status,
        plan=subscription.plan,
        active=subscription_is_active(subscription),
        current_period_end=subscription.current_period_end,
        billing_type="legacy_subscription" if subscription_is_active(subscription) else "none",
        cloud_mode=settings.cloud_mode,
        included_custom_domains=settings.free_custom_domains,
    )


async def create_checkout_session(db: AsyncSession, user: User) -> str:
    if not settings.stripe_secret_key or not settings.stripe_price_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe is not configured",
        )

    stripe.api_key = settings.stripe_secret_key
    legacy_subscription = await db.scalar(
        select(Subscription).where(Subscription.user_id == user.id)
    )
    customer_id = legacy_subscription.stripe_customer_id if legacy_subscription else None
    session = stripe.checkout.Session.create(
        mode="payment",
        line_items=[{"price": settings.stripe_price_id, "quantity": 1}],
        success_url=settings.stripe_success_url,
        cancel_url=settings.stripe_cancel_url,
        customer=customer_id,
        customer_email=None if customer_id else user.email,
        client_reference_id=str(user.id),
        metadata={"user_id": str(user.id), "price_id": settings.stripe_price_id},
    )
    session_id = session.get("id")
    session_url = session.get("url")
    if not session_id or not session_url:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Stripe returned an incomplete Checkout session",
        )

    db.add(
        CloudPurchase(
            user_id=user.id,
            stripe_checkout_session_id=session_id,
            stripe_payment_intent_id=session.get("payment_intent"),
            stripe_customer_id=session.get("customer") or customer_id,
            stripe_price_id=settings.stripe_price_id,
            status="pending",
        )
    )
    await db.flush()
    return session_url


async def handle_stripe_webhook(db: AsyncSession, request: Request) -> dict[str, str]:
    if not settings.stripe_webhook_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe webhook is not configured",
        )

    # Signature verification must receive exactly these bytes, before any
    # JSON parsing or normalization.
    payload = await request.body()
    signature = request.headers.get("stripe-signature")
    if not signature:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing Stripe signature")

    try:
        event = stripe.Webhook.construct_event(payload, signature, settings.stripe_webhook_secret)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Stripe signature")

    event_id = event.get("id")
    event_type = event.get("type")
    if not event_id or not event_type:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Stripe event")

    event_row, inserted = await _record_event(db, event)
    if not inserted:
        return {"status": "duplicate"}

    data = event.get("data", {}).get("object", {})
    outcome = "ignored"
    reason = None
    if event_type == "checkout.session.completed":
        outcome, reason = await _apply_checkout_completed(db, data)
    elif event_type in SUPPORTED_NON_PAYMENT_EVENTS:
        await _mark_non_payment_event(db, data, SUPPORTED_NON_PAYMENT_EVENTS[event_type])
        outcome = "ignored"
    # Subscription events are intentionally only recorded as ignored. They are
    # not part of the one-time Cloud access flow.

    event_row.status = outcome
    event_row.failure_reason = reason
    event_row.processed_at = datetime.now(UTC)
    await db.flush()
    return {"status": "ok"}


def subscription_is_active(subscription: Subscription | None) -> bool:
    if subscription is None or subscription.status not in ACTIVE_STATUSES:
        return False
    if subscription.current_period_end and subscription.current_period_end < datetime.now(UTC):
        return False
    return True


async def user_has_cloud_entitlement(db: AsyncSession, user: User) -> bool:
    if not settings.cloud_mode:
        return True
    entitlement = await db.scalar(
        select(CloudEntitlement).where(
            CloudEntitlement.user_id == user.id,
            CloudEntitlement.entitlement_key == ONE_TIME_ENTITLEMENT_KEY,
            CloudEntitlement.status == "active",
        )
    )
    if entitlement:
        return True

    # Compatibility read for legacy subscription rows. New webhook events do
    # not mutate this table.
    subscription = await db.scalar(select(Subscription).where(Subscription.user_id == user.id))
    return subscription_is_active(subscription)


async def _apply_checkout_completed(db: AsyncSession, session) -> tuple[str, str | None]:
    user_id, price_id, reason = _validated_checkout_identity(session)
    if reason:
        return "rejected", reason

    payment_status = session.get("payment_status")
    if payment_status != "paid":
        await _mark_non_payment_event(db, session, "unpaid")
        return "ignored", "checkout session was not paid"
    if not session.get("id") or not session.get("payment_intent"):
        return "rejected", "paid Checkout session is missing Stripe identifiers"

    user = await db.scalar(select(User).where(User.id == user_id))
    if user is None:
        return "rejected", "user does not exist"

    purchase, reason = await _get_or_create_purchase(db, session, user_id, price_id)
    if reason:
        return "rejected", reason
    purchase.status = "paid"
    purchase.paid_at = datetime.now(UTC)
    purchase.stripe_payment_intent_id = session.get("payment_intent") or purchase.stripe_payment_intent_id
    purchase.stripe_customer_id = session.get("customer") or purchase.stripe_customer_id

    entitlement = await db.scalar(
        select(CloudEntitlement).where(
            CloudEntitlement.user_id == user_id,
            CloudEntitlement.entitlement_key == ONE_TIME_ENTITLEMENT_KEY,
        )
    )
    if entitlement is None:
        entitlement = CloudEntitlement(
            user_id=user_id,
            entitlement_key=ONE_TIME_ENTITLEMENT_KEY,
            status="active",
            source_purchase=purchase,
        )
        db.add(entitlement)
    else:
        entitlement.status = "active"
        entitlement.source_purchase = purchase
    await db.flush()
    return "processed", None


def _validated_checkout_identity(session) -> tuple[uuid.UUID | None, str | None, str | None]:
    if session.get("mode") != "payment":
        return None, None, "Checkout session mode is not payment"
    metadata = session.get("metadata") or {}
    raw_user_id = metadata.get("user_id")
    client_reference_id = session.get("client_reference_id")
    if not raw_user_id or not client_reference_id or raw_user_id != client_reference_id:
        return None, None, "user_id metadata and client_reference_id do not match"
    try:
        user_id = uuid.UUID(str(raw_user_id))
    except (ValueError, AttributeError, TypeError):
        return None, None, "invalid user_id metadata"

    configured_price_id = settings.stripe_price_id
    metadata_price_id = metadata.get("price_id")
    if not configured_price_id or metadata_price_id != configured_price_id:
        return None, None, "price_id metadata does not match configuration"

    line_items = session.get("line_items")
    if line_items is not None:
        items = line_items.get("data", [])
        price_ids = [item.get("price", {}).get("id") for item in items]
        if price_ids != [configured_price_id]:
            return None, None, "Checkout line item price does not match configuration"
    return user_id, configured_price_id, None


async def _get_or_create_purchase(
    db: AsyncSession, session, user_id: uuid.UUID, price_id: str
) -> tuple[CloudPurchase, str | None]:
    session_id = session.get("id")
    payment_intent_id = session.get("payment_intent")
    if not session_id:
        return CloudPurchase(), "missing checkout session id"

    purchase = await db.scalar(
        select(CloudPurchase).where(CloudPurchase.stripe_checkout_session_id == session_id)
    )
    if purchase is None and payment_intent_id:
        purchase = await db.scalar(
            select(CloudPurchase).where(CloudPurchase.stripe_payment_intent_id == payment_intent_id)
        )
    if purchase is not None:
        if purchase.user_id != user_id or purchase.stripe_price_id != price_id:
            return purchase, "existing purchase identity does not match event"
        return purchase, None

    purchase = CloudPurchase(
        user_id=user_id,
        stripe_checkout_session_id=session_id,
        stripe_payment_intent_id=payment_intent_id,
        stripe_customer_id=session.get("customer"),
        stripe_price_id=price_id,
        status="pending",
    )
    db.add(purchase)
    await db.flush()
    return purchase, None


async def _mark_non_payment_event(db: AsyncSession, session, state: str) -> None:
    session_id = session.get("id")
    payment_intent_id = session.get("payment_intent") or session.get("id")
    purchase = None
    if session_id:
        purchase = await db.scalar(
            select(CloudPurchase).where(CloudPurchase.stripe_checkout_session_id == session_id)
        )
    if purchase is None and payment_intent_id:
        purchase = await db.scalar(
            select(CloudPurchase).where(CloudPurchase.stripe_payment_intent_id == payment_intent_id)
        )
    if purchase is not None and purchase.status != "paid":
        purchase.status = state
        await db.flush()


async def _record_event(db: AsyncSession, event) -> tuple[StripeEvent, bool]:
    values = {
        "stripe_event_id": event["id"],
        "event_type": event["type"],
        "status": "received",
        "stripe_created_at": _stripe_timestamp(event.get("created")),
    }
    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        statement = postgres_insert(StripeEvent).values(**values).on_conflict_do_nothing(
            index_elements=[StripeEvent.stripe_event_id]
        )
    elif dialect == "sqlite":
        statement = sqlite_insert(StripeEvent).values(**values).on_conflict_do_nothing(
            index_elements=[StripeEvent.stripe_event_id]
        )
    else:
        existing = await db.scalar(
            select(StripeEvent).where(StripeEvent.stripe_event_id == event["id"])
        )
        if existing:
            return existing, False
        db.add(StripeEvent(**values))
        await db.flush()
        return await db.scalar(select(StripeEvent).where(StripeEvent.stripe_event_id == event["id"])), True

    result = await db.execute(statement)
    event_row = await db.scalar(select(StripeEvent).where(StripeEvent.stripe_event_id == event["id"]))
    return event_row, result.rowcount == 1


def _stripe_timestamp(value) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromtimestamp(int(value), UTC)
    except (TypeError, ValueError, OSError):
        return None
