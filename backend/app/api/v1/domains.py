"""Domains router — manage custom domains."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.domain import DomainCreate, DomainList, DomainOut
from app.services import domains as domain_service

router = APIRouter(prefix="/domains", tags=["domains"])


@router.post("", response_model=DomainOut, status_code=201)
async def create_domain(
    body: DomainCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await domain_service.create_domain(db, str(user.id), body)


@router.get("", response_model=DomainList)
async def list_domains(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    items, total = await domain_service.get_user_domains(db, str(user.id))
    return DomainList(items=items, total=total)


@router.delete("/{domain_id}", status_code=204)
async def delete_domain(
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await domain_service.delete_domain(db, domain_id, str(user.id))