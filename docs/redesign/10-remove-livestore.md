# Wave 0a: Remove LiveStore and Effect Shims

## Outcome

Wave 0a is complete: active app code, config, and lockfile are strict Effect v4 with LiveStore removed.

`effect` remains declared as `^4.0.0-beta.60`; the installed package is `effect@4.0.0-beta.66`. `effect-v3` is no longer a dependency, `node_modules/effect-v3` is absent, and active source/config/lock/script sweeps find no `effect-v3`, `effect/ParseResult`, `effect/RuntimeFlags`, `catchCauseCompat`, or `catchCompat` references.

I left `docs/redesign/07-rebuild-plan.md` and `docs/redesign/08-effect-deshim.md` untouched as requested. Those historical docs still describe prior decisions, but they are not active runtime/toolchain references.

## Removed Dependencies

- Removed with `vp remove`: `@livestore/adapter-web`, `@livestore/livestore`, `@livestore/svelte`, `@livestore/sync-cf`, `effect-v3`.
- Removed as LiveStore sync auth fallout: `jose`.
- Kept: `effect`, `vite` alias to `@voidzero-dev/vite-plus-core@0.2.2`, `vitest` alias to `@voidzero-dev/vite-plus-test@0.1.24`.

## Removed Files

- `src/lib/livestore/client.ts`
- `src/lib/livestore/livestore.worker.ts`
- `src/lib/livestore/schema.ts`
- `src/lib/livestore/store-id.ts`
- `src/agents/livestore-sync.ts`
- `src/routes/api/livestore/+server.ts`
- `src/routes/api/livestore/+server.ts.bak`
- `src/routes/api/livestore/+server.ts.saved`
- `src/lib/effect/compat.ts`
- `src/lib/shims/effect-parse-result.ts`
- `src/lib/shims/effect-runtime-flags.ts`
- `scripts/generate-wrangler-effect-aliases.mjs`

## Config Changes

- `svelte.config.js`: removed the `LiveStoreSyncDO` agent export.
- `wrangler.toml`: removed the `LiveStoreSyncDO` Durable Object binding, its `v3` SQLite migration, and the generated `[alias]` block mapping `effect` to `effect-v3`.
- `src/cloudflare.d.ts`: removed `LiveStoreSyncDO` from generated/handwritten Cloudflare env types.
- `vite.config.ts`: removed LiveStore externals, `cloudflare:*` externals, Effect shim aliases, `ssr.noExternal`, the `worker:aliases` task, and the alias generator from `dev:worker`.
- `package.json` / `bun.lock`: removed LiveStore packages, `effect-v3`, and `jose`.

The `cloudflare:*` externals were removed because active source no longer imports `cloudflare:` after the LiveStore sync route was deleted.

## Effect v4 Rewrite

- `src/hooks.server.ts`: replaced the Effect wrapper around AuthAgent session fetch with plain `try`/`catch`.
- `src/routes/api/auth/[...all]/+server.ts`: replaced the Effect wrapper around AuthAgent forwarding with plain `try`/`catch`.
- `src/lib/app/runtime.ts`: replaced the compat helper with `Effect.catchCause`.
- `src/lib/keyboard/transport.ts`: replaced the compat helper with `Effect.catch`.
- `src/routes/(workbench)/+layout.svelte`: replaced the compat helper with `Effect.catchCause`.

Note: the installed Effect v4 beta exposes `Effect.catch` / `Effect.catchCause`; it does not expose `Effect.catchAll` / `Effect.catchAllCause`. The rewrite uses the actual v4 beta API and keeps the repo shim-free.

## AuthAgent JWT Plugin

The JWT plugin existed only to authorize LiveStore sync via `/api/auth/token` and `/api/auth/jwks`. With LiveStore removed, I removed:

- `better-auth/plugins/jwt` import and `plugins: [jwt(...)]` wiring from `src/agents/auth-agent.ts`.
- The `jwks` SQL table creation from `AuthAgent.ensureAuthTables`.
- The `jwks` Drizzle schema export from `src/lib/server/auth/schema.ts`.
- The direct `jose` dependency used by the deleted LiveStore sync route.

The normal better-auth session/cookie flow remains in place.

## App Boot and Persistence

The root app shell has no LiveStore provider or worker initialization. The app boots through the normal SvelteKit layout and persists local keyboard state through SQLocal:

- SQLocal entry point: `src/lib/keyboard/local-store.ts`
- OPFS database path: `keeb-workbench.sqlite3`
- Tables: `local_profiles`, `local_profile_drafts`, `local_forks`, `sync_log`
- Workbench usage: `src/routes/(workbench)/+layout.svelte` loads and saves through `loadLocal*Effect`, `saveLocal*Effect`, `clearLocal*Effect`, and `recordSyncEffect`.

LiveStore cross-device sync is dropped for now. Local browser persistence remains on SQLocal.

## Vite+ Test Runner Fix

`vp test` initially failed because the required `vitest` alias points to `@voidzero-dev/vite-plus-test@0.1.24`, whose package metadata has no `bin.vitest`. After adding that metadata, `vp test` then loaded a stale nested `@voidzero-dev/vite-plus-core@0.1.24` under the aliased package while the app is on Vite+ core `0.2.2`.

Minimal toolchain fix:

- Added `scripts/patch-vite-plus-test-bin.mjs`.
- Added `postinstall` to run that script after `vp install`.
- The script only patches the aliased `node_modules/vitest` package when it is `@voidzero-dev/vite-plus-test`: it adds `bin.vitest = "./vitest.mjs"` and removes the stale nested core folder so Node resolves to the project's `@voidzero-dev/vite-plus-core@0.2.2`.

This keeps the requested Vite+ aliases and is a toolchain resolution fix, not an Effect shim.

## Verification

| Command | Result |
| --- | --- |
| `vp install` | Passed. Checked/installed dependencies, ran `scripts/patch-vite-plus-test-bin.mjs`, then `svelte-kit sync`. |
| `vp check` | Passed. 101 formatted files; 164 files with no warnings, lint errors, or type errors. |
| `vp run svelte:check` | Passed. 5950 files, 0 errors, 0 warnings. |
| `vp build` | Passed. Cloudflare adapter completed; only plugin timing warnings were emitted. |
| `vp test` | Passed. 10 test files, 60 tests. |
