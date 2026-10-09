"""Prune expired raw click events with the backend's database configuration."""

import asyncio
import logging


async def run() -> int:
    from app.core.database import async_session, engine
    # Register relationship targets for ORM use outside the web bootstrap.
    from app.models import api_key, auth, billing, domain, link, link_stats, report, subscription, user  # noqa: F401
    from app.services.link_stats import prune_click_events

    try:
        async with async_session() as db:
            removed = await prune_click_events(db)
            await db.commit()
        return removed
    finally:
        await engine.dispose()


def main() -> int:
    try:
        removed = asyncio.run(run())
    except Exception:
        logging.exception("Click event pruning failed")
        return 1
    print(f"Removed {removed} click events.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
