"""Redirect router — the core {slug} → URL redirect."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.services import links as links_service

router = APIRouter(tags=["redirect"])


@router.get("/{slug}")
async def redirect(slug: str, db: AsyncSession = Depends(get_db)):
    """Resolve slug and redirect to target URL."""
    link = await links_service.get_link_by_slug(db, slug)

    if link is None or not link.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Link not found",
        )

    await links_service.increment_clicks(db, link)

    return Response(
        status_code=status.HTTP_307_TEMPORARY_REDIRECT,
        headers={"Location": link.url},
    )