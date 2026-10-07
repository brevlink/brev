# Custom domains with Cloudflare for SaaS

How a customer domain (`go.example.com`) ends up serving Brev links without
anyone touching nginx-proxy-manager or issuing a certificate by hand.

## How a request travels

```
customer browser
  -> Cloudflare edge (terminates the customer TLS, certificate issued by Cloudflare)
     -> custom hostname rule for go.example.com, fallback origin proxy.brevl.ink
        -> Origin Rule: origin port 8443
           -> brev-caddy:443   SNI=proxy.brevl.ink, Host=go.example.com
              -> backend:8000 (resolves the tenant from the Host) -> 307
```

First-party traffic is untouched: `brevl.ink`, `proxy.brevl.ink` and every
service on the host keep going through nginx-proxy-manager on port 443.

## Why this shape and not nginx-proxy-manager in front

With Cloudflare for SaaS the origin connection carries **SNI = the fallback
origin** (`proxy.brevl.ink`) and **Host = the customer hostname**. They do not
match, and that is deliberate: the Host is how the backend knows which tenant a
request belongs to.

nginx treats the mismatch as an error. Measured against the live origin:

| request | result |
| --- | --- |
| `Host: go.example.com` over HTTP/2 | `421 Misdirected Request` |
| `Host: go.example.com` over HTTP/1.1 | connection dropped (`unexpected eof`) |

Caddy routes by Host and has no such check, so the SaaS leg terminates there.
The backend needs no change: it receives the original Host, exactly as it does
for a first-party domain.

Two other things ruled out alternatives:

- **Caddy cannot obtain a Let's Encrypt certificate for the fallback origin**
  while nginx-proxy-manager sits on port 80: nginx answers the ACME HTTP-01
  challenge path itself and returns 404 for tokens that are not its own, so the
  challenge never reaches Caddy. Hence the Origin CA certificate.
- **SNI rewrites** (which would let one origin certificate serve many customer
  hostnames) are an Enterprise-only entitlement.

## Pieces and where they live

| piece | value |
| --- | --- |
| Cloudflare zone | `brevl.ink` (`dffe68e396421355289724ed4736067d`) |
| Fallback origin | `proxy.brevl.ink` (proxied `A` record to the origin IP) |
| Custom hostname | `custom_origin_server: proxy.brevl.ink` |
| Origin Rule | `http_request_origin` phase: `not http.host in {"brevl.ink" "www.brevl.ink" "proxy.brevl.ink"} -> origin.port 8443` |
| Published port | `${HTTPS_PORT:-8443}` in `docker-compose.yml` -> `brev-caddy:443` |
| Origin certificate | issued on demand by Caddy's internal CA, for any SNI — nothing to configure. A deployment that wants Full (strict) swaps the `tls` block for a certificate file pair valid for `proxy.brevl.ink` |
| Caddyfile | `:443` site without a host matcher, `import routing` shared with `:80` |

No certificate file is needed, and none is in the repository. The Caddyfile must
never hardcode a path either: a fresh clone has no such file and Caddy refuses to
start (`loading certificates: no such file or directory`), which would break
every self-hosted deployment.

## Customer onboarding

The dashboard shows the records to create:

1. `TXT _brev.<domain>` with the token returned by `POST /api/v1/domains` —
   proves the customer controls the domain, checked by `POST /domains/{id}/verify`.
2. `CNAME <domain> -> proxy.brevl.ink` — points the domain at Brev.

Both are needed. The CNAME is what makes Cloudflare issue the customer
certificate and start routing their traffic to the origin.

**Until the Cloudflare automation lands, the custom hostname is created by hand
in the Cloudflare dashboard.** The domain then shows as verified in Brev but
does not serve traffic until that hostname exists. The backend does not call the
Cloudflare API yet (`backend/app/services/domains.py` has no Cloudflare client).

## Pitfalls

- **`tls internal` alone is not enough for this site.** It covers only hostnames
  the site declares, and the SaaS site declares none on purpose: Cloudflare then
  gets no certificate for the fallback origin and the handshake dies with a 525
  on every customer domain. The site needs `on_demand`, so Caddy issues a
  certificate for whatever name arrives. Measured on 7 October 2026: plain
  `tls internal` → 525; `tls { on_demand; issuer internal }` → 307.
- **The Caddyfile must not hardcode a certificate path.** A clone has no
  `/data/certs`, and a missing file makes Caddy refuse to start, breaking every
  self-hosted install.
- **The zone SSL mode must stay `full`, not `strict`.** With `strict`,
  Cloudflare verifies the origin certificate: for the apex `brevl.ink` the
  request returns `526` because nginx-proxy-manager serves a `*.brevl.ink`
  certificate and a wildcard does not cover the apex. Enable `strict` only after
  nginx-proxy-manager serves a certificate whose SANs include `brevl.ink`
  itself.
- **A new first-party subdomain must be added to the Origin Rule exclusion
  list**, otherwise its traffic is sent to Caddy on 8443 instead of
  nginx-proxy-manager. The rule currently excludes `brevl.ink`, `www.brevl.ink`
  and `proxy.brevl.ink`.
- **Cloudflare's Free plan includes 100 custom hostnames per zone.** The risk is
  not cost, it is exhaustion: a bot creating accounts could consume the whole
  allowance and lock real customers out. The defence is the per-account cap —
  `FREE_CUSTOM_DOMAINS` plus the Brev Cloud entitlement beyond it — and rate
  limiting on `POST /api/v1/domains`.
- The Origin CA certificate has no renewal to schedule and no OCSP responder
  (Caddy logs a harmless "no OCSP stapling" warning at startup).

## Verifying the chain by hand

```bash
# straight to Caddy, bypassing Cloudflare: expect 307 to the link target
curl -sk -o /dev/null -w '%{http_code}\n' \
  --resolve proxy.brevl.ink:8443:<origin-ip> \
  -H 'Host: go.example.com' https://proxy.brevl.ink:8443/<slug>

# through Cloudflare: expect 307 to the link target
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}\n' https://go.example.com/<slug>
```

If the first returns `000`, Caddy has no certificate loaded. If it returns `307`
but the second fails, the problem is on the Cloudflare side: custom hostname
status, fallback origin status or the Origin Rule.
