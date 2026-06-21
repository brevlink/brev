# Brev

> URL shortener. Your domain, your links, your way.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.12-blue?logo=python)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-005571?logo=fastapi)](https://fastapi.tiangolo.com/)

Brev is an MIT-licensed URL shortener for self-hosting and hosted Cloud use.
The code is open source; the official hosted service, brand, and domains are
operated as Brev Cloud.

## Features

- Short links with redirect and click tracking.
- Multi-user link ownership.
- Custom domains with DNS verification before use.
- Host-aware redirects for default and custom domains.
- Browser sessions with `HttpOnly` cookies.
- Revocable API keys for CLI and programmatic access.
- Email verification hooks, Cloud billing entitlements, and admin moderation.
- Rate limiting on auth and link creation.
- FastAPI backend, Alembic migrations, React dashboard, Astro landing page, PostgreSQL, Caddy.

## How It Works

With `docker compose`, Brev starts four services:

- `caddy`: public entry point. It serves the landing page at `/`, the dashboard at `/app`, the API at `/api/v1`, and routes short links like `/launch` to the backend.
- `backend`: FastAPI API for login, sessions, links, redirects, custom domains, and Cloud billing.
- `dashboard`: React interface for accounts, links, domains, API keys, and billing.
- `db`: PostgreSQL.

Configuration is controlled through `.env`. You do not need to edit
`docker-compose.yml` to change the domain, port, passwords, image tags, or data
path.

## Self-Hosted: Step By Step

### 1. Requirements

Install Docker and Docker Compose on your server or computer.

### 2. Clone the project

```bash
git clone https://github.com/matteo-genovese/brev.git
cd brev
cp .env.example .env
```

### 3. Generate secrets

```bash
openssl rand -hex 32
openssl rand -hex 24
```

Open `.env` and paste the first value into `JWT_SECRET`, and the second value
into `DB_PASSWORD`.

### 4. Configure domain and URLs

For local testing, you can use:

```env
DEFAULT_DOMAIN=localhost
HTTP_PORT=80
SECURE_COOKIES=false
DOCS_ENABLED=true
CORS_ORIGINS=["http://localhost"]
```

For a public server behind HTTPS:

```env
DEFAULT_DOMAIN=yourdomain.com
SECURE_COOKIES=true
DOCS_ENABLED=false
CORS_ORIGINS=["https://yourdomain.com"]
```

Compose exposes HTTP on `HTTP_PORT`. For production, put Brev behind a reverse
proxy with TLS, for example Cloudflare, Nginx Proxy Manager, Traefik, or an
external Caddy instance. Set `SECURE_COOKIES=true` only when the site is served
over HTTPS.

### 5. Start

```bash
docker compose up -d --build
```

On first startup, the backend automatically runs database migrations. Alembic is
the tool that updates the PostgreSQL schema to the version required by the code.

### 6. Verify

```bash
docker compose ps
curl http://localhost/health
```

Then open:

- Landing: `http://localhost/`
- Dashboard: `http://localhost/app/login`
- API docs, only when `DOCS_ENABLED=true`: `http://localhost/docs`

The first registered user becomes the admin.

### 7. Update

```bash
git pull
docker compose up -d --build
```

Migrations are applied when the backend starts.

### 8. Logs and backups

```bash
docker compose logs -f backend
docker compose logs -f caddy
```

Data is stored in `BREV_DATA`, which defaults to `./data`. Back up at least:

- `./data/pgdata`
- `.env`

To create a PostgreSQL dump:

```bash
docker compose exec db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > brev.sql
```

### 9. Custom domains

In the dashboard, add the domain, create the requested TXT record for
verification, and then point the domain to the target shown in the app. The
default value is:

```env
CNAME_TARGET=proxy.brevl.ink.
```

For self-hosting, change it to your public proxy domain, for example:

```env
CNAME_TARGET=links.yourdomain.com.
```

## Brev Cloud

Brev Cloud is the official hosted service for users who want managed SSL,
custom-domain verification, backups, abuse controls, billing, and support.
Self-hosted Brev remains MIT licensed.

## CLI

```bash
pip install brev-cli

brev login user@example.com --server https://brevl.ink
brev token create --name laptop
brev create https://example.com --slug launch --title "Launch notes"
brev list
brev stats launch
brev delete launch
brev whoami
brev logout
```

`brev login` prompts for the password securely. `brev token create` creates and
stores a revocable API key for future CLI calls.

## API

API routes are under `/api/v1`.

Docs are available when `DOCS_ENABLED=true`:

```text
http://localhost/docs
http://localhost/redoc
```

Production deployments should keep `DOCS_ENABLED=false`.

## Environment

| Variable | Required | Note |
| --- | :---: | --- |
| `JWT_SECRET` | yes | Strong signing key, at least 32 chars in production |
| `DB_PASSWORD` | yes | PostgreSQL password used by Docker Compose |
| `DB_USER` | no | PostgreSQL user, default `postgres` |
| `DB_NAME` | no | PostgreSQL database, default `brev` |
| `HTTP_PORT` | no | Public HTTP port exposed by Caddy, default `80` |
| `BREV_DATA` | no | Local data directory, default `./data` |
| `POSTGRES_IMAGE` | no | PostgreSQL image used by Compose |
| `BACKEND_IMAGE` | no | Backend image tag built or used by Compose |
| `LANDING_IMAGE` | no | Landing image tag built or used by Compose |
| `DASHBOARD_IMAGE` | no | Dashboard image tag built or used by Compose |
| `CADDY_IMAGE` | no | Caddy image used by Compose |
| `DATABASE_URL` | no | PostgreSQL URI for non-compose deployments |
| `DEFAULT_DOMAIN` | no | Default short-link domain |
| `CORS_ORIGINS` | no | JSON list of allowed browser origins |
| `ENVIRONMENT` | no | `development` or `production` |
| `SECURE_COOKIES` | no | Must be `true` when served over HTTPS |
| `DOCS_ENABLED` | no | Disable in production |
| `BREV_DEBUG` | no | Enables backend debug mode when `true` |
| `CLOUD_MODE` | no | Enables subscription checks for Cloud-only limits |
| `REQUIRE_VERIFIED_EMAIL` | no | Requires verified email for custom domains |
| `FREE_CUSTOM_DOMAINS` | no | Included custom domains before subscription is required |
| `CNAME_TARGET` | no | DNS target shown for custom domains |
| `STRIPE_SECRET_KEY` | no | Cloud only |
| `STRIPE_WEBHOOK_SECRET` | no | Cloud only |
| `STRIPE_PRICE_ID` | no | Stripe recurring price for Brev Cloud |
| `STRIPE_SUCCESS_URL` | no | Checkout success redirect |
| `STRIPE_CANCEL_URL` | no | Checkout cancel redirect |

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

CI runs backend tests, Python dependency audit, Bandit, npm audit, and frontend
builds.

## Security

See [SECURITY.md](SECURITY.md) for vulnerability reporting. The CI pipeline runs
backend tests, Python dependency audit, Bandit, npm audit, and frontend builds.

## License and Brand

Code is licensed under [MIT](LICENSE). Brand guidance is in
[TRADEMARK.md](TRADEMARK.md): MIT lets people use and redistribute the code, but
it does not grant permission to impersonate the official Brev Cloud service.
