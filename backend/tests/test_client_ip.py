"""The rate limiter must see the caller, not the proxy in front of it."""
import os

from starlette.requests import Request

# Settings are validated at import time, so the environment has to be ready
# before anything under app.* is imported.
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-long-enough-for-dev")


def _request(client_host: str, headers: dict[str, str] | None = None) -> Request:
    raw = [(key.lower().encode(), value.encode()) for key, value in (headers or {}).items()]
    return Request(
        {
            "type": "http",
            "headers": raw,
            "client": (client_host, 1234),
            "method": "GET",
            "path": "/",
            "query_string": b"",
            "server": ("testserver", 80),
            "scheme": "http",
        }
    )


def _client_ip(request: Request, monkeypatch, trusted: bool) -> str:
    from app.core.config import settings
    from app.core.rate_limit import _client_ip as resolve

    monkeypatch.setattr(settings, "trusted_proxy_headers", trusted)
    return resolve(request)


def test_peer_is_used_when_proxy_headers_are_disabled(monkeypatch):
    request = _request(
        "8.8.8.8",
        {"cf-connecting-ip": "198.51.100.9", "x-forwarded-for": "198.51.100.10"},
    )
    assert _client_ip(request, monkeypatch, trusted=False) == "8.8.8.8"


def test_cloudflare_header_wins_behind_a_local_peer(monkeypatch):
    request = _request(
        "172.18.0.5",
        {"cf-connecting-ip": "198.51.100.9", "x-forwarded-for": "198.51.100.10"},
    )
    assert _client_ip(request, monkeypatch, trusted=True) == "198.51.100.9"


def test_forwarded_chain_is_used_without_cloudflare(monkeypatch):
    request = _request("10.0.0.4", {"x-forwarded-for": "198.51.100.11, 172.18.0.2"})
    assert _client_ip(request, monkeypatch, trusted=True) == "198.51.100.11"


def test_headers_from_a_public_peer_are_ignored(monkeypatch):
    """A peer outside the deployment could forge the headers it is trusting."""
    request = _request("8.8.8.8", {"cf-connecting-ip": "198.51.100.9"})
    assert _client_ip(request, monkeypatch, trusted=True) == "8.8.8.8"
