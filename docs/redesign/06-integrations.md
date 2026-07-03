# 06 Integrations

Scope: preserve the existing GitHub OAuth path during the UI rebuild, and define the new Monkeytype integration without changing the keyboard engine.

Local sources read:

- `src/agents/auth-agent.ts`
- `src/hooks.server.ts`
- `src/routes/api/auth/[...all]/+server.ts`
- `src/lib/auth-client.ts`
- `src/routes/(workbench)/+layout.svelte`
- `.dev.vars.example`
- `.env.example`
- `wrangler.toml`
- `vite.config.ts`
- `resources/kbgui-handoff/kbgui/project/store.jsx`
- `resources/kbgui-handoff/kbgui/project/app-shell.jsx`

External sources:

- Monkeytype public API docs: <https://api.monkeytype.com/docs>
- Monkeytype internal API docs, only to distinguish the account bearer flow from Ape keys: <https://api.monkeytype.com/docs/internal>

## GitHub OAuth

### Current end-to-end flow

The auth engine already exists and should be kept. `src/agents/auth-agent.ts` defines an `AuthAgent` Durable Object that lazily constructs `betterAuth` with:

- `basePath: "/api/auth"` and `baseURL` from `BETTER_AUTH_URL`, with a localhost/workers.dev fallback (`src/agents/auth-agent.ts:100-107`).
- A Durable Object SQLite Drizzle adapter for better-auth tables (`src/agents/auth-agent.ts:112-119`, `174-254`).
- GitHub social auth only when both `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are bound (`src/agents/auth-agent.ts:127-135`, `170-172`).
- The better-auth JWT plugin, exposing `/api/auth/jwks` and `/api/auth/token` for LiveStore sync auth (`src/agents/auth-agent.ts:148-163`).

Browser sign-in in the old UI works like this:

1. The UI imports `authClient` from `src/lib/auth-client.ts`, which is just `createAuthClient()` (`src/lib/auth-client.ts:1-3`).
2. The old workbench calls `authClient.signIn.social({ provider: "github", callbackURL: "/", disableRedirect: true })` (`src/routes/(workbench)/+layout.svelte:2187-2191`).
3. better-auth returns a GitHub authorization URL. The UI navigates the browser to it with `location.assign(data.url)` (`src/routes/(workbench)/+layout.svelte:2199-2203`).
4. GitHub redirects back to `/api/auth/callback/github`.
5. `src/routes/api/auth/[...all]/+server.ts` forwards the callback request to the singleton `AuthAgent` named `global-auth` (`src/routes/api/auth/[...all]/+server.ts:28-48`).
6. The auth route sets `redirect: "manual"` so better-auth's success `302` returns to the browser instead of being followed inside the Worker (`src/routes/api/auth/[...all]/+server.ts:33-39`).
7. `AuthAgent.fetch` hands the request to better-auth (`src/agents/auth-agent.ts:67-92`). better-auth validates the OAuth state, exchanges the GitHub code, writes/updates `user`, `account`, `session`, and `verification` rows in DO SQLite, returns session cookies, and redirects to `callbackURL` (`/`).
8. On later non-auth page/API requests, `src/hooks.server.ts` asks the AuthAgent for `/api/auth/get-session`, forwarding only auth-relevant headers (`src/hooks.server.ts:14-45`).
9. If the session is valid, the hook sets `event.locals.session` and `event.locals.user` (`src/hooks.server.ts:50-57`). If better-auth refreshes cookies, the hook appends the returned `Set-Cookie` without collapsing multi-cookie headers (`src/hooks.server.ts:69-90`).

Sign-out is the same proxy path in reverse: the old UI calls `authClient.signOut()` (`src/routes/(workbench)/+layout.svelte:2223-2236`), SvelteKit forwards it to AuthAgent, and better-auth clears the session cookie/server session.

### Env vars, secrets, and bindings

Required auth variables:

- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`

They are typed in `src/app.d.ts:19-22` and on the AuthAgent env in `src/agents/auth-agent.ts:10-13`.

Local Wrangler dev:

- `.dev.vars.example` is the authoritative local Worker secret template. It says `.dev.vars` is read by `wrangler dev`, `BETTER_AUTH_URL` should be `http://localhost:8787`, and the GitHub OAuth callback URL should be `http://localhost:8787/api/auth/callback/github` (`.dev.vars.example:1-22`).
- The Vite+ task for Worker-backed dev is `vp run dev:worker`, which runs `vp build`, regenerates Worker Effect aliases, then starts `wrangler dev` (`vite.config.ts:15-18`).

Cloudflare bindings:

- `wrangler.toml` binds `AuthAgent` as a Durable Object (`wrangler.toml:15-17`) and registers its SQLite migration (`wrangler.toml:27-29`).
- `wrangler.toml` does not define `[vars]` for the auth values. Production needs Cloudflare environment variables or secrets, for example `wrangler secret put BETTER_AUTH_SECRET`, `wrangler secret put GITHUB_CLIENT_SECRET`, and either secrets or non-secret vars for `GITHUB_CLIENT_ID` and `BETTER_AUTH_URL`.
- Production GitHub OAuth must use the deployed origin's callback URL, for example `https://<production-host>/api/auth/callback/github`.

### New UI minimum API surface

The new UI does not need to know about the Durable Object directly. It only needs the browser client:

```ts
import { authClient } from "$lib/auth-client";

const sessionResult = await authClient.getSession();
const session = sessionResult.data;

const signIn = await authClient.signIn.social({
  provider: "github",
  callbackURL: "/",
  disableRedirect: true,
});
if (signIn.data?.url) location.assign(signIn.data.url);

await authClient.signOut();
```

For display, use `session?.user.id`, `session?.user.name`, `session?.user.email`, and `session?.user.image`. The old UI sets the LiveStore/agent namespace from `session.user.id` and display text from name/email (`src/routes/(workbench)/+layout.svelte:2152-2161`).

### Gaps and caveats

- GitHub auth is Worker-only. Plain `vp dev` cannot use AuthAgent: the auth catch-all returns a 503 in SvelteKit dev (`src/routes/api/auth/[...all]/+server.ts:9-16`), and the old UI explicitly shows "Run `vp run dev:worker`" (`src/routes/(workbench)/+layout.svelte:2181-2183`). This caveat must survive the UI rebuild.
- `.env.example` lists `BETTER_AUTH_URL="http://localhost:5173"` and GitHub vars, but the current auth route refuses plain Vite dev. That file is misleading for GitHub OAuth unless the project later adds a non-Worker auth path.
- If GitHub env vars are absent, `socialProviders` becomes `{}`. The new UI should surface "GitHub auth is not configured" rather than leaving the user with a generic sign-in failure.
- `AuthAgent` falls back to a hard-coded local auth secret if `BETTER_AUTH_SECRET` is missing (`src/agents/auth-agent.ts:25`, `126`). That is convenient locally but risky in production; deployment should fail fast or at least log loudly when the secret is missing outside local dev.
- The auth forwarding path currently relies on the Effect compatibility shim: `src/hooks.server.ts` imports `catchCauseCompat`, and `src/routes/api/auth/[...all]/+server.ts` imports `catchCompat`. The old UI also uses `catchCauseCompat` around auth effects. A clean-break refactor can replace these wrappers with normal `try`/`catch` and then remove `src/lib/effect/compat.ts` once no imports remain. `src/lib/auth-client.ts` itself has no Effect dependency.

### Build list

| Status | File/function | Build item |
| --- | --- | --- |
| [exists] | `src/agents/auth-agent.ts` | Keep AuthAgent as the better-auth owner, including GitHub provider setup, DO SQLite tables, and JWT plugin. |
| [exists] | `src/routes/api/auth/[...all]/+server.ts` | Keep the catch-all proxy to AuthAgent and preserve `redirect: "manual"` for OAuth callback success redirects. |
| [exists] | `src/hooks.server.ts` | Keep server-side session lookup through AuthAgent and cookie refresh forwarding. |
| [exists] | `src/lib/auth-client.ts` | Reuse this singleton from the new UI. |
| [new] | New account/profile UI shell code | Recreate `getSession`, GitHub sign-in redirect, sign-out, signed-in display, and Worker-only dev messaging. |
| [fix] | `src/routes/api/auth/[...all]/+server.ts`, `src/hooks.server.ts`, old UI replacement | Replace Effect compat wrappers with plain error handling during the clean-break refactor. Remove `src/lib/effect/compat.ts` only after all imports are gone. |
| [fix] | Deployment docs/config | Add production GitHub OAuth instructions: set `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and configure the production callback URL in GitHub. |
| [fix] | Auth configuration health | Fail fast or show a clear admin/user-facing error when GitHub provider vars or `BETTER_AUTH_SECRET` are missing. |
| [fix] | `.env.example` or dev docs | Clarify that GitHub OAuth does not work under plain `vp dev`; local OAuth needs `vp run dev:worker` and `.dev.vars`. |

## Monkeytype

### What the design currently wants

Monkeytype is not implemented in `src` today. The references are only in the handoff design.

The seed state models an account as GitHub-signed-in plus a Monkeytype object:

- `connected`
- `wpm`
- `accuracy`
- `consistency`
- `tests`
- `pb`

See `resources/kbgui-handoff/kbgui/project/store.jsx:62-67`.

The reducer only toggles `monkeytype.connected`; it does not fetch or persist anything (`resources/kbgui-handoff/kbgui/project/store.jsx:231-238`).

The app shell renders:

- A Monkeytype block in the signed-in profile popover (`app-shell.jsx:55-78`).
- A profile link to `https://monkeytype.com/profile/${acc.login}` (`app-shell.jsx:67`).
- Four stats: `wpm avg`, `accuracy`, `pb wpm`, and `tests` (`app-shell.jsx:68-72`).
- A topbar chip showing `{mt.wpm} wpm` when connected (`app-shell.jsx:108`).

Important design gap: `acc.login` is the GitHub login in the mock account, but Monkeytype usernames do not have to match GitHub usernames. The real integration should store `monkeytype.username` separately or mark the external profile link unavailable until a Monkeytype username is provided/verified.

The design seeds `consistency`, but the app shell does not currently render it. The design does not currently render a streak or recent-result list. Recent results are still useful because they are the likely source for a real "wpm avg" and "accuracy" value.

### API model

Base URL: `https://api.monkeytype.com`.

Auth:

- Public docs state that authentication uses the `Authorization` header in this form: `Authorization: ApeKey YOUR_APE_KEY`.
- Many public endpoints list `BearerAuth ApeKey`, meaning either Monkeytype account bearer auth or an Ape key can authorize the request.
- Internal docs show account-bearer-only endpoints such as `GET /users`, plus Ape key management endpoints that require `BearerAuth` and permissions such as `canManageApeKeys`. This app should not collect Monkeytype passwords or account bearer tokens. Use a user-generated Ape key only.

Endpoints relevant to the design:

| Need | Endpoint | Auth | Notes |
| --- | --- | --- | --- |
| Completed test count | `GET /users/stats` | `BearerAuth ApeKey` | Returns `completedTests`, `startedTests`, `timeTyping`. Rate limit: 60/hour. |
| PB WPM, PB accuracy, PB consistency for one mode | `GET /users/personalBests?mode=<mode>&mode2=<mode2>` | `BearerAuth ApeKey` | Returns one PB object with `wpm`, `acc`, `consistency`, `raw`, `timestamp`, etc. Rate limit: 60/hour. VERIFY product default: common choice is `mode=time&mode2=60`, but the design does not specify mode. |
| Average WPM/accuracy/consistency from recent results | `GET /results?limit=<0..1000>&offset=<n>&onOrAfterTimestamp=<ms>` | `BearerAuth ApeKey` | Returns result rows with `wpm`, `acc`, `consistency`, `mode`, `mode2`, `timestamp`, `isPb`. Rate limit: 60/hour for regular users but only 30/day with ApeKeys. Use sparingly and cache. |
| Last result, if the UI chooses "latest" instead of "average" | `GET /results/last` | `BearerAuth ApeKey` | Returns one result row. Rate limit: 60/hour. |
| Streak, if added to UI | `GET /users/streak` | `BearerAuth ApeKey` | Returns `lastResultTimestamp`, `length`, `maxLength`, `hourOffset`. Rate limit: 60/hour. |
| Activity calendar, if added to UI | `GET /users/currentTestActivity` | `BearerAuth ApeKey` | Returns up to 372 days of `testsByDays` plus `lastDay`. Rate limit: 60/hour. |
| Public profile/profile-link validation | `GET /users/{uidOrName}/profile?isUid=false` | Public docs do not list auth for this endpoint | Returns public profile data including `typingStats`, `personalBests`, `testActivity`, `streak`, and `maxStreak` when profiles are enabled. Rate limit: 100/hour. Requires a Monkeytype username or uid. |

Rate limits and pagination:

- The public docs state a general limit of 30 requests/minute across all endpoints, with stricter endpoint-specific limits.
- `GET /results` has pagination via `offset`, `limit`, and `onOrAfterTimestamp`; `limit` can be up to 1000.
- Live response headers checked on 2026-07-03 included `X-Ratelimit-Limit`, `X-Ratelimit-Remaining`, and `X-Ratelimit-Reset`. The integration should read these and retain stale cached data when quota is low or exhausted.
- ApeKey error status codes include 470 invalid ApeKey, 471 inactive ApeKey, 472 malformed ApeKey, and 479 ApeKey rate limit exceeded.

### CORS and browser reachability

Live CORS checks on 2026-07-03:

- `OPTIONS https://api.monkeytype.com/users/stats` with `Origin: http://localhost:5173` and requested `authorization` header returned `204` plus `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Headers: authorization`.
- `OPTIONS https://api.monkeytype.com/results?limit=1` returned the same relevant CORS headers.

So browser calls are technically possible. The app should still proxy calls through our Cloudflare/SvelteKit server layer after initial key submission because:

- The Ape key should not live in LiveStore, component state, localStorage, or client-side fetch code after connect.
- A first-party server layer can enforce per-user auth through better-auth before using the stored key.
- A server layer can centralize rate-limit handling and cache expensive `/results` calls, especially because ApeKeys only get 30 `/results` calls per day.

### Storage and security recommendation

Store the user's Ape key per better-auth user, encrypted server-side.

Recommended minimal stack fit:

- Add an encrypted integration-secret table and RPC methods to `AuthAgent`, because it already owns better-auth identity, the GitHub OAuth account table, and Durable Object SQLite.
- Key rows by `user_id` and provider, for example provider `monkeytype`.
- Store `username`, preferred PB mode/mode2, encrypted Ape key ciphertext, nonce/iv, created/updated timestamps, last successful sync timestamp, last summary JSON, and last rate-limit reset metadata.
- Encrypt with Web Crypto AES-GCM using a new Cloudflare secret such as `INTEGRATION_SECRET_KEY` or `MONKEYTYPE_SECRET_KEY`. The secret should be a random 32-byte base64/base64url value in `.dev.vars` locally and a Worker secret in production.
- Do not store the Ape key in LiveStore. LiveStore may store a derived, non-secret summary later if offline/cross-device display is explicitly needed, but the default should be server cache plus component/remote-query state.

Alternatives considered:

- better-auth additional fields on `user`: works for non-secret profile metadata, but it puts integration-specific secret handling into the auth user row and still requires encrypted storage.
- Manually using better-auth's `account` table as a fake `monkeytype` provider: tempting because it has token columns, but it conflates better-auth-owned OAuth accounts with an unrelated user-supplied API key.
- KV or D1: not currently bound in this repo. KV also has eventual consistency concerns. D1 would add infrastructure for one secret when DO SQLite already exists.
- Existing `UserWorkbenchAgent`: per-user and already bound, but its domain is keyboard snapshots. Avoid mixing third-party secrets into the workbench engine store.

### Proposed integration surface

Use SvelteKit remote functions for the UI-facing API, backed by server-only Monkeytype helpers:

- `src/routes/integrations/monkeytype.remote.ts`
  - `getMonkeytypeConnection = query(...)`: require `event.locals.user`; read connection metadata and cached summary from AuthAgent; return `{ connected, username, mode, mode2, summary, lastSyncedAt, stale, error }`.
  - `connectMonkeytype = command(...)`: require user; accept `{ apeKey, username?, mode?, mode2? }`; validate the key with Monkeytype; encrypt/store it; warm the summary cache; return the same connection DTO.
  - `disconnectMonkeytype = command(...)`: require user; delete encrypted key and cached Monkeytype summary.
  - `refreshMonkeytypeSummary = command(...)`: require user; fetch fresh data when TTL/cooldown allows; update cache; return summary. Use a command rather than a query because it mutates the cache.

- `src/lib/server/monkeytype/client.ts`
  - Centralize `fetch` calls to `https://api.monkeytype.com`.
  - Always send `Authorization: ApeKey <key>` server-side.
  - Normalize Monkeytype errors, including 470/471/472/479.
  - Capture rate-limit headers.

- `src/lib/server/monkeytype/summary.ts`
  - Compute the design DTO:
    - `tests = stats.completedTests`
    - `pb = personalBest.wpm`
    - `accuracy = average recent result acc` or `null` if no recent results
    - `wpm = average recent result wpm` or `null`
    - `consistency = average recent result consistency` or PB consistency as a fallback
  - Preserve the raw source timestamps so the UI can show stale/error states without guessing.

Fetch/caching strategy:

- On connect, call `GET /users/stats` and `GET /users/personalBests` to validate the key and mode. Call `GET /results?limit=50&offset=0` only if the initial summary needs average WPM/accuracy immediately.
- Cache the full summary server-side for at least 6 hours. `/results` should be manual-refresh or stale-while-revalidate at most, because ApeKey quota is 30/day.
- If `/results` is rate-limited, keep showing stale WPM/accuracy and still refresh cheaper `stats`/`personalBests` if allowed.
- Do not call Monkeytype on every app-shell render. The shell should read `getMonkeytypeConnection`; a settings/profile control can call `refreshMonkeytypeSummary`.

User input:

- The profile/settings UI should ask for an Ape key.
- It should also ask for a Monkeytype username, or let the user leave it blank. VERIFY whether a public ApeKey endpoint can return the current username; the public docs do not confirm one. Without a username, do not build a profile URL from the GitHub login.
- Include a PB mode selector or hard-code a documented product default. VERIFY default mode/mode2 before shipping; the handoff mock does not say whether `pb` means time 15, time 60, words 50, etc.

### Build list

| Status | File/function | Build item |
| --- | --- | --- |
| [new] | `src/lib/server/monkeytype/client.ts` | Server-only Monkeytype API client with ApeKey auth header, base URL, error normalization, and rate-limit header parsing. |
| [new] | `src/lib/server/monkeytype/summary.ts` | Derive `{ wpm, accuracy, consistency, tests, pb }` from stats, PB, and recent results. Include stale/error metadata. |
| [new] | `src/routes/integrations/monkeytype.remote.ts` | Remote `query`/`command` functions: get connection, connect, disconnect, refresh summary. Guard every function with better-auth user identity. |
| [new] | `src/agents/auth-agent.ts` integration-secret methods | Add DO SQLite table/methods for encrypted per-user Monkeytype secret, username, selected mode, cached summary, and sync metadata. |
| [fix] | `src/app.d.ts`, `.dev.vars.example`, production secrets | Add a typed/bound encryption secret such as `MONKEYTYPE_SECRET_KEY`; document local `.dev.vars` and production `wrangler secret put`. |
| [new] | New profile/settings UI | Replace design-only `MT_TOGGLE` with a real connect form, disconnect action, refresh action, stale/error display, and Worker-backed data loading. |
| [fix] | Account/Monkeytype UI model | Stop using GitHub `acc.login` as the Monkeytype profile slug. Add `monkeytype.username` and only link to `https://monkeytype.com/profile/<username>` when known. |
| [new] | `src/lib/types/monkeytype.ts` or colocated DTO schemas | Define DTOs for connection state, summary, PB mode, rate-limit metadata, and normalized errors. |
| [new] | Tests for summary and remote guards | Unit-test summary derivation and error mapping; test that remote functions reject unauthenticated users and never return the Ape key. |
| [new] | Optional LiveStore derived summary event/table | Only add if offline/cross-device display is required. Store derived non-secret summary, never the Ape key. |
