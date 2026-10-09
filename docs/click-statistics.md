# Click statistics

Brev records clicks on short-link redirects, excluding recognized bots and
prefetch requests. Raw event records contain the link, UTC day and first
occurrence timestamp, hit count, country from `CF-IPCountry` when available,
referrer hostname, device category (`desktop`, `mobile`, `tablet`, `other`),
and a visitor fingerprint when it can be calculated.

## Data minimization

Raw IP addresses and raw user agents are never stored in click records. They
are used in memory to calculate a HMAC-SHA256 fingerprint truncated to 32 hex
characters (128 bits). Its daily salt is derived from the server secret and
UTC date; neither the salt nor the source IP/user agent is stored. The daily
salt makes fingerprints change across days. The referrer contains only the
host, without a path, query, credentials, fragment or port.

Repeated visits with the same fingerprint on the same link and UTC day
increase the event's hit count. Country, referrer and device describe that
visitor's first visit that day. Visits without a calculable fingerprint count
separately. Visitor totals sum daily distinct visitors per link; they do not
deduplicate people across days or links.

## Retention and operator maintenance

Raw events have a default retention of **90 days**, configurable through
`CLICK_EVENT_RETENTION_DAYS` (a positive integer). Daily click and visitor
aggregates **do not expire automatically** and survive raw-event pruning.
Country, referrer and device breakdowns depend on the remaining raw events.
Deleting a link deletes both its raw events and daily aggregates.

From the backend container's working directory (`/app`), run:

```sh
python -m scripts.prune_click_events
```

The command uses the backend's environment configuration, including
`DATABASE_URL`, `JWT_SECRET` and `CLICK_EVENT_RETENTION_DAYS`. It commits the
deletion, prints the number of removed events, and exits with code 0 on success
(including when there is nothing to prune). Failures are logged to stderr and
produce a nonzero exit code.

**The operator must schedule this command in cron**, for example once a day,
by executing it inside the backend container. The web process does not run
pruning and no scheduler is installed by this change. Without an operator cron,
the retention window is not enforced. Backup and infrastructure-log retention
must be managed separately.
