# Wave 3b: Monkeytype Data Sync

Date: 2026-07-04

## Integration model

Monkeytype is implemented as a custom better-auth plugin inside `AuthAgent`.

This is not OAuth. Users authenticate to kbgui with GitHub/better-auth, then connect Monkeytype as a synced data source with a user-generated ApeKey. The ApeKey is never returned to the browser after submission and is not stored in client state, localStorage, or LiveStore.

## Server plugin

Plugin file:

- `src/lib/server/auth/monkeytype-plugin.ts`

Registered in:

- `src/agents/auth-agent.ts`

Plugin id:

- `monkeytype`

Plugin schema/table:

- better-auth model: `monkeytypeConnection`
- SQLite table: `monkeytype_connection`
- Drizzle schema: `src/lib/server/auth/schema.ts`
- AuthAgent bootstrap creates the table/indexes on DO start.

Stored fields:

- `userId`
- `apeKeyCiphertext`
- `apeKeyIv`
- `username`
- `mode`
- `mode2`
- `summaryJson`
- `lastSyncedAt`
- `rateLimitResetAt`
- `createdAt`
- `updatedAt`

Endpoints under `/api/auth/monkeytype/*`:

- `POST /connect`
  - Body: `{ apeKey?, username?, mode?, mode2? }`
  - Requires a better-auth session.
  - Validates the ApeKey by calling Monkeytype server-side.
  - Optionally validates the provided public Monkeytype username.
  - Encrypts the ApeKey and stores only ciphertext/IV.
  - Warms the summary cache and returns a display DTO.
- `POST /disconnect`
  - Requires a better-auth session.
  - Deletes the stored connection.
- `GET /status`
  - Requires a better-auth session.
  - Returns connection metadata and cached summary only.
- `POST /refresh`
  - Requires a better-auth session.
  - Reuses cached summary for at least 6 hours unless forced.
  - Honors stored rate-limit reset cooldown.
  - Keeps stale summary data when Monkeytype quota is exhausted.

Returned DTO never includes `apeKey`, `apeKeyCiphertext`, or `apeKeyIv`.

## Monkeytype API Client

Server-only client:

- `src/lib/server/monkeytype/client.ts`

Base URL:

- `https://api.monkeytype.com`

Implemented calls:

- `GET /users/stats`
- `GET /users/personalBests?mode=&mode2=`
- `GET /results?limit=50&offset=0`
- `GET /users/{username}/profile?isUid=false`

Authenticated calls send:

```txt
Authorization: ApeKey <key>
```

Normalized ApeKey errors:

- `470` -> `MONKEYTYPE_INVALID_APE_KEY`
- `471` -> `MONKEYTYPE_INACTIVE_APE_KEY`
- `472` -> `MONKEYTYPE_MALFORMED_APE_KEY`
- `479` -> `MONKEYTYPE_APE_KEY_RATE_LIMITED`

The client captures `X-Ratelimit-Limit`, `X-Ratelimit-Remaining`, and `X-Ratelimit-Reset`.

## Summary And Defaults

Pure summary derivation:

- `src/lib/server/monkeytype/summary.ts`

Summary fields:

- `wpm`
- `accuracy`
- `consistency`
- `tests`
- `pb`
- `mode`
- `mode2`
- `resultCount`
- `generatedAt`
- `stale`
- `error`

Chosen PB default:

- `mode = "time"`
- `mode2 = "60"`

This default is documented in code through `DEFAULT_MONKEYTYPE_MODE` and `DEFAULT_MONKEYTYPE_MODE2` in `src/lib/monkeytype/types.ts`.

Username handling:

- Monkeytype username is stored separately from GitHub identity.
- Profile links use `monkeytype.username`.
- If no Monkeytype username is stored, the UI does not invent a link from the GitHub login.

## ApeKey Encryption

Crypto helper:

- `src/lib/server/monkeytype/crypto.ts`

Encryption:

- AES-GCM through Web Crypto
- 12-byte random IV
- 32-byte base64 secret: `MONKEYTYPE_SECRET_KEY`

Local setup in `.dev.vars`:

```txt
MONKEYTYPE_SECRET_KEY="<32-byte base64 secret>"
```

Generate:

```sh
openssl rand -base64 32
```

Production setup:

```sh
vp exec wrangler secret put MONKEYTYPE_SECRET_KEY
```

`MONKEYTYPE_SECRET_KEY` is typed in `src/app.d.ts` and listed in `.dev.vars.example`.

## Client And UI

Client plugin:

- `src/lib/auth-client.ts`

Typed calls:

- `authClient.monkeytype.status()`
- `authClient.monkeytype.connect(...)`
- `authClient.monkeytype.disconnect()`
- `authClient.monkeytype.refresh(...)`

UI wiring:

- Profile popover Monkeytype block in `src/routes/(app)/+layout.svelte`
  - Connected state shows WPM, accuracy, PB WPM, tests, profile link, Refresh, Disconnect.
  - Not-connected state links to Settings.
- Topbar WPM chip in `src/routes/(app)/+layout.svelte`
  - Reads from real `ShellStore.monkeytype`.
- Settings integration card in `src/routes/(app)/settings/+page.svelte`
  - ApeKey input.
  - Optional Monkeytype username input.
  - PB preset selector, defaulting to `time 60`.
  - Connect/Update, Refresh, Disconnect.
  - Error/stale display for invalid or rate-limited keys.
- Shell state in `src/lib/app/shell-store.svelte.ts`
  - Stores only non-secret Monkeytype DTO data.

## Manual Exercise Needed

A full connect/sync requires a real Monkeytype ApeKey created by the user in Monkeytype.

Manual path:

1. Set `MONKEYTYPE_SECRET_KEY`.
2. Run `vp run dev:worker`.
3. Sign in with GitHub.
4. Open Settings -> Monkeytype.
5. Paste a real ApeKey.
6. Optionally enter a Monkeytype username.
7. Connect and verify the profile popover/topbar update.

## Verification Evidence

Static and unit checks:

```txt
vp check: pass, 0 warnings/errors
vp run svelte:check: pass, 0 warnings/errors
vp build: pass
vp test: 21 files passed, 103 tests passed
```

Runtime guard proof:

```txt
vp run dev:worker: started Worker-backed dev server on 127.0.0.1:8787
GET http://127.0.0.1:8787/api/auth/monkeytype/status
HTTP 401
body: {"message":"Unauthorized","code":"UNAUTHORIZED"}

AuthAgent log:
[AuthAgent] >>> GET /api/auth/monkeytype/status
[AuthAgent] <<< GET /api/auth/monkeytype/status -> 401
[wrangler:info] GET /api/auth/monkeytype/status 401 UNAUTHORIZED

Port 8787 listeners after stop: 0
```

No full Monkeytype sync was attempted because that requires a real ApeKey.
