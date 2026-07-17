"""Async SQLAlchemy engine, session factory, and base model."""

from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

engine_kwargs = {"echo": settings.debug}
if settings.database_url.startswith("sqlite"):
    engine_kwargs.update({"poolclass": StaticPool})
else:
    engine_kwargs.update({"pool_size": 5, "max_overflow": 10})

engine = create_async_engine(settings.database_url, **engine_kwargs)

async_session = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency — yields an async DB session."""
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Create all tables for development/test bootstrap only."""
    async with engine.begin() as conn:
        from app.models import api_key, auth, billing, domain, link, subscription, user  # noqa: F401

        await conn.run_sync(Base.metadata.create_all)
