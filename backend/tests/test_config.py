"""Configuration normalisation."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def _settings(monkeypatch, **overrides):
    monkeypatch.setenv("JWT_SECRET", "test-secret-that-is-long-enough-for-dev")
    from app.core.config import Settings

    return Settings(**overrides)


def test_cname_target_loses_the_root_dot(monkeypatch) -> None:
    """The dashboard shows this value to customers: a stray trailing dot can be
    rejected by their DNS panel."""
    settings = _settings(monkeypatch, cname_target="proxy.brevl.ink.")
    assert settings.cname_target == "proxy.brevl.ink"


def test_cname_target_is_lowercased_and_trimmed(monkeypatch) -> None:
    settings = _settings(monkeypatch, cname_target="  Proxy.Brevl.Ink  ")
    assert settings.cname_target == "proxy.brevl.ink"


def test_cname_target_without_dot_is_unchanged(monkeypatch) -> None:
    settings = _settings(monkeypatch, cname_target="proxy.brevl.ink")
    assert settings.cname_target == "proxy.brevl.ink"
