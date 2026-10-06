from __future__ import annotations

from pathlib import Path


def test_legal_routes_are_explicitly_before_short_link_matcher():
    caddyfile = (Path(__file__).resolve().parents[2] / "Caddyfile").read_text(encoding="utf-8")
    legal_start = caddyfile.index("@legal path")
    short_start = caddyfile.index("@short path_regexp")
    assert legal_start < short_start
    legal_matcher = caddyfile[legal_start:caddyfile.index("\n", legal_start)]
    for page in ("privacy", "terms", "cookies", "legal", "subprocessors"):
        assert f"/{page}" in legal_matcher
        assert f"/{page}/" in legal_matcher
    for route in ("handle /api/*", "handle_path /app/*", "handle /health", "@short path_regexp short"):
        assert route in caddyfile


def test_saas_leg_serves_any_host_on_its_own_port():
    """Cloudflare for SaaS reaches Caddy with the customer hostname while the SNI
    is our fallback origin: the site must have no host matcher, or every customer
    domain would fall through."""
    caddyfile = (Path(__file__).resolve().parents[2] / "Caddyfile").read_text(encoding="utf-8")
    assert ":443 {" in caddyfile
    assert "tls /data/certs/proxy.brevl.ink.crt /data/certs/proxy.brevl.ink.key" in caddyfile
    # The certificate belongs to the fallback origin, so no host-specific site
    # may claim port 443: that would shadow the catch-all for customer hostnames.
    assert "proxy.brevl.ink:443 {" not in caddyfile


def test_routing_is_shared_not_duplicated():
    caddyfile = (Path(__file__).resolve().parents[2] / "Caddyfile").read_text(encoding="utf-8")
    assert caddyfile.count("import routing") >= 2
    assert caddyfile.count("@short path_regexp") == 1
