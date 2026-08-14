import { Effect } from "effect";
import { describe, expect, it } from "@effect/vitest";

import { annotateSlotSync } from "./constraints";
import type { CoachLayoutFixture } from "./contracts";
import { scoreLayout } from "./scoring";

const pinkyBrackets: CoachLayoutFixture = {
  id: "pinky-brackets",
  name: "pinky",
  slots: [
    annotateSlotSync("6,0", "2", "KC_LPRN", 6, 0, "nav"),
    annotateSlotSync("6,5", "2", "KC_RPRN", 6, 5, "nav"),
  ],
};

const indexBrackets: CoachLayoutFixture = {
  id: "index-brackets",
  name: "index",
  slots: [
    annotateSlotSync("7,3", "2", "KC_LPRN", 7, 3, "nav"),
    annotateSlotSync("7,4", "2", "KC_RPRN", 7, 4, "nav"),
  ],
};

describe("Oxeylyzer-style scoring", () => {
  it.effect("penalizes same-finger and stretch more than home-index placements", () =>
    Effect.gen(function* () {
      const ngrams = [{ grams: "()", weight: 5 }];
      const pinky = yield* scoreLayout(pinkyBrackets.slots, ngrams);
      const index = yield* scoreLayout(indexBrackets.slots, ngrams);
      expect(pinky.total).toBeGreaterThan(index.total);
      expect(pinky.effort + pinky.stretch).toBeGreaterThan(index.effort + index.stretch);
    }),
  );

  it.effect("applies personal latency/error into the total", () =>
    Effect.gen(function* () {
      const ngrams = [{ grams: "(", weight: 3 }];
      const base = yield* scoreLayout(indexBrackets.slots, ngrams);
      const personal = yield* scoreLayout(indexBrackets.slots, ngrams, [
        { code: "KC_LPRN", errorRate: 0.4, meanLatencyMs: 500, samples: 10 },
      ]);
      expect(personal.personal).toBeGreaterThan(0);
      expect(personal.total).toBeGreaterThan(base.total);
    }),
  );

  it.effect("applies confusion-pair soft penalty", () =>
    Effect.gen(function* () {
      const ngrams = [{ grams: "(", weight: 3 }];
      const base = yield* scoreLayout(indexBrackets.slots, ngrams);
      const confused = yield* scoreLayout(
        indexBrackets.slots,
        ngrams,
        [],
        [{ expected: "KC_LPRN", observed: "KC_RPRN", count: 8 }],
      );
      expect(confused.confusion).toBeGreaterThan(0);
      expect(confused.total).toBeGreaterThan(base.total);
    }),
  );
});
