import { Effect } from "effect";

import { synthesizeAdaptiveScript, rankWeakTargets, type WeakTarget } from "./adaptive-lesson";
import type { PracticeScript, PracticeSessionSummary } from "./contracts";

export interface ConfidenceChip {
  readonly id: string;
  readonly target: string;
  readonly accuracy: number;
  readonly samples: number;
  readonly meanLatencyMs: number | null;
}

interface TargetStats {
  correct: number;
  total: number;
  latencySum: number;
}

const collectTargetStats = Effect.fn("Practice.collectTargetStats")(function* (
  sessions: readonly PracticeSessionSummary[],
) {
  const map = new Map<string, TargetStats>();
  const bump = (key: string, correct: boolean, latencyMs = 0) => {
    const prev = map.get(key) ?? { correct: 0, total: 0, latencySum: 0 };
    prev.total += 1;
    if (correct) prev.correct += 1;
    prev.latencySum += latencyMs;
    map.set(key, prev);
  };

  for (const session of sessions) {
    for (const event of session.events) {
      switch (event._tag) {
        case "CharTyped":
          bump(
            event.expected === " " ? "Space" : event.expected,
            event.correct,
            event.latencyMs ?? 0,
          );
          break;
        case "IndentResolved":
          bump(
            event.key === "Tab" ? "Tab" : "Space×indent",
            event.correct,
            event.latencyMs ?? 0,
          );
          break;
        case "ActionCompleted":
          bump(event.actionId, event.correct, event.latencyMs);
          break;
        default:
          break;
      }
    }
  }
  return map;
});

/** Per-key / indent / action confidence from recent practice. */
export const confidenceChips = Effect.fn("Practice.confidenceChips")(function* (
  script: PracticeScript,
  sessions: readonly PracticeSessionSummary[],
  limit = 8,
) {
  const stats = yield* collectTargetStats(sessions);
  const chips: ConfidenceChip[] = [];

  if (script.mode === "nav") {
    for (const action of script.actions) {
      const s = stats.get(action.id);
      chips.push({
        id: action.id,
        target: action.glyph,
        accuracy: s && s.total > 0 ? Math.round((s.correct / s.total) * 1000) / 10 : 100,
        samples: s?.total ?? 0,
        meanLatencyMs: s && s.total > 0 ? Math.round(s.latencySum / s.total) : null,
      });
    }
  } else {
    const weak = yield* rankWeakTargets(sessions, limit);
    if (weak.length > 0) {
      for (const w of weak) {
        const s = stats.get(w.char === " " ? "Space" : w.char === "\t" ? "Tab" : w.char);
        chips.push({
          id: w.char,
          target: w.char === " " ? "Space" : w.char === "\t" ? "Tab" : w.char,
          accuracy: Math.round(w.accuracy * 10) / 10,
          samples: w.samples,
          meanLatencyMs: s && s.total > 0 ? Math.round(s.latencySum / s.total) : null,
        });
      }
    } else {
      for (const [target, s] of stats) {
        if (s.total === 0) continue;
        chips.push({
          id: target,
          target,
          accuracy: Math.round((s.correct / s.total) * 1000) / 10,
          samples: s.total,
          meanLatencyMs: Math.round(s.latencySum / s.total),
        });
      }
    }
  }

  return chips
    .sort((a, b) => {
      if (a.samples === 0 && b.samples === 0) return 0;
      if (a.samples === 0) return 1;
      if (b.samples === 0) return -1;
      return a.accuracy - b.accuracy;
    })
    .slice(0, limit);
});

/**
 * Adaptive remix — text/symbols: synthesize a weak-key weighted lesson (keybr-style).
 * Nav: boost weak motion/chord actions in the stream.
 */
export const adaptScript = Effect.fn("Practice.adaptScript")(function* (
  base: PracticeScript,
  sessions: readonly PracticeSessionSummary[],
  seed = Date.now(),
) {
  if (base.mode !== "nav") {
    return yield* synthesizeAdaptiveScript({
      mode: base.mode,
      sessions,
      seed,
      goal: base.goal,
    });
  }

  const stats = yield* collectTargetStats(sessions);
  if (stats.size === 0) return base;

  const weighted = [];
  for (const action of base.actions) {
    const s = stats.get(action.id);
    let copies = 1;
    if (s && s.total >= 2) {
      const accuracy = s.correct / s.total;
      if (accuracy < 0.85) copies += 2;
      else if (accuracy < 0.95) copies += 1;
    }
    for (let i = 0; i < copies; i++) {
      weighted.push(
        i === 0
          ? action
          : { ...action, id: `${action.id}+${i}`, label: `${action.label} (boost)` },
      );
    }
  }

  return {
    ...base,
    id: `${base.id}-adaptive`,
    title: `${base.title} · adaptive`,
    actions: weighted.slice(0, 80),
  };
});

export type { WeakTarget };
