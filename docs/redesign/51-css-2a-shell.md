# CSS Migration 2a: App Shell

## Scope

Converted all scoped CSS in `src/routes/(app)/+layout.svelte` to Tailwind v4 utility classes and removed the file's `<style>` block.

Converted shell areas:

- Root app shell grid, background wash, text color, and responsive rail widths.
- Left rail, brand slot, navigation layout, active/hover nav states, icons, labels, and connected check mark.
- Profile popover, GitHub identity rows, dividers, profile link, auth hint, Monkeytype block, stats, error/stale states, and action sizing.
- Footer account strip open/hover states, avatar copy/caret controls, and device status/dot states.
- Top appbar, route title, board/live-sync/variant/Monkeytype chips, starter badge, spacer, and primary action area.
- Placement banner, shell content scroller, overlay host, and flash overlay host.
- Existing responsive behavior at `900px` and `560px`.

## Global CSS

No `:global()` rules remain in the file.

Former global reach-throughs were converted directly:

- `:global(.monkeytype-action)` and `:global(.monkeytype-connect)` became `w-full justify-center` classes passed to the existing `Button` wrapper.
- `.appbar :global([data-slot="badge"])` became `class={appbarChipClass}` on the appbar `Chip` instances, preserving the `max-width: 145px` rule at `max-width: 560px`.

## Shadcn Primitives

No primitive swap was made. The shell already uses the local `Button`, `Chip`, `AvatarButton`, and `Brand` wrappers, and swapping primitives would have increased visual-risk for a mechanical migration.

## Verification

- `vp install`: pass.
- Ports `5173`, `5174`, and `4173`: cleared before verification and again before capture.
- `vp check`: pass; all 177 files formatted, no warnings, lint errors, or type errors in 245 files.
- `vp run svelte:check`: pass; 6002 files, 0 errors, 0 warnings.
- `vp build`: pass.
- `vp test`: pass; 37 files, 194 tests.
- `vp run capture`: pass; 8/8 screenshots captured.

Capture output checked in `docs/redesign/screenshots/rebuild/`; the shared shell chrome renders correctly across the generated app screens, including active rail state, topbar starter badge/chips, Connect action, and footer Local draft/No device states.
