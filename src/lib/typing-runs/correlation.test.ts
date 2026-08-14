import { describe, expect, it } from "@effect/vitest";

import { correlateCapture } from "./correlation";
import type { MonkeytypeRunCapture } from "./contracts";
import type { NormalizedMonkeytypeResult } from "./monkeytype-results";

describe("correlateCapture", () => {
  it("matches directly on monkeytypeResultId", () => {
    const decision = correlateCapture(sampleCapture({ monkeytypeResultId: "res_1" }), [
      sampleResult({ id: "res_1" }),
    ]);
    expect(decision).toEqual({
      state: "matched",
      confidence: 1,
      monkeytypeResultId: "res_1",
    });
  });

  it("keeps a direct id pending until a fresh sync arrives", () => {
    const decision = correlateCapture(
      sampleCapture({
        monkeytypeResultId: "res_missing",
        capturedAt: "2026-07-04T12:03:00.000Z",
      }),
      [sampleResult({ id: "res_other", syncedAtMs: Date.parse("2026-07-04T11:00:00.000Z") })],
      { hasFreshSync: false },
    );
    expect(decision.state).toBe("pending");
    expect(decision.monkeytypeResultId).toBe("res_missing");
  });

  it("marks a missing direct id unmatched after a fresh sync", () => {
    const decision = correlateCapture(
      sampleCapture({ monkeytypeResultId: "res_missing" }),
      [sampleResult({ id: "res_other" })],
      { hasFreshSync: true },
    );
    expect(decision.state).toBe("unmatched");
  });

  it("fuzzy-matches a unique timestamp and metric tuple", () => {
    const decision = correlateCapture(
      sampleCapture({
        capturedAt: "2026-07-04T12:03:10.000Z",
        wpm: 101.2,
        acc: 98.1,
      }),
      [
        sampleResult({
          id: "res_fuzzy",
          timestampMs: Date.parse("2026-07-04T12:03:00.000Z"),
          wpm: 101,
          acc: 98.2,
        }),
      ],
    );
    expect(decision.state).toBe("matched");
    expect(decision.monkeytypeResultId).toBe("res_fuzzy");
    expect(decision.confidence).toBeGreaterThan(0.7);
  });

  it("marks multiple plausible matches ambiguous", () => {
    const decision = correlateCapture(sampleCapture(), [
      sampleResult({ id: "res_a", timestampMs: Date.parse("2026-07-04T12:03:00.000Z") }),
      sampleResult({ id: "res_b", timestampMs: Date.parse("2026-07-04T12:03:05.000Z") }),
    ]);
    expect(decision).toEqual({
      state: "ambiguous",
      confidence: null,
      monkeytypeResultId: null,
    });
  });

  it("stays pending when no results exist yet", () => {
    expect(correlateCapture(sampleCapture(), []).state).toBe("pending");
  });

  it("marks unmatched after a fresh sync with no plausible row", () => {
    const decision = correlateCapture(
      sampleCapture({ wpm: 40 }),
      [sampleResult({ wpm: 140, timestampMs: Date.parse("2026-07-04T12:03:00.000Z") })],
      { hasFreshSync: true },
    );
    expect(decision.state).toBe("unmatched");
  });
});

function sampleCapture(overrides: Partial<MonkeytypeRunCapture> = {}): MonkeytypeRunCapture {
  return {
    source: "monkeytype-extension-dom-v1",
    capturedAt: "2026-07-04T12:03:00.000Z",
    wpm: 101,
    rawWpm: 106,
    acc: 98.2,
    consistency: 77,
    testDuration: 60,
    mode: "time",
    mode2: "60",
    keyboard: { keyboardId: "kb-1", displayName: "Workbench 65" },
    layout: { layoutId: "main:kb-1", displayName: "main" },
    extension: {
      installId: "install-1",
      version: "0.1.0",
      parserVersion: "dom-v1",
    },
    ...overrides,
  };
}

function sampleResult(
  overrides: Partial<NormalizedMonkeytypeResult> = {},
): NormalizedMonkeytypeResult {
  return {
    id: "res_1",
    timestampMs: Date.parse("2026-07-04T12:03:00.000Z"),
    wpm: 101,
    rawWpm: 106,
    acc: 98.2,
    consistency: 77,
    testDuration: 60,
    mode: "time",
    mode2: "60",
    syncedAtMs: Date.parse("2026-07-04T12:04:00.000Z"),
    payload: {},
    ...overrides,
  };
}
