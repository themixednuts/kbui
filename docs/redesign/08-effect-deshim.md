# Wave 0a Effect De-Shim

## Decision

Chose option 3: align the whole app on Effect v3.

NPM metadata showed `@livestore/livestore` has `latest = 0.4.0` and `dev = 0.4.0-dev.27`, but both `0.4.0` and `0.4.0-dev.27` still peer on `effect: ^3.21.2`. The LiveStore release page also shows `v0.4.0` as the latest stable release and `v0.4.0-dev.27` as the newest dev release. No 0.4.x/0.5.x release with Effect v4 support was available.

I kept the existing `@livestore/*` pins at `0.4.0-dev.26` because moving to stable `0.4.0` would be an additional LiveStore API upgrade while still remaining on Effect v3. The lower-risk clean break was to make the app's real `effect` dependency match LiveStore's peer line and remove the dual-version bridge.

Sources:

- NPM metadata via `vp info @livestore/livestore version`, `dist-tags`, and peer dependency checks.
- LiveStore releases: https://github.com/livestorejs/livestore/releases
- LiveStore changelog: https://docs.livestore.dev/changelog/

## Final Versions

- `effect`: `3.21.2`
- `@livestore/adapter-web`: `0.4.0-dev.26`
- `@livestore/livestore`: `0.4.0-dev.26`
- `@livestore/svelte`: `0.4.0-dev.26`
- `@livestore/sync-cf`: `0.4.0-dev.26`
- `vitest`: `4.1.9` real package pin, replacing the stale `@voidzero-dev/vite-plus-test` alias so `vp test` can resolve the Vitest bin.

## Removed

- Deleted `src/lib/effect/compat.ts`.
- Deleted `src/lib/shims/effect-parse-result.ts`.
- Deleted `src/lib/shims/effect-runtime-flags.ts`.
- Deleted `scripts/generate-wrangler-effect-aliases.mjs`.
- Removed `effect-v3` from `package.json` and `bun.lock`.
- Removed the `effect` override that forced Effect v4 beta.
- Removed Vite `resolve.alias` entries for `effect/ParseResult` and `effect/RuntimeFlags`.
- Removed `ssr.noExternal: [/^@livestore\//]`; `vp build` passes without it, so it was only needed for the removed alias bridge.
- Removed the generated `[alias]` block in `wrangler.toml` that mapped `effect` and subpaths to `node_modules/effect-v3`.
- Removed the Vite+ `worker:aliases` task and dropped the alias generator from `dev:worker`.

## Rewritten Call Sites

- `src/hooks.server.ts`: replaced the `Effect.tryPromise(...).pipe(catchCauseCompat(...))` session lookup with plain `try`/`catch`.
- `src/routes/api/auth/[...all]/+server.ts`: replaced the auth forwarding Effect wrapper with plain `try`/`catch`.
- `src/lib/app/runtime.ts`: replaced `catchCauseCompat` with `Effect.catchAllCause`.
- `src/lib/keyboard/transport.ts`: replaced `catchCompat` with `Effect.catchAll`.
- `src/routes/(workbench)/+layout.svelte`: replaced `catchCauseCompat` with `Effect.catchAllCause` so the old workbench continues compiling.

## Type Bridges

No type-only Effect/LiveStore bridge remains.

`src/lib/livestore/client.ts` now passes `storage: { type: "opfs" }` directly to `makePersistedAdapter`. The previous `WebAdapterOptions["storage"]` cast was only needed while the project mixed Effect v4 app types with LiveStore's Effect v3 surface.

## Verification

- `vp install`: pass. Final run checked 580 installs across 815 packages with no changes.
- `vp check`: pass. 106 files formatted; no warnings, lint errors, or type errors in 169 files.
- `vp run svelte:check`: pass. 0 errors, 0 warnings.
- `vp build`: pass. Build also confirmed `ssr.noExternal` is no longer required.
- `vp test`: pass. 10 test files passed, 60 tests passed.
