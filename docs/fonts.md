# Self-hosted fonts

Both apps ship the same WOFF2 files under `src/assets/fonts/`. Font requests
stay on the application's origin; no font service, CDN, npm dependency, or
locally installed font is needed at runtime.

`dashboard/src/index.css` and `landing/src/styles/global.css` declare the
families as `Inter` and `Instrument Serif`, with `font-display: swap` and the
original fallback stacks unchanged. The `unicode-range` declarations come
from Fontsource's subset CSS, so browsers request only the needed subsets.
Inter is normal style with a variable `wght` axis from 100 through 900,
covering the existing 400, 600, 700, 800 and 900 weights. Instrument Serif
provides regular and italic at weight 400. Only latin and latin-ext are
included. The existing page text and visual tokens are unchanged.

## Provenance and licenses

Downloaded on 2026-10-08 from these pinned Fontsource archives, without
installing either package into the applications:

- [@fontsource-variable/inter 5.3.0 archive](https://registry.npmjs.org/@fontsource-variable/inter/-/inter-5.3.0.tgz)
- [@fontsource/instrument-serif 5.3.0 archive](https://registry.npmjs.org/@fontsource/instrument-serif/-/instrument-serif-5.3.0.tgz)

Both archives were checked against the npm registry's SHA-512 `dist.integrity`.
The WOFF2 files and complete license texts were copied unchanged from each
archive's `package/files/` and `package/LICENSE`. The subset ranges were copied
from Inter's `wght.css` and Instrument Serif's `400.css` and `400-italic.css`.
Our CSS uses the existing family name `Inter` instead of Fontsource's CSS alias
`Inter Variable`; the font binaries were not renamed internally or modified.

| Family | Internal font version, read from the WOFF2 name table | Fontsource source revision | Upstream | License |
| --- | --- | --- | --- | --- |
| Inter | `4.001;git-66647c0bb` | `v20`, metadata last modified 2025-09-10 | [Inter project](https://github.com/rsms/inter), distributed through [Google Fonts sources](https://github.com/google/fonts/tree/main/ofl/inter) and [Fontsource](https://fontsource.org/fonts/inter) | SIL Open Font License 1.1 |
| Instrument Serif | `1.000; ttfautohint (v1.8.4.7-5d5b);gftools[0.9.27]` | `v5`, metadata last modified 2025-09-05 | [Instrument Serif project](https://github.com/Instrument/instrument-serif), distributed through [Google Fonts sources](https://github.com/google/fonts/tree/main/ofl/instrumentserif) and [Fontsource](https://fontsource.org/fonts/instrument-serif) | SIL Open Font License 1.1 |

Copyright: Inter Project Authors (2016) and Instrument Serif Project Authors
(2022), respectively. Complete OFL 1.1 texts including attribution are next to
the files in each app:

- [Dashboard Inter license](../dashboard/src/assets/fonts/inter/OFL.txt)
- [Landing Inter license](../landing/src/assets/fonts/inter/OFL.txt)
- [Dashboard Instrument Serif license](../dashboard/src/assets/fonts/instrument-serif/OFL.txt)
- [Landing Instrument Serif license](../landing/src/assets/fonts/instrument-serif/OFL.txt)

## File sizes

Sizes apply to each identical app copy. KB means 1,000 bytes; these are the
actual WOFF2 sizes on disk, before any HTTP transfer encoding.

| Path below `src/assets/fonts/` | Bytes | KB |
| --- | ---: | ---: |
| `inter/inter-latin-wght-normal.woff2` | 48,256 | 48.256 |
| `inter/inter-latin-ext-wght-normal.woff2` | 85,068 | 85.068 |
| `instrument-serif/instrument-serif-latin-400-normal.woff2` | 21,032 | 21.032 |
| `instrument-serif/instrument-serif-latin-ext-400-normal.woff2` | 11,604 | 11.604 |
| `instrument-serif/instrument-serif-latin-400-italic.woff2` | 22,128 | 22.128 |
| `instrument-serif/instrument-serif-latin-ext-400-italic.woff2` | 12,384 | 12.384 |
| **Total per app** | **200,472** | **200.472** |

The two Inter binaries were inspected with FontTools: each has exactly one
variable axis, `wght`, with minimum 100 and maximum 900. All six pairs of files
were compared byte for byte between the applications.

## Verified build URLs

The font URLs are relative to the source CSS so Vite/Astro resolve, hash and
emit the assets. No absolute source URL assumes that both apps share a base.
The following URLs were extracted from the actual built CSS on 2026-10-08,
and every corresponding file was confirmed to exist. Hashes may change with
future asset or build changes.

Dashboard CSS: `dashboard/dist/assets/index-xGPUaF0q.css`.
The `/app/` base is removed to map the public URL to `dashboard/dist/`.
The existing `handle_path /app/*` in the repository's Caddyfile also removes
this prefix before forwarding requests to dashboard nginx; nginx's document
root contains the contents of `dashboard/dist/`.

| URL in built dashboard CSS | File satisfying the URL |
| --- | --- |
| `/app/assets/inter-latin-wght-normal-Dx4kXJAl.woff2` | `dashboard/dist/assets/inter-latin-wght-normal-Dx4kXJAl.woff2` |
| `/app/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2` | `dashboard/dist/assets/inter-latin-ext-wght-normal-DO1Apj_S.woff2` |
| `/app/assets/instrument-serif-latin-400-normal-DnYpCC2O.woff2` | `dashboard/dist/assets/instrument-serif-latin-400-normal-DnYpCC2O.woff2` |
| `/app/assets/instrument-serif-latin-ext-400-normal-C2je3j2s.woff2` | `dashboard/dist/assets/instrument-serif-latin-ext-400-normal-C2je3j2s.woff2` |
| `/app/assets/instrument-serif-latin-400-italic-DKMiL14s.woff2` | `dashboard/dist/assets/instrument-serif-latin-400-italic-DKMiL14s.woff2` |
| `/app/assets/instrument-serif-latin-ext-400-italic-C9HzH3YL.woff2` | `dashboard/dist/assets/instrument-serif-latin-ext-400-italic-C9HzH3YL.woff2` |

Landing CSS: `landing/dist/_astro/global.LoEpXFty.css`.
The landing has base `/`, so its public URLs map directly to `landing/dist/`.

| URL in built landing CSS | File satisfying the URL |
| --- | --- |
| `/_astro/inter-latin-wght-normal.Dx4kXJAl.woff2` | `landing/dist/_astro/inter-latin-wght-normal.Dx4kXJAl.woff2` |
| `/_astro/inter-latin-ext-wght-normal.DO1Apj_S.woff2` | `landing/dist/_astro/inter-latin-ext-wght-normal.DO1Apj_S.woff2` |
| `/_astro/instrument-serif-latin-400-normal.DnYpCC2O.woff2` | `landing/dist/_astro/instrument-serif-latin-400-normal.DnYpCC2O.woff2` |
| `/_astro/instrument-serif-latin-ext-400-normal.C2je3j2s.woff2` | `landing/dist/_astro/instrument-serif-latin-ext-400-normal.C2je3j2s.woff2` |
| `/_astro/instrument-serif-latin-400-italic.DKMiL14s.woff2` | `landing/dist/_astro/instrument-serif-latin-400-italic.DKMiL14s.woff2` |
| `/_astro/instrument-serif-latin-ext-400-italic.C9HzH3YL.woff2` | `landing/dist/_astro/instrument-serif-latin-ext-400-italic.C9HzH3YL.woff2` |

## nginx and checks

Both applications' builds were mounted read-only at `/usr/share/nginx/html`
in temporary, real nginx containers with their existing `nginx.conf` mounted
at `/etc/nginx/conf.d/default.conf`. Both image tags referenced by the
repository's Dockerfiles were tested:

| Image | Observed nginx version | Dashboard | Landing |
| --- | --- | --- | --- |
| `nginx:stable-alpine` | 1.30.5 | 6/6 fonts: HTTP 200, `Content-Type: font/woff2` | 6/6 fonts: HTTP 200, `Content-Type: font/woff2` |
| `nginx:1.27-alpine` | 1.27.5 | 6/6 fonts: HTTP 200, `Content-Type: font/woff2` | 6/6 fonts: HTTP 200, `Content-Type: font/woff2` |

Requests used the URLs from the built CSS, with `/app/` stripped for the
direct dashboard nginx test as described above. Every response body matched
its built WOFF2 byte for byte, so a successful SPA fallback response could
not hide a missing asset. Both images already include the WOFF2 MIME type;
no additional `types` block or nginx configuration change is needed.

Checks, from the repository root:

```sh
(cd dashboard && npm run build && npm run lint)
(cd landing && npm run build)
node landing/scripts/check-legal-pages.mjs
```

All passed. The legal check also passes from `landing/`; it locates that app
relative to the script rather than depending on the current directory.
It verifies that `landing/src/**` and `dashboard/index.html` contain no
Google Fonts service or asset references.

No public deployment or visual browser rendering was tested. The HTTP test
used local nginx containers, without starting the production Caddy/backend
stack. Temporary containers were stopped after verification.
