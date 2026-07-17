from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


@pytest.fixture()
def client(monkeypatch) -> TestClient:
    monkeypatch.setenv("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    monkeypatch.setenv("JWT_SECRET", "test-secret-that-is-long-enough-for-dev")
    monkeypatch.setenv("CORS_ORIGINS", '["http://testserver"]')
    monkeypatch.setenv("FRONTEND_VERIFICATION_URL", "http://testserver/verify-email")
    monkeypatch.setenv("FRONTEND_PASSWORD_RESET_URL", "http://testserver/reset-password")
    monkeypatch.setenv("DEBUG", "false")
    for name in list(sys.modules):
        if name == "app" or name.startswith("app."):
            sys.modules.pop(name)
    from app.main import app
    from app.services import auth as auth_service
    from app.services.mailer import InMemoryMailer

    test_mailer = InMemoryMailer()
    monkeypatch.setattr(auth_service, "mailer", test_mailer)
    with TestClient(app) as test_client:
        test_client.test_mailer = test_mailer
        yield test_client
