import { describe, expect, it } from "@effect/vitest";

import { normalizeMonkeytypeResults } from "./monkeytype-results";

describe("normalizeMonkeytypeResults", () => {
  it("reads Monkeytype GET /results envelopes", () => {
    const rows = normalizeMonkeytypeResults(
      {
        message: "",
        data: [
          {
            _id: "abc",
            wpm: 101.4,
            rawWpm: 110,
            acc: 98.2,
            consistency: 77,
            testDuration: 60,
            mode: "time",
            mode2: "60",
            timestamp: 1_720_000_000,
          },
        ],
      },
      1_720_100_000_000,
    );

    expect(rows).toEqual([
      {
        id: "abc",
        timestampMs: 1_720_000_000_000,
        wpm: 101.4,
        rawWpm: 110,
        acc: 98.2,
        consistency: 77,
        testDuration: 60,
        mode: "time",
        mode2: "60",
        syncedAtMs: 1_720_100_000_000,
        payload: expect.objectContaining({ _id: "abc" }),
      },
    ]);
  });

  it("skips rows without id or metrics and dedupes by id", () => {
    const rows = normalizeMonkeytypeResults(
      [
        { wpm: 90, acc: 90, timestamp: 1 },
        { _id: "keep", wpm: 100, acc: 99, timestamp: 1_720_000_000_000 },
        { id: "keep", wpm: 101, acc: 98, timestamp: 1_720_000_000_001 },
      ],
      9,
    );
    expect(rows.map((row) => row.id)).toEqual(["keep"]);
    expect(rows[0]?.wpm).toBe(100);
  });
});
