# Wave 5b Extension Package

Scope: browser-extension slice only. The kbgui root app remains a Vite+ app; `extension/`
is a separate WXT/Svelte package with its own dependency graph and local install.

## Package Layout

Added `extension/`:

- `package.json` / `package-lock.json`: standalone npm package, not a root workspace member.
- `wxt.config.ts`: WXT config for Chrome MV3, Svelte module, real Vite, host permissions, and a
  manifest-generation hook that emits a module background service worker.
- `entrypoints/background.ts`: MV3 service worker for storage, pairing, kbgui API calls, ingest
  idempotency, and retry queueing.
- `entrypoints/monkeytype.content.ts`: Monkeytype content script, Shadow DOM UI mount, result
  observer, and `RUN_CAPTURED` messaging.
- `src/contracts.ts`: re-exports the pure Wave 5a contracts from
  `../src/lib/typing-runs/contracts.ts`.
- `src/monkeytype/selectors.ts`: centralized Monkeytype DOM selectors and parser version.
- `src/monkeytype/capture.ts`: result parsing, two-read stabilization, SPA route observation,
  duplicate suppression, and `MonkeytypeRunCapture` construction.
- `src/kbgui/client.ts`: fixed kbgui endpoint client for `/api/extension/*`; no page-provided URL
  fetch path.
- `src/kbgui/messages.ts`: typed content/background messages and UI state.
- `src/storage.ts`: typed `chrome.storage.local` keys for base URL, install id, device token,
  cached choices, selections, last run draft, and pending uploads.
- `src/ui/Tagger.svelte`: compact Shadow DOM tagger UI.
- `test/fixtures/monkeytype-result.html` and `src/monkeytype/capture.test.ts`: fixture parser tests.

## Tooling Isolation

The extension is intentionally not listed as a root workspace. It has its own `node_modules` and
declares its own real `vite`, `wxt`, `svelte`, `vitest`, and `typescript`. Extension commands are run
from `extension/` with npm:

```sh
cd extension
npm install
npm run build
npm test
```

This avoids the root `package.json` override that aliases `vite` to Vite+ core. The root app still
uses `vp` commands only.

Root isolation changes:

- `.gitignore` now ignores `extension/node_modules`, `extension/.output`, and `extension/.wxt`.
- `vite.config.ts` adds `extension/**` to `fmt.ignorePatterns` and `lint.ignorePatterns`.
- Root tests already include only `src/**/*.test.ts`, so extension Vitest files are outside root test
  scope.
- Root `svelte-check` stayed scoped to the root SvelteKit app and did not report extension files.

## WXT Config

Generated manifest was verified after build:

- name: `kbgui Monkeytype Tagger`
- permissions: `["storage"]`
- host permissions:
  - `https://monkeytype.com/*`
  - `http://localhost:8787/*`
  - `http://127.0.0.1:8787/*`
  - `https://kbgui.example.com/*`
- background: `{ "type": "module", "service_worker": "background.js" }`
- content script: `https://monkeytype.com/*`, `document_idle`

WXT overwrote a direct `manifest.background.type` setting during entrypoint generation, so
`wxt.config.ts` uses `build:manifestGenerated` to set `background.type = "module"` after WXT has
created the service worker entry.

## Monkeytype Capture

Selectors are centralized in `src/monkeytype/selectors.ts`:

- `#result .stats .wpm .bottom`
- `#result .stats .acc .bottom`
- `#result .stats .consistency .bottom`
- `#result .stats .testType .bottom`
- `#result .stats .time .bottom .text`
- `#result .stats .raw .bottom`

Capture behavior:

- Watches `#result` with a `MutationObserver`.
- Hooks SPA route changes through `history.pushState`, `history.replaceState`, `popstate`, and
  `hashchange`.
- Polls a bounded settle window after DOM changes.
- Requires two consecutive equal normalized reads before emitting.
- Suppresses duplicate stable emissions until the result panel resets or the tuple changes.
- Normalizes WPM, raw WPM, accuracy, consistency, test duration, mode/mode2, language, punctuation,
  and numbers where visible in the DOM.
- Emits versioned captures with `source: "monkeytype-extension-dom-v1"` and parser version
  `monkeytype-dom-v1.0.0`.

Fixture tests parse the saved Monkeytype `#result` HTML into a full `MonkeytypeRunCapture`, verify
the centralized selectors, and exercise the two-read duplicate gate.

## Tagger UI And Pairing

`Tagger.svelte` mounts into a WXT Shadow DOM UI via Svelte 5 `mount(Tagger, { target })`.

The panel:

- Shows paired/session/needs-pairing status.
- Loads cached keyboard/layout choices from the background.
- Saves the selected keyboard/layout in `chrome.storage.local`.
- Shows queue count and retry control.
- Shows post-run WPM/accuracy/mode confirmation with the selected keyboard/layout.
- Lets the user set the kbgui base URL, defaulting to `http://127.0.0.1:8787`.
- Lets the user enter a Settings-generated pairing code; the background posts to
  `/api/extension/pair` and stores the returned device token.

Styles are scoped to the Shadow DOM, set an explicit 14px base size, and do not depend on Monkeytype
page fonts or global CSS.

## Background API And Queue

`background.ts` validates runtime message senders against `https://monkeytype.com/*` before handling
content messages.

The background owns all kbgui API calls:

- `POST /api/extension/pair`
- `GET /api/extension/session`
- `GET /api/extension/keyboards`
- `POST /api/extension/runs`

Run posting:

- Reads the current selected keyboard/layout from extension storage.
- Builds the shared-contract `MonkeytypeRunCapture`.
- Computes `idempotencyKeyForCapture(capture)` using the Wave 5a contract function.
- Posts `{ capture, idempotencyKey }` to `/api/extension/runs`.
- Stores failed non-401 uploads in a bounded `chrome.storage.local` queue and retries while the
  service worker is alive.
- Keeps the latest parsed run draft so selection changes can repost the latest run with the updated
  selection.

The API client only constructs known `/api/extension/*` URLs from the configured kbgui origin. It
rejects non-http(s) origins and requires HTTPS for non-local origins.

## Extension Verification

Commands run from `extension/`:

```sh
npm install
npm test
npm run build
```

Results:

- `npm install`: completed; WXT 0.20.27 generated `.wxt` types. The first install attempt exposed a
  real peer mismatch between `@sveltejs/vite-plugin-svelte@7` and Vite 7, so the extension now pins
  `@sveltejs/vite-plugin-svelte@6`, whose peer range supports Vite 7 and Svelte 5.
- `npm test`: 1 test file passed, 3 tests passed.
- `npm run build`: WXT built `chrome-mv3` with real Vite 7.3.6.
  - `.output/chrome-mv3/manifest.json`: 648 B
  - `.output/chrome-mv3/background.js`: 10.8 kB
  - `.output/chrome-mv3/content-scripts/monkeytype.js`: 75.59 kB
  - `.output/chrome-mv3/content-scripts/monkeytype.css`: 3.68 kB

npm reported advisories in the extension dependency tree after install. They were not introduced into
the root app dependency graph because the extension install is isolated.

## Root Verification

Commands run from the repo root:

```sh
vp check
vp run svelte:check
vp build
vp test
vp run capture
```

Results:

- `vp check`: all 182 files formatted; no warnings, lint errors, or type errors in 262 files.
- `vp run svelte:check`: 6026 files, 0 errors, 0 warnings.
- `vp build`: completed successfully with `@sveltejs/adapter-cloudflare:agents`.
- `vp test`: 35 test files passed, 173 tests passed.
- `vp run capture`: 8/8 Playwright visual captures passed.

Post-check sanity:

- No listener remained on `127.0.0.1:4173`.
- No listener remained on `127.0.0.1:8787`.

## Remaining Live Verification

This slice is source/build/test verified. These parts still need a real loaded unpacked extension on
`https://monkeytype.com`:

- Final selector stability against Monkeytype's live DOM.
- Shadow DOM panel placement over the real Monkeytype result screen and responsive viewport behavior.
- Pairing against a running local worker with a real Settings-generated code.
- Device-token run ingest from Chrome extension origin to `http://127.0.0.1:8787`.
- Queue retry behavior across actual MV3 service worker suspension/restart.
- Any future published-extension ID allowlisting or `externally_connectable` flow.
