# Security Policy

## Supported Versions

Brev is pre-1.0. Security fixes target the current `main` branch until stable
versioned releases exist.

## Reporting a Vulnerability

Please report security issues privately through a
[GitHub security advisory](https://github.com/brevlink/brev/security/advisories/new)
or the maintainer contact listed in the package metadata. Do not publish
exploit details before a fix is available.

Useful reports include:

- affected component and version or commit;
- reproduction steps;
- expected impact;
- whether the issue affects self-hosted Brev, Brev Cloud, or both.

## Scope

Examples of in-scope issues:

- authentication bypass;
- account or link ownership bypass;
- custom-domain takeover;
- token or secret disclosure;
- stored XSS in the dashboard;
- server-side request forgery if metadata fetching is added.

Abuse reports for hosted links should include the short URL and any relevant
destination evidence.
