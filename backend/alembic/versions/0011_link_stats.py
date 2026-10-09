"""Privacy-minimized events and durable daily click aggregates."""
from alembic import op
import sqlalchemy as sa

revision = "0011_link_stats"
down_revision = "0010_account_settings"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "link_click_events",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("link_id", sa.Uuid(), sa.ForeignKey("links.id", ondelete="CASCADE"), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("country", sa.String(2)),
        sa.Column("referrer_host", sa.Text()),
        sa.Column("device", sa.Text(), nullable=False),
        sa.Column("visitor_hash", sa.Text()),
        sa.Column("hits", sa.Integer(), nullable=False, server_default="1"),
        sa.UniqueConstraint("link_id", "day", "visitor_hash", name="uq_click_event_visitor"),
    )
    for column in ("link_id", "occurred_at", "day"):
        op.create_index(f"ix_link_click_events_{column}", "link_click_events", [column])
    op.create_table(
        "link_click_daily",
        sa.Column("link_id", sa.Uuid(), sa.ForeignKey("links.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("day", sa.Date(), primary_key=True),
        sa.Column("clicks", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("visitors", sa.Integer(), nullable=False, server_default="0"),
        sa.UniqueConstraint("link_id", "day", name="uq_click_daily_link_day"),
    )


def downgrade():
    op.drop_table("link_click_daily")
    op.drop_table("link_click_events")
