# CSS Migration 2c-i: Editor Inspectors

## Scope

- `src/lib/components/editor/EditorKeyInspector.svelte`
- `src/lib/components/editor/EditorLightingInspector.svelte`

## Converted CSS

- `EditorKeyInspector.svelte`: removed the scoped style block and moved the selected-key hero, cap preview, tab fill behavior, inspector scroll area, keycode input row, quick-pick palette groups, keycode pill hover/active states, workspace logic section spacing, hold-tap grid, notes textarea, source preview, empty state, multi-note state, compact layout, and mobile layout rules into Tailwind v4 utilities.
- `EditorLightingInspector.svelte`: removed the scoped style block and moved the lighting hero, LED preview mixed/off states, paint swatches, swatch hover/active/off states, selection actions, divider, global-effect nav fill behavior, tint row, drag status, compact layout, and mobile layout rules into Tailwind v4 utilities.

## Dynamic Styling Preservation

- `EditorKeyInspector.svelte` keeps runtime `--source-color` bindings for transparent/source layer pills; Tailwind utilities reference the variable for the pill marker.
- `EditorLightingInspector.svelte` keeps runtime `--hero-color` for the LED preview and `--swatch-color` for swatch buttons; Tailwind utilities reference those variables instead of hardcoding dynamic colors.
- Custom button-like elements use important utilities where needed to preserve the old scoped-CSS cascade over the app-wide unlayered `button` reset.

## Global CSS

No `:global()` rules were retained in either target file. The previous segmented-nav child-button sizing and selection-action button sizing are now handled with descendant utilities or direct `class` props.

## Verification

- `vp check`: passed; 177 files formatted, 245 files lint/type checked.
- `vp run svelte:check`: passed; 6002 files, 0 errors, 0 warnings.
- `vp build`: passed.
- `vp test`: passed; 37 test files, 194 tests.
- `vp run capture`: passed; 8/8 screenshots captured, including `editor-keys.png` and `editor-lighting.png`.
