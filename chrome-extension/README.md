# Brev Chromium extension

Create short links without leaving the page in Chromium-family browsers that support the Chrome 116 extension APIs. The popup prefills the current page URL and title, supports a custom slug and title, lists usable custom domains, and shows the five most recent links. Results include Copy, Open and a QR code loaded only when requested. All API requests use a Bearer API key and omit session cookies.

## Install unpacked

1. Open `chrome://extensions` (or your browser's equivalent extensions page).
2. Enable Developer mode.
3. Choose Load unpacked and select this repository's `chrome-extension/` directory.
4. Pin Brev to the toolbar and open Settings.

There is no build step, dependency installation, bundler, remote code or bundled webfont. `package.json` only marks JavaScript as modules for local Node checks.

## Configure an account

In the Brev dashboard, open Account, then API keys. Create a key and copy the token immediately: it is shown only once. In extension Settings, enter your server base URL (the default is `https://brevl.ink`), paste the key and save. The page verifies it with `/api/v1/auth/me` and shows the account email. The dashboard link follows the server field.

The key is stored unencrypted in `chrome.storage.local` in this browser profile, never in sync storage. Remove key clears the local credential and cached account data; revoke the key in the dashboard to disable it elsewhere. Changing servers requires pasting a key for that server. Custom server origins need an explicit runtime host permission, requested on save. URLs are normalized without a trailing slash; HTTP and HTTPS are supported, including base paths. Credentials, queries and fragments are rejected in server URLs. Old granted origins remain granted until removed through browser extension settings.

Choose a default custom domain for the popup and whether it copies results automatically (on by default). Only verified domains with an active certificate or no Cloudflare certificate status are offered. The deployment default is the first choice. Its label uses the configured server hostname because the API does not expose a deployment default-domain setting; the server's returned `short_url` is always authoritative, including on deployments where those hosts differ. A removed or unusable preferred domain falls back to the deployment default when opening the popup. A different account resets the preference.

## Quick actions

Press **Ctrl+Shift+Y** to create and copy a short link for the current page. Chrome leaves a shortcut unassigned when another extension or the browser already owns it. See and change shortcuts at `chrome://extensions/shortcuts`. The context menu entries are:

- Create a short link with Brev (page).
- Shorten this link with Brev (HTTP or HTTPS link).
- Shorten the selected URL with Brev (selection).

Quick actions always omit `domain_id` and `slug`, using the deployment default and a server-generated slug, and always copy regardless of the popup auto-copy preference. A green `OK` badge lasts three seconds; the toolbar title contains the short URL. A red `!` badge and readable toolbar title explain failure. If copying fails, link creation still reports success and the title directs you to Recent. Clipboard writes are serialized through an offscreen document, created on demand and closed after each write. The hidden document uses `document.execCommand('copy')` because it cannot depend on clipboard focus; clipboard readback from the X selection in a real Chromium session verified that both the popup flow and the quick path copied exactly the created short URL.

Chromium does not provide selected text before a context menu is shown with these permissions. The selection entry therefore appears for all selected text, and accepts only an absolute HTTP or HTTPS URL when clicked. Invalid selections create nothing and report an explanatory toolbar error. Hiding it for other text cannot be implemented with the specified API surface and exact permission list.

Browser-internal pages have no shortenable URL. The popup leaves the URL empty and creation disabled, explains why, and allows you to enter a web URL manually.

## Permissions

- `activeTab`: read the current tab URL and title after opening Brev, invoking its shortcut or choosing its context menu. No persistent browsing access.
- `storage`: local settings, API key, account data, domains and recent links. No sync credential storage.
- `contextMenus`: the three quick actions.
- `clipboardWrite`: copy created and recent short links.
- `offscreen`: clipboard access from the service worker, which has no document or clipboard API.
- Required `https://brevl.ink/*` host access: call the default server API.
- Optional `https://*/*` and `http://*/*` host access: permit requesting only the origin of a custom server entered in Settings. These declarations do not grant access to every site.

No `tabs`, `scripting`, `notifications`, `cookies` or `<all_urls>` permission is requested. Requests omit cookies, refuse redirects and time out after 15 seconds. No destination page is fetched or modified.

## Implementation choices

`api.js` is a pure module with no top-level browser API access and imports in bare Node. It centralizes fetch, validation and HTTP error mapping. JSON `detail` strings are preserved; validation detail arrays are joined by their `msg` fields as in the CLI. Authentication and connection failures offer Settings, and verification failures link to the dashboard. The popup renders readable errors without alerts, including recent/domain refresh and QR errors. A QR failure hides the toggle and leaves the short link available. SVGs are loaded into an image as a data URL, never injected into the document.

Storage has `settings` and `cache` objects. Settings include `baseUrl`, `apiKey`, `defaultDomain`, `autoCopy` and a random `revision`; changing settings invalidates the cache. Cache entries hold `data` and an `at` timestamp. Account and domains have a five-minute lifetime. Recent links and their server summary refresh on popup/settings load and after creation. The service worker refreshes all three independently, serializes refresh batches and ignores responses for an older settings revision. Cached data renders immediately; network work never gates rendering the popup form. Cache errors leave stale display data available except on authentication failure. The popup guards against pre-creation recent refreshes replacing a newer list.

The popup is 360 px wide, with native labeled controls, visible focus outlines, status and alert regions, and palette tokens throughout. No new literal color is needed. Badge colors are read from the generated palette at runtime. System font fallbacks are used without loading brand fonts.

## Generated assets and checks

Run from the repository root:

```sh
node chrome-extension/scripts/sync-palette.mjs
node chrome-extension/scripts/sync-palette.mjs --check
bash chrome-extension/scripts/build-icons.sh
bash chrome-extension/scripts/build-icons.sh --check
node chrome-extension/scripts/validate.mjs
python3 chrome-extension/scripts/package.py --list
python3 chrome-extension/scripts/package.py --out dist
python3 chrome-extension/scripts/package.py --verify dist/brev-extension-*.zip
find chrome-extension -name '*.js' -exec node --check {} \;
node --input-type=module -e "import('./chrome-extension/api.js').then(() => console.log('api.js import passed.'))"
```

The palette script rewrites the single `@theme` block from `design/palette.css` into `:root`. Do not edit generated `palette.css` by hand. Its check mode writes nothing.

The icon script requires ImageMagick `magick` and Node on PATH. It composites the existing `landing/public/brev_icona.webp` mark over a rounded square using the palette surface color, with smaller margins at 16/32 px. It shaves 24 px of the transparent outer border before trimming to exclude the source asset's isolated lower-right corner artifact; the mark itself and its original colors, including its blue arrow, are preserved. Check mode generates in a temporary directory and compares PNG bytes, then cleans up. Use the same ImageMagick version for byte-identical regeneration across machines.

The deterministic validator uses Node's standard library without network access. It checks manifest paths and permissions, local HTML references, inline scripts and handlers, forbidden JavaScript calls and remote HTTP URL literals (only `DEFAULT_SERVER` is allowed), JavaScript syntax, palette synchronization and square PNG headers/dimensions. It reports all detected problems. Its source scans are conservative static checks, not a general JavaScript security parser. Icon byte regeneration is checked separately by the icon script.

## Packaging and releases

`python3 chrome-extension/scripts/package.py --out dist` writes `dist/brev-extension-<version>.zip`, the archive a release attaches: only the files the browser loads, `manifest.json` first, sorted entries and fixed timestamps, so the same revision always produces the same bytes. `--verify <zip>` checks an existing archive (entry set, manifest version, the icons and the popup the manifest names, no development files) and `--list` prints the packaged files. A new runtime file has to be added to the script's list: an unclassified entry in this directory makes packaging fail, instead of shipping something unintended or dropping it silently.

Pushing a tag `extension-v<version>` runs `.github/workflows/release-extension.yml`: it refuses a tag that does not match the manifest version, runs the static validator, builds and verifies the archive, and attaches it to a GitHub release. `README.md`, `package.json` and `scripts/` are development files and are not part of the archive.

## Not supported yet

- Firefox: its Manifest V3 background uses an event page rather than a service worker, and it has no `chrome.offscreen`.
- Store publication: the archive is what a store upload expects, but no listing, developer account or upload step exists.

Browser behavior is not exercised inside the implementation sandbox. A real Chromium session verified loading without manifest errors, settings persistence, the active-tab URL and title prefill, link creation on the deployment default and on a custom domain, clipboard contents read back from the X selection, the badge and toolbar title after a quick action, QR rendering, and the error paths for a taken slug and a rejected key. Still unverified: the runtime origin grant for a custom server (the harness pre-grants that origin), the native context-menu click (the handler was invoked directly instead), and any browser other than Chromium.
