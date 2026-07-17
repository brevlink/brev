"""Auth router — register, login, me."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, revoke_authenticated_session
from app.core.database import get_db
from app.core.rate_limit import enforce_rate_limit
from app.core.security import clear_session_cookie, set_session_cookie
from app.models.user import User
from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    RegisterRequest,
    RegisterResponse,
    AuthLinkBootstrapResponse,
    MessageResponse,
    PasswordChangeRequest,
    PasswordResetConfirm,
    PasswordResetRequest,
    ResendVerificationResponse,
    VerifyEmailRequest,
    VerifyEmailResponse,
)
from app.schemas.user import UserOut
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/register",
    response_model=RegisterResponse,
    status_code=201,
)
async def register(request: Request, body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    enforce_rate_limit("auth-register", identifiers=[request.client.host if request.client else "unknown", body.email.casefold()], limit=10, window_seconds=3600)
    return await auth_service.register(db, body)


@router.post(
    "/login",
    response_model=LoginResponse,
)
async def login(
    request: Request,
    body: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    enforce_rate_limit("auth-login", identifiers=[request.client.host if request.client else "unknown", body.email.casefold()], limit=20, window_seconds=900)
    login_response = await auth_service.login(db, body.email, body.password)
    set_session_cookie(response, login_response.access_token)
    return login_response


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user)):
    return UserOut(
        id=str(current_user.id),
        email=current_user.email,
        display_name=current_user.display_name,
        is_verified=current_user.is_verified,
        is_admin=current_user.is_admin,
        created_at=current_user.created_at,
    )


@router.post("/logout", status_code=204)
async def logout(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    await revoke_authenticated_session(request, db)
    clear_session_cookie(response)


@router.get("/verify-email", response_model=AuthLinkBootstrapResponse)
async def verify_email_bootstrap(
    token: str = Query(min_length=32, max_length=256),
    db: AsyncSession = Depends(get_db),
):
    """Validate a browser link without consuming or applying the token."""
    expires_at = await auth_service.inspect_email_verification(db, token)
    return AuthLinkBootstrapResponse(
        valid=True,
        expires_at=expires_at,
        action="POST /api/v1/auth/verify-email with JSON {\"token\": \"...\"}",
    )


@router.post("/verify-email", response_model=VerifyEmailResponse)
async def verify_email(
    body: VerifyEmailRequest,
    db: AsyncSession = Depends(get_db),
):
    user = await auth_service.verify_email(db, body.token)
    return VerifyEmailResponse(email=user.email, is_verified=user.is_verified)


@router.post("/resend-verification", response_model=ResendVerificationResponse)
async def resend_verification(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    enforce_rate_limit("auth-resend", identifiers=[request.client.host if request.client else "unknown", current_user.email], limit=3, window_seconds=3600)
    await auth_service.resend_verification(db, current_user)
    return ResendVerificationResponse(message="Verification email sent if the account needs verification")


@router.post("/password-reset/request", response_model=MessageResponse, status_code=202)
async def request_password_reset(
    request: Request,
    body: PasswordResetRequest,
    db: AsyncSession = Depends(get_db),
):
    enforce_rate_limit("auth-reset-request", identifiers=[request.client.host if request.client else "unknown", body.email.casefold()], limit=5, window_seconds=3600)
    return await auth_service.request_password_reset(db, body.email)


@router.get("/password-reset/confirm", response_model=AuthLinkBootstrapResponse)
async def password_reset_bootstrap(
    token: str = Query(min_length=32, max_length=256),
    db: AsyncSession = Depends(get_db),
):
    """Validate a reset link without changing a password or consuming it."""
    expires_at = await auth_service.inspect_password_reset(db, token)
    return AuthLinkBootstrapResponse(
        valid=True,
        expires_at=expires_at,
        action="POST /api/v1/auth/password-reset/confirm",
    )


@router.post("/password-reset/confirm", response_model=MessageResponse)
async def confirm_password_reset(
    request: Request,
    body: PasswordResetConfirm,
    db: AsyncSession = Depends(get_db),
):
    enforce_rate_limit("auth-reset-confirm", identifiers=[request.client.host if request.client else "unknown", body.token[:16]], limit=10, window_seconds=3600)
    return await auth_service.reset_password(db, body)


@router.post("/password/change", response_model=MessageResponse)
async def change_password(
    body: PasswordChangeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return await auth_service.change_password(db, current_user, body)
