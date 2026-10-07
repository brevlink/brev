from __future__ import annotations

import pytest
from fastapi.testclient import TestClient


PASSWORD = "Correct-Horse-Battery-1"


def _record_response_start(app, events):

    async def record(scope, receive, send):
        async def record_send(message):
            if message["type"] == "http.response.start":
                events.append(("response", message["status"]))
            await send(message)

        await app(scope, receive, record_send)

    return record


@pytest.mark.parametrize("authenticated_write", [False, True])
def test_commit_finishes_before_http_success(client, monkeypatch, authenticated_write):
    from sqlalchemy.ext.asyncio import AsyncSession

    assert client.post(
        "/api/v1/auth/register",
        json={"email": "transactions@example.com", "password": PASSWORD},
    ).status_code == 201
    login_body = {"email": "transactions@example.com", "password": PASSWORD}
    headers = {}
    if authenticated_write:
        token = client.post("/api/v1/auth/login", json=login_body).json()["access_token"]
        headers["Authorization"] = f"Bearer {token}"

    events = []
    commit = AsyncSession.commit

    async def record_commit(session):
        await commit(session)
        events.append(("commit", None))

    monkeypatch.setattr(AsyncSession, "commit", record_commit)
    observer = TestClient(_record_response_start(client.app, events))
    if authenticated_write:
        response = observer.post(
            "/api/v1/links",
            json={"url": "https://example.com/transaction", "slug": "transaction"},
            headers=headers,
        )
        expected_status = 201
    else:
        response = observer.post("/api/v1/auth/login", json=login_body)
        expected_status = 200

    assert response.status_code == expected_status, response.text
    # SQLite shares a connection, masking visibility races. Observe ASGI order
    # instead, and ensure auth and the handler share one transaction.
    assert events == [("commit", None), ("response", expected_status)]


def test_commit_failure_rolls_back_before_http_error(client, monkeypatch):
    from sqlalchemy.ext.asyncio import AsyncSession

    assert client.post(
        "/api/v1/auth/register",
        json={"email": "commit-failure@example.com", "password": PASSWORD},
    ).status_code == 201
    events = []
    rollback = AsyncSession.rollback

    async def fail_commit(session):
        raise RuntimeError("commit failed")

    async def record_rollback(session):
        await rollback(session)
        events.append(("rollback", None))

    monkeypatch.setattr(AsyncSession, "commit", fail_commit)
    monkeypatch.setattr(AsyncSession, "rollback", record_rollback)
    # Capture the response on the wire even when teardown raises an exception.
    with TestClient(
        _record_response_start(client.app, events), raise_server_exceptions=False
    ) as observer:
        response = observer.post(
            "/api/v1/auth/login",
            json={"email": "commit-failure@example.com", "password": PASSWORD},
        )

    assert response.status_code == 500
    assert events == [("rollback", None), ("response", 500)]
