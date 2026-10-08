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
        # Name SQLite's unnamed FK to match PostgreSQL's default constraint name.
        with op.batch_alter_table(
            table, naming_convention={"fk": "%(table_name)s_%(column_0_name)s_fkey"}
        ) as batch:
            batch.drop_constraint(f"{table}_user_id_fkey", type_="foreignkey")
            batch.alter_column("user_id", existing_type=sa.Uuid(), nullable=True)
            batch.create_foreign_key(
                f"{table}_user_id_fkey", "users", ["user_id"], ["id"], ondelete="SET NULL"
            )


def downgrade():
    for table in ("cloud_purchases", "subscriptions"):
        op.execute(sa.text(f"DELETE FROM {table} WHERE user_id IS NULL"))
        with op.batch_alter_table(
            table, naming_convention={"fk": "%(table_name)s_%(column_0_name)s_fkey"}
        ) as batch:
            batch.drop_constraint(f"{table}_user_id_fkey", type_="foreignkey")
            batch.alter_column("user_id", existing_type=sa.Uuid(), nullable=False)
            batch.create_foreign_key(
                f"{table}_user_id_fkey", "users", ["user_id"], ["id"], ondelete="CASCADE"
            )
    op.drop_column("auth_tokens", "pending_email")
