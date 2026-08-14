import { Effect, Schema } from "effect";

import * as Preferences from "$lib/app/services/preferences";

import { PracticeSessionSummary, PracticeSessionSummaryList } from "./contracts";

export const PRACTICE_SESSIONS_KEY = "kbgui.practice-sessions.v1";
const MAX_SESSIONS = 100;

export class PracticePersistError extends Schema.TaggedErrorClass<PracticePersistError>()(
  "Practice.PersistError",
  { message: Schema.String },
) {}

export const loadPracticeSessionsEffect = Effect.fn("Practice.loadSessions")(function* () {
  const decoded = yield* Preferences.getJson(PRACTICE_SESSIONS_KEY, PracticeSessionSummaryList).pipe(
    Effect.mapError(
      (error) =>
        new PracticePersistError({
          message: `Failed to load practice sessions: ${String(error)}`,
        }),
    ),
  );
  return decoded ?? [];
});

export const savePracticeSessionEffect = Effect.fn("Practice.saveSession")(function* (
  summary: PracticeSessionSummary,
) {
  const existing = yield* loadPracticeSessionsEffect();
  const next = [summary, ...existing.filter((s) => s.id !== summary.id)].slice(0, MAX_SESSIONS);
  yield* Preferences.setJson(PRACTICE_SESSIONS_KEY, PracticeSessionSummaryList, next).pipe(
    Effect.mapError(
      (error) =>
        new PracticePersistError({
          message: `Failed to save practice session: ${String(error)}`,
        }),
    ),
  );
  return next;
});
