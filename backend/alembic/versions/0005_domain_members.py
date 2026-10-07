"""domain members: share a custom domain with other accounts

Revision ID: 0005_domain_members
Revises: 0004_custom_domain_hostnames

An invitation has to exist before the invitee has an account, and AuthToken
requires a user_id, so sharing needs its own table. The token hash is cleared
when the invitation is accepted: a spent link must stop working.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0005_domain_members"
down_revision = "0004_custom_domain_hostnames"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "domain_members",
        sa.Column("id", sa.Uuid(as_uuid=True), primary_key=True, nullable=False),
        sa.Column(
            "domain_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("domains.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column(
            "user_id",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "invited_by",
            sa.Uuid(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("invite_token_hash", sa.String(length=64), nullable=True),
        sa.Column("invite_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_domain_members_lookup", "domain_members", ["domain_id", "email"], unique=True
    )
    op.create_index("ix_domain_members_user", "domain_members", ["user_id"])
    op.create_index(
        "ix_domain_members_token", "domain_members", ["invite_token_hash"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_domain_members_token", table_name="domain_members")
    op.drop_index("ix_domain_members_user", table_name="domain_members")
    op.drop_index("ix_domain_members_lookup", table_name="domain_members")
    op.drop_table("domain_members")
