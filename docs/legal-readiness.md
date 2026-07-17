# Legal readiness checklist

The legal pages in `landing/src/pages/` are a draft base for the public Brev
site. They are not legal advice and do not state that Brev is GDPR compliant.
They must be completed and reviewed by a qualified legal professional before
any Brev Cloud launch or payment flow.

## Separate operating contexts

- **Public site:** the current Astro landing page is static and does not add
  analytics, advertising, or a public data-collection form. Hosting/deployment
  logs still need to be checked with the selected provider.
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
- retention and deletion schedule for accounts, links/domains, click counters,
  sessions/tokens, security/support logs and billing records;
- data-subject request workflow, identity checks, breach response and update
  notice for new subprocessors;
- whether and when Stripe Checkout, transactional email, analytics or other
  non-essential services are enabled in production.

The current backend uses a browser session cookie named `brev_session`,
password hashes, account fields, links/domains, API keys, sessions and
single-use auth-token records. It persists a click counter for redirects. It
does not currently configure Stripe or a transactional email provider by
default; detailed request/security-log retention is not defined by this
repository and must not be invented in the public notice.

The MIT license in `LICENSE` is unchanged. Brand use remains subject to
`TRADEMARK.md`.
