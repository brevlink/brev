# Legal readiness checklist

The legal pages in `landing/src/pages/` are a draft base for the public Brev
site. They are not legal advice and do not state that Brev is GDPR compliant.
They must be completed and reviewed by a qualified legal professional before
any Brev Cloud launch or payment flow.

## Separate operating contexts

- **Public site:** the static Astro landing and legal pages have active,
  cookie-free visit statistics through Plausible, self-hosted on Matt’s own
  infrastructure (novezero.it), under the same controller. No profiling,
  personal-data retention or transfer of analytics data to third parties;
  IP addresses are used to derive country and are not retained. No advertising
  or public data-collection form is added. Hosting/deployment logs still need
  to be checked with the selected provider.
- **Brev self-hosted:** the operator of each installation normally determines
  the purposes and means of processing its users’ data. The operator must
  publish and configure its own privacy/cookie notices, providers, backups,
  logging, retention, incident process, and legal contacts.
- **Future Brev Cloud:** a separate managed service. Its account, link/domain,
  click/security, support and billing flows need a confirmed data map and
  processor register before launch.

## Required confirmations

Matt must provide or approve the following, with legal review where relevant:

- `[DA COMPLETARE]` legal entity/person, postal address, P.IVA/codice fiscale,
  general contact, privacy/DPO contact, hosting/deployment contact and support
  channel;
- establishment, countries served, applicable lawful bases, consumer terms,
  refund/withdrawal rules, applicable law, jurisdiction and supervisory
  authority;
- actual Cloud hosting, database, email, Stripe, backup and logging/monitoring
  providers, processing countries, DPAs, subprocessors and transfer safeguards;
- retention and deletion schedule for accounts, links/domains,
  sessions/tokens, security/support logs and billing records;
- data-subject request workflow, identity checks, breach response and update
  notice for new subprocessors;
- whether and when Stripe Checkout, transactional email or other non-essential
  services are enabled in production. Public-site analytics is active:
  Plausible is self-hosted on Matt’s own infrastructure (novezero.it) and
  cookie-free; this use requires no cookie consent. It covers the landing and
  legal pages only, with no analytics added to the authenticated dashboard.

The current backend uses a browser session cookie named `brev_session`,
password hashes, account fields, links/domains, API keys, sessions and
single-use auth-token records. It records minimized click statistics for redirects (see below). It
does not currently configure Stripe or a transactional email provider by
default; detailed request/security-log retention is not defined by this
repository and must not be invented in the public notice.

The MIT license in `LICENSE` is unchanged. Brand use remains subject to
`TRADEMARK.md`.

## Click statistics: confirmed data and retention

Click records contain a count, UTC day and first occurrence timestamp, country
from `CF-IPCountry` (if present), referrer hostname only, device category
(`desktop`, `mobile`, `tablet`, `other`) and, when calculable, a non-reversible
visitor fingerprint. Raw IP addresses, raw user agents and full referrer URLs
(paths, query parameters, credentials and fragments) are never stored in these
records. IP and user agent are used only in memory to derive the device and
fingerprint. The country comes from the Cloudflare header, without a local
geolocation service.

The fingerprint is truncated HMAC-SHA256, with a daily salt derived from the
server secret and UTC date. Neither the salt nor source IP/user agent is stored;
fingerprints cannot be linked across days. Events are one row per link, UTC day
and fingerprint, with repeated visits counted in `hits`. Missing fingerprints
remain separate records. Country/referrer/device describe the first visit that
day. Known bots and prefetch requests are excluded from statistics and counters.

Raw click events are retained for **90 days by default**, configurable with
`CLICK_EVENT_RETENTION_DAYS` (positive integer). Daily click/visitor aggregates
are retained long term without automatic expiry so totals survive event pruning.
Deleting a link cascades deletion of its events and aggregates. No specific
expiry for retained daily aggregates is being invented here.

The operator command `python -m scripts.prune_click_events`, run from `/app`
inside the backend container, removes events older than the configured rolling
window and commits the deletion. Operators must schedule it in cron; no
scheduler is installed in this change. See [Click statistics](click-statistics.md).
Regular execution is required for the retention policy to take effect. Backup
and infrastructure-log retention must be checked separately. The compose configuration is
unchanged; configure retention directly in the backend environment or a local
compose override.

Account totals sum daily distinct visitors per link: they do not identify unique
people across days or links. Breakdown dimensions use retained events, so a
shorter retention setting can leave historical totals available without their
country/referrer/device detail.

Set `TRUSTED_PROXY_HEADERS=true` only behind a trusted ingress that replaces
client-supplied proxy headers (for example Cloudflare). This allows the
fingerprint to use `CF-Connecting-IP`; otherwise it uses the immediate peer IP.
The setting must be configured in the backend environment separately from the
unchanged compose file. Redirect analytics have a one-second budget and fail
open with a sanitized warning; analytics can consequently undercount during
failures or contention, while the redirect continues. Existing click counters have no historical date
or visitor information and are not backfilled into the new statistics.

The click-related data/retention decisions above are settled. Other legal bases,
contacts, providers and retention schedules remain subject to the existing
confirmations and legal review. The public privacy notice must describe these
fields and the 90-day raw-event / long-term aggregate policy in Italian.

Public legal-page text is maintained separately by the project owners. No
privacy-notice patch is kept in this repository, and this change does not
modify `landing/src/pages/privacy.astro`.

## Account settings (implemented)

- Email change requires the current password and confirmation through a single-use link sent to the new address and valid for 24 hours; the previous address is notified. The address changes only when the link is opened, and the confirmation page requires an explicit click so mail scanners cannot consume the token.
- Profile export returns JSON (profile, links, domains and members, API key metadata, daily click aggregates). API key secrets are excluded, and raw click events are not exported because they carry the visitor fingerprint.
- Account deletion removes the profile, links, owned domains, memberships, API keys, sessions and tokens, removes click events and daily aggregates for those links, invalidates sessions immediately, and refuses to proceed while a paid subscription is active. Billing records kept for accounting obligations are anonymized by removing the account and customer references while prices, status and dates remain. The confirmation states what is removed and what is retained in anonymized form.
- The public privacy notice describes these features in Italian; placeholders for the controller's identity, address and contacts remain open.
