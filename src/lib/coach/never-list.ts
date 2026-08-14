import { Effect, Schema } from "effect";

import * as Preferences from "$lib/app/services/preferences";

import { NeverMoveList } from "./contracts";

export const NEVER_MOVES_KEY_PREFIX = "kbgui.coach-never-moves.v1";

export const neverMovesKey = Effect.fn("Coach.neverMovesKey")(function* (
  profileId: string,
  layoutId: string,
) {
  return `${NEVER_MOVES_KEY_PREFIX}:${profileId}:${layoutId}`;
});

export class CoachNeverListError extends Schema.TaggedErrorClass<CoachNeverListError>()(
  "Coach.NeverListError",
  { message: Schema.String },
) {}

export const loadNeverMovesEffect = Effect.fn("Coach.loadNeverMoves")(function* (
  profileId: string,
  layoutId: string,
) {
  const key = yield* neverMovesKey(profileId, layoutId);
  const decoded = yield* Preferences.getJson(key, NeverMoveList).pipe(
    Effect.mapError(
      (error) => new CoachNeverListError({ message: `Load never-list failed: ${String(error)}` }),
    ),
  );
  return decoded ?? [];
});

export const addNeverMoveEffect = Effect.fn("Coach.addNeverMove")(function* (
  profileId: string,
  layoutId: string,
  moveId: string,
) {
  const existing = yield* loadNeverMovesEffect(profileId, layoutId);
  if (existing.includes(moveId)) return existing;
  const next = [...existing, moveId].slice(0, 500);
  const key = yield* neverMovesKey(profileId, layoutId);
  yield* Preferences.setJson(key, NeverMoveList, next).pipe(
    Effect.mapError(
      (error) => new CoachNeverListError({ message: `Save never-list failed: ${String(error)}` }),
    ),
  );
  return next;
});

export const filterNeverMoves = Effect.fn("Coach.filterNeverMoves")(function* <
  T extends { moveId: string },
>(items: readonly T[], neverIds: readonly string[]) {
  const blocked = new Set(neverIds);
  return items.filter((item) => !blocked.has(item.moveId));
});
