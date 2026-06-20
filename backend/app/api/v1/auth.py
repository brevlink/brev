"""Auth router — register, login, me."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, LoginResponse, RegisterRequest, RegisterResponse
from app.schemas.user import UserOut
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=RegisterResponse, status_code=201)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    return await auth_service.register(db, body)


@router.post("/login", response_model=LoginResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    return await auth_service.login(db, body.email, body.password)


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return UserOut(
        id=str(current_user.id),
        email=current_user.email,
        display_name=current_user.display_name,
        is_verified=current_user.is_verified,
        created_at=current_user.created_at,
    )