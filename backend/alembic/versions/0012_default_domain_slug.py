"""Unique slug on the default domain.

The existing unique index is (domain_id, slug). Postgres treats NULLs as
distinct in a unique index, so links on the default domain (domain_id IS NULL)
were not protected at all: two rows with the same slug could coexist and
every resolution afterwards failed with a 500.

This adds the partial index that covers exactly that case.
"""
from alembic import op

revision = "0012_default_domain_slug"
down_revision = "0011_link_stats"
branch_labels = None
depends_on = None


def upgrade():
    # Fail with a clear message instead of a bare constraint error: duplicates
    # created before this revision have to be resolved by hand, and the index
    # cannot be built while they exist.
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1 FROM links
                WHERE domain_id IS NULL
                GROUP BY slug
                HAVING count(*) > 1
            ) THEN
                RAISE EXCEPTION
                    'duplicate slugs on the default domain: resolve them before upgrading';
            END IF;
        END $$;
        """
    )
    op.create_index(
        "ux_links_default_domain_slug",
        "links",
        ["slug"],
        unique=True,
        postgresql_where="domain_id IS NULL",
    )


def downgrade():
    op.drop_index("ux_links_default_domain_slug", table_name="links")
