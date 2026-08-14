import { Effect, Layer } from "effect";
import { describe, expect, it } from "@effect/vitest";

import * as Preferences from "$lib/app/services/preferences";
import { WorkbenchStore } from "$lib/app/workbench-store.svelte";
import { localStoreLayer } from "$lib/keyboard/local-store";
import type { PracticeSessionSummary } from "$lib/practice/contracts";

import { applyCoachSuggestionEffect } from "./apply";
import { isMovable } from "./constraints";
import { suggestCoach } from "./engine";
import {
  CHARYBDIS_COACH_FIXTURE,
  CODING_NGRAMS_V1,
  IMPROVABLE_NAV_FIXTURE,
} from "./fixtures";
import { addNeverMoveEffect, loadNeverMovesEffect } from "./never-list";
import { hasEnoughPracticeData, personalStatsFromPractice } from "./personal";

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

describe("coach engine fixtures", () => {
  it.effect("never relocates pinned alphas, sacred thumbs, or numpad", () =>
    Effect.gen(function* () {
      for (const slot of CHARYBDIS_COACH_FIXTURE.slots) {
        if (slot.code === "KC_A" || slot.code === "MO(1)" || slot.code === "KC_P7") {
          expect(yield* isMovable(slot)).toBe(false);
        }
      }
      expect(CHARYBDIS_COACH_FIXTURE.slots.some((s) => s.trackball)).toBe(true);
      for (const slot of CHARYBDIS_COACH_FIXTURE.slots.filter((s) => s.trackball)) {
        expect(yield* isMovable(slot)).toBe(false);
      }
    }),
  );

  it.effect("produces a binding-diff suggestion with stable move id", () =>
    Effect.gen(function* () {
      const result = yield* suggestCoach({
        layout: IMPROVABLE_NAV_FIXTURE,
        ngrams: CODING_NGRAMS_V1,
        seed: 7,
      });
      expect(result._tag).toBe("Suggestion");
      if (result._tag !== "Suggestion") return;
      expect(result.suggestion.moveId.startsWith("swap:")).toBe(true);
      expect(result.suggestion.diffs.length).toBe(2);
      for (const diff of result.suggestion.diffs) {
        const slot = IMPROVABLE_NAV_FIXTURE.slots.find(
          (s) => s.keyId === diff.keyId && s.layerId === diff.layerId,
        );
        expect(slot && (yield* isMovable(slot))).toBe(true);
      }
    }),
  );

  it.effect("marks low-data when personal stats are required but sparse", () =>
    Effect.gen(function* () {
      const result = yield* suggestCoach({
        layout: IMPROVABLE_NAV_FIXTURE,
        ngrams: CODING_NGRAMS_V1,
        requirePersonal: true,
        personal: [{ code: "KC_LPRN", errorRate: 0.5, meanLatencyMs: 400, samples: 2 }],
      });
      expect(result._tag).toBe("LowData");
    }),
  );
});

describe("coach never-list + personal stats", () => {
  it.effect("persists never-this-move and filters suggestion", () =>
    Effect.gen(function* () {
      const first = yield* suggestCoach({
        layout: IMPROVABLE_NAV_FIXTURE,
        ngrams: CODING_NGRAMS_V1,
        seed: 7,
      });
      expect(first._tag).toBe("Suggestion");
      if (first._tag !== "Suggestion") return;

      yield* addNeverMoveEffect("profile-1", "layout-1", first.suggestion.moveId);
      const never = yield* loadNeverMovesEffect("profile-1", "layout-1");
      expect(never).toContain(first.suggestion.moveId);

      const second = yield* suggestCoach({
        layout: IMPROVABLE_NAV_FIXTURE,
        ngrams: CODING_NGRAMS_V1,
        seed: 7,
        neverMoveIds: never,
      });
      if (second._tag === "Suggestion") {
        expect(second.suggestion.moveId).not.toBe(first.suggestion.moveId);
      }
    }).pipe(Effect.provide(memoryPreferencesLayer)),
  );

  it.effect("builds personal stats only from trainer-local sessions", () =>
    Effect.gen(function* () {
      const sessions: PracticeSessionSummary[] = [
        {
          id: "1",
          source: "trainer-local-v1",
          scriptId: "rust-text-v1",
          mode: "rust-text",
          startedAt: "2026-01-01T00:00:00.000Z",
          endedAt: "2026-01-01T00:01:00.000Z",
          durationMs: 60_000,
          wpm: 40,
          accuracy: 90,
          actionsTotal: 5,
          actionsCorrect: 4,
          events: [
            { _tag: "ActionStarted", actionId: "t1", atMs: 0 },
            {
              _tag: "ActionCompleted",
              actionId: "t1",
              atMs: 100,
              correct: false,
              latencyMs: 100,
            },
          ],
          keyboard: {
            keyboardId: "k",
            keyboardName: "K",
            layoutId: "l",
            layoutName: "L",
          },
        },
      ];
      const stats = yield* personalStatsFromPractice(sessions);
      expect(stats.length).toBe(1);
      expect(yield* hasEnoughPracticeData(sessions)).toBe(false);
    }),
  );
});

describe("coach accept applies via workbench seams", () => {
  it.effect("accept updates WIP + save-point; live failure keeps both", () =>
    Effect.gen(function* () {
      const workbench = new WorkbenchStore({ persist: false });
      const layerId = workbench.profile.layers[0]!.id;
      const keyId = "k2-4";
      const before = workbench.profile.layers[0]!.bindings[keyId]!.code;

      const applied = yield* applyCoachSuggestionEffect({
        workbench,
        suggestion: {
          moveId: "swap:test",
          rationale: "test",
          confidence: "medium",
          scoreDelta: 1,
          basedOnPersonalStats: false,
          diffs: [
            {
              keyId,
              layerId,
              before,
              after: "KC_G",
            },
          ],
        },
        liveWrite: () => Effect.fail(new Error("via disconnected")),
      });

      expect(workbench.profile.layers[0]!.bindings[keyId]!.code).toBe("KC_G");
      expect(applied.savePoint).toBeTruthy();
      expect(workbench.savePoints.some((sp) => sp.id === applied.savePoint.id)).toBe(true);
      expect(applied.liveWriteError).toContain("via disconnected");
    }).pipe(Effect.provide(Layer.merge(localStoreLayer, memoryPreferencesLayer))),
  );

  it.effect("disconnected accept still creates WIP + save-point", () =>
    Effect.gen(function* () {
      const workbench = new WorkbenchStore({ persist: false });
      const layerId = workbench.profile.layers[0]!.id;
      const keyId = "k2-5";
      const before = workbench.profile.layers[0]!.bindings[keyId]!.code;

      const applied = yield* applyCoachSuggestionEffect({
        workbench,
        suggestion: {
          moveId: "swap:offline",
          rationale: "offline",
          confidence: "low",
          scoreDelta: 0.5,
          basedOnPersonalStats: false,
          diffs: [{ keyId, layerId, before, after: "KC_H" }],
        },
      });

      expect(workbench.profile.layers[0]!.bindings[keyId]!.code).toBe("KC_H");
      expect(applied.savePoint).toBeTruthy();
      expect(applied.liveWriteError).toBeUndefined();
    }).pipe(Effect.provide(Layer.merge(localStoreLayer, memoryPreferencesLayer))),
  );
});
