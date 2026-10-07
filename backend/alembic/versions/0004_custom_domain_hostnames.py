"""custom domain hostnames on Cloudflare for SaaS

Revision ID: 0004_custom_domain_hostnames
Revises: 0003_cloud_one_time_billing
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0004_custom_domain_hostnames"
down_revision = "0003_cloud_one_time_billing"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "domains",
        sa.Column("cloudflare_hostname_id", sa.String(length=64), nullable=True),
    )
    op.add_column(
        "domains",
        sa.Column("cloudflare_status", sa.String(length=32), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("domains", "cloudflare_status")
    op.drop_column("domains", "cloudflare_hostname_id")
