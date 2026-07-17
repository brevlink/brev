"""Password hashing, JWTs, session cookies, and API key helpers."""

from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from unicodedata import normalize

import bcrypt
import jwt
from fastapi import HTTPException, Response, status
from pydantic import BaseModel

from app.core.config import settings

PASSWORD_MAX_BYTES = 72  # bcrypt truncates input after 72 bytes.
PASSWORD_MAX_LENGTH = 128
COMMON_PASSWORDS = frozenset(
    {
        "123456789012",
        "1234567890",
        "password",
        "password1",
        "password123",
        "qwertyuiop",
        "qwerty123456",
        "asd12345",
        "letmein1234",
        "welcome1234",
        "admin123456",
    }
)

# ── Password hashing ──────────────────────────────────────────────────


def normalize_password(password: str) -> str:
    """Normalize Unicode without trimming meaningful password whitespace."""
    return normalize("NFKC", password)


def validate_password(password: str) -> str:
    normalized = normalize_password(password)
    if len(normalized) < 12:
        raise ValueError("Password must be at least 12 characters long")
    if len(normalized) > PASSWORD_MAX_LENGTH:
        raise ValueError("Password is too long")
    if len(normalized.encode("utf-8")) > PASSWORD_MAX_BYTES:
        raise ValueError("Password is too long for the configured password hashing policy")
    if normalized.casefold() in COMMON_PASSWORDS:
        raise ValueError("Password is too common")
    return normalized


def hash_password(password: str) -> str:
    # Existing bcrypt hashes remain valid; the policy is enforced only when
    # accepting a new password or password change.
    normalized = validate_password(password)
    return bcrypt.hashpw(normalized.encode("utf-8"), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(normalize_password(plain).encode("utf-8"), hashed.encode())
    except (ValueError, TypeError):
        return False


# ── JWT ───────────────────────────────────────────────────────────────


class TokenPayload(BaseModel):
    sub: str  # user id (UUID)
    exp: datetime
    iat: datetime
    jti: str
    type: str = "access"


def create_access_token(user_id: str) -> str:
    now = datetime.now(UTC)
    expire = datetime.now(UTC) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "sub": user_id,
        "exp": expire,
        "iat": now,
        "jti": str(uuid.uuid4()),
        "type": "access",
    }
    return jwt.encode(
        payload,
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


def hash_session_jti(jti: str) -> str:
    peppered = f"{settings.jwt_secret}:{jti}".encode("utf-8")
    return hashlib.sha256(peppered).hexdigest()


def hash_opaque_token(token: str) -> str:
    peppered = f"{settings.jwt_secret}:{token}".encode("utf-8")
    return hashlib.sha256(peppered).hexdigest()


def decode_access_token(token: str) -> TokenPayload:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[settings.jwt_algorithm],
        )
        return TokenPayload(**payload)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token expired",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )


# ── Browser session cookies ───────────────────────────────────────────


def set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.session_cookie_name,
        value=token,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        max_age=settings.jwt_expire_minutes * 60,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.session_cookie_name,
        httponly=True,
        secure=settings.secure_cookies,
        samesite="lax",
        path="/",
    )


# ── API keys ──────────────────────────────────────────────────────────


def generate_api_key() -> str:
    return f"brev_{secrets.token_urlsafe(32)}"


def hash_api_key(token: str) -> str:
    peppered = f"{settings.jwt_secret}:{token}".encode()
    return hashlib.sha256(peppered).hexdigest()


def constant_time_equal(left: str, right: str) -> bool:
    return secrets.compare_digest(left, right)
