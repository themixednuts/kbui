# De-Mock 1a Report

## Scope

This sub-wave removes fake-as-real defaults and weak ID fallbacks from the new/empty states covered by findings 5, 23, 24, 25, 28, 29, 30, 31, and 32 in `docs/redesign/43-demock-audit.md`.

## Finding Changes

- Finding 5: Removed the disabled "Trace from photo" / "Soon" connect option and its stub styling from `src/routes/(app)/connect/+page.svelte`.
- Findings 24 and 25: Version save-point message and branch-name inputs now initialize as empty strings in `src/routes/(app)/versions/+page.svelte`. After a branch succeeds, the branch field also resets to empty instead of preloading a generated variant name.
- Finding 29: `addMacro()` now creates a macro draft with an empty name and empty sequence. Clearing a macro sequence keeps it empty instead of forcing `KC_NO`.
- Finding 30: `addCombo()` now creates an unassigned combo draft with no keys and no binding. Combo key editing allows partial and zero-key drafts.
- Finding 31: `addTapDance()` now creates an unassigned tap-dance draft with no source key and no tap/hold/double-tap actions.
- Findings 23, 28, and 32: Added `src/lib/util/id.ts` with `newId()`, backed by `crypto.randomUUID()` only. It throws if `crypto.randomUUID()` is unavailable. It replaced weak ID generation in browse adoption IDs, workbench save-point/fork IDs, and editor logic IDs.

## Empty Draft Behavior

The Library UI now renders incomplete drafts explicitly:

- Macros show "Add sequence" and cannot be placed until they have at least one sequence item.
- Combos show "Add keys" and "Set output" while incomplete. They can still use the board picker to add member keys.
- Tap dances show "Unassigned key" and per-action prompts. They cannot be placed until source key, tap, hold, and double-tap are all assigned.

Bindable logic options skip incomplete macros and tap dances, and store-level placement rejects incomplete macro/tap-dance drafts.

## Generation And Live-Sync Guards

Firmware source generation excludes incomplete macro, combo, and tap-dance definitions. If an existing key binding points at an incomplete macro or tap dance, generated keymap output clears that cell to `KC_NO` or `KC_TRNS` for QMK, or `&none` or `&trans` for ZMK, with an incomplete-binding diagnostic.

QMK macro and tap-dance source generation preserves original indexes for completed entries when earlier drafts are incomplete, so existing `QK_MACRO_n` and `TD(n)` bindings stay aligned.

VIA and ZMK live-sync classifiers now mark bindings to incomplete macro/tap-dance drafts as invalid instead of queueing live writes.

## Tests

Updated and added coverage:

- `src/lib/util/id.test.ts`: `newId()` returns unique UUID-shaped strings.
- `src/lib/app/workbench-store.test.ts`: empty draft constructors and partial draft editing.
- `src/lib/keyboard/logic-bindings.test.ts`: incomplete macro/tap-dance drafts are excluded from bindable options.
- `src/lib/keyboard/firmware-source.test.ts`: incomplete drafts are excluded from generated QMK source, incomplete bindings are cleared, and complete entries keep original indexes.
- `src/lib/keyboard/via-live.test.ts`: incomplete macro bindings are not live-writable.
- Existing live-sync tests were adjusted away from old combo-name assumptions.

## Verification

- `vp install`: passed.
- `vp check`: passed, all 174 files formatted; no warnings, lint errors, or type errors in 242 files.
- `vp run svelte:check`: passed, 0 errors and 0 warnings.
- `vp build`: passed. Rolldown printed plugin timing notices only.
- `vp test`: passed, 36 test files and 180 tests.
- `vp run capture`: passed, 8/8 captures.
- Port check after capture: no listeners on 5173, 5174, or 4173.
