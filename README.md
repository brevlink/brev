# Brev

> Open-source link infrastructure. Your domain, your dashboard, your CLI.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.12-blue?logo=python)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-005571?logo=fastapi)](https://fastapi.tiangolo.com/)

Brev is an MIT-licensed URL shortener built to be self-hosted first.

The core product is the web stack: a FastAPI backend, PostgreSQL database, React
dashboard, and Caddy entry point. The CLI connects to whichever Brev server you
run, so the same command-line workflow works against your own instance or a
hosted Brev Cloud instance later.

Brev Cloud may become the official managed service for people who do not want to
run infrastructure. The code stays open source, and self-hosting the backend and
dashboard is the primary path.

The name comes from the Italian word `breve`, meaning short. The product is
built around that idea: short links, short paths, and the wordplay of
`brev link`.

## Legal readiness

The public landing site contains draft legal pages for the future Brev Cloud:

- [Privacy Notice](https://brevl.ink/privacy)
- [Terms of Service](https://brevl.ink/terms)
- [Cookie Policy](https://brevl.ink/cookies)
- [Legal Notice / Imprint](https://brevl.ink/legal)
- [Subprocessors & Data Retention](https://brevl.ink/subprocessors)

These are working drafts, not legal advice and not a claim that Brev is GDPR
compliant. They must be completed and reviewed by a qualified legal
professional before Brev Cloud launches. In particular, the legal entity and
address, tax identifiers, contacts, hosting and email providers, privacy
contact, supervisory authority, lawful bases, international-transfer
mechanisms, retention schedule, consumer/payment/refund terms, and applicable
law/jurisdiction are still `[DA COMPLETARE]`.

Brev self-hosted and Brev Cloud are separate contexts. A self-hosted operator
normally determines the purposes and means for data in its own installation and
must configure its own privacy notice, providers, cookies, logs, retention and
security process. Stripe is not configured in the current repository
configuration, and transactional email is disabled by default (`EMAIL_PROVIDER=none`).
See [docs/legal-readiness.md](docs/legal-readiness.md) and
[docs/self-hosting.md](docs/self-hosting.md).

## Repository

This repository lives at:

```text
https://github.com/brevlink/brev
```

Current layout:

```text
backend/        FastAPI API, auth, links, redirects, domains, billing hooks
dashboard/      React dashboard served at /app
landing/        Astro marketing site served at /
cli/            Python CLI that connects to a Brev server
docs/           Self-hosting and project notes
```

Planned areas:

```text
chrome-extension/   Browser extension, once the product shape is clearer
android/            Android app, once the API and workflows settle
```

The planned clients should stay thin: they should authenticate against a Brev
server and reuse the same backend/dashboard concepts instead of becoming
separate products.

## What You Self-Host

For most people, self-hosting means running:

- `backend`: API, auth, link creation, redirects, custom domains, API keys.
- `dashboard`: private web UI for managing links, domains, account state, and keys.
- `db`: PostgreSQL data store.
- `caddy`: single HTTP entry point that routes API, dashboard, docs, health checks, and short links.

The landing site is included in the default compose stack because it is useful
for the public Brev instance, but the operational value is in the backend and
dashboard.

## Features

- Short links with redirect and click tracking.
- Multi-user link ownership.
- Custom domains with DNS verification before use.
- Host-aware redirects for default and custom domains.
- Browser sessions with `HttpOnly` cookies.
- Revocable API keys for CLI and programmatic access.
- CLI workflow that can point at any self-hosted Brev server.
- Email verification hooks, Cloud billing entitlements, and admin moderation.
- Rate limiting on auth and link creation.
- Docker Compose stack with FastAPI, PostgreSQL, Caddy, React, and Astro.

## Quick Start

Requirements: Docker and Docker Compose.

```bash
git clone https://github.com/brevlink/brev.git
cd brev
cp .env.example .env
```

Generate secrets:

```bash
openssl rand -hex 32
openssl rand -hex 24
```

Put the first value in `JWT_SECRET` and the second value in `DB_PASSWORD` inside
`.env`.

For local testing:

```env
DEFAULT_DOMAIN=localhost
HTTP_PORT=80
SECURE_COOKIES=false
DOCS_ENABLED=true
CORS_ORIGINS=["http://localhost"]
```

Start Brev:

```bash
docker compose up -d --build
```

Then open:

- Dashboard: `http://localhost/app/login`
- API health: `http://localhost/health`
- API docs, only when `DOCS_ENABLED=true`: `http://localhost/docs`
- Landing: `http://localhost/`

The first registered user becomes the admin.

For a fuller production checklist, see [docs/self-hosting.md](docs/self-hosting.md).

## CLI

Install:

```bash
pip install brev-cli
```

Point it at your own Brev server:

```bash
brev login user@example.com --server https://links.example.com
brev token create --name laptop
brev create https://example.com --slug launch --title "Launch notes"
brev list
brev stats launch
brev delete launch
brev whoami
brev logout
```

`brev login` asks for your password once and proves your identity to the Brev
server. `brev token create --name laptop` then creates a revocable API key for
that device and stores it locally in `~/.brev/config`, so future CLI commands can
use the API without asking for your password again.

Use one token per device or automation target, for example `laptop`, `server`,
or `github-actions`. If a device is lost or a script should stop working, revoke
only that token from the dashboard instead of changing your account password.

For local development from this repository:

```bash
python3 -m pip install --user -e ./cli
brev login user@example.com --server http://localhost
```

## API

API routes are under `/api/v1`.

Docs are available when `DOCS_ENABLED=true`:

```text
http://localhost/docs
http://localhost/redoc
```

Production deployments should keep `DOCS_ENABLED=false`.

### Authentication hardening

Registration, verification resend, and password reset require a configured
transactional email adapter. `EMAIL_PROVIDER=none` is valid for self-hosted or
other deployments that do not have a mail server yet: the app can start, run
migrations, and let existing accounts log in, while those email-dependent
operations fail closed with HTTP 503. It never returns or logs
verification/reset tokens. Tests inject the in-memory mailer; there is no
fake-mailer production bypass.

Verification and reset tokens are random, stored only as hashes, expire, and
are single-use. Browser state-changing requests authenticated by the session
cookie must include an allowed `Origin` (or matching `Referer`). CLI/API clients
should use `Authorization: Bearer <JWT>` or a revocable `brev_...` API key; API
key bearer authentication is not a browser session and is not subject to the
cookie CSRF check.

Email links are an explicit frontend contract: configure
`FRONTEND_VERIFICATION_URL` and `FRONTEND_PASSWORD_RESET_URL` to routes that
actually exist in the deployed frontend. The token is placed in the URL
fragment (`#token=...`), not returned by registration/reset APIs and not sent
in the subsequent HTTP request for the frontend page. The frontend must POST
the token as JSON to `/api/v1/auth/verify-email` or to
`/api/v1/auth/password-reset/confirm` respectively. The backend also exposes
read-only GET bootstrap checks at those API paths; they validate a query token
without consuming it or changing state.

`REQUIRE_VERIFIED_EMAIL` defaults to `false`. When `true`, login, `/auth/me`,
verification resend, and password reset remain available; unverified
non-admin users receive `403` for links, domains, API-key, and billing
features. Admins remain available for recovery/moderation. Resend is rate
limited and never returns the verification token.

Sessions are persisted and revoked on logout and password change/reset. The
in-memory rate limiter is bounded and keyed by IP plus email for auth flows; it
is not a distributed limiter. Multi-instance deployments need a shared
rate-limit implementation behind the same abstraction.

## Environment

| Variable | Required | Note |
| --- | :---: | --- |
| `JWT_SECRET` | yes | Strong signing key, at least 32 chars in production |
| `DB_PASSWORD` | yes | PostgreSQL password used by Docker Compose |
| `DB_USER` | no | PostgreSQL user, default `postgres` |
| `DB_NAME` | no | PostgreSQL database, default `brev` |
| `HTTP_PORT` | no | Public HTTP port exposed by Caddy, default `80` |
| `BREV_DATA` | no | Local data directory, default `./data` |
| `BREV_NETWORK_NAME` | no | Docker network name, default `brev_net` |
| `BREV_NETWORK_EXTERNAL` | no | Set to `true` when using an existing Docker network |
| `POSTGRES_IMAGE` | no | PostgreSQL image used by Compose |
| `BACKEND_IMAGE` | no | Backend image tag built or used by Compose |
| `LANDING_IMAGE` | no | Landing image tag built or used by Compose |
| `DASHBOARD_IMAGE` | no | Dashboard image tag built or used by Compose |
| `CADDY_IMAGE` | no | Caddy image tag built by Compose |
| `DATABASE_URL` | no | PostgreSQL URI for non-compose deployments |
| `DEFAULT_DOMAIN` | no | Default short-link domain |
| `CORS_ORIGINS` | no | JSON list of allowed browser origins |
| `APP_BASE_URL` | no | Public backend base URL |
| `FRONTEND_VERIFICATION_URL` | when email enabled | Existing frontend route that reads `token` from the URL fragment and POSTs verification |
| `FRONTEND_PASSWORD_RESET_URL` | when email enabled | Existing frontend route that reads `token` from the URL fragment and POSTs password reset |
| `ENVIRONMENT` | no | `development` or `production` |
| `SECURE_COOKIES` | no | Must be `true` when served over HTTPS |
| `EMAIL_PROVIDER` | no | `smtp`, `api`, or `none`; `none` keeps self-hosted startup/login available but fails email-dependent auth flows safely |
| `EMAIL_FROM` | when email enabled | Sender address; no default is provided |
| `SMTP_HOST` / `SMTP_PORT` | when SMTP | SMTP endpoint and port |
| `SMTP_USERNAME` / `SMTP_PASSWORD` | no | Optional SMTP authentication |
| `SMTP_STARTTLS` | no | Use STARTTLS for SMTP, default `true` |
| `EMAIL_API_URL` / `EMAIL_API_TOKEN` | when API | Generic JSON email endpoint and bearer credential |
| `DOCS_ENABLED` | no | Disable in production |
| `BREV_DEBUG` | no | Enables backend debug mode when `true` |
| `CLOUD_MODE` | no | Enables Brev Cloud entitlement checks for Cloud-only limits |
| `REQUIRE_VERIFIED_EMAIL` | no | Default `false`; when `true`, requires verification for non-admin product features while keeping login/resend/recovery available |
| `FREE_CUSTOM_DOMAINS` | no | Included custom domains before a Cloud entitlement is required |
| `CNAME_TARGET` | no | DNS target shown for custom domains |
| `STRIPE_SECRET_KEY` | no | Cloud only |
| `STRIPE_WEBHOOK_SECRET` | no | Cloud only |
| `STRIPE_PRICE_ID` | no | Stripe one-time Price for Brev Cloud; create it as a one-time Price in the Stripe Dashboard |
| `STRIPE_SUCCESS_URL` | no | Checkout success redirect |
| `STRIPE_CANCEL_URL` | no | Checkout cancel redirect |

Stripe Cloud is deliberately prepared as a one-time payment only. The backend
uses `mode=payment` and grants persistent Cloud access only after a signed
`checkout.session.completed` event reports `payment_status=paid`. The legacy
`subscriptions` table remains for compatibility with existing data and status
responses, but new purchases do not create subscriptions or use subscription
renewals, a billing portal, or subscription webhooks as their primary flow.

Before enabling it, create a one-time (not recurring) Stripe Price in the
Stripe Dashboard and set `STRIPE_PRICE_ID` to that Price ID. Configure a
test-mode secret and webhook signing secret only in the deployment environment;
do not put credentials in this repository. Live/test webhook endpoints and
their Stripe Dashboard configuration are future deployment steps and are not
enabled by these changes alone. The webhook endpoint will be
`POST /api/v1/billing/webhook`.

## Local Development

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
alembic upgrade head
uvicorn app.main:app --reload
```

Dashboard:

```bash
cd dashboard
npm install
npm run dev
```

Landing:

```bash
cd landing
npm install
npm run dev
```

CLI:

```bash
python3 -m pip install --user -e ./cli
```

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting. CI runs backend
tests, Python dependency audit, Bandit, npm audit, and frontend builds.

## License and Brand

Code is licensed under [MIT](LICENSE). Brand guidance is in
[TRADEMARK.md](TRADEMARK.md): MIT lets people use and redistribute the code, but
it does not grant permission to impersonate the official Brev Cloud service.
