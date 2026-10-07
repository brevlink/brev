"""Persist public reports and their review state."""
from alembic import op
import sqlalchemy as sa

revision = "0008_link_reports"
down_revision = "0007_domain_link_cascade"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "reports",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("short_url", sa.String(2048), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("reporter_email", sa.String(320), nullable=True),
        sa.Column("link_id", sa.Uuid(), sa.ForeignKey("links.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_reports_link_id", "reports", ["link_id"])


def downgrade() -> None:
    op.drop_index("ix_reports_link_id", table_name="reports")
    op.drop_table("reports")
