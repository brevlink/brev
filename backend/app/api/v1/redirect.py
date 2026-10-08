"""Redirect router - the core {slug} → URL redirect."""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import async_session, db_session
from app.services import links as links_service
from app.services.link_stats import record_click
from app.templates.link_unavailable import LINK_UNAVAILABLE_HTML

router = APIRouter(tags=["redirect"])


@router.get("/{slug}")
async def redirect(slug: str, request: Request, db: AsyncSession = db_session):
    """Resolve slug and redirect to target URL."""
    link = await links_service.get_redirect_link(db, request.headers.get("host", ""), slug)

    if link is None or not link.is_active or link.is_flagged:
        if "text/html" in request.headers.get("accept", "").lower():
            return HTMLResponse(
                content=LINK_UNAVAILABLE_HTML,
                status_code=status.HTTP_404_NOT_FOUND,
                headers={
                    "Cache-Control": "no-store",
                    "Referrer-Policy": "no-referrer",
                },
            )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Link not found",
        )

    target_url = link.url
    try:
        # Bound analytics latency, including lock waits and commit failures.
        async with asyncio.timeout(1):
            # Isolate analytics failures (including rollback/close) from the
            # read session that resolved the critical redirect.
            async with async_session() as analytics_db:
                await record_click(analytics_db, link, request)
                await analytics_db.commit()
    except Exception as error:
        # Avoid dumping SQL parameters or request data into logs.
        logging.getLogger(__name__).warning("Click recording failed (%s)", type(error).__name__)

    return Response(
        status_code=status.HTTP_307_TEMPORARY_REDIRECT,
        headers={"Location": target_url},
    )
