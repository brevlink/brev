"""Links router — CRUD for short links."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.link import LinkCreate, LinkList, LinkOut, LinkUpdate
from app.services import links as links_service

router = APIRouter(prefix="/links", tags=["links"])


@router.post("", response_model=LinkOut, status_code=201)
async def create_link(
    body: LinkCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await links_service.create_link(db, str(user.id), body)


@router.get("", response_model=LinkList)
async def list_links(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    items, total = await links_service.get_user_links(
        db, str(user.id), skip=skip, limit=limit
    )
    return LinkList(items=items, total=total)


@router.get("/{slug}", response_model=LinkOut)
async def get_link(
    slug: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    link = await links_service.get_link_by_slug(db, slug)
    if link is None or str(link.user_id) != str(user.id):
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Link not found",
        )
    return links_service._link_to_out(link)


@router.patch("/{link_id}", response_model=LinkOut)
async def update_link(
    link_id: str,
    body: LinkUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await links_service.update_link(db, link_id, str(user.id), body)


@router.delete("/{link_id}", status_code=204)
async def delete_link(
    link_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await links_service.delete_link(db, link_id, str(user.id))