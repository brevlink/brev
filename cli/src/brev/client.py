"""HTTP client for the Brev API — zero deps, pure stdlib."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any


class BrevAPIError(Exception):
    def __init__(self, status: int, detail: str):
        self.status = status
        self.detail = detail
        super().__init__(f"[{status}] {detail}")


def _request(
    method: str,
    url: str,
    token: str | None = None,
    body: dict | None = None,
) -> Any:
    headers = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "brev-cli/0.1.0",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(
        url, data=data, headers=headers, method=method
    )

    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read()
            if content:
                return json.loads(content)
            return {}
    except urllib.error.HTTPError as e:
        detail = _parse_error(e)
        raise BrevAPIError(e.code, detail) from e
    except urllib.error.URLError as e:
        raise BrevAPIError(0, f"Connection failed: {e.reason}") from e


def _parse_error(err: urllib.error.HTTPError) -> str:
    try:
        body = json.loads(err.read())
        if isinstance(body, dict):
            detail = body.get("detail", str(err))
            if isinstance(detail, list):
                return "; ".join(d.get("msg", str(d)) for d in detail)
            return str(detail)
        return str(body)
    except Exception:
        return str(err)


# ── Public API ────────────────────────────────────────────────────────


def login(api_url: str, email: str, password: str) -> dict:
    url = f"{api_url.rstrip('/')}/api/v1/auth/login"
    return _request("POST", url, body={"email": email, "password": password})


def register(api_url: str, email: str, password: str, display_name: str = "") -> dict:
    url = f"{api_url.rstrip('/')}/api/v1/auth/register"
    body = {"email": email, "password": password}
    if display_name:
        body["display_name"] = display_name
    return _request("POST", url, body=body)


def whoami(api_url: str, token: str) -> dict:
    url = f"{api_url.rstrip('/')}/api/v1/auth/me"
    return _request("GET", url, token=token)


def create_link(api_url: str, token: str, url: str, slug: str | None = None, title: str | None = None) -> dict:
    endpoint = f"{api_url.rstrip('/')}/api/v1/links"
    body: dict[str, str] = {"url": url}
    if slug:
        body["slug"] = slug
    if title:
        body["title"] = title
    return _request("POST", endpoint, token=token, body=body)


def list_links(api_url: str, token: str, skip: int = 0, limit: int = 50) -> dict:
    endpoint = f"{api_url.rstrip('/')}/api/v1/links?skip={skip}&limit={limit}"
    return _request("GET", endpoint, token=token)


def get_link(api_url: str, token: str, slug: str) -> dict:
    endpoint = f"{api_url.rstrip('/')}/api/v1/links/{slug}"
    return _request("GET", endpoint, token=token)


def delete_link(api_url: str, token: str, link_id: str) -> None:
    endpoint = f"{api_url.rstrip('/')}/api/v1/links/{link_id}"
    _request("DELETE", endpoint, token=token)


def create_api_key(api_url: str, token: str, name: str = "CLI") -> dict:
    endpoint = f"{api_url.rstrip('/')}/api/v1/api-keys"
    return _request("POST", endpoint, token=token, body={"name": name})
