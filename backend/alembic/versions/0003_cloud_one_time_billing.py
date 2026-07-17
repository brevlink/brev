"""Add one-time Cloud purchases, entitlements, and Stripe event idempotency."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0003_cloud_one_time_billing"
down_revision = "0002_auth_hardening"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "cloud_purchases",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("stripe_checkout_session_id", sa.String(length=255), nullable=False),
        sa.Column("stripe_payment_intent_id", sa.String(length=255), nullable=True),
        sa.Column("stripe_customer_id", sa.String(length=255), nullable=True),
        sa.Column("stripe_price_id", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("stripe_checkout_session_id"),
        sa.UniqueConstraint("stripe_payment_intent_id"),
    )
    op.create_index("ix_cloud_purchases_user_id", "cloud_purchases", ["user_id"], unique=False)
    op.create_index("ix_cloud_purchases_status", "cloud_purchases", ["status"], unique=False)

    op.create_table(
        "cloud_entitlements",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("entitlement_key", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("source_purchase_id", sa.Uuid(), nullable=True),
        sa.Column("granted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["source_purchase_id"], ["cloud_purchases.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "entitlement_key", name="uq_cloud_entitlements_user_key"),
    )
    op.create_index("ix_cloud_entitlements_status", "cloud_entitlements", ["status"], unique=False)

    op.create_table(
        "stripe_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("stripe_event_id", sa.String(length=255), nullable=False),
        sa.Column("event_type", sa.String(length=128), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("failure_reason", sa.String(length=255), nullable=True),
        sa.Column("stripe_created_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("stripe_event_id"),
    )


def downgrade() -> None:
    op.drop_table("stripe_events")
    op.drop_index("ix_cloud_entitlements_status", table_name="cloud_entitlements")
    op.drop_table("cloud_entitlements")
    op.drop_index("ix_cloud_purchases_status", table_name="cloud_purchases")
    op.drop_index("ix_cloud_purchases_user_id", table_name="cloud_purchases")
    op.drop_table("cloud_purchases")
