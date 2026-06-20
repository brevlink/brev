"""Brev API — FastAPI application."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1 import auth as auth_router
from app.api.v1 import domains as domains_router
from app.api.v1 import links as links_router
from app.api.v1 import redirect as redirect_router
from app.core.config import settings
from app.core.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run startup/shutdown tasks."""
    await init_db()
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Root-level routes (must be before redirect catch-all) ────────────
@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.app_name}

# ── API routes ────────────────────────────────────────────────────────────
app.include_router(auth_router.router, prefix="/api")
app.include_router(links_router.router, prefix="/api")
app.include_router(domains_router.router, prefix="/api")

# Redirect MUST be at root level for short URLs like brevl.ink/abc123
app.include_router(redirect_router.router)