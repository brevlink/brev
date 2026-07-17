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
