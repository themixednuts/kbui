import { Effect } from "effect";

import { charToKeycode } from "$lib/practice/keycodes";
import type { PracticeSessionSummary } from "$lib/practice/contracts";

import type { ConfusionPair, PersonalKeyStat } from "./contracts";
import { PERSONAL_SAMPLE_THRESHOLD } from "./engine";

/** Prefer predicted binding code from stroke context; fall back to char→keycode. */
const resolveEventCode = Effect.fnUntraced(function* (input: {
  expected: string;
  predictedCode?: string | null;
}) {
  const predicted = input.predictedCode?.trim();
  if (predicted && predicted.length > 0 && !predicted.includes("→") && !predicted.includes("+")) {
    // Binding codes are KC_* or wrappers like LSFT(KC_EQL) — not display hints.
    return predicted;
  }
  return yield* charToKeycode(input.expected);
});

/**
 * Aggregate trainer events into per-keycode personal stats for coach scoring.
 * Char events prefer predicted layout bindings so stats join movable slots.
 */
export const personalStatsFromPractice = Effect.fn("Coach.personalStatsFromPractice")(function* (
  sessions: readonly PracticeSessionSummary[],
) {
  const byCode = new Map<string, { errors: number; total: number; latencySum: number }>();

  const bump = (code: string, correct: boolean, latencyMs = 0) => {
    if (!code || code === "KC_NO") return;
    const prev = byCode.get(code) ?? { errors: 0, total: 0, latencySum: 0 };
    prev.total += 1;
    if (!correct) prev.errors += 1;
    prev.latencySum += latencyMs;
    byCode.set(code, prev);
  };

  for (const session of sessions) {
    if (session.source !== "trainer-local-v1") continue;
    for (const event of session.events) {
      switch (event._tag) {
        case "ActionCompleted":
          bump(`ACT_${event.actionId.split("+")[0]}`, event.correct, event.latencyMs);
          break;
        case "CharTyped": {
          const code = yield* resolveEventCode({
            expected: event.expected,
            predictedCode: event.context?.predictedCode,
          });
          bump(code, event.correct, event.latencyMs ?? 0);
          break;
        }
        case "IndentResolved":
          bump(
            event.key === "Tab" ? "KC_TAB" : "KC_SPC",
            event.correct,
            event.latencyMs ?? 0,
          );
          break;
        default:
          break;
      }
    }
  }

  return [...byCode.entries()].map(
    ([code, s]): PersonalKeyStat => ({
      code,
      errorRate: s.total > 0 ? s.errors / s.total : 0,
      meanLatencyMs: s.total > 0 ? s.latencySum / s.total : 0,
      samples: s.total,
    }),
  );
});

/**
 * Confusion pairs: intended keycode → observed keycode from misses.
 * Soft-penalizes placements of frequently confused codes in the coach score.
 */
export const confusionPairsFromPractice = Effect.fn("Coach.confusionPairsFromPractice")(
  function* (sessions: readonly PracticeSessionSummary[], limit = 24) {
    const map = new Map<string, number>();
    for (const session of sessions) {
      if (session.source !== "trainer-local-v1") continue;
      for (const event of session.events) {
        if (event._tag !== "CharTyped" || event.correct) continue;
        const expected = yield* resolveEventCode({
          expected: event.expected,
          predictedCode: event.context?.predictedCode,
        });
        const observed =
          event.observed.length === 1
            ? yield* charToKeycode(event.observed)
            : event.observed.startsWith("KC_")
              ? event.observed
              : "KC_NO";
        if (expected === "KC_NO" || observed === "KC_NO" || expected === observed) continue;
        const key = `${expected}\0${observed}`;
        map.set(key, (map.get(key) ?? 0) + 1);
      }
    }
    const pairs: ConfusionPair[] = [...map.entries()]
      .map(([key, count]) => {
        const [expected, observed] = key.split("\0");
        return { expected: expected!, observed: observed!, count };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
    return pairs;
  },
);

export const practiceSampleCount = Effect.fn("Coach.practiceSampleCount")(function* (
  sessions: readonly PracticeSessionSummary[],
) {
  const stats = yield* personalStatsFromPractice(sessions);
  return stats.reduce((n, p) => n + p.samples, 0);
});

export const hasEnoughPracticeData = Effect.fn("Coach.hasEnoughPracticeData")(function* (
  sessions: readonly PracticeSessionSummary[],
) {
  const count = yield* practiceSampleCount(sessions);
  return count >= PERSONAL_SAMPLE_THRESHOLD;
});

export { PERSONAL_SAMPLE_THRESHOLD };
