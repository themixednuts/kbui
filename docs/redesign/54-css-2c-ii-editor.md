# CSS Migration 2c-ii: Editor Layout and Layer Logic

## Scope

- `src/routes/(app)/editor/+page.svelte`
- `src/lib/components/editor/EditorLayerStack.svelte`
- `src/lib/components/editor/ActiveStackCard.svelte`
- `src/lib/components/keymap/KeyBindingLogicPicker.svelte`

## Converted CSS

- `+page.svelte`: removed the scoped style block and moved the editor route shell, toolbar wrapping, live-sync notices, starter-board switcher opacity, board stage frame, lighting hint, split-mode board viewport overrides, split inspector dock, and key-inspector descendant overrides into Tailwind v4 utilities.
- `EditorLayerStack.svelte`: removed the scoped style block and moved the layer stack layout, layer-chip base/hover/active states, layer dot styling, add-layer sizing, and mobile stacking behavior into Tailwind v4 utilities.
- `ActiveStackCard.svelte`: removed the scoped style block and moved the active stack card frame, header layout, metadata typography, chip row, inherit note, and mobile layout into Tailwind v4 utilities.
- `KeyBindingLogicPicker.svelte`: removed the scoped style block and moved the empty state, logic list, bindable/static rows, active row state, row typography, and footnote into Tailwind v4 utilities.

## Dynamic Styling Preservation

- `EditorLayerStack.svelte` still binds each layer dot background from `layer.color`.
- `ActiveStackCard.svelte` still passes each runtime `layer.color` through the `Chip` dot prop.
- `+page.svelte` still keeps runtime board zoom/pan bindings and the lighting selection dot color derived from `keyLightingToCss`.
- Button-like migrated rows use important Tailwind utilities where needed so the app-wide unlayered `button` reset does not override the old scoped button colors, borders, and backgrounds.

## Global CSS

No `:global()` rules were retained in these target files. Reachable child-component overrides are now handled through forwarded `class` props or route-level Tailwind arbitrary descendant variants.

## Verification

- `vp check`: passed; 177 files formatted, 245 files lint/type checked.
- `vp run svelte:check`: passed; 6002 files, 0 errors, 0 warnings.
- `vp build`: passed.
- `vp test`: passed; 37 test files, 194 tests.
- `vp run capture`: passed; 8/8 screenshots captured, including `editor-keys.png` and `editor-split.png`.
