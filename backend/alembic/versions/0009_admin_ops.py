"""Record operator decisions and serialize Cloud checkout attempts."""
from alembic import op
import sqlalchemy as sa

revision = "0009_admin_ops"
down_revision = "0008_link_reports"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "checkout_guards",
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("attempt_id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.String(255)),
        sa.Column("checkout_url", sa.String(2048)),
        sa.Column("attempted_at", sa.DateTime(timezone=True)),
    )
    op.create_table(
        "admin_actions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("actor_id", sa.Uuid(), nullable=False),
        sa.Column("actor_email", sa.String(320), nullable=False),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("target_type", sa.String(32), nullable=False),
        sa.Column("target_id", sa.Uuid(), nullable=False),
        sa.Column("account_id", sa.Uuid()),
        sa.Column("reason", sa.String(1000), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_admin_actions_account_id", "admin_actions", ["account_id"])


def downgrade() -> None:
    op.drop_table("admin_actions")
    op.drop_table("checkout_guards")
