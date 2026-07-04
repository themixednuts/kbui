# CSS Migration 2e: Library

## Scope

- `src/routes/(app)/library/+page.svelte`
  - Converted the Library route shell, two-column `minmax(0,1fr) minmax(300px,340px)` grid, segmented tab header spacing, list rows, selected/hover states, tap-dance mini grid, right-side "Use it" panel, form controls, combo layer/member controls, action buttons, and empty/incomplete-draft states from scoped CSS to Tailwind v4 utilities.
  - Removed the scoped `<style>` block.

## Global Handling

- No `:global()` rules were retained.
- Former card-targeting globals were converted through forwarded classes:
  - `library-card` and `use-card` min-width/overflow/max-width rules now live on `Card.Root` class props.
  - `library-card-header` spacing/responsive alignment now lives on `Card.Header`.
  - `library-card-body` padding and `use-panel` grid/gap now live on `Card.Content`.
  - `wide-action` width/centering now lives on the `Button` class prop.
- Shared app globals such as `.seq`, `.tap-grid`, `.mono`, and `.material-symbols-outlined` remain shared app utilities. Where the old scoped Library CSS overrode them, the route now uses direct Tailwind classes, with important utilities only where needed to preserve the old cascade.

## Verification

- `vp install`: passed.
- Ports `5173`, `5174`, and `4173`: checked/cleared before verification, before build, and before capture; no listeners were present.
- `vp check`: passed; all 177 files correctly formatted, no warnings/lint/type errors in 245 files.
- `vp run svelte:check`: passed; 6002 files, 0 errors, 0 warnings.
- `vp build`: passed.
- `vp test`: first run hit a transient timing-budget failure in `src/lib/keyboard/combo-routing.test.ts` (`636.3ms` vs `<500ms`); immediate rerun passed with 37 test files and 194 tests.
- `vp run capture`: passed; 8/8 screenshots captured, including `library.png`.

## Visual Notes

- `docs/redesign/screenshots/rebuild/library.png` was regenerated and checked. The Library route shows the segmented tabs, two-column layout, selected coral row state, "Use it" panel, form controls, and action buttons after the scoped CSS removal.
