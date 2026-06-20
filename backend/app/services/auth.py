"""Auth service — registration and login."""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import User
from app.schemas.auth import LoginResponse, RegisterRequest, RegisterResponse


async def register(db: AsyncSession, body: RegisterRequest) -> RegisterResponse:
    """Create a new user. Raises 409 if email already exists."""
    result = await db.execute(select(User).where(User.email == body.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    user = User(
        id=uuid.uuid4(),
        email=body.email,
        password_hash=hash_password(body.password),
        display_name=body.display_name,
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    return RegisterResponse(
        id=str(user.id),
        email=user.email,
        display_name=user.display_name,
    )


async def login(db: AsyncSession, email: str, password: str) -> LoginResponse:
    """Authenticate a user. Raises 401 on bad credentials."""
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user is None or not verify_password(password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(str(user.id))
    return LoginResponse(
        access_token=token,
        user=RegisterResponse(
            id=str(user.id),
            email=user.email,
            display_name=user.display_name,
        ),
    )


async def get_user_by_id(db: AsyncSession, user_id: str) -> User | None:
    """Fetch user by UUID string."""
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        return None
    result = await db.execute(select(User).where(User.id == uid))
    return result.scalar_one_or_none()