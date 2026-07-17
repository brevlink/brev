"""Brev API — FastAPI application."""

from __future__ import annotations

from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi import Request
from fastapi.responses import JSONResponse

from app.api.v1 import redirect as redirect_router
from app.api.v1.router import router as api_router
from app.core.config import settings
from app.core.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run startup/shutdown tasks."""
    # Development tests/self-hosted local runs may bootstrap an empty DB. In
    # production Alembic is the schema authority and must run before Uvicorn.
    if not settings.is_production:
        await init_db()
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs" if settings.docs_enabled else None,
    redoc_url="/redoc" if settings.docs_enabled else None,
    openapi_url="/openapi.json" if settings.docs_enabled else None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)


def _origin_is_allowed(value: str | None) -> bool:
    if not value:
        return False
    return value.rstrip("/") in {origin.rstrip("/") for origin in settings.cors_origins}


def _request_scheme(request: Request) -> str:
    if settings.trusted_proxy_headers:
        forwarded = request.headers.get("x-forwarded-proto")
        if forwarded:
            return forwarded.split(",", 1)[0].strip().lower()
    return request.url.scheme.lower()


def _add_security_headers(request: Request, response) -> None:
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    if _request_scheme(request) == "https":
        response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")


@app.middleware("http")
async def csrf_and_security_headers(request: Request, call_next):
    """Require a same-site Origin/Referer for cookie-authenticated writes.

    Bearer API keys/JWTs are intentionally exempt: they do not ride in the
    browser cookie and remain usable by the CLI and programmatic clients.
    """
    unsafe = request.method.upper() in {"POST", "PUT", "PATCH", "DELETE"}
    has_cookie = bool(request.cookies.get(settings.session_cookie_name))
    has_bearer = request.headers.get("authorization", "").lower().startswith("bearer ")
    public_cookie_free = request.url.path in {
        "/api/v1/auth/register",
        "/api/v1/auth/login",
        "/api/v1/auth/verify-email",
        "/api/v1/auth/password-reset/request",
        "/api/v1/auth/password-reset/confirm",
    }
    if unsafe and has_cookie and not has_bearer and not public_cookie_free:
        origin = request.headers.get("origin")
        referer = request.headers.get("referer")
        referer_origin = None
        if referer:
            parsed = urlsplit(referer)
            if parsed.scheme and parsed.netloc:
                referer_origin = f"{parsed.scheme}://{parsed.netloc}"
        if not (_origin_is_allowed(origin) or _origin_is_allowed(referer_origin)):
            response = JSONResponse(status_code=403, content={"detail": "CSRF validation failed"})
            _add_security_headers(request, response)
            return response

    response = await call_next(request)
    _add_security_headers(request, response)
    return response

# ── Root-level routes (must be before redirect catch-all) ────────────
@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.app_name}

# ── API routes ────────────────────────────────────────────────────────────
app.include_router(api_router, prefix="/api")

# Redirect MUST be at root level for short URLs like brevl.ink/abc123
app.include_router(redirect_router.router)
