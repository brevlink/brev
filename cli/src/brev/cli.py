"""CLI entry point — argparse commands for `brev`."""

from __future__ import annotations

import argparse
import getpass
import sys

from brev import client, config
from brev.client import BrevAPIError


def cmd_login(args: argparse.Namespace) -> None:
    """Authenticate and store credentials."""
    api_url = args.server.rstrip("/")
    if args.token:
        config.save_config(api_url, args.token)
        print(f"✓ API key saved (server: {api_url})")
        return

    email = args.email or input("Email: ").strip()
    password = args.password or getpass.getpass("Password: ")

    # First try login, prompt for registration if it fails
    try:
        res = client.login(api_url, email, password)
        _save_and_report(api_url, res)
    except BrevAPIError as e:
        if e.status == 401 and args.register_if_unregistered:
            _register_and_login(api_url, email, password)
        else:
            print(f"✗ {e.detail}", file=sys.stderr)
            sys.exit(1)


def _register_and_login(api_url: str, email: str, password: str) -> None:
    display_name = email.split("@")[0]
    try:
        client.register(api_url, email, password, display_name)
        res = client.login(api_url, email, password)
        _save_and_report(api_url, res)
    except BrevAPIError as e:
        print(f"✗ {e.detail}", file=sys.stderr)
        sys.exit(1)


def _save_and_report(api_url: str, res: dict) -> None:
    token = res["access_token"]
    user = res["user"]
    config.save_config(api_url, token)
    print(f"✓ Logged in as {user['email']} (server: {api_url})")


def cmd_create(args: argparse.Namespace) -> None:
    """Create a short link."""
    token = config.get_token()
    if not token:
        print("✗ Not logged in. Run `brev login` first.", file=sys.stderr)
        sys.exit(1)

    api_url = config.get_api_url()
    try:
        link = client.create_link(
            api_url,
            token,
            url=args.url,
            slug=args.slug,
            title=args.title,
        )
        print(f"✓ Created: {link['short_url']} → {link['url']}")
        if link.get("clicks") is not None:
            print(f"  Clicks: {link['clicks']}")
    except BrevAPIError as e:
        print(f"✗ {e.detail}", file=sys.stderr)
        sys.exit(1)


def cmd_list(args: argparse.Namespace) -> None:
    """List all links."""
    token = config.get_token()
    if not token:
        print("✗ Not logged in. Run `brev login` first.", file=sys.stderr)
        sys.exit(1)

    api_url = config.get_api_url()
    try:
        data = client.list_links(api_url, token, skip=args.skip, limit=args.limit)
        items = data.get("items", [])
        total = data.get("total", 0)

        if not items:
            print("No links yet. Create one with `brev create <url>`.")
            return

        print(f"Links ({total} total):")
        for link in items:
            clicks = link.get("clicks", 0)
            active = "✓" if link.get("is_active", True) else "✗"
            title = link.get("title") or "(no title)"
            print(f"  {active} {link['short_url']} → {link['url']}")
            print(f"     {clicks} clicks | {title}")
            print()

    except BrevAPIError as e:
        print(f"✗ {e.detail}", file=sys.stderr)
        sys.exit(1)


def cmd_stats(args: argparse.Namespace) -> None:
    """Show stats for a link."""
    token = config.get_token()
    if not token:
        print("✗ Not logged in. Run `brev login` first.", file=sys.stderr)
        sys.exit(1)

    api_url = config.get_api_url()
    try:
        link = client.get_link(api_url, token, slug=args.slug)
        print(f"Slug:     {link['slug']}")
        print(f"URL:      {link['url']}")
        print(f"Short:    {link['short_url']}")
        print(f"Clicks:   {link['clicks']}")
        print(f"Active:   {'Yes' if link.get('is_active', True) else 'No'}")
        print(f"Title:    {link.get('title') or '(none)'}")
        print(f"Created:  {link['created_at']}")
        print(f"Updated:  {link['updated_at']}")
    except BrevAPIError as e:
        print(f"✗ {e.detail}", file=sys.stderr)
        sys.exit(1)


def cmd_delete(args: argparse.Namespace) -> None:
    """Delete a link."""
    token = config.get_token()
    if not token:
        print("✗ Not logged in. Run `brev login` first.", file=sys.stderr)
        sys.exit(1)

    api_url = config.get_api_url()
    try:
        # First resolve slug → link id
        link = client.get_link(api_url, token, slug=args.slug)
        link_id = link["id"]
        client.delete_link(api_url, token, link_id)
        print(f"✓ Deleted: {link['slug']} → {link['url']}")
    except BrevAPIError as e:
        print(f"✗ {e.detail}", file=sys.stderr)
        sys.exit(1)


def cmd_whoami(args: argparse.Namespace) -> None:
    """Show current user info."""
    token = config.get_token()
    if not token:
        print("✗ Not logged in. Run `brev login` first.", file=sys.stderr)
        sys.exit(1)

    api_url = config.get_api_url()
    try:
        user = client.whoami(api_url, token)
        print(f"ID:       {user['id']}")
        print(f"Email:    {user['email']}")
        print(f"Name:     {user.get('display_name') or '(not set)'}")
        print(f"Verified: {'Yes' if user.get('is_verified') else 'No'}")
        print(f"Created:  {user['created_at']}")
        print(f"Server:   {api_url}")
    except BrevAPIError as e:
        print(f"✗ {e.detail}", file=sys.stderr)
        sys.exit(1)


def cmd_logout(args: argparse.Namespace) -> None:
    """Clear stored credentials."""
    config.clear_config()
    print("✓ Logged out")


def cmd_token_create(args: argparse.Namespace) -> None:
    """Create and store a revocable API key for future CLI calls."""
    token = config.get_token()
    if not token:
        print("✗ Not logged in. Run `brev login` first.", file=sys.stderr)
        sys.exit(1)

    api_url = config.get_api_url()
    try:
        data = client.create_api_key(api_url, token, name=args.name)
        config.save_config(api_url, data["token"])
        print(f"✓ Created API key: {data['prefix']}…")
        print("  Saved it for future CLI requests.")
    except BrevAPIError as e:
        print(f"✗ {e.detail}", file=sys.stderr)
        sys.exit(1)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="brev",
        description="Brev — URL shortener CLI.",
    )
    parser.set_defaults(func=lambda _: parser.print_help())

    sub = parser.add_subparsers(title="commands")

    # ── login ──────────────────────────────────────────────────────────
    p_login = sub.add_parser("login", help="Log in to a Brev server")
    p_login.add_argument("email", nargs="?", help="Your email address")
    p_login.add_argument("--password", help="Password (omit to use a hidden prompt)")
    p_login.add_argument("--token", help="Use an existing Brev API key instead of a password")
    p_login.add_argument("--server", default=config.DEFAULT_SERVER,
                         help=f"Brev server URL (default: {config.DEFAULT_SERVER})")
    p_login.add_argument("--no-register", dest="register_if_unregistered",
                         action="store_false", default=True,
                         help="Don't auto-register if account doesn't exist")
    p_login.set_defaults(func=cmd_login)

    # ── create ─────────────────────────────────────────────────────────
    p_create = sub.add_parser("create", help="Create a short link")
    p_create.add_argument("url", help="The URL to shorten")
    p_create.add_argument("--slug", help="Custom slug (random if omitted)")
    p_create.add_argument("--title", help="Optional title for the link")
    p_create.set_defaults(func=cmd_create)

    # ── list ───────────────────────────────────────────────────────────
    p_list = sub.add_parser("list", help="List your short links")
    p_list.add_argument("--skip", type=int, default=0, help="Skip N items")
    p_list.add_argument("--limit", type=int, default=50, help="Max items (max 100)")
    p_list.set_defaults(func=cmd_list)

    # ── stats ──────────────────────────────────────────────────────────
    p_stats = sub.add_parser("stats", help="Show link stats")
    p_stats.add_argument("slug", help="The slug to inspect")
    p_stats.set_defaults(func=cmd_stats)

    # ── delete ─────────────────────────────────────────────────────────
    p_del = sub.add_parser("delete", help="Delete a short link")
    p_del.add_argument("slug", help="The slug to delete")
    p_del.set_defaults(func=cmd_delete)

    # ── whoami ─────────────────────────────────────────────────────────
    p_me = sub.add_parser("whoami", help="Show current user info")
    p_me.set_defaults(func=cmd_whoami)

    # ── logout ─────────────────────────────────────────────────────────
    p_logout = sub.add_parser("logout", help="Clear stored credentials")
    p_logout.set_defaults(func=cmd_logout)

    # ── token create ─────────────────────────────────────────────────────
    p_token = sub.add_parser("token", help="Manage API keys")
    token_sub = p_token.add_subparsers(title="token commands")
    p_token_create = token_sub.add_parser("create", help="Create and store a CLI API key")
    p_token_create.add_argument("--name", default="CLI", help="API key name")
    p_token_create.set_defaults(func=cmd_token_create)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
