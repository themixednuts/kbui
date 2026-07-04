# CSS Migration 2b: Board Components

## Scope

- `src/lib/components/board/Keycap.svelte`
- `src/lib/components/board/KeyboardBoard.svelte`
- `src/lib/components/board/KeyboardBoard.stories.svelte`

## Converted CSS

- `Keycap.svelte`: removed the scoped style block and moved the keycap root, face, typography, homing bar, combo marker, layer marker, selected/marked/fall-through/empty/modifier/accent/encoder/lighting/LED-off states, hover lift, and active press styling into Tailwind v4 utilities. The cap shadows use the existing `shadow-*` theme utilities where possible and arbitrary `shadow-[...]` utilities where the old CSS combined source-color inset shadows with token shadows.
- `KeyboardBoard.svelte`: removed the scoped style block and moved the board viewport, grid background, pan/lighting cursors, zoom surface, key plane, combo SVG connector strokes, split seam, split label, responsive viewport padding, and zoom readout styling into Tailwind utilities.
- `KeyboardBoard.stories.svelte`: removed the scoped style block and moved the story wrapper dimensions, border, radius, overflow, and background into utility classes.

## Dynamic Styling Preservation

- `Keycap.svelte` keeps `geometryStyle` as a runtime style binding for absolute key geometry, rotation, `--source-color`, and `--key-lighting`.
- Dynamic per-key source color remains a CSS variable provided by `geometryStyle`; static Tailwind utilities only reference that variable.
- Dynamic lighting color remains runtime-computed through `--key-lighting`; the lighting gradient and inset glow use Tailwind arbitrary utilities that still reference the runtime variable.
- `KeyboardBoard.svelte` keeps `surfaceStyle`, `planeStyle`, split seam `left`, and split label `left`/`top` as runtime style bindings for zoom, pan, board bounds, and split layout.

## Global CSS

No `:global()` rules were retained in these files. The previous cross-component cursor rules for `.board-keycap` are now viewport descendant utilities.

## Verification

- `vp install`: passed.
- `vp check`: passed; 177 files formatted, 245 files lint/type checked.
- `vp run svelte:check`: passed; 0 errors, 0 warnings.
- `vp build`: passed.
- `vp test`: passed; 37 test files, 194 tests. An initial full-suite run hit the existing combo-routing render-budget timing assertion under contention; the isolated test and final full-suite rerun passed.
- `vp run capture`: passed; 8/8 screenshots captured, including `editor-keys.png`, `editor-lighting.png`, and `editor-split.png`.
