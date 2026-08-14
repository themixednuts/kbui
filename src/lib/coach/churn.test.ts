import { Effect, Layer } from "effect";
import { expect, layer } from "@effect/vitest";

import * as Preferences from "$lib/app/services/preferences";

import {
  CHURN_DELTA_OVERRIDE,
  CHURN_TTL_MS,
  freshRecentAccepts,
  isChurnBlocked,
  loadRecentAcceptsEffect,
  recordAcceptEffect,
} from "./churn";
import { RecentAccept } from "./contracts";

const memory = new Map<string, string>();
const memoryPreferencesLayer = Layer.succeed(
  Preferences.Service,
  Preferences.Service.of({
    get: (key) => Effect.succeed(memory.get(key) ?? null),
    set: (key, value) =>
      Effect.sync(() => {
        memory.set(key, value);
      }),
    remove: (key) =>
      Effect.sync(() => {
        memory.delete(key);
      }),
  }),
);

layer(memoryPreferencesLayer)("coach churn budget", (it) => {
  it.effect("records accepts and blocks low-delta revisits", () =>
    Effect.gen(function* () {
      memory.clear();
      yield* recordAcceptEffect("p1", "l1", "swap:a", ["2,1", "2,2"]);
      const recent = yield* loadRecentAcceptsEffect("p1", "l1");
      expect(recent.length).toBe(1);

      const blocked = yield* isChurnBlocked({
        keyIds: ["2,1"],
        moveId: "swap:b",
        scoreDelta: 0.2,
        recent,
      });
      expect(blocked).toBe(true);

      const allowed = yield* isChurnBlocked({
        keyIds: ["2,1"],
        moveId: "swap:c",
        scoreDelta: CHURN_DELTA_OVERRIDE + 0.1,
        recent,
      });
      expect(allowed).toBe(false);
    }),
  );

  it.effect("expires accepts older than the TTL", () =>
    Effect.gen(function* () {
      const stale = RecentAccept.make({
        moveId: "swap:old",
        keyIds: ["9,9"],
        acceptedAt: new Date(Date.now() - CHURN_TTL_MS - 60_000).toISOString(),
      });
      const fresh = yield* freshRecentAccepts([stale]);
      expect(fresh).toEqual([]);
      const blocked = yield* isChurnBlocked({
        keyIds: ["9,9"],
        moveId: "swap:new",
        scoreDelta: 0.1,
        recent: [stale],
      });
      expect(blocked).toBe(false);
    }),
  );
});
