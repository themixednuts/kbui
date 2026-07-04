# Wave 5a Extension Ingest Backend

Scope: kbgui-side ingest backend for the Monkeytype run-tagger extension. The browser extension package remains Wave 5b.

## Contracts

Added pure shared DTOs in `src/lib/typing-runs/contracts.ts`. The module has no `$lib`, SQLocal, Effect, SvelteKit, or server-only imports so Wave 5b can import it from the extension package.

Key contracts:

- `KeyboardChoice` and `LayoutChoice` mirror the design doc identity shapes.
- `MonkeytypeRunCapture` is the normalized DOM-first Monkeytype run payload with versioned `source: "monkeytype-extension-dom-v1"`.
- Request/response DTOs cover pairing, device lists, keyboard choices, session probing, run ingest, tagged-run views, and stats.
- `runIdempotencyKeySpec` and `idempotencyKeyForCapture(capture)` define the deterministic idempotency key: direct Monkeytype result id when present, otherwise source/capture/install/parser/mode/WPM/accuracy/keyboard/layout fields.

## TypingRunsAgent

Added `TypingRunsAgent` in `src/agents/typing-runs-agent.ts`. It mirrors `CommunityAgent`: `Agent<Cloudflare.Env, ...>`, Drizzle over DO SQLite via `drizzle(this.#agentCtx.storage)`, `ensureTables()`, and public RPC methods called through `src/lib/typing-runs/service.ts`.

Binding/config:

- `wrangler.toml`: `TypingRunsAgent` Durable Object binding and `v4` SQLite migration.
- `svelte.config.js`: Cloudflare worker export injection.
- `src/app.d.ts` and `src/cloudflare.d.ts`: app/worker namespace types.

Singleton name: `global-typing-runs` via `TYPING_RUNS_AGENT_NAME`. This matches `CommunityAgent`'s singleton pattern. User isolation is enforced by `user_id` on every private row and by service/endpoint auth; using one DO keeps pairing/device lookup and run idempotency simple for this first private analytics slice.

Tables:

- `extension_device`: device token hash, install metadata, timestamps, revocation.
- `extension_pairing_token`: one-time pairing token hash, user id, expiry, consumed/device linkage.
- `typing_run_tag`: normalized run tag, raw capture JSON, idempotency key, pending correlation state, keyboard/layout columns and indexes from the design.
- `typing_run_choice_sync`: supporting local-first sync table for app-supplied keyboard/layout choices.

RPC methods implemented:

- `createPairingToken(userId, meta)`
- `pairDevice(code, install)`
- `resolveDeviceToken(token)`
- `listDevices(userId)` / `revokeDevice(userId, id)`
- `setKeyboardChoices(userId, choices)` / `getKeyboardChoices(userId)`
- `ingestRun(userId, capture)` with `(userId, idempotencyKey)` duplicate detection and `correlationState: "pending"`
- `listTaggedRuns(userId, filter)` / `getStats(userId, groupBy)`

Pairing tokens and device tokens are stored only as SHA-256 hashes. Device tokens are returned only from `pairDevice`.

## Endpoints

Added extension-facing worker routes:

- `POST /api/extension/pair`
- `GET /api/extension/session`
- `GET /api/extension/keyboards`
- `POST /api/extension/runs`

Shared endpoint logic lives in `src/lib/server/typing-runs/extension-api.ts`:

- Supports `Authorization: Bearer <deviceToken>` and better-auth session cookies.
- Never trusts a client-provided user id.
- Validates JSON DTOs before RPC calls.
- Adds TODO markers for user/device rate limiting.
- Uses explicit-origin CORS for `chrome-extension://`, `moz-extension://`, localhost, and 127.0.0.1. Credentialed CORS always echoes the specific origin with `Access-Control-Allow-Credentials: true`; no wildcard-with-credentials path exists.

## App Remote Functions And Settings

Added `src/routes/(app)/settings/typing-runs.remote.ts`:

- `createExtensionPairingToken()`
- `listExtensionDevices()`
- `revokeExtensionDevice(id)`
- `listTaggedRuns(...)`
- `getTypingRunStats(...)`
- `syncExtensionKeyboardChoices(...)`

Updated `src/routes/(app)/settings/+page.svelte` with a compact "Monkeytype run tagger" card:

- Creates and displays a short-lived pairing code.
- Lists active/revoked extension devices.
- Revokes devices.
- Syncs keyboard/layout choices while signed in.

Choice sync reads the app shell's existing workbench context without modifying `(workbench)`. It syncs the main profile plus local forks, using the active in-memory profile for the currently selected variant so the extension picker sees current local-first state.

## Verification

Commands:

- `vp install`: completed successfully.
- `vp check`: all 182 files formatted; no warnings, lint errors, or type errors in 262 files.
- `vp run svelte:check`: 6026 files, 0 errors, 0 warnings.
- `vp build`: completed successfully with `@sveltejs/adapter-cloudflare:agents`.
- `vp test`: 35 test files passed, 173 tests passed.

Tests added:

- `src/lib/typing-runs/service.test.ts`: pairing single-use, expiry, device token resolve/revoke, keyboard choices, ingest idempotency.
- `src/routes/api/extension/extension-api.test.ts`: anonymous run ingest reject, invalid bearer reject, invalid pairing code reject.

Runtime proof:

- Port `8787` was already occupied by an unrelated `workerd` from another repo, so the worker proof used the same command behind `dev:worker` after `vp build`, on port `8788`: `vp exec wrangler dev --ip 127.0.0.1 --port 8788`.
- Wrangler binding list included `env.TypingRunsAgent (TypingRunsAgent) Durable Object local`.
- `POST /api/extension/runs` without auth returned `401 {"error":"Extension request requires a paired device token or session."}`.
- `POST /api/extension/pair` with an invalid code returned `401 {"error":"Pairing code is invalid or expired."}`.
- With a local Wrangler-state Better Auth session for `runtime-proof-user` and a seeded one-time pairing row in `TypingRunsAgent` SQLite:
  - `GET /api/extension/session` returned `200` with `canUse: true`.
  - `POST /api/extension/pair` returned `200`, `userId: "runtime-proof-user"`, and a one-time device token.
  - First `POST /api/extension/runs` with that token returned `200 {"status":"stored","correlationState":"pending"}`.
  - Repeating the same run returned `200 {"status":"duplicate","correlationState":"pending"}`.
- Worker was stopped afterward; port `8788` was confirmed clear.
