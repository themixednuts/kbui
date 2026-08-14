import { Effect, Result, Schema } from "effect";

import type { EditorStore } from "$lib/app/editor-store.svelte";
import type { WorkbenchStore } from "$lib/app/workbench-store.svelte";

import type { BindingDiff, CoachSuggestion } from "./contracts";

export class CoachApplyError extends Schema.TaggedErrorClass<CoachApplyError>()(
  "Coach.ApplyError",
  { message: Schema.String },
) {}

export interface ApplyCoachResult {
  /** Versions save-point created after WIP apply (shape owned by workbench). */
  readonly savePoint: { readonly id: string };
  readonly liveWriteError: string | undefined;
}

export const applyDiffsToEditor = Effect.fn("Coach.applyDiffsToEditor")(function* (
  editor: EditorStore,
  diffs: readonly BindingDiff[],
) {
  for (const diff of diffs) {
    editor.setLayer(diff.layerId);
    editor.selectKey(diff.keyId);
    editor.applyKeycode(diff.after);
  }
});

/**
 * Apply binding diffs through the public editor selection/keycode API
 * (same seam as manual edits), then create a Versions save-point.
 * VIA live-write is owned by KeyboardLiveSyncEngine watching profile changes.
 */
export const applyCoachSuggestionEffect = Effect.fn("Coach.applySuggestion")(function* (input: {
  workbench: WorkbenchStore;
  suggestion: CoachSuggestion;
  /** Optional live-write hook; failures must not roll back WIP/save-point. */
  liveWrite?: () => Effect.Effect<void, unknown>;
}) {
  const { workbench, suggestion } = input;
  if (suggestion.diffs.length === 0) {
    return yield* new CoachApplyError({ message: "Suggestion has no binding diffs" });
  }

  yield* applyDiffsToEditor(workbench, suggestion.diffs);

  const savePoint = yield* workbench.createSavePointEffect(
    `Coach: ${suggestion.moveId.slice(0, 72)}`,
  ).pipe(
    Effect.mapError(
      (error) =>
        new CoachApplyError({
          message: error instanceof Error ? error.message : String(error),
        }),
    ),
  );
  if (!savePoint) {
    return yield* new CoachApplyError({
      message: "Save-point was not created (no WIP changes detected)",
    });
  }

  let liveWriteError: string | undefined;
  if (input.liveWrite) {
    const live = yield* Effect.result(input.liveWrite());
    if (Result.isFailure(live)) {
      liveWriteError =
        live.failure instanceof Error ? live.failure.message : String(live.failure);
    }
  }

  const result: ApplyCoachResult = { savePoint, liveWriteError };
  return result;
});
