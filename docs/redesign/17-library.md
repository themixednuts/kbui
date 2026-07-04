# Wave 2a - Library

## Shared Profile State

`/library` and `/editor` now operate on the same active `DeviceProfile` draft.

- `src/lib/app/workbench-store.svelte.ts` creates `WorkbenchStore`, a shared app-level profile store that extends the existing `EditorStore`.
- `src/routes/(app)/+layout.svelte` owns one `WorkbenchStore` instance and provides it through Svelte context with `setWorkbenchContext`.
- `src/routes/(app)/editor/+page.svelte` and `src/routes/(app)/library/+page.svelte` both read that same instance with `getWorkbenchContext`.
- SQLocal draft hydration, dirty tracking, profile diffs, and persistence still flow through the existing `EditorStore` path. The app layout flushes the shared draft on destroy.
- The editor's temporary sample-board switcher now calls `workbench.switchSampleBoard(...)` instead of replacing the whole editor store inside the route.

The shell also derives dirty/device chrome from the shared workbench store, so Library edits update the same dirty count shown by Editor changes.

## Library Screen Structure

`src/routes/(app)/library/+page.svelte` replaces the placeholder with the design's Library screen:

- Left Library card:
  - Tabs for Macros, Combos, and Tap Dance.
  - Item rows with summaries:
    - Macros show trigger and sequence.
    - Combos use `comboChordLabels` and `comboLayerScopeLabel`.
    - Tap dances show tap, hold, and double-tap behavior.
  - Per-row `Use it` actions.
  - Add actions for each item type.
- Right `Use it` card:
  - Selected item editor.
  - Place action.
  - Duplicate and Delete actions.
  - Combo member/layer editing grid using `comboKeyOptionLabel`.

The visual treatment follows the existing app tokens and the handoff screenshot: dense ledger on the left, narrow operational panel on the right, and no local copy of profile logic state.

## CRUD Reuse

The Library uses the same domain behavior as `LogicBuilder` rather than keeping separate route-local state.

- `EditorStore` now exposes profile mutation methods:
  - `addMacro`, `updateMacro`, `duplicateMacro`, `removeMacro`
  - `addCombo`, `updateCombo`, `updateComboKeys`, `duplicateCombo`, `removeCombo`
  - `addTapDance`, `updateTapDance`, `duplicateTapDance`, `removeTapDance`
- Macro and tap-dance keycodes use `macroBindingCode` and `tapDanceBindingCode`.
- Combo display/editing continues to use `combo-visibility.ts` helpers.
- Removal reconciles index-based QMK bindings for macros and tap dances where the app has enough information to do so.
- `changes.ts` now records tap-dance diffs and logic removals, so Library CRUD appears in the same uncommitted change list as keymap edits.

## Placement Flow

Placement state lives in `ShellStore.placeMode`.

- Library `Use it` sets `shell.startPlacement(...)` and navigates to `/editor`.
- The app shell shows the placement banner only while on `/editor`.
- Editor key clicks intercept placement before normal selection:
  - Macro placement writes `QK_MACRO_n` plus `macroId` to the clicked key on the active layer.
  - Tap-dance placement writes `TD(n)` to the clicked key on the active layer.
  - Combo placement toggles picked keys and commits the combo when two member keys are selected.
- Successful placement clears `ShellStore.placeMode`.
- Combo board placement is intentionally simple in this wave: it commits a two-key chord. Editing larger combo chords remains available in the Library side panel; multi-key board picking with explicit confirmation is a follow-up.

## Verification

- `vp check`: pass. All 116 files formatted; 193 files checked with no warnings, lint errors, or type errors.
- `vp run svelte:check`: pass. 0 errors, 0 warnings.
- `vp build`: pass. Cloudflare Agents adapter completed; build emitted plugin timing warnings only.
- `vp test`: pass. 15 test files, 85 tests.

No `vp dev` or `vp preview` server was left running.
