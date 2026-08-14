import { Effect, Schema } from "effect";

import * as Preferences from "$lib/app/services/preferences";

import { RecentAccept, RecentAcceptList } from "./contracts";

export const CHURN_KEY_PREFIX = "kbgui.coach-churn.v1";
/** Keep last N accepts for cooldown. */
export const CHURN_HISTORY_LIMIT = 8;
/** Soft-block swaps touching these keys unless delta clears the bar. */
export const CHURN_DELTA_OVERRIDE = 1.25;
/** Accepts older than this no longer block churn (7 days). */
export const CHURN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const churnKey = Effect.fn("Coach.churnKey")(function* (
  profileId: string,
  layoutId: string,
) {
  return `${CHURN_KEY_PREFIX}:${profileId}:${layoutId}`;
});

export class CoachChurnError extends Schema.TaggedErrorClass<CoachChurnError>()(
  "Coach.ChurnError",
  { message: Schema.String },
) {}

/** Drop accepts outside the TTL window. */
export const freshRecentAccepts = Effect.fn("Coach.freshRecentAccepts")(function* (
  recent: readonly RecentAccept[],
  nowMs = Date.now(),
) {
  return recent.filter((entry) => {
    const t = Date.parse(entry.acceptedAt);
    return Number.isFinite(t) && nowMs - t < CHURN_TTL_MS;
  });
});

export const loadRecentAcceptsEffect = Effect.fn("Coach.loadRecentAccepts")(function* (
  profileId: string,
  layoutId: string,
) {
  const key = yield* churnKey(profileId, layoutId);
  const decoded = yield* Preferences.getJson(key, RecentAcceptList).pipe(
    Effect.mapError(
      (error) => new CoachChurnError({ message: `Load churn list failed: ${String(error)}` }),
    ),
  );
  return yield* freshRecentAccepts(decoded ?? []);
});

export const recordAcceptEffect = Effect.fn("Coach.recordAccept")(function* (
  profileId: string,
  layoutId: string,
  moveId: string,
  keyIds: readonly string[],
) {
  const existing = yield* loadRecentAcceptsEffect(profileId, layoutId);
  const entry = RecentAccept.make({
    moveId,
    keyIds: [...keyIds],
    acceptedAt: new Date().toISOString(),
  });
  const next = [entry, ...existing.filter((e) => e.moveId !== moveId)].slice(0, CHURN_HISTORY_LIMIT);
  const key = yield* churnKey(profileId, layoutId);
  yield* Preferences.setJson(key, RecentAcceptList, next).pipe(
    Effect.mapError(
      (error) => new CoachChurnError({ message: `Save churn list failed: ${String(error)}` }),
    ),
  );
  return next;
});

/** Key ids currently under churn cooldown. */
export const churnBlockedKeyIds = Effect.fn("Coach.churnBlockedKeyIds")(function* (
  recent: readonly RecentAccept[],
) {
  const fresh = yield* freshRecentAccepts(recent);
  const ids = new Set<string>();
  for (const entry of fresh) {
    for (const keyId of entry.keyIds) ids.add(keyId);
  }
  return ids;
});

/**
 * True when a candidate swap should be skipped under the churn budget
 * (touches a recently moved key and the improvement is not large enough).
 */
export const isChurnBlocked = Effect.fn("Coach.isChurnBlocked")(function* (input: {
  readonly keyIds: readonly string[];
  readonly moveId: string;
  readonly scoreDelta: number;
  readonly recent: readonly RecentAccept[];
}) {
  const fresh = yield* freshRecentAccepts(input.recent);
  if (fresh.some((r) => r.moveId === input.moveId)) return true;
  if (input.scoreDelta >= CHURN_DELTA_OVERRIDE) return false;
  const blocked = yield* churnBlockedKeyIds(fresh);
  return input.keyIds.some((id) => blocked.has(id));
});
