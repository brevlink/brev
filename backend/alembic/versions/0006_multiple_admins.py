"""Allow multiple admins while retaining first-admin bootstrap."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0006_multiple_admins"
down_revision = "0005_domain_members"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_index("uq_users_single_admin", table_name="users")


def downgrade() -> None:
    # Refuse a downgrade with multiple admins rather than silently demoting them.
    op.create_index(
        "uq_users_single_admin",
        "users",
        ["is_admin"],
        unique=True,
        postgresql_where=sa.text("is_admin"),
        sqlite_where=sa.text("is_admin"),
    )
