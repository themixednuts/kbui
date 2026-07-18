# Wave 0c Board Renderer

Wave 0c adds a new reusable board renderer under `src/lib/components/board/`. It is additive: the existing inline renderer in `src/routes/(workbench)/+layout.svelte` remains untouched.

## Files

- `coords.ts`: adapter between handoff `"r,c"` coordinates and stable engine `KeyboardKey.id` values.
- `board-view-model.ts`: pure engine-backed render model builder.
- `board-flow.ts`: converts rendered keys and routed combo segments into typed Svelte Flow nodes and edges.
- `BoardKeyNode.svelte`: custom Svelte Flow node that preserves the existing keycap UI.
- `BoardComboEdge.svelte`: custom Svelte Flow edge that preserves the existing routed combo line.
- `Keycap.svelte`: one visual keycap with marker snippets; it can be positioned directly or fill a flow-managed node.
- `KeyboardBoard.svelte`: responsive Svelte Flow board surface with zoom, pan, combo routes, split seam, and lighting drag-select.
- `KeyboardBoard.stories.svelte`: Storybook visual fixtures for keys, lighting, and split layouts.
- `index.ts`: import surface for Wave 1.

## Component API

`KeyboardBoard.svelte` props:

- `profile: DeviceProfile`
- `activeLayer?: string`
- `lens?: "keys" | "lighting"`
- `selection?: Iterable<string>`: selected `KeyboardKey.id` values.
- `marked?: Iterable<string>`: secondary marks, useful for combo picking.
- `showFallthrough?: boolean`
- `zoom = $bindable(1)`
- `pan = $bindable({ x: 0, y: 0 })`
- `split?: boolean | "auto"`
- `class?: string`
- `comboMarker?: Snippet<[BoardKeyViewModel]>`
- `layerMarker?: Snippet<[BoardKeyViewModel]>`

Callbacks:

- `onSelectKey(id)`
- `onToggleKey(id)`
- `onClearSelection()`
- `onLightingDrag(ids, mode)` where mode is `"select" | "add" | "toggle" | "clear"`
- `onHoverKey(id | null)`

`Keycap.svelte` accepts a `BoardKeyViewModel`, the active lens, the same marker snippets, and key-level pointer/click callbacks. Default marker rendering is provided when snippets are omitted. `KeyboardBoard` uses it through `BoardKeyNode`; the `flowManaged` prop removes only absolute positioning, leaving the visual component unchanged.

The board viewport is measured with a Svelte 5 `{@attach}` attachment. Svelte Flow's internal viewport stays locked at `0,0,1`; the existing outer board surface continues to own zoom and middle-button pan, so adopting flow nodes does not change editor controls.

## Coordinate Conversion

The handoff prototype uses coordinate strings like `"2,4"`. The engine uses stable ids like `k2-4` plus `row` and `col`. `coords.ts` keeps that gap explicit:

- `coordFromRowCol(row, col)` and `coordForKey(key)` produce `"r,c"`.
- `parseDesignCoord(coord)` validates and parses the handoff form.
- `keyIdForCoord(keys, coord)` and `coordForKeyId(keys, id)` bridge to stable ids.
- Batch helpers skip unknown entries.
- If duplicate matrix coordinates exist, coordinate lookup returns the first key while id lookup remains available for every key.

## View Model

`createBoardViewModel(input)` is pure and has no Svelte/DOM dependency. It returns rows, positioned keys, bounds, combo connectors, and split metadata.

Behavior preserved from the inline renderer:

- Active-layer `KC_TRNS` keys resolve to the base layer when `showFallthrough` is true.
- Fall-through keys carry source-layer metadata for the cap corner.
- Combo markers and routed paths are derived from active-layer-visible combos, then represented as real Svelte Flow edges between key nodes.
- Layer activation markers include chain-risk styling metadata.
- Direct layer actions use the action (`MO`, `TG`, and so on) as the key label while the marker owns the target (`L1`), avoiding duplicate target labels.
- Non-positioned engine layouts are converted to key-unit geometry by row flow, so wide keys do not overlap.
- Positioned VIA/KLE layouts keep their `x`, `y`, `width`, `height`, and rotation.

## Lighting Conversion

No schema changes were made. The engine `KeyLighting` model remains HSB-like:

```ts
{ hue: number, saturation: number, brightness: number }
```

For display, `keyLightingToCss()` converts it to OKLCH:

- `lightness = 0.52 + (brightness / 100) * 0.28`
- `chroma = (saturation / 100) * 0.2`
- `hue = hue normalized into 0..360`
- `brightness <= 0` returns `null`, rendered as LED off.
- Missing per-key lighting falls back to the profile-wide lighting values.

## Reused Engine Helpers

- `comboAppliesToLayer`, `comboChordLabels`, `comboMarkerText`
- `routeComboConnectors`
- `layerActivationsForLayer`, `layerActivationsByKey`
- `layerActivationMarkerText`, `layerActivationSummary`
- `normalizeQmkKeycode`, `qmkKeycodeLabel`
- `isSplitKeyboard`

## Stories

Run:

```powershell
vp run storybook
```

Open `Board/KeyboardBoard`:

- `Keys Lens`: sample engine keyboard, selected combo key, marked combo mate, combo connector, and layer marker.
- `Lighting Lens`: sample engine keyboard with OKLCH display colors and one zero-brightness off key.
- `Split Layout`: engine-schema split fixture with seam label and routed combo.

Use the handoff screenshots as visual references:

- `resources/kbgui-handoff/kbgui/project/screenshots/keymap.png`
- `resources/kbgui-handoff/kbgui/project/screenshots/lighting-final.png`
- `resources/kbgui-handoff/kbgui/project/screenshots/split.png`

## Check Results

- `vp install`: passed.
- `vp check`: passed; all 106 files formatted, no warnings/lint/type errors in 172 files.
- `vp run svelte:check`: passed; 5958 files, 0 errors, 0 warnings.
- `vp build`: passed. Vite/Rolldown emitted plugin timing warnings only.
- `vp test`: passed; 12 test files, 73 tests.
