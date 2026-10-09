"""Run the operator command in a separate process against a durable database."""

from datetime import UTC, datetime, timedelta
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import uuid

from sqlalchemy import create_engine


BACKEND = Path(__file__).resolve().parents[1]


def _command(database_url):
    return subprocess.run(
        [sys.executable, "-m", "scripts.prune_click_events"],
        cwd=BACKEND,
        env={
            **os.environ,
            "DATABASE_URL": database_url,
            "JWT_SECRET": "test-secret-that-is-long-enough-for-dev",
            "DEBUG": "false",
            "CLICK_EVENT_RETENTION_DAYS": "90",
        },
        capture_output=True,
        text=True,
        timeout=30,
    )


def test_cli_commits_pruning_preserves_aggregates_and_can_run_again(client, tmp_path):
    from app.core.database import Base
    from app.models.link import Link
    from app.models.link_stats import LinkClickDaily, LinkClickEvent
    from app.models.user import User

    path = tmp_path / "clicks.db"
    engine = create_engine(f"sqlite:///{path}")
    now = datetime.now(UTC)
    user_id, link_id = uuid.uuid4(), uuid.uuid4()
    try:
        Base.metadata.create_all(engine)
        with engine.begin() as db:
            db.execute(User.__table__.insert().values(
                id=user_id, email="pruning@example.com", password_hash="unused",
            ))
            db.execute(Link.__table__.insert().values(
                id=link_id, user_id=user_id, slug="prune-me", url="https://example.com",
            ))
            for age in (91, 1):
                when = now - timedelta(days=age)
                db.execute(LinkClickEvent.__table__.insert().values(
                    link_id=link_id, occurred_at=when, day=when.date(), device="other",
                ))
                db.execute(LinkClickDaily.__table__.insert().values(
                    link_id=link_id, day=when.date(), clicks=1, visitors=1,
                ))
    finally:
        engine.dispose()

    url = f"sqlite+aiosqlite:///{path}"
    first = _command(url)
    assert first.returncode == 0, first.stderr
    assert first.stdout.strip() == "Removed 1 click events."
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT COUNT(*) FROM link_click_events").fetchone()[0] == 1
        assert db.execute("SELECT SUM(clicks), SUM(visitors) FROM link_click_daily").fetchone() == (2, 2)
    second = _command(url)
    assert second.returncode == 0, second.stderr
    assert second.stdout.strip() == "Removed 0 click events."


def test_cli_database_failure_returns_nonzero_without_success_message(tmp_path):
    result = _command(f"sqlite+aiosqlite:///{tmp_path / 'missing' / 'clicks.db'}")
    assert result.returncode == 1
    assert "Click event pruning failed" in result.stderr
    assert "Removed" not in result.stdout
