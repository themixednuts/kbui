# Wave 1c Editor Split Layout

Wave 1c adds the compact split-board editor path for `/editor`. The `(workbench)` route group was not modified.

## Split Detection And Layout

The editor continues to derive board render state through `createBoardViewModel()`. Split mode is enabled from the board model's `split.enabled`, which is backed by the existing split signals in `board-view-model.ts`: positioned row gaps, `settings.splitTransport`, and `isSplitKeyboard()`.

When `split.enabled` is true, `/editor` switches from the right-side `KeyInspectorPanel` composition to a two-row route layout:

- Top row: the existing toolbar and `KeyboardBoard`.
- Bottom row: a compact inspector dock.

The split branch suppresses the non-split under-board active-stack card and lighting hint so the board stage stays shallow. `KeyboardBoard` remains the only board renderer; it renders the positioned split halves, seam line, and seam label from the existing board split metadata.

## Bottom Dock Inspector

The bottom dock reuses the Wave 1a/1b inspector components:

- `EditorKeyInspector.svelte` for keys.
- `EditorLightingInspector.svelte` for lighting.

Both inspectors keep their side-panel layout for non-split boards. Their existing `compact` mode now lays out the same editing controls horizontally for the split dock:

- Keys: key hero, inspector tabs, keycode picker/input, hold-tap controls, notes/source, reset, and clear.
- Lighting: selection hero, swatches, select-all/clear, brightness, effect, speed, tint, and selection status.

Selection, key binding edits, hold-tap edits, notes, lighting drag selection, swatch paint, and global lighting controls all continue to call the same `EditorStore` actions in both split and non-split modes.

## Split Demo Board

The split Storybook fixture was moved into `src/lib/keyboard/sample-boards.ts` as `splitDemoKeyboard`. The module also exports the default `sampleKeyboard` under `sampleBoards.default`.

`/editor` has a temporary board selector in the editor header:

- `Workbench` uses the existing default sample board.
- `Split demo` navigates to `/editor?board=split`.

This is intentionally temporary until the Connect flow owns real board selection. Editor local drafts are now loaded by active profile id, so a default-board draft cannot replace the split demo profile.

## Reuse

Reused directly:

- `KeyboardBoard.svelte` split rendering, zoom/pan, key selection, and lighting drag handling.
- `board-view-model.ts` split detection and seam metadata.
- `EditorStore` key and lighting mutations.
- `EditorKeyInspector.svelte` and `EditorLightingInspector.svelte`.
- Shared UI primitives: `SegmentedNav`, `Button`, `Chip`, `SliderField`, and `Switch`.

Removed:

- `src/lib/components/editor/LightingComingSoon.svelte`, which was unused after Wave 1b.

## Verification

Commands run with the Vite+ `vp` CLI:

| Command | Result |
| --- | --- |
| `vp install` | Passed; installed packages and ran `svelte-kit sync` |
| `vp check` | Passed; 112 files formatted, 189 files with no warnings/lint/type errors |
| `vp run svelte:check` | Passed; 5982 files, 0 errors, 0 warnings |
| `vp build` | Passed; Vite/Rolldown plugin timing warnings only |
| `vp test` | Passed; 14 test files, 81 tests |

No `vp dev` or `vp preview` server was started.
