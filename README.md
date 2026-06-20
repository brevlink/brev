# **Brev**

> **URL shortener** — Your domain, your links, your way.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub Stars](https://img.shields.io/github/stars/matteo-genovese/brev?style=flat)](https://github.com/matteo-genovese/brev)
[![Python](https://img.shields.io/badge/python-3.12-blue?logo=python)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-005571?logo=fastapi)](https://fastapi.tiangolo.com/)

**Brev** (from Italian *breve*, "short") is an open-source URL shortener. Self-host it, or let us handle the infra.

---

## ✨ Features

- **Short links** with redirect + click tracking
- **Multi-user** — each user controls their own links
- **Multi-domain** — bring your own custom domains
- **CLI** — `brew install brev` / `pip install brev-cli`
- **Self-contained** — PostgreSQL auth, zero vendor lock-in
- **OpenAPI docs** — auto-generated at `/docs`

---

## 🎯 Ecosystem

### 🐳 Brev OSS (self-hosted)

```bash
git clone https://github.com/matteo-genovese/brev.git
cd brev
cp .env.example .env
docker compose up -d
```

Fully self-contained: PostgreSQL for data + auth, FastAPI backend, React dashboard. No external accounts.

### ☁️ Brev Cloud (coming soon)

- Sign up at **brevl.ink**
- **One-time payment** per domain (via Stripe)
- Link your custom domain — we handle DNS + SSL
- Deploy, backups, scaling included

### 💻 Brev CLI (planned)

```bash
pip install brev-cli

brev login                 # API key auth
brev create https://...    # → https://your.domain/abc
brev list                  # your links
brev stats <slug>          # analytics
brev delete <slug>         # remove
```

Works with both OSS and Cloud.

---

## 🧱 Stack

| Component | Technology |
|-----------|-----------|
| **Landing** | Astro |
| **Dashboard** | React 19, TypeScript, Tailwind CSS |
| **Backend** | Python 3.12, FastAPI, SQLAlchemy async |
| **Database** | PostgreSQL 16 |
| **Auth** | bcrypt + JWT |
| **Payments** | Stripe |
| **CLI** | Python |
| **Proxy** | Caddy (auto SSL) |
| **Deploy** | Docker, GitHub Actions |

---

## 🌐 Environment Variables

| Variable | Required | Note |
|----------|:--------:|------|
| `DATABASE_URL` | ✅ | PostgreSQL URI |
| `JWT_SECRET` | ✅ | JWT signing key |
| `STRIPE_SECRET_KEY` | ❌ | Cloud only |
| `STRIPE_WEBHOOK_SECRET` | ❌ | Cloud only |

---

## 📖 API

FastAPI generates OpenAPI docs automatically:

```
http://localhost:8000/docs    # Swagger UI
http://localhost:8000/redoc   # ReDoc
```

---

## 🗺️ Roadmap

- [x] Vision & README
- [ ] **Backend** — FastAPI, models, auth, API
- [ ] **Self-contained auth** — bcrypt + JWT
- [ ] **Multi-user** — scoped links & domains
- [ ] **Landing page** — SEO-ready Astro site
- [ ] **Dashboard** — full link management UI
- [ ] **Dynamic domains** — add custom domains from UI
- [ ] **Custom slug** — choose short code
- [ ] **Analytics** — click timeline, referrer, UA
- [ ] **CLI** — pip-installable client
- [ ] **Brev Cloud** — Stripe, DNS, SSL, domains
- [ ] **Rate limiting** — anti-spam
- [ ] **API keys** — programmatic access

---

## 📄 License

MIT
