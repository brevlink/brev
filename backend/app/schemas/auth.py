"""Auth-related Pydantic schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.core.security import validate_password


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    display_name: str | None = Field(default=None, max_length=128)

    @field_validator("password")
    @classmethod
    def password_policy(cls, value: str) -> str:
        return validate_password(value)


class RegisterResponse(BaseModel):
    id: str
    email: str
    display_name: str | None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: RegisterResponse


class VerifyEmailResponse(BaseModel):
    email: str
    is_verified: bool


class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=32, max_length=256)


class AuthLinkBootstrapResponse(BaseModel):
    """Read-only contract used by a browser before its frontend POSTs a token."""

    valid: bool
    expires_at: datetime
    action: str


class ResendVerificationResponse(BaseModel):
    message: str


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str = Field(min_length=32, max_length=256)
    new_password: str = Field(min_length=1, max_length=128)

    @field_validator("new_password")
    @classmethod
    def password_policy(cls, value: str) -> str:
        return validate_password(value)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=1, max_length=128)

    @field_validator("new_password")
    @classmethod
    def password_policy(cls, value: str) -> str:
        return validate_password(value)


class MessageResponse(BaseModel):
    message: str
