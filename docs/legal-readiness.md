# Legal readiness

## Current status

The five public legal pages are complete in English and are no longer drafts.
Brev Cloud is live at https://brevl.ink and is currently free of charge.
There are no active paid plans or payment flows. Email verification is required
for links, domains and API keys. Custom domains are available at no extra cost.

The public documents use version 1.0, last updated 12 October 2026. These values
are defined once in `landing/src/components/LegalLayout.astro`. Changes update
the version and date; material changes to the terms are published on the website
and communicated to registered users.

## Decisions made

- The controller and operator is Matteo Genovese, an individual based in Italy.
  No home address is published. No data protection officer has been appointed.
- Privacy requests use privacy@brevl.ink. Abuse reports use abuse@brevl.ink and
  /app/report. Security reports use GitHub Security Advisories.
- English is the sole language of the public legal documents.
- Raw click events are retained for 90 days. Self-hosted operators can configure
  `CLICK_EVENT_RETENTION_DAYS`. Daily aggregates have no automatic expiry.
  Deleting a link or account removes its related events and aggregates.
  Raw IP addresses and user agents are used only in memory. Daily truncated
  HMAC-SHA256 fingerprints cannot be linked across days. Referrers retain only
  the hostname. Country comes from Cloudflare's `CF-IPCountry` header.
- `brev_session` is the only cookie. It is necessary, first-party, HttpOnly,
  SameSite=Lax and Secure in production. There are no non-essential cookies
  or consent-based processing today, so no cookie consent banner is used.
  The dashboard uses neither localStorage nor sessionStorage.
- Performance of a contract, Article 6(1)(b) GDPR, covers account, link, domain,
  API key and redirect management and related service emails. Legitimate
  interests, Article 6(1)(f), cover security, abuse prevention, rate limiting
  and aggregate click measurement. Legal obligations, Article 6(1)(c), will
  cover accounting and tax duties if payments are enabled.
- Cloudflare, Inc. provides CDN, DNS, TLS termination, WAF and Cloudflare for
  SaaS. It sees visitor IP addresses. Its US transfers are addressed by the
  standard contractual clauses included in its customer DPA.
- IONOS SE hosts the application and database in Germany, within the EU.
- Contabo GmbH hosts the transactional mail server mail.novezero.it in Germany,
  within the EU, for verification, password resets, email changes and domain
  invitations.
- Plausible is self-hosted on the controller's infrastructure at novezero.it.
  It is not a third party or subprocessor. It measures the landing and legal
  pages only, without cookies, profiling, personal-data retention or analytics
  transfers to third parties. IP addresses derive country and are not retained.
  No website analytics is added to the authenticated dashboard.
- GitHub hosts the public repository and security reports, without processing
  service users' data. Stripe is not enabled and no payment data is processed.
- Accounts can be exported as JSON, email addresses can be changed using the
  current password and a single-use confirmation link valid for 24 hours, and
  accounts can be deleted immediately from the account panel. Domain invitations
  last 14 days. Other token lifetimes are described by technical expiry without
  inventing a fixed period.
- Account and service data are kept for the life of the account. Sessions end
  at logout, expiry or revocation. Support messages are kept as needed to handle
  requests and retain a record. Provider log periods and backup rotation periods
  are not invented in the public documents.
- Self-hosted operators are independent controllers for their installations.
  They maintain their own notices, provider lists and operational policies.
  The software remains MIT licensed; brand use follows `TRADEMARK.md`.

## Open actions

- Obtain review by a legal professional before enabling any payment service.
- Formally accept Cloudflare's DPA and verify the DPAs for IONOS and Contabo.
- Confirm actual backup retention and rotation where backups are active.
- Verify that privacy@brevl.ink and abuse@brevl.ink exist and receive mail before
  publication.
- Confirm Cloudflare, IONOS and Contabo log retention policies.
- Define payment terms if and when payments are enabled, including price,
  currency, taxes, charge timing, receipts and refund policy before any charge.

## Information handling

Do not write secrets, private addresses or third-party personal data in this
internal document or the public pages.
