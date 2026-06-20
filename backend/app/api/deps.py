"""Shared FastAPI dependencies."""

from __future__ import annotations

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_token_user_id
from app.models.user import User
from app.services.auth import get_user_by_id


async def get_current_user(
    user_id: str = Depends(get_token_user_id),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Resolve the authenticated user from the JWT token."""
    user = await get_user_by_id(db, user_id)
    if user is None or not user.is_active:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )
    return user