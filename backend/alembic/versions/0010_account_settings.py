"""Email changes and detached accounting records."""
from alembic import op
import sqlalchemy as sa

revision = "0010_account_settings"
down_revision = "0009_admin_ops"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("auth_tokens", sa.Column("pending_email", sa.String(320)))
    for table in ("cloud_purchases", "subscriptions"):
        op.drop_constraint(f"{table}_user_id_fkey", table, type_="foreignkey")
        op.alter_column(table, "user_id", nullable=True)
        op.create_foreign_key(f"{table}_user_id_fkey", table, "users", ["user_id"], ["id"], ondelete="SET NULL")


def downgrade():
    for table in ("cloud_purchases", "subscriptions"):
        op.execute(sa.text(f"DELETE FROM {table} WHERE user_id IS NULL"))
        op.drop_constraint(f"{table}_user_id_fkey", table, type_="foreignkey")
        op.alter_column(table, "user_id", nullable=False)
        op.create_foreign_key(f"{table}_user_id_fkey", table, "users", ["user_id"], ["id"], ondelete="CASCADE")
    op.drop_column("auth_tokens", "pending_email")
