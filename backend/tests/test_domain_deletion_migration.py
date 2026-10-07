"""Exercise the FK migration with real rows, independently of ORM cascades."""

import importlib.util
from pathlib import Path

import pytest
import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


@pytest.mark.parametrize("constraint_name", [None, "links_domain_id_fkey"])
def test_domain_link_fk_upgrade_and_downgrade(constraint_name):
    path = Path(__file__).resolve().parents[1] / "alembic/versions/0007_domain_link_cascade.py"
    spec = importlib.util.spec_from_file_location("domain_cascade_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine("sqlite:///:memory:")
    with engine.connect() as connection:
        connection.exec_driver_sql("PRAGMA foreign_keys=ON")
        connection.exec_driver_sql("CREATE TABLE domains (id INTEGER PRIMARY KEY)")
        constraint = f"CONSTRAINT {constraint_name} " if constraint_name else ""
        connection.exec_driver_sql(
            "CREATE TABLE links (id INTEGER PRIMARY KEY, domain_id INTEGER, "
            f"{constraint}FOREIGN KEY (domain_id) REFERENCES domains(id) ON DELETE SET NULL)"
        )
        connection.exec_driver_sql("INSERT INTO domains VALUES (1)")
        connection.exec_driver_sql("INSERT INTO links VALUES (1, 1), (2, NULL)")
        connection.commit()
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            assert sa.inspect(connection).get_foreign_keys("links")[0]["options"]["ondelete"] == "CASCADE"
            connection.exec_driver_sql("DELETE FROM domains WHERE id = 1")
            assert connection.exec_driver_sql("SELECT id FROM links").all() == [(2,)]
            connection.exec_driver_sql("INSERT INTO domains VALUES (3)")
            connection.exec_driver_sql("INSERT INTO links VALUES (3, 3)")
            migration.downgrade()
            assert sa.inspect(connection).get_foreign_keys("links")[0]["options"]["ondelete"] == "SET NULL"
            connection.exec_driver_sql("DELETE FROM domains WHERE id = 3")
            assert connection.exec_driver_sql("SELECT domain_id FROM links WHERE id = 3").scalar() is None
