# Legacy Retirement

## Grep-First Findings

Scoped search over the surviving app paths found two real `$lib/workbench/` imports before deletion:

| File | Finding |
| --- | --- |
| `src/lib/components/keymap/KeyBindInspector.svelte:5` | `InspectorTab` imported from `$lib/workbench/url-search` |
| `src/lib/components/logic/LogicBuilder.svelte:10` | `LogicTab` imported from `$lib/workbench/url-search` |

Both components were referenced only by the deleted `(workbench)` route group, so no legacy workbench module was moved into the surviving app. The same scoped search also matched `src/routes/(app)/+layout.svelte:46` on `setWorkbenchContext(workbench);`; that is the rebuilt app store context, not the old route group or `src/lib/workbench`.

The only `/trace` link was inside `src/routes/(workbench)/+layout.svelte`, so `src/routes/trace/` was deleted with the legacy reference surface. Post-delete fixed-string searches for `$lib/workbench/`, `src/lib/workbench`, `src/routes/(workbench)`, and `src/routes/trace` found no surviving legacy imports or route references. The benign `setWorkbenchContext(workbench)` string remains because the new store is still named workbench.

## Deleted Files

Deletion counts below are from `git diff --numstat`.

| File | Deleted lines |
| --- | ---: |
| `src/routes/(workbench)/+layout.svelte` | 3492 |
| `src/routes/(workbench)/+layout.ts` | 7 |
| `src/routes/(workbench)/firmware/+page.svelte` | 7 |
| `src/routes/(workbench)/keymap/+page.svelte` | 7 |
| `src/routes/(workbench)/lighting/+page.svelte` | 7 |
| `src/routes/(workbench)/lighting/+page.ts` | 9 |
| `src/routes/(workbench)/logic/+page.svelte` | 7 |
| `src/routes/(workbench)/versioning/+page.svelte` | 7 |
| `src/lib/workbench/WorkbenchPagesRegistrar.svelte` | 16 |
| `src/lib/workbench/context-store.ts` | 13 |
| `src/lib/workbench/context.ts` | 16 |
| `src/lib/workbench/routes.ts` | 22 |
| `src/lib/workbench/url-search.ts` | 93 |
| `src/lib/workbench/workbench-store.svelte.ts` | 38 |
| `src/routes/trace/+page.svelte` | 4816 |
| `tests/e2e/workbench.spec.ts` | 196 |
| `tests/e2e/fixtures/mock-hid.ts` | 121 |
| `src/lib/components/keymap/KeyBindInspector.svelte` | 498 |
| `src/lib/components/keymap/KeymapRgbPanel.svelte` | 197 |
| `src/lib/components/keymap/keymap-rgb-selection.svelte.ts` | 35 |
| `src/lib/components/logic/LogicBuilder.svelte` | 449 |
| `src/lib/components/settings/SettingsDrawer.svelte` | 177 |

Total deleted-file removal: 10,230 lines.

## Redirect Cleanup

`src/routes/+page.ts` now only redirects `/` to `/editor`. The retired `LEGACY_VIEWS` handling for `?view=keymap`, `?view=logic`, `?view=lighting`, `?view=versioning`, and `?view=firmware` was removed because those old filesystem routes no longer exist.

## Moves And Config

No files were moved out of `src/lib/workbench/`. The surviving app did not depend on any old workbench module after old-only components were removed.

No config changes were required in `svelte.config.js`, `wrangler.toml`, or `vite.config.ts`. The surviving Cloudflare agents and bindings remain intact: `AuthAgent`, `UserWorkbenchAgent`, `CommunityAgent`, and `TypingRunsAgent`.

## Verification

Commands run with the Vite+ `vp` CLI:

| Command | Result |
| --- | --- |
| `vp install` | Passed |
| `vp check` | Passed: 172 files formatted, 240 files lint/type checked |
| `vp run svelte:check` | Passed: 0 errors, 0 warnings |
| `vp build` | Passed |
| `vp test` | Passed: 35 files, 173 tests |
| `vp run capture` | Passed: 8/8 captures |

Capture covered `/editor`, `/editor` lighting, `/editor?board=split`, `/connect`, `/library`, `/versions`, `/settings`, and `/browse`. A post-capture check of port `4173` returned no active listener, so the Playwright preview server exited cleanly.
