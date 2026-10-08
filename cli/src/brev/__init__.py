"""Brev CLI - manage short links from the terminal.

Usage:
  brev login [server]
  brev create <url> [--slug SLUG] [--title TITLE]
  brev list [--skip N] [--limit N]
  brev stats <slug>
  brev delete <slug>
  brev whoami
  brev logout
"""

from __future__ import annotations