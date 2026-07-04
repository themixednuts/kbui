# Wave 1b Editor Lighting Lens

Wave 1b replaces the `/editor` lighting placeholder with a real lighting lens backed by the engine `LightingProfile` model. The `(workbench)` route group was not modified.

## Swatch To KeyLighting Model

`src/lib/keyboard/lighting-swatches.ts` defines the handoff palette as typed swatches:

- `white`, `coral`, `teal`, `mint`, `lilac`, `mustard`, and `off`.
- Each swatch keeps the design OKLCH display color from `data.js` / `artboards-keymap.jsx`.
- Each swatch also maps to the existing engine `KeyLighting` shape: `{ hue, saturation, brightness }`.

No engine schema changes were made. Applying a swatch writes `KeyLighting` into `profile.lighting.keys[keyId]`, and the board displays it through the existing `keyLightingToCss()` conversion. The OKLCH design color remains the palette-button display color; the applied key display is the engine conversion result.

The `off` swatch is represented as an explicit zero-brightness key override:

```ts
{ hue: 0, saturation: 0, brightness: 0 }
```

This is deliberate. Deleting a key override would fall back to board-wide lighting and would not render the key as off.

The sample keyboard now includes the handoff LED seed pattern so `/editor` is usable without a connected device.

## Editor Store

`src/lib/app/editor-store.svelte.ts` now owns lighting state and mutations:

- Store state: `currentSwatch`, `tintByLayer`, and derived lighting selection summary.
- Global engine state: brightness, speed, and effect are read from and written to `profile.lighting`.
- Selection reuse: the existing editor `selection` set is used for lighting selection.
- Actions: `applySwatchToSelection`, `setKeyLighting`, `clearKeyLighting`, `paintKeys`, `applyLightingDrag`, `selectAllKeys`, `setBrightness`, `setSpeed`, `setEffect`, and `toggleTintByLayer`.

Dirty tracking continues to flow through `diffProfiles(baseProfile, profile)`. Per-key lighting writes and global brightness/speed/effect changes are recorded as lighting changes and persist through the existing SQLocal draft path. `tintByLayer` is held in store state because the engine schema has no field for it yet.

## Inspector And Board Wiring

`src/lib/components/editor/EditorLightingInspector.svelte` implements the lighting inspector:

- Hero state for custom, mixed, off, or empty selections.
- OKLCH swatch palette plus off.
- Selection count, Select all, and Clear actions.
- Brightness and speed sliders using `SliderField`.
- Global effect segmented control using `SegmentedNav`.
- Tint by active layer switch using the shared `Switch` primitive.

`src/routes/(app)/editor/+page.svelte` now renders `KeyboardBoard` with `lens="lighting"` and wires `onLightingDrag` into the editor store. The right inspector column, and split-board dock, render `EditorLightingInspector` when the active lens is `lighting`. `LightingComingSoon.svelte` is no longer used.

## Paint Scope Decision

I followed `artboards-keymap.jsx`: drag is multi-select, not key/row/all paint scope.

The old `paintScope` idea is not rebuilt in Wave 1b. Users drag to create or adjust the selection, then click a swatch to paint all selected keys. Shift-drag adds, Ctrl/Meta toggles, and empty-space click clears via the board drag modes. This matches the handoff reducer's `SEL_*` path rather than reviving the older key/row/all scope controls.

## Reuse

The implementation reuses the existing RGB/keymap pieces where they fit:

- `KeyboardBoard.svelte` lighting lens and drag-select surface.
- `keyLightingToCss()` from `board-view-model.ts`.
- The old `KeymapRgbPanel` selection model concept, but restyled into the new inspector instead of reusing its hue/saturation/layer-tabs UI.
- Shared UI primitives: `SliderField`, `SegmentedNav`, `Button`, `Chip`, and `Switch`.

## Verification

Commands run with the Vite+ `vp` CLI:

| Command | Result |
| --- | --- |
| `vp install` | Passed; install completed and `svelte-kit sync` ran |
| `vp check --fix` | Passed; formatted new files and found no warnings, lint errors, or type errors |
| `vp check` | Passed: 111 files formatted, 189 files with no warnings/lint/type errors |
| `vp run svelte:check` | Passed: 5982 files, 0 errors, 0 warnings |
| `vp build` | Passed; Vite/Rolldown emitted plugin timing warnings only |
| `vp test` | Passed: 14 test files, 81 tests |

Focused preflight tests also passed for `lighting-swatches`, `editor-store`, and `board-view-model`: 3 files, 15 tests.

No git commit was created.
