# Wave 0d App Shell

## Route Structure

Wave 0d adds a new SvelteKit route group at `src/routes/(app)/`. Route groups do not affect public URLs, so the new destinations are:

| URL | File |
| --- | --- |
| `/connect` | `src/routes/(app)/connect/+page.svelte` |
| `/editor` | `src/routes/(app)/editor/+page.svelte` |
| `/browse` | `src/routes/(app)/browse/+page.svelte` |
| `/library` | `src/routes/(app)/library/+page.svelte` |
| `/versions` | `src/routes/(app)/versions/+page.svelte` |
| `/settings` | `src/routes/(app)/settings/+page.svelte` |

`src/routes/(app)/+layout.svelte` owns the new application shell. The root layout remains the global wrapper for favicon, `app.css`, and the Sonner `Toaster`.

`src/routes/+page.ts` now redirects `/` to `/editor`. Legacy `?view=` handling is unchanged, so those URLs still resolve to the old workbench paths.

The old `(workbench)` group remains intact in the filesystem and is still emitted by `vp build`. `/editor` opens the new shell route. A local HTTP probe of `/keymap` returned a 500 from the pre-existing workbench snippet registrar (`invalid_snippet_arguments` in dev, `Cannot read properties of undefined (reading 'push')` in preview), so the route file remains present but the old reference route is not currently browser-reachable without touching the forbidden `(workbench)` code.

## Shell Components

The new shell layout includes:

- Persistent left rail with `Brand`, destination links, active route styling from `$app/state` `page.url.pathname`, account/profile footer, and device status footer.
- Top appbar with route title, connected board chip, current variant chip, optional Monkeytype WPM chip, dirty save-point action, and Connect/Flash primary action.
- Profile popover with GitHub identity, Monkeytype stats, and sign-out action when signed in.
- Empty placement-banner, overlay, and flash-overlay host nodes for later waves.

The editor skeleton additionally embeds `KeyboardBoard` from `$lib/components/board` using `sampleKeyboard` as a live preview. The other destination pages render the required placeholder cards.

## Shell Store

`src/lib/app/shell-store.svelte.ts` defines a small rune-backed `ShellStore`:

- `navItems`: typed app navigation metadata for the six new destinations.
- `device`: placeholder connected board state (`Workbench 65`, `QMK`, `VIA v3`).
- `currentVariant`: placeholder variant metadata, colored with `var(--coral)` so accent overrides re-theme the shell.
- `dirty`: placeholder dirty count used to gate the save-point button.
- `monkeytype`: placeholder Monkeytype stats.
- `account`: loading/signed-in/signed-out/error profile state.
- `profileOpen`: profile popover state.
- `placeMode`: future placement banner state.

It also exports `routeIdFromPath()` and `routeTitleFromPath()` for shell route chrome.

## Primitive Reuse

Reused primitives:

- `Brand.svelte` for the left-rail brand.
- `AvatarButton.svelte` for the account footer avatar trigger.
- `Button.svelte` for profile actions and appbar actions.
- `Chip.svelte` for board, variant, and Monkeytype appbar chips.
- `card/*` primitives for route placeholder cards.
- `KeyboardBoard.svelte` for the editor preview.

New shell-specific pieces:

- The vertical left-rail navigation and active-state styling.
- The appbar composition.
- The account/footer strip and profile popover.
- Empty shell overlay and placement-banner host nodes.

`SegmentedNav.svelte` was not reused in Wave 0d because this shell uses vertical route navigation, not a segmented control.

## Profile Auth

The shell imports `authClient` from `$lib/auth-client` and calls `authClient.getSession()` in a browser-only `$effect`. When a session exists, the popover renders the session user name, avatar image when present, a derived login label, placeholder Monkeytype stats, and a sign-out button.

When there is no session or auth is unavailable, the shell falls back to a local draft account state and renders a disabled GitHub sign-in action. Full sign-in and Monkeytype wiring remain scoped to Wave 3.

## Verification

Commands run with the Vite+ `vp` CLI:

| Command | Result |
| --- | --- |
| `vp install` | Passed |
| `vp check` | Passed: 107 files formatted, 180 files with no warnings/lint/type errors |
| `vp run svelte:check` | Passed: 0 errors, 0 warnings |
| `vp build` | Passed; Vite/Rolldown emitted plugin timing warnings only |
| `vp test` | Passed: 12 files, 73 tests |

Local route probes:

| URL | Result |
| --- | --- |
| `http://127.0.0.1:5173/editor` | HTTP 200 |
| `http://127.0.0.1:5173/keymap` | HTTP 500 from untouched old workbench snippet rendering |

No git commit was created.
