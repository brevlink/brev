from __future__ import annotations

from types import SimpleNamespace

import pytest


def _api_config(url: str, *, production: bool = False) -> SimpleNamespace:
    return SimpleNamespace(
        email_api_url=url,
        email_api_token="token-from-environment",
        email_from="noreply@example.com",
        is_production=production,
    )


@pytest.mark.parametrize("url", ["ftp://mail.example.test/send", "file:///tmp/mail.json", "//mail.example.test/send"])
def test_api_mailer_rejects_non_http_url_without_request(monkeypatch, url):
    monkeypatch.setenv("JWT_SECRET", "test-secret-that-is-long-enough-for-dev")
    from app.services.mailer import APIFieldMailer, MailDeliveryError

    def fail_if_called(*args, **kwargs):
        raise AssertionError("urlopen must not be called for an invalid provider URL")

    monkeypatch.setattr("app.services.mailer.urllib_request.urlopen", fail_if_called)
    mailer = APIFieldMailer(_api_config(url))

    with pytest.raises(MailDeliveryError, match="URL is invalid"):
        mailer._send_sync(b"{}")


def test_api_mailer_rejects_http_in_production_without_request(monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "test-secret-that-is-long-enough-for-dev")
    from app.services.mailer import APIFieldMailer, MailDeliveryError

    monkeypatch.setattr(
        "app.services.mailer.urllib_request.urlopen",
        lambda *args, **kwargs: pytest.fail("urlopen must not be called for HTTP in production"),
    )
    mailer = APIFieldMailer(_api_config("http://mail.example.test/send", production=True))

    with pytest.raises(MailDeliveryError, match="URL is invalid"):
        mailer._send_sync(b"{}")
