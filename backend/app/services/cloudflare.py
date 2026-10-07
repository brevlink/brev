"""Cloudflare for SaaS: customer hostnames on our zone.

The backend owns the Cloudflare side of a custom domain, so nobody creates a
hostname by hand: adding a domain in the dashboard creates it here, removing the
domain deletes it.

Where the traffic goes is decided elsewhere and does not change per domain: the
custom hostname is created with ``custom_origin_server`` set to this zone's
CNAME target, and the zone carries an Origin Rule that sends requests for those
hostnames to Caddy's own port. See ``docs/cloudflare-for-saas.md``.
"""

from __future__ import annotations

import httpx

from app.core.config import settings

API_BASE = "https://api.cloudflare.com/client/v4"
TIMEOUT_SECONDS = 20.0


class CloudflareError(RuntimeError):
    """The Cloudflare API refused the call, or could not be reached."""


def is_configured() -> bool:
    """False on a deployment that terminates TLS for customer hostnames itself."""
    return bool(settings.cloudflare_api_token and settings.cloudflare_zone_id)


def _headers() -> dict[str, str]:
    # The token is read from the environment and never logged or returned.
    return {
        "Authorization": f"Bearer {settings.cloudflare_api_token}",
        "Content-Type": "application/json",
    }


async def _call(method: str, path: str, **kwargs) -> dict:
    if not is_configured():
        raise CloudflareError("Cloudflare is not configured")

    url = f"{API_BASE}/zones/{settings.cloudflare_zone_id}{path}"
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            response = await client.request(method, url, headers=_headers(), **kwargs)
    except httpx.HTTPError as exc:
        raise CloudflareError(f"Cloudflare unreachable: {exc}") from exc

    try:
        payload = response.json()
    except ValueError as exc:
        raise CloudflareError(
            f"Cloudflare returned {response.status_code} without a JSON body"
        ) from exc

    if response.status_code >= 400 or not payload.get("success"):
        dettagli = ", ".join(
            f"{e.get('code')}: {e.get('message')}" for e in payload.get("errors") or []
        )
        raise CloudflareError(dettagli or f"Cloudflare returned {response.status_code}")

    return payload.get("result") or {}


def _riassunto(result: dict) -> dict:
    return {
        "id": result.get("id"),
        "status": result.get("status"),
        "ssl_status": (result.get("ssl") or {}).get("status"),
    }


async def create_custom_hostname(hostname: str) -> dict:
    """Create the hostname for a customer domain.

    HTTP validation is enough: the customer points a CNAME at the CNAME target
    and Cloudflare validates it without a TXT record.
    """
    result = await _call(
        "POST",
        "/custom_hostnames",
        json={
            "hostname": hostname,
            "custom_origin_server": settings.cname_target,
            "ssl": {
                "method": "http",
                "type": "dv",
                "settings": {"min_tls_version": "1.2"},
            },
        },
    )
    return _riassunto(result)


async def get_custom_hostname(hostname_id: str) -> dict:
    """Current status of a hostname, for the dashboard and the verify endpoint."""
    return _riassunto(await _call("GET", f"/custom_hostnames/{hostname_id}"))


async def delete_custom_hostname(hostname_id: str) -> None:
    await _call("DELETE", f"/custom_hostnames/{hostname_id}")
