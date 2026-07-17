"""Application configuration via Pydantic Settings."""

from __future__ import annotations

from pydantic import model_validator
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
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24  # 24 hours; sessions use the same TTL
    session_cookie_name: str = "brev_session"
    secure_cookies: bool = False

    # ── App ───────────────────────────────────────────────────────────
    default_domain: str = "brevl.ink"
    app_name: str = "Brev API"
    cors_origins: list[str] = []
    debug: bool = False
    environment: str = "development"
    docs_enabled: bool = True
    trusted_proxy_headers: bool = False
    cloud_mode: bool = False
    require_verified_email: bool = False
    free_custom_domains: int = 0

    # ── Transactional email ──────────────────────────────────────────
    # "none" is deliberately a failing configuration, never a fake sender.
    email_provider: str = "none"  # smtp | api | none
    email_from: str | None = None
    app_base_url: str = "http://localhost"
    # These are real routes owned by the configured frontend. Tokens are put
    # in the URL fragment so browser/proxy request logs do not receive them.
    frontend_verification_url: str | None = None
    frontend_password_reset_url: str | None = None
    email_verification_expire_minutes: int = 60 * 24
    password_reset_expire_minutes: int = 30
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_starttls: bool = True
    email_api_url: str | None = None
    email_api_token: str | None = None

    # ── Caddy On-Demand TLS ───────────────────────────────────────────
    proxy_origin: str = "http://backend:8000"  # internal docker network
    caddy_admin_api: str = "http://caddy:2019"  # Caddy admin API
    cname_target: str = "proxy.brevl.ink."

    # ── Stripe one-time Cloud checkout (Cloud only) ──────────────────
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    stripe_price_id: str | None = None  # one-time Stripe Price ID
    stripe_success_url: str = "https://brevl.ink/app/dashboard?billing=success"
    stripe_cancel_url: str = "https://brevl.ink/app/dashboard?billing=cancelled"

    @property
    def is_production(self) -> bool:
        return self.environment.lower() in {"prod", "production"}

    @model_validator(mode="after")
    def validate_production_settings(self) -> "Settings":
        if self.is_production:
            if len(self.jwt_secret) < 32:
                raise ValueError("JWT_SECRET must be a strong secret in production")
            if "*" in self.cors_origins:
                raise ValueError("CORS_ORIGINS cannot contain '*' in production")
            if not self.secure_cookies:
                raise ValueError("SECURE_COOKIES must be true in production")
            if self.email_provider not in {"smtp", "api"}:
                raise ValueError("EMAIL_PROVIDER must be smtp or api in production")
            if not self.email_from:
                raise ValueError("EMAIL_FROM is required when email is enabled")
        if self.email_provider not in {"none", "smtp", "api"}:
            raise ValueError("EMAIL_PROVIDER must be none, smtp, or api")
        if self.email_provider in {"smtp", "api"} and not self.email_from:
            raise ValueError("EMAIL_FROM is required when email is enabled")
        if self.email_provider in {"smtp", "api"}:
            for name, value in (
                ("FRONTEND_VERIFICATION_URL", self.frontend_verification_url),
                ("FRONTEND_PASSWORD_RESET_URL", self.frontend_password_reset_url),
            ):
                if not value or not value.startswith(("http://", "https://")):
                    raise ValueError(f"{name} must be an absolute http(s) URL when email is enabled")
        return self


settings = Settings()
