# Self-Hosting Brev

Brev is designed so the useful self-hosted unit is the backend and dashboard.
The CLI, browser extension, and future mobile app should connect to this same
server instead of requiring separate infrastructure.

Each self-hosted operator is responsible for its own legal and operational
configuration: privacy/cookie notice, user-facing contacts, hosting and email
providers, logs, backups, retention, security response and any applicable
requirements. The public legal pages are drafts for the future Brev Cloud and
are not a self-hosted operator's completed notice or a claim of GDPR compliance.

## Services

`docker compose up -d --build` starts:

- `caddy`: public entry point on `HTTP_PORT`.
- `backend`: FastAPI app for API routes, redirects, sessions, API keys, domains, and admin flows.
- `dashboard`: React app served at `/app`.
- `landing`: public landing page served at `/`.
- `db`: PostgreSQL.

Caddy routes:

- `/api/*`, `/docs`, `/redoc`, `/openapi.json`, `/health` to the backend.
- `/app/*` to the dashboard.
- short-link paths such as `/launch` to the backend.
- everything else to the landing site.

## Install

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

Set:

```env
JWT_SECRET=first-generated-value
DB_PASSWORD=second-generated-value
```

For local testing:

```env
DEFAULT_DOMAIN=localhost
HTTP_PORT=80
SECURE_COOKIES=false
DOCS_ENABLED=true
CORS_ORIGINS=["http://localhost"]
```

For a public HTTPS deployment:

```env
DEFAULT_DOMAIN=links.example.com
SECURE_COOKIES=true
DOCS_ENABLED=false
CORS_ORIGINS=["https://links.example.com"]
CNAME_TARGET=links.example.com.
APP_BASE_URL=https://links.example.com
FRONTEND_VERIFICATION_URL=https://links.example.com/REPLACE_WITH_EXISTING_VERIFICATION_ROUTE
FRONTEND_PASSWORD_RESET_URL=https://links.example.com/REPLACE_WITH_EXISTING_RESET_ROUTE
EMAIL_PROVIDER=smtp
EMAIL_FROM=noreply@links.example.com
SMTP_HOST=mail.example.net
SMTP_PORT=587
SMTP_STARTTLS=true
```

The SMTP host, sender, username, and password above are placeholders, not
credentials. Configure either SMTP or the provider-neutral `EMAIL_API_URL` and
`EMAIL_API_TOKEN`. `EMAIL_PROVIDER=none` is valid for self-hosted deployments
or any deployment without a mail server yet: the app still starts, runs
migrations, and allows existing accounts to log in. Registration, verification
resend, and password recovery remain disabled and fail closed with HTTP 503; the
app never simulates delivery or returns an auth token. Test-only in-memory
delivery is injected by the backend test suite and cannot be enabled through an
environment variable.
The two `FRONTEND_*_URL` values must be real routes implemented by the
deployed frontend; the backend does not assume or create dashboard routes.
Links carry the single-use token in a URL fragment. The frontend must POST it
to the documented API endpoints. `GET` on either API endpoint is a read-only
bootstrap validation and does not consume the token.

Start:

```bash
docker compose up -d --build
```

Check:

```bash
docker compose ps
curl http://localhost/health
```

## Reverse Proxy and TLS

Compose exposes plain HTTP on `HTTP_PORT`. For production, put Brev behind TLS
with Cloudflare, Nginx Proxy Manager, Traefik, an external Caddy instance, or
another reverse proxy.

Set `SECURE_COOKIES=true` only when users access Brev over HTTPS.

## CLI Against a Self-Hosted Server

```bash
pip install brev-cli
brev login user@example.com --server https://links.example.com
brev token create --name laptop
brev create https://example.com --slug launch
```

For local compose:

```bash
brev login user@example.com --server http://localhost
```

## Custom Domains

In the dashboard, add the domain and create the requested TXT record for
verification. Then point the domain to the target shown by the app.

For self-hosting, set `CNAME_TARGET` to the public proxy domain you control:

```env
CNAME_TARGET=links.example.com.
```

## Updates

```bash
git pull
docker compose up -d --build
```

The backend runs Alembic migrations on startup.

The auth hardening migration adds persistent sessions and hashed, expiring
single-use verification/reset tokens. Existing bcrypt password hashes remain
valid. Any old pending plaintext email-verification tokens are invalidated by
the migration; users can request a new verification email.

### Brev Cloud Stripe (future configuration)

Self-hosted deployments do not need Stripe: leave `CLOUD_MODE` and the Stripe
variables empty/disabled. Brev Cloud is prepared for a one-time Checkout only.
If it is enabled in a future Cloud deployment, create a **one-time, non-recurring**
Price in the Stripe Dashboard and set `STRIPE_PRICE_ID` to that Price ID. Use
test-mode credentials while validating the integration; never place keys in
this repository. The future test/live webhook endpoint is
`POST /api/v1/billing/webhook`, with its signing secret configured separately.
The endpoint grants persistent Cloud access only after a signed paid checkout
event; no billing portal, renewal, or subscription webhook flow is configured.
Stripe is not configured by the repository's default setup. Transactional email
is also not configured by default (`EMAIL_PROVIDER=none`); an operator that
enables SMTP or an API adapter must add the provider to its own data map and
notice.

## Logs

```bash
docker compose logs -f backend
docker compose logs -f caddy
```

## Backups

Data is stored in `BREV_DATA`, which defaults to `./data`. Back up:

- `./data/pgdata`
- `.env`

PostgreSQL dump:

```bash
docker compose exec db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > brev.sql
```

## PostgreSQL Password Changes

`POSTGRES_PASSWORD` is only used when PostgreSQL initializes an empty data
directory. If `BREV_DATA/pgdata` already exists and you later change
`DB_PASSWORD`, PostgreSQL keeps the old password.

For a fresh install where you do not need existing data:

```bash
docker compose down
rm -rf ./data/pgdata
docker compose up -d --build
```

To keep the database, update the PostgreSQL password to match `DB_PASSWORD`:

```bash
docker compose exec db psql -U postgres -d postgres -c "ALTER USER postgres WITH PASSWORD 'your-db-password';"
docker compose up -d backend
```
