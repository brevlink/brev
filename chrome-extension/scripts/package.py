#!/usr/bin/env python3
"""Build and verify the extension package that is attached to a release.

The package is what a person downloads to install the extension by hand and
what would be uploaded to a store: only the files the browser loads, manifest
first, no development tooling. The archive is written with fixed timestamps and
sorted entries so the same revision always produces the same bytes.

Usage:
  package.py --out <dir>        build <dir>/brev-extension-<version>.zip
  package.py --verify <zip>     check an existing archive
  package.py --list             print the member list that would be packaged
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
import zipfile
from pathlib import Path

EXTENSION_DIR = Path(__file__).resolve().parent.parent

# Everything the browser loads, relative to the extension directory.
INCLUDED = [
    "manifest.json",
    "background.js",
    "api.js",
    "storage.js",
    "ui.js",
    "popup.html",
    "popup.css",
    "popup.js",
    "options.html",
    "options.js",
    "offscreen.html",
    "offscreen.js",
    "palette.css",
    "icons/icon16.png",
    "icons/icon32.png",
    "icons/icon48.png",
    "icons/icon128.png",
]

# Present in the repository, deliberately not shipped.
DEVELOPMENT_ONLY = {"README.md", "package.json", "scripts"}

# Fixed timestamp so repeated builds of the same revision are byte-identical.
FIXED_TIME = (1980, 1, 1, 0, 0, 0)


def version() -> str:
    manifest = json.loads((EXTENSION_DIR / "manifest.json").read_text())
    return manifest["version"]


def check_inventory() -> None:
    """Fail when the directory holds something the packaging list ignores.

    A new runtime file must be a deliberate decision, not a silent omission
    from the archive.
    """
    included = {Path(item).parts[0] for item in INCLUDED}
    known = included | DEVELOPMENT_ONLY
    present = {entry.name for entry in EXTENSION_DIR.iterdir()}
    unknown = sorted(present - known)
    if unknown:
        raise SystemExit(
            "unclassified entries in chrome-extension/: "
            + ", ".join(unknown)
            + "\nAdd each one to INCLUDED or to DEVELOPMENT_ONLY in this script."
        )
    missing = [item for item in INCLUDED if not (EXTENSION_DIR / item).is_file()]
    if missing:
        raise SystemExit("missing files that the package needs: " + ", ".join(missing))


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def build(out_dir: Path) -> Path:
    check_inventory()
    out_dir.mkdir(parents=True, exist_ok=True)
    target = out_dir / f"brev-extension-{version()}.zip"
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        for item in sorted(INCLUDED, key=lambda name: (name != "manifest.json", name)):
            info = zipfile.ZipInfo(item, date_time=FIXED_TIME)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            archive.writestr(info, (EXTENSION_DIR / item).read_bytes())
    print(f"built {target.name} ({target.stat().st_size} bytes), sha256 {digest(target)}")
    return target


def verify(path: Path) -> int:
    problems: list[str] = []
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if names and names[0] != "manifest.json":
            problems.append(f"manifest.json must be the first entry, found {names[0]!r}")
        expected = sorted(INCLUDED)
        if sorted(names) != expected:
            problems.append(
                "entry list differs from the packaged set: "
                f"extra={sorted(set(names) - set(expected))} "
                f"missing={sorted(set(expected) - set(names))}"
            )
        for name in names:
            if Path(name).parts[0] in DEVELOPMENT_ONLY:
                problems.append(f"development file shipped in the package: {name}")
        try:
            manifest = json.loads(archive.read("manifest.json"))
        except KeyError:
            problems.append("manifest.json is not inside the archive")
            manifest = {}
        except json.JSONDecodeError as error:
            problems.append(f"manifest.json does not parse: {error}")
            manifest = {}
        if manifest.get("manifest_version") != 3:
            problems.append(f"manifest_version is {manifest.get('manifest_version')!r}, expected 3")
        for path_key, value in (manifest.get("icons") or {}).items():
            if isinstance(value, str) and value not in names:
                problems.append(f"manifest icon {path_key} points to {value}, missing from the archive")
        for action_path in ((manifest.get("action") or {}).get("default_icon") or {}).values():
            if action_path not in names:
                problems.append(f"action icon {action_path} is missing from the archive")
        if (manifest.get("action") or {}).get("default_popup") not in names:
            problems.append("the popup page named by the manifest is missing")
        background = (manifest.get("background") or {}).get("service_worker")
        if background and background not in names:
            problems.append("the service worker named by the manifest is missing")

    if problems:
        print(f"{path.name}: {len(problems)} problem(s)")
        for problem in problems:
            print("  " + problem)
        return 1
    print(f"{path.name}: ok, {len(names)} files, version {manifest.get('version')}, sha256 {digest(path)}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--out", type=Path, help="output directory for the archive")
    group.add_argument("--verify", type=Path, help="archive to check")
    group.add_argument("--list", action="store_true", help="print the packaged files")
    args = parser.parse_args()

    if args.list:
        check_inventory()
        for item in INCLUDED:
            print(item)
        return 0
    if args.out:
        build(args.out)
        return 0
    return verify(args.verify)


if __name__ == "__main__":
    sys.exit(main())
