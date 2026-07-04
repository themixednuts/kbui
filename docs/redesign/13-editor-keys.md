# Wave 1a Editor Keys Lens

## Route

Wave 1a replaces the placeholder `/editor` route with a real keys-lens editor in `src/routes/(app)/editor/+page.svelte`.

The route now owns the editor workspace composition:

- Lens selector for `keys` and `lighting` with `SegmentedNav`.
- Layer rail and active-stack summary around the current layer.
- Reused board renderer from `$lib/components/board/KeyboardBoard.svelte`.
- Right-side inspector with empty, single-selection, and multi-selection states.
- A lighting placeholder panel that leaves the route structure ready for Wave 1b.
- Shell appbar state updates for the active board, variant, and dirty count.

The old `(workbench)` route group was used only as a source reference and was not modified.

## Editor Store

`src/lib/app/editor-store.svelte.ts` defines the rune-backed editor state and pure mutation helpers used by tests.

Store state:

- `baseProfile`: immutable comparison profile, initialized from the sample keyboard.
- `profile`: editable local `DeviceProfile`, initialized from a SQLocal draft when available, otherwise from the sample keyboard.
- `activeLayer`: current layer id.
- `lens`: `keys` or `lighting`, defaulting to `keys`.
- `selection`: selected keyboard key ids.
- `targetOs`: OS-aware label target.
- `showFallthrough`: board render toggle for inherited bindings.
- `inspectorTab`: current inspector tab.
- `hydrated` and `persistenceError`: local persistence status.

Derived state:

- Active layer record and inherited layer stack.
- Primary selected key, rendered binding, QMK snippet, selected code summary, logic bindings, and diff stats.
- `dirty`, computed from `diffDeviceProfile(baseProfile, profile)`.

Actions:

- Selection: `selectKey`, `toggleKey`, `clearSelection`.
- Navigation/settings: `setLayer`, `addLayer`, `setLens`, `setTargetOs`, `cycleTargetOs`, `setShowFallthrough`, `toggleFallthrough`, `setInspectorTab`.
- Binding edits: `applyBindingToSelection`, `applyKeycode`, `clearBindingOnSelection`, `resetSelectionToBase`.
- Behavior edits: `applyHoldTapToSelection`, `setNotesForPrimaryKey`, `setTappingTerm`, `bindLogicOption`.
- Persistence: `flushPersistence`.

The pure exports cover selection toggling, layer-stack resolution, binding apply/clear/reset, hold-tap updates, notes updates, keycode display summaries, and default selection. `src/lib/app/editor-store.test.ts` verifies the mutation behavior against the sample keyboard.

## Component Structure

New editor components live under `src/lib/components/editor/`:

- `EditorLayerStack.svelte`: compact layer switcher with add-layer support.
- `ActiveStackCard.svelte`: active layer stack, inherited layers, and selected-key inheritance note.
- `EditorKeyInspector.svelte`: right-side inspector for key binding, hold-tap behavior, source snippets, notes, multi-selection, and lighting placeholder routing.
- `LightingComingSoon.svelte`: Wave 1b placeholder.

The route keeps board orchestration, lens switching, shell integration, zoom controls, and layout sizing in `+page.svelte`.

## Reused Logic

Reused directly:

- `$lib/components/board/KeyboardBoard.svelte` for the physical keyboard rendering.
- `$lib/components/board/board-view-model.ts` through the board component for key labels, fall-through bindings, combo markers, and layer markers.
- `$lib/components/keymap/KeyInspectorPanel.svelte` for the selected-key header/details.
- `$lib/components/keymap/KeyBindingLogicPicker.svelte` for logic binding options.
- `$lib/components/keymap/TargetOsChip.svelte` for OS-aware target selection.
- `$lib/keyboard/schema.ts`, `catalog.ts`, `changes.ts`, `logic-bindings.ts`, `layer-activations.ts`, `qmk-keycodes.ts`, `mock-device.ts`, and `local-store.ts`.
- UI primitives: `SegmentedNav`, `Button`, `Chip`, `SliderField`, `Input`, and resizable panels.

New UI composition:

- The clean-break editor shell, layer stack, active-stack card, inspector grouping, picker layout, and lighting placeholder.
- A small shell context bridge in `src/lib/app/shell-store.svelte.ts` and `src/routes/(app)/+layout.svelte` so `/editor` can reflect dirty state and board metadata in the appbar.
- `KeyboardBoard.svelte` accepts an optional `targetOs` prop and forwards it into the existing board view-model.

`src/lib/keyboard/changes.ts` now includes binding notes in the binding diff label so notes edits are reflected in dirty/change tracking.

## Persistence

Persistence is local-only in this wave.

On browser initialization, the editor attempts to load the latest SQLocal draft via `loadLocalDraft()`. If no draft exists, it uses `createSampleKeyboard()` so `/editor` is usable without a connected device.

Edits update only the local draft profile. Dirty drafts are debounced through `saveLocalDraft()`, and clean state clears the draft through `clearLocalDraft()`. `flushPersistence()` is called on route teardown. There are no live device writes, flash operations, or connect-time mutations in Wave 1a.

## Deferred Gaps

- Full lighting lens editing is Wave 1b; the selector and placeholder route are present.
- Save-point history and full appbar save flow are later work; Wave 1a only publishes the dirty count to the shell.
- Live device connect, write, and flash flows remain out of scope.
- Macro and tap-dance authoring uses existing catalog/keycode assignment surfaces; richer editors are deferred.
- A pixel/screenshot fidelity pass remains future work; Wave 1a performed route smoke verification only.

## Verification

Commands run with the Vite+ `vp` CLI:

| Command | Result |
| --- | --- |
| `vp install` | Passed |
| `vp check` | Passed: 109 files formatted, 186 files with no warnings/lint/type errors |
| `vp run svelte:check` | Passed: 0 errors, 0 warnings |
| `vp build` | Passed; Vite/Rolldown emitted plugin timing warnings only |
| `vp test src/lib/app/editor-store.test.ts` | Passed: 1 file, 4 tests |
| `vp test` | Passed: 13 files, 77 tests |
| `vp dev --host 127.0.0.1 --port 5183` | `/editor` smoke passed: HTTP 200; listener stopped afterward |

No git commit was created.

## Repository Note

Vite+ formatting normalized line endings on this Windows checkout. `.gitattributes` was added with `* text=auto eol=lf` so future `vp check` runs have a stable line-ending policy. `git status` can still show many tracked files as modified from line-ending normalization, while the textual diff is scoped to the Wave 1a editor, shell bridge, board prop, and change-label updates.
