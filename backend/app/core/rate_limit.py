"""Small in-memory rate limiter for self-hosted and single-node deployments."""

from __future__ import annotations

import time
from collections import defaultdict, deque
from collections.abc import Callable

from fastapi import HTTPException, Request, status


_BUCKETS: dict[str, deque[float]] = defaultdict(deque)
_MAX_BUCKETS = 10_000


def _client_ip(request: Request) -> str:
    from app.core.config import settings

    forwarded = request.headers.get("x-forwarded-for")
    if forwarded and settings.trusted_proxy_headers:
        return forwarded.split(",", 1)[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(name: str, limit: int, window_seconds: int) -> Callable[[Request], None]:
    async def dependency(request: Request) -> None:
        enforce_rate_limit(
            name,
            identifiers=[_client_ip(request)],
            limit=limit,
            window_seconds=window_seconds,
        )

    return dependency


def enforce_rate_limit(
    name: str,
    *,
    identifiers: list[str],
    limit: int,
    window_seconds: int,
) -> None:
    """Enforce a bounded single-node limiter on every supplied key.

    This is intentionally an abstraction, not a claim of distributed
    protection. A multi-instance deployment must provide a shared store.
    """
    now = time.monotonic()
    cutoff = now - window_seconds
    # Bounded cleanup prevents attacker-controlled identifiers growing this
    # process without limit.
    for key, bucket in list(_BUCKETS.items()):
        while bucket and bucket[0] <= cutoff:
            bucket.popleft()
        if not bucket:
            _BUCKETS.pop(key, None)
    keys = [f"{name}:{identifier}" for identifier in identifiers if identifier]
    buckets = [_BUCKETS[key] for key in keys]
    if any(len(bucket) >= limit for bucket in buckets):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many requests. Try again later.")
    for bucket in buckets:
        bucket.append(now)
    while len(_BUCKETS) > _MAX_BUCKETS:
        oldest_key = min(_BUCKETS, key=lambda key: _BUCKETS[key][-1])
        _BUCKETS.pop(oldest_key, None)
