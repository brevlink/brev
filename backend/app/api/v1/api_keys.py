"""API key router."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_feature_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.api_key import APIKeyCreate, APIKeyCreateResponse, APIKeyList
from app.services import api_keys as api_key_service

router = APIRouter(prefix="/api-keys", tags=["api-keys"])


@router.post("", response_model=APIKeyCreateResponse, status_code=201)
async def create_api_key(
    body: APIKeyCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_feature_user),
):
    return await api_key_service.create_api_key(db, str(user.id), body.name)


@router.get("", response_model=APIKeyList)
async def list_api_keys(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_feature_user),
):
    items, total = await api_key_service.list_api_keys(db, str(user.id))
    return APIKeyList(items=items, total=total)


@router.delete("/{key_id}", status_code=204)
async def revoke_api_key(
    key_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_feature_user),
):
    await api_key_service.revoke_api_key(db, key_id, str(user.id))
