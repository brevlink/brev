"""Authenticated account and domain-scoped link statistics."""
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_feature_user
from app.core.database import db_session
from app.models.user import User
from app.services.links import get_qr_link_by_slug
from app.services.link_stats import read_stats

router = APIRouter(tags=["stats"])
StatsRange = Literal["7d", "30d", "90d"]


@router.get("/links/{slug}/stats")
async def link_stats(
    slug: str, range: StatsRange = Query("30d"),
    host: str | None = Query(None, max_length=253),
    db: AsyncSession = db_session, user: User = Depends(get_current_feature_user),
):
    link = await get_qr_link_by_slug(db, slug, str(user.id), host)
    if link is None:
        raise HTTPException(status_code=404, detail="Link not found")
    return await read_stats(db, user.id, int(range[:-1]), link)


@router.get("/stats/summary")
async def summary(
    range: StatsRange = Query("30d"),
    db: AsyncSession = db_session, user: User = Depends(get_current_feature_user),
):
    return await read_stats(db, user.id, int(range[:-1]))
