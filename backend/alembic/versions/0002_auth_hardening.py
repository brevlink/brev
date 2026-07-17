"""Persistent sessions and hashed, expiring email auth tokens."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0002_auth_hardening"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # A prior race could theoretically have produced multiple admins. Keep a
    # deterministic existing admin before adding the invariant.
    op.execute(
        sa.text(
            "UPDATE users SET is_admin = FALSE WHERE is_admin AND id NOT IN "
            "(SELECT id FROM users WHERE is_admin ORDER BY id LIMIT 1)"
        )
    )
    op.drop_column("users", "email_verification_token")
    op.create_index(
        "uq_users_single_admin",
        "users",
        ["is_admin"],
        unique=True,
        postgresql_where=sa.text("is_admin"),
        sqlite_where=sa.text("is_admin"),
    )

    op.create_table(
        "sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("jti_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("jti_hash"),
    )
    op.create_index("ix_sessions_jti_hash", "sessions", ["jti_hash"], unique=True)
    op.create_index("ix_sessions_expires_at", "sessions", ["expires_at"], unique=False)
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"], unique=False)

    op.create_table(
        "auth_tokens",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("purpose", sa.String(length=32), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_auth_tokens_lookup", "auth_tokens", ["purpose", "token_hash"], unique=True)
    op.create_index("ix_auth_tokens_expires_at", "auth_tokens", ["expires_at"], unique=False)
    op.create_index("ix_auth_tokens_user_purpose", "auth_tokens", ["user_id", "purpose"], unique=False)


def downgrade() -> None:
    op.drop_table("auth_tokens")
    op.drop_table("sessions")
    op.drop_index("uq_users_single_admin", table_name="users")
    op.add_column("users", sa.Column("email_verification_token", sa.String(length=96), nullable=True))
