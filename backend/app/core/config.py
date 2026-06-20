"""Application configuration via Pydantic Settings."""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # ── Database ──────────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://postgres:postgres@db:5432/brev"

    # ── Auth ──────────────────────────────────────────────────────────
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24  # 24 hours

    # ── App ───────────────────────────────────────────────────────────
    default_domain: str = "brevl.ink"
    app_name: str = "Brev API"
    cors_origins: list[str] = ["*"]
    debug: bool = False

    # ── Caddy On-Demand TLS ───────────────────────────────────────────
    proxy_origin: str = "http://backend:8000"  # internal docker network
    caddy_admin_api: str = "http://caddy:2019"  # Caddy admin API

    # ── Stripe (Cloud only) ───────────────────────────────────────────
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    stripe_price_id: str | None = None  # one-time payment price ID


settings = Settings()