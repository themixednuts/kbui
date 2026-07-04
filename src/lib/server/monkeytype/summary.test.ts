import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_MONKEYTYPE_MODE, DEFAULT_MONKEYTYPE_MODE2 } from "$lib/monkeytype/types";
import { deriveMonkeytypeSummary } from "./summary";

describe("Monkeytype summary derivation", () => {
  it("derives shell stats from stats, personal bests, and recent results", () => {
    const summary = deriveMonkeytypeSummary(
      {
        stats: { completedTests: 1240 },
        personalBests: { data: [{ wpm: 120.6, acc: 97.2, consistency: 83.4 }] },
        results: [
          { wpm: 98.2, acc: 96.41, consistency: 82.12 },
          { wpm: 100.7, acc: 95.11, consistency: 80.21 },
        ],
      },
      { generatedAt: "2026-07-04T12:00:00.000Z" },
    );

    expect(summary).toMatchObject({
      wpm: 99,
      accuracy: 95.8,
      consistency: 81.2,
      tests: 1240,
      pb: 121,
      mode: DEFAULT_MONKEYTYPE_MODE,
      mode2: DEFAULT_MONKEYTYPE_MODE2,
      resultCount: 2,
      generatedAt: "2026-07-04T12:00:00.000Z",
      stale: false,
      error: null,
    });
  });

  it("uses the documented PB default and falls back to PB consistency without results", () => {
    const summary = deriveMonkeytypeSummary({
      stats: { completedTests: "8" },
      personalBests: { wpm: 77.4, consistency: 71.25 },
      results: [],
    });

    expect(summary.wpm).toBeNull();
    expect(summary.accuracy).toBeNull();
    expect(summary.consistency).toBe(71.25);
    expect(summary.tests).toBe(8);
    expect(summary.pb).toBe(77);
    expect(summary.mode).toBe("time");
    expect(summary.mode2).toBe("60");
  });

  it("keeps previous averages when quota-limited result sync is stale", () => {
    const previous = deriveMonkeytypeSummary({
      stats: { completedTests: 10 },
      personalBests: { wpm: 80 },
      results: [{ wpm: 70, acc: 96, consistency: 75 }],
    });
    const summary = deriveMonkeytypeSummary(
      {
        stats: { completedTests: 11 },
        personalBests: { wpm: 81 },
      },
      {
        previous,
        stale: true,
        error: {
          code: "MONKEYTYPE_APE_KEY_RATE_LIMITED",
          message: "Rate limited",
        },
      },
    );

    expect(summary.wpm).toBe(70);
    expect(summary.accuracy).toBe(96);
    expect(summary.tests).toBe(11);
    expect(summary.pb).toBe(81);
    expect(summary.stale).toBe(true);
    expect(summary.error?.code).toBe("MONKEYTYPE_APE_KEY_RATE_LIMITED");
  });
});
