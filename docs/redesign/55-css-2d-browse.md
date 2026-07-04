# CSS Migration 2d: Browse

## Scope

- `src/routes/(app)/browse/+page.svelte`
  - Converted the Browse route shell, header/search, tag filter row, compatibility and official filters, sort controls, result states, responsive card grid, and report dialog from scoped CSS to Tailwind v4 utilities.
  - Removed the scoped `<style>` block.
- `src/lib/components/browse/CommunityKeymapCard.svelte`
  - Converted the community keymap card, mini-keyboard preview, title/Official badge row, author line, note clamp, tags, metric row, liked state, and Preview action from scoped CSS to Tailwind v4 utilities.
  - Removed the scoped `<style>` block.
- `src/lib/components/browse/CommunityPreviewModal.svelte`
  - Converted the preview modal backdrop, modal frame, header, board panel, detail panel, tags, metrics, action feedback, action buttons, responsive layout, and loading/error states from scoped CSS to Tailwind v4 utilities.
  - Removed the scoped `<style>` block.

## Dynamic Styling

- Preserved the mini-preview runtime CSS variables:
  - `--cols` still controls the preview grid column count.
  - `--key-c` still controls each highlighted preview key color.
- The per-key lit styling now uses conditional Tailwind utility classes while keeping the dynamic color value in the existing inline style binding.

## Globals

- No `:global()` rules were retained.
- Former global rules were replaced with direct classes:
  - `preview-action` now receives `justify-self-start`.
  - Preview modal action buttons receive width/centering classes directly.
  - The modal `like-action.liked` state is now a `cn()` conditional.
  - The nested `KeyboardBoard` viewport rule is applied through Tailwind descendant utilities on `community-preview-board`.

## Verification

- `vp install`: passed.
- Killed ports `5173`, `5174`, and `4173` before verification, and again before capture/manual modal preview.
- `vp check`: passed; all 177 files formatted, no warnings/lint/type errors in 245 files.
- `vp run svelte:check`: passed; 6002 files, 0 errors, 0 warnings.
- `vp build`: passed.
- `vp test`: passed; 37 test files, 194 tests.
- `vp run capture`: passed; 8/8 screenshots, including `browse.png`.
- Manual modal spot-check: passed; opened Browse preview modal and verified dialog, Official badge, metrics, and action stack render.

## Visual Notes

- `docs/redesign/screenshots/rebuild/browse.png` shows the Browse grid with visible Official badges, dynamic colored mini-preview cells, real zero metrics, tags, and no compile badge.
