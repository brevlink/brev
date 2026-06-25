"""Cloud billing and entitlement helpers."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

import stripe
from fastapi import HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.billing import BillingStatus

ACTIVE_STATUSES = {"active", "trialing", "paid"}


async def get_or_create_subscription(db: AsyncSession, user: User) -> Subscription:
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
    subscription = await get_or_create_subscription(db, user)
    return BillingStatus(
        status=subscription.status,
        plan=subscription.plan,
        active=subscription_is_active(subscription),
        current_period_end=subscription.current_period_end,
        cloud_mode=settings.cloud_mode,
        included_custom_domains=settings.free_custom_domains,
    )


async def create_checkout_session(db: AsyncSession, user: User) -> str:
    if not settings.stripe_secret_key or not settings.stripe_price_id:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Stripe is not configured")

    stripe.api_key = settings.stripe_secret_key
    subscription = await get_or_create_subscription(db, user)
    session = stripe.checkout.Session.create(
        mode="subscription",
        line_items=[{"price": settings.stripe_price_id, "quantity": 1}],
        success_url=settings.stripe_success_url,
        cancel_url=settings.stripe_cancel_url,
        customer=subscription.stripe_customer_id,
        customer_email=None if subscription.stripe_customer_id else user.email,
        client_reference_id=str(user.id),
        metadata={"user_id": str(user.id)},
    )
    return session.url


async def handle_stripe_webhook(db: AsyncSession, request: Request) -> dict[str, str]:
    if not settings.stripe_webhook_secret:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Stripe webhook is not configured")

    payload = await request.body()
    signature = request.headers.get("stripe-signature")
    if not signature:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing Stripe signature")

    try:
        event = stripe.Webhook.construct_event(payload, signature, settings.stripe_webhook_secret)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Stripe signature")

    event_type = event["type"]
    data = event["data"]["object"]
    if event_type == "checkout.session.completed":
        await _apply_checkout_completed(db, data)
    elif event_type in {"customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"}:
        await _apply_subscription_event(db, data)
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
    subscription = await get_or_create_subscription(db, user)
    return subscription_is_active(subscription)


async def _apply_checkout_completed(db: AsyncSession, session) -> None:
    user_id = session.get("metadata", {}).get("user_id") or session.get("client_reference_id")
    if not user_id:
        return
    subscription = await _subscription_for_user_id(db, user_id)
    subscription.stripe_customer_id = session.get("customer")
    subscription.stripe_subscription_id = session.get("subscription")
    subscription.status = "active"
    subscription.plan = "cloud"
    await db.flush()


async def _apply_subscription_event(db: AsyncSession, stripe_subscription) -> None:
    subscription_id = stripe_subscription.get("id")
    customer_id = stripe_subscription.get("customer")
    result = await db.execute(
        select(Subscription).where(
            (Subscription.stripe_subscription_id == subscription_id)
            | (Subscription.stripe_customer_id == customer_id)
        )
    )
    subscription = result.scalar_one_or_none()
    if subscription is None:
        return
    subscription.stripe_subscription_id = subscription_id
    subscription.stripe_customer_id = customer_id
    subscription.status = stripe_subscription.get("status", "inactive")
    subscription.plan = "cloud" if subscription.status in ACTIVE_STATUSES else "free"
    period_end = stripe_subscription.get("current_period_end")
    subscription.current_period_end = datetime.fromtimestamp(period_end, UTC) if period_end else None
    await db.flush()


async def _subscription_for_user_id(db: AsyncSession, user_id: str) -> Subscription:
    result = await db.execute(select(Subscription).where(Subscription.user_id == uuid.UUID(user_id)))
    subscription = result.scalar_one_or_none()
    if subscription:
        return subscription
    subscription = Subscription(user_id=uuid.UUID(user_id))
    db.add(subscription)
    await db.flush()
    return subscription
