# Toolchain Upgrade Report

Date: 2026-07-03

## Version Changes

Baseline command output is saved in `docs/redesign/05-toolchain-before.txt`.

| Package | Before | After | Notes |
| --- | ---: | ---: | --- |
| `@better-auth/drizzle-adapter` | 1.6.9 | 1.6.23 | Updated |
| `@cloudflare/workers-types` | 4.20260505.1 | 5.20260703.1 | Updated major |
| `@internationalized/date` | 3.12.1 | 3.12.2 | Updated |
| `@lucide/svelte` | 1.16.0 | 1.23.0 | Updated |
| `@playwright/test` | 1.59.1 | 1.61.1 | Updated |
| `@storybook/addon-docs` | 10.3.6 | 10.4.6 | Updated |
| `@storybook/addon-svelte-csf` | 5.1.2 | 5.1.2 | Already latest |
| `@storybook/sveltekit` | 10.3.6 | 10.4.6 | Updated |
| `@sveltejs/adapter-auto` | 7.0.1 | 7.0.1 | Already latest |
| `@sveltejs/adapter-cloudflare` | 7.2.8 | 7.2.9 | Updated |
| `@sveltejs/kit` | 2.59.0 | 2.69.1 | Updated |
| `@sveltejs/vite-plugin-svelte` | 7.0.0 | 7.1.2 | Updated |
| `@tailwindcss/vite` | 4.2.4 | 4.3.2 | Updated |
| `@types/node` | 25.6.0 | 26.1.0 | Updated major |
| `agents` | 0.12.3 | 0.17.3 | Updated minor |
| `better-auth` | 1.6.9 | 1.6.23 | Updated |
| `bits-ui` | 2.18.1 | 2.18.1 | Already latest |
| `clsx` | 2.1.1 | 2.1.1 | Already latest |
| `drizzle-kit` | 0.31.10 | 0.31.10 | Already latest |
| `drizzle-orm` | 0.45.2 | 0.45.2 | Already latest |
| `fflate` | 0.8.2 | 0.8.3 | Updated |
| `jose` | 6.2.3 | 6.2.3 | Already latest |
| `mode-watcher` | 1.1.0 | 1.1.0 | Already latest |
| `paneforge` | 1.0.2 | 1.0.2 | Already latest |
| `shadcn-svelte` | 1.2.7 | 1.3.0 | Updated |
| `sqlocal` | 0.18.0 | 0.18.0 | Already latest |
| `storybook` | 10.3.6 | 10.4.6 | Updated |
| `svelte` | 5.55.5 | 5.56.4 | Updated |
| `svelte-check` | 4.4.7 | 4.7.1 | Updated |
| `svelte-sonner` | 1.1.1 | 1.1.1 | Already latest |
| `tailwind-merge` | 3.6.0 | 3.6.0 | Already latest |
| `tailwind-variants` | 3.2.2 | 3.2.2 | Already latest |
| `tailwindcss` | 4.2.4 | 4.3.2 | Updated |
| `tw-animate-css` | 1.4.0 | 1.4.0 | Already latest |
| `typescript` | 6.0.3 | 6.0.3 | Already latest |
| `vite` | `@voidzero-dev/vite-plus-core@0.1.21` | `@voidzero-dev/vite-plus-core@0.2.2` | Vite+ alias preserved |
| `vite-plus` | 0.1.20 | 0.2.2 | Updated after `vp upgrade` and `vp migrate` |
| `vitest` | `@voidzero-dev/vite-plus-test@0.1.21` | `@voidzero-dev/vite-plus-test@0.1.24` | Vite+ test alias preserved |
| `wrangler` | 4.87.0 | 4.107.0 | Updated |

## Guardrail Pins

| Package | Result |
| --- | --- |
| `@livestore/adapter-web` | Kept at `0.4.0-dev.26` |
| `@livestore/livestore` | Kept at `0.4.0-dev.26` |
| `@livestore/svelte` | Kept at `0.4.0-dev.26` |
| `@livestore/sync-cf` | Kept at `0.4.0-dev.26` |
| `effect` | Kept on `^4.0.0-beta.60`, installed `4.0.0-beta.66` |
| `effect-v3` | Kept as `npm:effect@3.21.2` |
| `vite` override | Kept as `npm:@voidzero-dev/vite-plus-core@0.2.2` |
| `vitest` override | Kept as `npm:@voidzero-dev/vite-plus-test@0.1.24` |
| `packageManager` | Kept as `bun@1.3.9` |

`vp outdated` now reports only the intentionally pinned LiveStore packages and the `effect-v3` alias line.

## Migration Changes

- Ran `vp upgrade` to move the global Vite+ CLI from `0.1.18` to `0.2.2`, then ran the Vite+ local toolchain migration described in `node_modules/vite-plus/docs/guide/upgrade.md`.
- Rewrote unit test imports from `vitest` to `vite-plus/test`, matching the local Vite+ migration guidance.
- Restored the `vitest` dependency and override to the Vite+ test alias after `vp migrate` attempted to pin stock `vitest`.
- Added Vite+ `fmt.ignorePatterns` and `lint.ignorePatterns` for `resources/**` and `docs/redesign/**` so checks do not rewrite generated resources or redesign docs owned by other processes.
- Moved shadcn variant exports from Svelte module scripts into adjacent `variants.ts` files for button, badge, tabs, and toggle. This keeps public barrel exports stable while making TypeScript/Vite+ checking resolve the named exports.
- Added the missing shared `WithElementRef` utility type used by the UI components.
- Updated Svelte-facing types for stricter Svelte 5 checking: toggle-group item children snippets, `Chip` style forwarding, key inspector rendered-binding shape, and workbench page snippet registration through closures.
- Fixed stricter lint findings: unused imports/constants, unused SQL tagged-template expressions, an unused combo-route parameter, `new Array(...)` usage, and shim stringification.
- Kept the LiveStore OPFS runtime configuration unchanged, but added a narrow `WebAdapterOptions["storage"]` type bridge because the pinned LiveStore dev preview emits an incompatible encoded type while its own docs still show `storage: { type: 'opfs' }`.
- Replaced the invalid CSS selector `.connect-copy > *:not(::after)` with `.connect-copy > *`; `::after` is not a direct child, so behavior is unchanged and the build optimizer warning is gone.

## Final Checks

| Command | Status | Notes |
| --- | --- | --- |
| `vp install` | Pass | No changes after reinstall |
| `vp check` | Pass | 110 formatted files checked; 173 lint/type files checked |
| `vp run svelte:check` | Pass | 6335 files, 0 errors, 0 warnings |
| `vp build` | Pass | Cloudflare adapter completed; non-failing plugin timing notices only |
