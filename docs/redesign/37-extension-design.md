# Wave 5 Extension Design

Design date: 2026-07-04  
Scope: design and research only. No source/config changes are included here.

> **DECISIONS (architect, no further sign-off):** adopt all 8 recommendations — WXT (not CRXJS); pairing/device-token auth first (session-cookie later); in-repo `extension/` workspace package + a pure `src/lib/typing-runs/contracts.ts`; DOM-scrape Monkeytype with graceful failure + server-side correlation; new `TypingRunsAgent` (Drizzle/DO SQLite, mirror CommunityAgent). **Build order: (5a) kbgui ingest backend** (`TypingRunsAgent` + `/api/extension/{pair,keyboards,runs}` + Settings pairing UI + contracts + tests — dev:worker-verifiable) **then (5b) the `extension/` WXT+Svelte5 package** (Shadow-DOM tagger + DOM capture + pairing + post; carries the WXT-under-Vite+ tooling risk).

Wave 5 adds a browser extension that watches Monkeytype result screens, tags each completed run with the keyboard and layout the user was using, and posts the tagged run back to kbgui. The server-side Monkeytype ApeKey integration from Wave 3 remains the history/backfill source; the extension adds the missing keyboard/layout context at the time of the run.

## Recommendation Summary

- **Tooling:** use WXT for the extension package. WXT has documented Svelte content-script UI support using Svelte's `mount`, built-in Shadow DOM UI helpers, MV3 background/content entrypoint conventions, browser targeting, zipping, messaging/storage wrappers, and Vite integration. CRXJS is a viable Vite plugin, but it leaves more extension structure, Shadow DOM UI, packaging, and cross-browser convention work to this repo.
- **Auth:** build the first slice with a pairing/device token. Add existing better-auth session-cookie requests as a later convenience path. Chrome can send site cookies from extension requests with host permissions, but pairing is more robust across dev, third-party-cookie settings, unpublished extension IDs, and support workflows.
- **Repo layout:** add an in-repo `extension/` workspace package later. Keep the SvelteKit app at the root and add a minimal shared contracts module/package so the extension can import pure TypeScript DTOs without importing app-only SvelteKit/SQLocal code.
- **Monkeytype coupling:** accept DOM scraping for the bounded first slice, but treat it as best-effort and versioned. Monkeytype does not expose an official page event API for extensions. Use resilient selectors, duplicate suppression, graceful failure, and server-side correlation with ApeKey-synced results.

## Existing kbgui Context

- Monkeytype is already integrated server-side through a custom better-auth plugin in `AuthAgent`. The plugin stores an encrypted ApeKey, username, selected mode/mode2, a summary JSON, sync timestamps, and rate-limit metadata. Its endpoints live under `/api/auth/monkeytype/*`.
- `AuthAgent` owns better-auth and the Monkeytype plugin; `CommunityAgent` is the closest existing pattern for a user-facing Durable Object Agent with Drizzle over DO SQLite, RPC methods, and SvelteKit service/remote wrappers.
- `src/hooks.server.ts` resolves better-auth session state through the singleton `AuthAgent`.
- Keyboard profiles currently live mostly in the local SQLocal store (`src/lib/keyboard/local-store.ts`) and use `DeviceProfile` / catalog identity types from `src/lib/keyboard/schema.ts`. The extension cannot read kbgui's SQLocal database from `monkeytype.com`; Wave 5 needs an account-visible keyboard/layout list API, or an explicit export/sync path, before the extension can populate the picker from real user data.

## Research Notes

WXT is the better fit for this repo because it already documents a Svelte content-script UI mounted with `mount(Component, { target })`, and its Shadow DOM helper path is specifically designed for isolated content-script UI styling. Its docs also call out Vite configuration through `wxt.config.ts`, while warning that WXT orchestrates Vite internally and plugins should be tested in that context. The comparison table on WXT's site lists MV2/MV3 support, all-browser output, entrypoint discovery, UI HMR, zip creation, storage/messaging wrappers, and content-script UI support as built-in capabilities.

CRXJS is still a credible fallback. It provides a Vite plugin, ESM content scripts, HMR, automatic `web_accessible_resources` for imported assets, and recommends keeping most logic in an isolated content script with a small main-world IIFE only when timing-sensitive page hooks are needed. For this project, that lower-level model is less attractive than WXT because Wave 5 needs content UI, background messaging, packaging, storage, and later cross-browser work.

Chrome MV3 constraints shape the architecture:

- Content scripts run in isolated worlds and can only access a limited set of extension APIs directly. They communicate with the service worker through runtime messaging.
- Cross-origin requests from content scripts are subject to the page's origin/CORS behavior. For kbgui API calls, the extension background service worker should own network requests.
- Extension service workers are declared in the MV3 manifest background section and can be ES modules, but remote code is not allowed.
- `chrome.storage` is available to content scripts and service workers, persists independently of page cache/history, and `storage.local` currently has a 10 MB quota.
- `externally_connectable` is only needed if the kbgui web app should talk directly to the installed extension, for example to complete pairing from Settings without copy/paste.

Relevant sources are collected at the end of this document.

## 1. Extension Architecture

### Package Layout

The repo is currently a single package. Wave 5 should turn it into a workspace without moving the root SvelteKit app:

```text
kbgui/
  package.json                 # later: add workspaces
  src/                         # existing app
  docs/
  extension/
    package.json
    wxt.config.ts
    entrypoints/
      background.ts
      monkeytype.content.ts
    src/
      ui/
        Tagger.svelte
      monkeytype/
        capture.ts
        selectors.ts
      kbgui/
        client.ts
        messages.ts
      storage.ts
      contracts.ts
```

Workspace change needed later:

- Add `workspaces: ["extension"]` to the root package manifest, preserving the root app package.
- Keep app commands under the project convention (`vp install`, `vp check`, `vp build`). If extension tasks are exposed from the root later, define explicit Vite+ tasks such as `vp run extension:dev` and `vp run extension:build` that delegate to WXT.
- Keep the root SvelteKit `vite.config.ts` separate from `extension/wxt.config.ts`. WXT uses Vite internally; the root project aliases `vite` to Vite+ core, so the first implementation slice should include a short tooling spike to verify WXT works under this workspace resolution. If needed, isolate the extension dependency graph so WXT receives the Vite-compatible version it expects.

Shared types should be pure TypeScript contracts. Do not import `$lib` SvelteKit modules, SQLocal code, Effect runtime helpers, or server-only files into the extension. A good later shape is either:

- `src/lib/typing-runs/contracts.ts` with only serializable DTOs and no app-only imports, imported by both app and extension; or
- `packages/kbgui-contracts` if the shared surface grows beyond a few DTOs.

The extension should share identity shapes, not the full editor model. Suggested contracts:

```ts
type KeyboardChoice = {
  keyboardId: string;
  displayName: string;
  profileId?: string;
  forkId?: string;
  catalogId?: string;
  vendorId?: number;
  productId?: number;
  boardName?: string;
};

type LayoutChoice = {
  layoutId: string;
  displayName: string;
  variantId?: string;
  layerNames?: string[];
  layoutHash?: string;
};
```

### MV3 Manifest Shape

WXT will generate the final manifest from config and entrypoints, but the intended MV3 shape is:

```json
{
  "manifest_version": 3,
  "name": "kbgui Monkeytype Tagger",
  "permissions": ["storage"],
  "host_permissions": [
    "https://monkeytype.com/*",
    "https://kbgui.example.com/*",
    "http://localhost:8787/*",
    "http://127.0.0.1:8787/*"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["https://monkeytype.com/*"],
      "js": ["monkeytype.content.js"],
      "run_at": "document_idle"
    }
  ]
}
```

Notes:

- `host_permissions` for Monkeytype allow content-script injection. Host permissions for the kbgui origin allow the background service worker to call the kbgui API.
- Prefer background-owned kbgui API requests. The content script should never fetch arbitrary URLs or accept a page-provided URL to fetch.
- Add `externally_connectable` only when Settings needs to message the installed extension directly. If used, restrict `matches` to the exact kbgui production/dev origins and pin the extension ID once it is published or otherwise stable.
- The extension should not request broad permissions such as `tabs` unless a later slice needs them. The background can validate message senders through the sender URL without broad tab access in the normal content-script messaging flow.

### Content Script

The Monkeytype content script owns page observation and UI mounting:

1. Create a fixed host element on `monkeytype.com`.
2. Attach a ShadowRoot, preferably through WXT's `createShadowRootUi`.
3. Mount the Svelte 5 UI with `mount(Tagger, { target: container })`.
4. Observe the result screen and send typed `RUN_CAPTURED` messages to the background.
5. Receive keyboard/layout lists, auth status, and post status from the background.

The content script should be split into small modules:

- `capture.ts`: DOM observation, parsing, duplicate suppression.
- `selectors.ts`: all Monkeytype selectors in one versioned place.
- `Tagger.svelte`: user controls and status.
- `messages.ts`: typed runtime messages.

Shadow DOM is required because Monkeytype owns the page CSS and DOM. WXT's docs note that Shadow DOM is useful for content-script CSS isolation and also warn that `rem` units can still be influenced by the page root font size. The tagger should set its own base font size and use `px`/local CSS variables for fixed UI elements.

### Background Service Worker

The MV3 background service worker owns durable extension behavior:

- kbgui API requests.
- Pairing-token exchange and device-token storage.
- Optional session-cookie auth probes.
- Keyboard/layout list caching.
- Pending run queue flush/retry.
- Message validation from the content script.

The background should accept run-capture messages only from `https://monkeytype.com/*` senders. It should also compute or verify an idempotency key before posting:

```text
idempotencyKey =
  sha256(user/install scope + capturedAt bucket + mode + mode2 + wpm + acc + consistency + keyboardId + layoutId)
```

The exact hash is not important; the important property is duplicate suppression when Monkeytype rerenders the result screen, the content script restarts, or a network retry occurs.

## 2. Monkeytype Run Capture

### What Monkeytype Exposes

Monkeytype's public API documents result objects with fields such as `_id`, `wpm`, `rawWpm`, `acc`, `mode`, `mode2`, `timestamp`, `testDuration`, and `consistency`. The frontend source also shows that a completed event contains `wpm`, `rawWpm`, `acc`, `mode`, `mode2`, `timestamp: Date.now()`, `testDuration`, `consistency`, `keyConsistency`, language, difficulty, tags, and more.

The page result UI is not an official extension API. Current Monkeytype source renders a `#result` screen with stat groups including `wpm`, `acc`, `testType`, `raw`, `consistency`, and `time`. The result-update code writes values into selectors such as:

```text
#result .stats .wpm .bottom
#result .stats .raw .bottom
#result .stats .acc .bottom
#result .stats .consistency .bottom
#result .stats .testType .bottom
#result .stats .time .bottom .text
```

This is enough for a first extension slice, but it is DOM coupling. It can break whenever Monkeytype changes class names, layout, or result rendering.

### Detection Strategy

Use a two-stage detector:

1. **Result visibility detection**
   - Start a `MutationObserver` after `document_idle`.
   - Watch for `#result` being inserted or becoming visible.
   - Also listen for route/history changes because Monkeytype is a SPA.

2. **Stable stat extraction**
   - Once `#result` is visible, poll for a short bounded window, for example 2 seconds.
   - Require parseable `wpm`, `acc`, `mode/mode2` or `testType`, and one of `consistency`/`testDuration`.
   - Consider the result stable only after two consecutive reads match.
   - Suppress duplicates until the result panel hides or the parsed tuple changes.

The extension should not mutate Monkeytype state, simulate input, or depend on console logs. It should read the page after the run is complete.

### Captured Data

Post a normalized, versioned capture:

```ts
type MonkeytypeRunCapture = {
  source: "monkeytype-extension-dom-v1";
  capturedAt: string;          // extension observation time, ISO
  monkeytypeResultId?: string; // nullable; usually unavailable from DOM-first capture
  monkeytypeTimestamp?: number;// nullable; real Monkeytype timestamp if later observed

  wpm: number;
  rawWpm?: number;
  acc: number;
  consistency?: number;
  testDuration?: number;
  mode?: string;
  mode2?: string;
  testTypeText?: string;
  language?: string;
  difficulty?: string;
  punctuation?: boolean;
  numbers?: boolean;

  keyboard: KeyboardChoice;
  layout: LayoutChoice;
  extension: {
    installId: string;
    version: string;
    parserVersion: string;
  };
};
```

`capturedAt` is not the same as Monkeytype's internal `timestamp`. In the DOM-only first slice, it is the best available timestamp and should be used as an approximate correlation hint. A later main-world bridge or Monkeytype save-response observer may fill `monkeytypeResultId` and/or the real `timestamp`, but that should be a later slice because it is more invasive.

### Correlation With ApeKey Sync

Correlation should happen server-side:

1. If `monkeytypeResultId` is present, match directly to the ApeKey-synced result `_id`.
2. Otherwise match by:
   - same kbgui `userId`;
   - close timestamp, using `capturedAt` and the ApeKey result `timestamp`;
   - equal or near-equal `wpm`, `acc`, `consistency`;
   - same `mode`, `mode2`, and `testDuration` when available.
3. If there are multiple plausible matches, mark the tag `ambiguous` instead of guessing.
4. If no match is available yet, keep the tag `pending` and retry after the next Monkeytype refresh.

Suggested initial timestamp window: +/- 30 seconds for DOM-only captures, narrowed later if a real Monkeytype timestamp is observed. The server should store the raw capture JSON so parser bugs can be debugged without losing the user's tag.

### Failure Handling

The extension should degrade quietly:

- If mandatory fields cannot be read, do not post a partial run. Show a small "run not captured" state in the tagger.
- Queue captures in `chrome.storage.local` when offline or when kbgui rejects due to temporary auth/network failure.
- Use idempotency keys so queued retries cannot double-count a run.
- Record parser version in every post.
- Keep selectors centralized and covered by fixture tests using saved Monkeytype result HTML.
- Provide a kbgui-side "unmatched" state rather than hiding captures that have not correlated with ApeKey history yet.

## 3. Tagger UI

The tagger is a compact Shadow DOM Svelte UI on `monkeytype.com`.

Default state:

- Fixed near the lower-right or upper-right edge, outside Monkeytype's typing area.
- Shows current keyboard and layout.
- Provides a quick selector for keyboard and layout.
- Shows connection status: paired, signed in, offline, pending upload, or needs pairing.

After a completed run:

- The panel expands or raises a toast-like confirmation.
- It displays the parsed summary: WPM, accuracy, mode/mode2, and selected keyboard/layout.
- If the selected keyboard/layout is unchanged, auto-post immediately and show status.
- If the user changes the selection after the run, post an update using the same idempotency key and capture id.

Keyboard/layout choices should come from kbgui:

- `GET /api/extension/keyboards` returns the account-visible choices.
- The background caches the list in `chrome.storage.local`.
- The content UI receives the list through background messaging.
- The last selected keyboard/layout is stored locally and reused for future Monkeytype runs.

Important design gap: existing keyboard profiles are local-first in SQLocal. The first implementation must either add account-backed keyboard/layout metadata or provide a Settings-managed list specifically for extension tagging. The extension cannot reliably discover the user's kbgui local profiles from `monkeytype.com`.

Shadow DOM styling requirements:

- Scope all styles inside the shadow root.
- Set an explicit base font size and color variables.
- Avoid global page selectors.
- Keep the host small and fixed-size so Monkeytype layout changes do not shift the tagger.
- Do not use page fonts as an assumption; inherit nothing important from Monkeytype.

## 4. Auth Model

### Recommended Path

Implement pairing/device-token auth first. Add session-cookie auth second as a convenience.

Session-cookie auth can work technically: Chrome documents that extension requests to third-party origins with host permissions are treated as same-site for cookie purposes, so even `SameSite=Strict` cookies can be sent in extension network requests. A background `fetch(kbguiUrl, { credentials: "include" })` can therefore authorize against the existing better-auth session when the user is signed into kbgui in the same browser profile.

It is still not the best first slice:

- It depends on the user already being signed into kbgui.
- It is harder to test in local/unpublished extension flows.
- Browser cookie settings and third-party-cookie changes can still produce edge cases.
- Cross-origin credential behavior is easy to get wrong if any request accidentally moves into the content script/page context.
- Support is clearer when kbgui Settings can show and revoke a named extension device.

The durable model should be:

- **Primary for slice 1:** explicit pairing token exchanged for a scoped device token.
- **Later convenience:** try existing better-auth session from the extension background and auto-link if present.

### Pairing Flow

1. User opens kbgui Settings while signed in.
2. User clicks "Create extension pairing token".
3. kbgui creates a short-lived one-time pairing token, stores only its hash, binds it to `userId`, and expires it after about 10 minutes.
4. User enters the code in the extension, or later the Settings page sends it to the extension through `externally_connectable`.
5. Extension background calls `POST /api/extension/pair` with the code and extension install metadata.
6. Server consumes the pairing token and returns a long-lived random device token once.
7. Extension stores the device token in `chrome.storage.local`.
8. Subsequent calls use `Authorization: Bearer <deviceToken>`.
9. kbgui Settings lists extension devices and allows revocation.

Device token scope should be narrow:

- read keyboard/layout choices;
- post Monkeytype run tags;
- read own upload status;
- no ApeKey access;
- no profile mutation outside extension-specific settings.

### Session-Cookie Flow

Later, the background can attempt:

```ts
fetch(`${kbguiOrigin}/api/extension/session`, {
  credentials: "include",
  headers: { "x-kbgui-extension": extensionVersion }
});
```

If the better-auth cookie is accepted, the server returns the user identity and keyboard/layout list. If not, the extension falls back to pairing.

Server implications:

- Requests from the extension background should be accepted only on extension endpoints.
- Validate JSON schemas and idempotency keys.
- Rate-limit per user/device.
- Do not rely on content-script-provided user IDs.
- If any endpoint is called from a browser page context, credentialed CORS must use an explicit `Access-Control-Allow-Origin` and `Access-Control-Allow-Credentials: true`; wildcard origins are not valid with credentials.

Content-script direct auth is not recommended. Chromium's security docs state that cross-origin requests from content scripts are subject to the page's CORS behavior; the background service worker should be the kbgui API boundary.

## 5. Ingest Backend In kbgui

Add a new Agent: `TypingRunsAgent`.

Do not extend `AuthAgent` for run analytics. `AuthAgent` should stay focused on better-auth, sessions, and Monkeytype ApeKey storage. Do not extend `CommunityAgent`; community keymaps are public catalog/community data, while typing runs are private user analytics. `TypingRunsAgent` can mirror the `CommunityAgent` shape: DO SQLite, Drizzle schema, `ensureTables()`, RPC methods, a service wrapper, and SvelteKit endpoints/remote functions.

Future binding/config changes:

- Add `TypingRunsAgent` export.
- Add a Durable Object binding and migration.
- Add App namespace typing in `src/app.d.ts`.
- Add server service helpers similar to `src/lib/community/service.ts`.

### Tables

`extension_device`

```text
id text primary key
user_id text not null
token_hash text not null unique
label text
install_id text
extension_version text
created_at integer not null
last_seen_at integer
revoked_at integer
```

`extension_pairing_token`

```text
token_hash text primary key
user_id text not null
created_at integer not null
expires_at integer not null
consumed_at integer
device_id text
```

`typing_run_tag`

```text
id text primary key
user_id text not null
source text not null
idempotency_key text not null
monkeytype_result_id text
monkeytype_timestamp_ms integer
captured_at integer not null
received_at integer not null

wpm real not null
raw_wpm real
acc real not null
consistency real
test_duration real
mode text
mode2 text
language text
difficulty text
punctuation integer
numbers integer

keyboard_id text not null
keyboard_profile_id text
keyboard_fork_id text
keyboard_name text not null
catalog_id text
vendor_id integer
product_id integer
board_name text

layout_id text not null
layout_variant_id text
layout_name text not null
layout_hash text

extension_device_id text
correlation_state text not null   -- pending | matched | ambiguous | unmatched
correlation_confidence real
raw_capture_json text not null
created_at integer not null
updated_at integer not null
```

Indexes:

- unique `(user_id, idempotency_key)`;
- `(user_id, monkeytype_result_id)`;
- `(user_id, captured_at)`;
- `(user_id, keyboard_id, layout_id)`;
- `(user_id, correlation_state)`.

If Wave 5 also persists ApeKey result rows, add:

`monkeytype_result`

```text
id text primary key              -- Monkeytype _id
user_id text not null
timestamp_ms integer not null
wpm real not null
raw_wpm real
acc real not null
consistency real
test_duration real
mode text
mode2 text
payload_json text not null
synced_at integer not null
```

This table is useful because the current Wave 3 summary stores aggregated Monkeytype data, not necessarily a durable local copy of every recent result needed for correlation.

### Endpoints And Remote Functions

Extension-facing JSON endpoints:

- `POST /api/extension/pair`
  - body: pairing code, install id, extension version;
  - auth: one-time pairing token;
  - returns device token and basic account info.

- `GET /api/extension/session`
  - auth: better-auth session cookie;
  - returns extension-safe user identity and whether the session can be used.

- `GET /api/extension/keyboards`
  - auth: better-auth session or extension device token;
  - returns `KeyboardChoice[]` and `LayoutChoice[]`.

- `POST /api/extension/runs`
  - auth: better-auth session or extension device token;
  - validates and stores `MonkeytypeRunCapture`;
  - returns `{ status: "stored" | "duplicate", correlationState }`.

kbgui app remote functions:

- `listTaggedRuns({ limit, keyboardId, layoutId, mode })`;
- `getTypingRunStats({ groupBy: "keyboard" | "layout" | "keyboard-layout" })`;
- `retryRunCorrelation()`;
- `listExtensionDevices()` / `revokeExtensionDevice(id)`;
- `createExtensionPairingToken()`.

### Correlation Flow

On ingest:

1. Authenticate to a concrete `userId`.
2. Validate the capture schema.
3. Upsert by `(userId, idempotencyKey)`.
4. Try direct result-id match if present.
5. Otherwise search recent synced Monkeytype results for the timestamp/metric tuple.
6. Store `matched`, `ambiguous`, or `pending`.

On Monkeytype ApeKey refresh:

1. Fetch recent results through the existing encrypted ApeKey path.
2. Normalize the result rows into `TypingRunsAgent`, or pass them to `TypingRunsAgent` for matching.
3. Re-run pending correlations for that user.

`AuthAgent` should not expose the ApeKey to `TypingRunsAgent` or the extension. It can expose a server-only method/service that refreshes and returns normalized recent results for the authenticated user.

## 6. kbgui Surfacing

Add a small "Typing runs" surface under the existing profile/Monkeytype area first. A full analytics page can come later.

Initial view:

- recent tagged runs;
- WPM, accuracy, consistency, mode/mode2, timestamp;
- keyboard and layout;
- correlation state: matched, pending, ambiguous, unmatched;
- source/version badge for debugging.

Initial aggregates:

- best WPM per keyboard/layout;
- average WPM, accuracy, and consistency per keyboard/layout;
- run count and last-used timestamp;
- filters for keyboard, layout, mode, and date range.

Later:

- compare keyboard/layout against overall Monkeytype PBs;
- link to Monkeytype result/profile when `_id` is known;
- show "needs keyboard sync" state when the extension has no account-visible keyboard choices;
- allow manual correction of an ambiguous match.

## 7. Phasing

### Slice 1: Pairing + DOM Capture + Ingest

Bounded goal:

- Scaffold `extension/` with WXT and Svelte 5.
- Inject a Shadow DOM tagger on `monkeytype.com`.
- Read a completed Monkeytype result from the DOM.
- Let the user select keyboard/layout from a mock or minimal kbgui-provided list.
- Pair with kbgui through a Settings-generated token.
- Post a tagged run to `TypingRunsAgent`.
- Queue and retry failed posts.

Server scope:

- `TypingRunsAgent` with `extension_device`, `extension_pairing_token`, and `typing_run_tag`.
- `POST /api/extension/pair`.
- `GET /api/extension/keyboards`.
- `POST /api/extension/runs`.
- Minimal Settings UI for creating/revoking pairing tokens/devices.

Verification:

- Unit/fixture tests for DOM parsing using saved Monkeytype result HTML.
- Local unpacked Chrome extension against `http://localhost:8787` or `http://127.0.0.1:8787`.
- Manual test on real `https://monkeytype.com` because the final DOM and CSP behavior must be verified in-browser.

### Slice 2: Session Cookie Convenience

- Background probes `/api/extension/session` with `credentials: "include"`.
- If valid, extension can skip pairing for signed-in users.
- Keep pairing as fallback and support path.
- Add stricter origin/extension ID allowlisting once the extension ID is stable.

### Slice 3: Better Correlation

- Persist recent ApeKey `/results` rows server-side.
- Re-run pending tag correlation after Monkeytype refresh.
- Add result-id matching if a later extension bridge observes the saved Monkeytype result ID.
- Add an ambiguous-match correction UI.

### Slice 4: kbgui Analytics Surface

- Add the profile/Monkeytype tagged-run section.
- Add best/average stats by keyboard/layout.
- Add filters and links to matched Monkeytype results.

### Slice 5: Packaging And Cross-Browser

- Produce signed/published Chrome extension build.
- Pin extension ID and tighten `externally_connectable`.
- Test WXT browser targets beyond Chrome if desired.

Parts that need the real Monkeytype site or a published extension to fully verify:

- Monkeytype DOM selector stability.
- Result save timing and whether a result ID can be observed without an invasive bridge.
- Extension ID allowlisting and `externally_connectable` behavior.
- Cookie/session behavior across Chrome profiles and third-party-cookie settings.

## 8. Decisions For Sign-Off

1. **Tooling:** choose WXT over CRXJS for Wave 5.
   - Reason: documented Svelte `mount` content UI, Shadow DOM helper, MV3 entrypoints, packaging, storage/messaging helpers, and broader browser target support.

2. **Auth:** implement pairing/device token first; add better-auth session-cookie auth second.
   - Reason: pairing is explicit, revocable, testable, and independent of browser cookie edge cases. Session-cookie auth is valuable as a no-login convenience but should not be the only path.

3. **Repo layout:** add an in-repo `extension/` workspace package.
   - Reason: the extension should share kbgui contracts and ship with the app, but it should not live inside the SvelteKit app build. Add a pure shared contracts surface rather than importing app internals.

4. **Monkeytype integration surface:** accept DOM scraping for the first slice, with strict graceful failure.
   - Reason: no official Monkeytype page extension API was found. The public API and source confirm the result data exists, but page DOM/classes are unofficial. Server-side ApeKey correlation is the safety net.

5. **Backend ownership:** add `TypingRunsAgent`.
   - Reason: typed run tags are private user analytics and deserve their own Durable Object/SQLite boundary. `AuthAgent` should remain auth/ApeKey focused; `CommunityAgent` should remain community-keymap focused.

## Sources

- WXT content scripts and Svelte/Shadow DOM UI examples: https://wxt.dev/guide/essentials/content-scripts.html
- WXT Vite configuration: https://wxt.dev/guide/essentials/config/vite.html
- WXT comparison table: https://wxt.dev/guide/resources/compare
- CRXJS content script and HMR model: https://crxjs.dev/concepts/content/
- Chrome extension network requests and host permissions: https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
- Chromium content-script cross-origin fetch changes: https://www.chromium.org/Home/chromium-security/extension-content-script-fetches/
- Chrome content scripts and isolated worlds: https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- Chrome MV3 extension service workers: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/basics
- Chrome extension messaging: https://developer.chrome.com/docs/extensions/develop/concepts/messaging
- Chrome extension storage API: https://developer.chrome.com/docs/extensions/reference/api/storage
- Chrome extension storage and cookies: https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies
- Chrome `externally_connectable`: https://developer.chrome.com/docs/extensions/reference/manifest/externally-connectable
- MDN `Request.credentials`: https://developer.mozilla.org/en-US/docs/Web/API/RequestInit#credentials
- MDN `Access-Control-Allow-Credentials`: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Access-Control-Allow-Credentials
- MDN cookie `SameSite`: https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Cookies
- Monkeytype API docs: https://api.monkeytype.com/docs
- Monkeytype result page HTML source: https://github.com/monkeytypegame/monkeytype/blob/master/frontend/src/html/pages/test-result.html
- Monkeytype result update source: https://github.com/monkeytypegame/monkeytype/blob/master/frontend/src/ts/test/result.ts
- Monkeytype completed-event construction source: https://github.com/monkeytypegame/monkeytype/blob/master/frontend/src/ts/test/test-logic.ts
- Monkeytype result schemas: https://github.com/monkeytypegame/monkeytype/blob/master/packages/schemas/src/results.ts
