"""Make domain removal delete links consistently with the ORM.

Slugs are unique within a domain, so SET NULL could move duplicate slugs into
the default domain and make its redirects ambiguous.
"""

from alembic import op
import sqlalchemy as sa

revision = "0007_domain_link_cascade"
down_revision = "0006_multiple_admins"
branch_labels = None
depends_on = None


def _replace_domain_fk(ondelete: str) -> None:
    constraint = next(
        fk for fk in sa.inspect(op.get_bind()).get_foreign_keys("links")
        if fk["constrained_columns"] == ["domain_id"]
    )
    # SQLite's original FK is unnamed; batch naming lets us replace it too.
    name = constraint["name"] or "fk_links_domain_id_domains"
    with op.batch_alter_table(
        "links", naming_convention={"fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s"}
    ) as batch:
        batch.drop_constraint(name, type_="foreignkey")
        batch.create_foreign_key(name, "domains", ["domain_id"], ["id"], ondelete=ondelete)


def upgrade() -> None:
    _replace_domain_fk("CASCADE")


def downgrade() -> None:
    _replace_domain_fk("SET NULL")
