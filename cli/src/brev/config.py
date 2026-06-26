"""Configuration storage — token + server URL."""

from __future__ import annotations

import configparser
import os
from pathlib import Path

CONFIG_DIR = Path.home() / ".brev"
CONFIG_FILE = CONFIG_DIR / "config"
DEFAULT_SERVER = "https://brevl.ink"


def _ensure_dir() -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    CONFIG_FILE.touch(mode=0o600, exist_ok=True)


def save_config(api_url: str, token: str) -> None:
    _ensure_dir()
    config = configparser.ConfigParser()
    config["brev"] = {"api_url": api_url, "token": token}
    with open(CONFIG_FILE, "w") as f:
        config.write(f)
    os.chmod(CONFIG_FILE, 0o600)


def load_config() -> dict[str, str]:
    if not CONFIG_FILE.exists():
        return {}
    config = configparser.ConfigParser()
    config.read(str(CONFIG_FILE))
    if "brev" not in config:
        return {}
    return dict(config["brev"])


def clear_config() -> None:
    if CONFIG_FILE.exists():
        CONFIG_FILE.unlink()


def get_token() -> str | None:
    cfg = load_config()
    return cfg.get("token")


def get_api_url() -> str:
    cfg = load_config()
    return cfg.get("api_url", DEFAULT_SERVER)
