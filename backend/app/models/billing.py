"""Persistent one-time Cloud purchases, entitlements, and Stripe events."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CloudPurchase(Base):
    """A Stripe Checkout payment for the one-time Cloud product."""

    __tablename__ = "cloud_purchases"
    __table_args__ = (
        Index("ix_cloud_purchases_user_id", "user_id"),
        Index("ix_cloud_purchases_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    stripe_checkout_session_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    stripe_payment_intent_id: Mapped[str | None] = mapped_column(String(255), unique=True, default=None)
    stripe_customer_id: Mapped[str | None] = mapped_column(String(255), default=None)
    stripe_price_id: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending", nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    user = relationship("User", back_populates="cloud_purchases")
    entitlements = relationship("CloudEntitlement", back_populates="source_purchase")


class CloudEntitlement(Base):
    """Durable access granted by a successful one-time Cloud purchase."""

    __tablename__ = "cloud_entitlements"
    __table_args__ = (
        UniqueConstraint("user_id", "entitlement_key", name="uq_cloud_entitlements_user_key"),
        Index("ix_cloud_entitlements_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    entitlement_key: Mapped[str] = mapped_column(String(64), default="cloud", nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)
    source_purchase_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("cloud_purchases.id", ondelete="SET NULL"), default=None
    )
    granted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    user = relationship("User", back_populates="cloud_entitlement")
    source_purchase = relationship("CloudPurchase", back_populates="entitlements")


class StripeEvent(Base):
    """Minimal Stripe event store used to make webhook effects idempotent."""

    __tablename__ = "stripe_events"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    stripe_event_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    event_type: Mapped[str] = mapped_column(String(128), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="received", nullable=False)
    failure_reason: Mapped[str | None] = mapped_column(String(255), default=None)
    stripe_created_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class CheckoutGuard(Base):
    """One reusable Checkout attempt per account, including before webhook delivery."""

    __tablename__ = "checkout_guards"
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    attempt_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), default=uuid.uuid4, nullable=False)
    session_id: Mapped[str | None] = mapped_column(String(255), default=None)
    checkout_url: Mapped[str | None] = mapped_column(String(2048), default=None)
    attempted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)


class AdminAction(Base):
    """Snapshots survive target deletion so operator decisions remain explainable."""

    __tablename__ = "admin_actions"
    id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    actor_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    actor_email: Mapped[str] = mapped_column(String(320), nullable=False)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    target_type: Mapped[str] = mapped_column(String(32), nullable=False)
    target_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    account_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), index=True)
    reason: Mapped[str] = mapped_column(String(1000), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False)
