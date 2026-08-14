import { Effect } from "effect";
import { describe, expect, it } from "@effect/vitest";

import { PracticeEvent, type PracticeSessionSummary } from "./contracts";
import { rankWeakTargets, synthesizeAdaptiveScript } from "./adaptive-lesson";
import { adaptScript } from "./adaptive";
import { RUST_TEXT_DRILL_V1 } from "./rust-corpus";

const keyboard = {
  keyboardId: "k",
  keyboardName: "K",
  layoutId: "l",
  layoutName: "L",
} as const;

function sessionWithMisses(chars: string[]): PracticeSessionSummary {
  const events = chars.flatMap((ch, i) => [
    PracticeEvent.cases.CharTyped.make({
      atMs: i * 10,
      expected: ch,
      observed: "x",
      correct: false,
    }),
    PracticeEvent.cases.CharTyped.make({
      atMs: i * 10 + 1,
      expected: ch,
      observed: ch,
      correct: true,
    }),
  ]);
  return {
    id: "s1",
    source: "trainer-local-v1",
    scriptId: "rust",
    mode: "rust-text",
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:01:00.000Z",
    durationMs: 60_000,
    wpm: 30,
    accuracy: 50,
    actionsTotal: 0,
    actionsCorrect: 0,
    events,
    keyboard,
  };
}

describe("adaptive lesson synthesis", () => {
  it.effect("ranks weak characters from misses", () =>
    Effect.gen(function* () {
      const weak = yield* rankWeakTargets([sessionWithMisses(["{", "}", "{", ":"])], 8);
      expect(weak.length).toBeGreaterThan(0);
      expect(weak.some((w) => w.char === "{")).toBe(true);
    }),
  );

  it.effect("synthesizes an adaptive script denser in weak punctuation", () =>
    Effect.gen(function* () {
      const script = yield* synthesizeAdaptiveScript({
        mode: "rust-text",
        sessions: [sessionWithMisses(["{", "}", "(", ")"])],
        seed: 42,
        lineCount: 5,
      });
      expect(script.id.startsWith("adaptive-")).toBe(true);
      expect(script.actions).toEqual([]);
      const blob = script.lines.join("");
      expect(blob.includes("{") || blob.includes("(") || blob.includes(")")).toBe(true);
    }),
  );

  it.effect("adaptScript for text mode returns a synthesized lesson", () =>
    Effect.gen(function* () {
      const adapted = yield* adaptScript(RUST_TEXT_DRILL_V1, [sessionWithMisses([";", ":"])], 7);
      expect(adapted.id.startsWith("adaptive-")).toBe(true);
      expect(adapted.lines.length).toBeGreaterThan(0);
    }),
  );
});
