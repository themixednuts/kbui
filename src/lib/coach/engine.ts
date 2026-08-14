import { Effect } from "effect";

import { isChurnBlocked } from "./churn";
import { isMovable } from "./constraints";
import {
  CoachSuggestResult,
  type BindingDiff,
  type CoachKeySlot,
  type CoachLayoutFixture,
  type CodingNgram,
  type ConfusionPair,
  type PersonalKeyStat,
  type RecentAccept,
} from "./contracts";
import { scoreLayout } from "./scoring";

const PERSONAL_SAMPLE_THRESHOLD = 12;

export interface SuggestInput {
  readonly layout: CoachLayoutFixture;
  readonly ngrams: readonly CodingNgram[];
  readonly personal?: readonly PersonalKeyStat[];
  readonly confusion?: readonly ConfusionPair[];
  readonly neverMoveIds?: readonly string[];
  readonly recentAccepts?: readonly RecentAccept[];
  readonly seed?: number;
  /** When true, require personal samples before confident suggestions. */
  readonly requirePersonal?: boolean;
}

const mulberry32 = Effect.fnUntraced(function* (seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
});

const moveIdFor = Effect.fnUntraced(function* (a: CoachKeySlot, b: CoachKeySlot) {
  return `swap:${a.layerId}/${a.keyId}:${a.code}->${b.code}|${b.layerId}/${b.keyId}:${b.code}->${a.code}`;
});

const applySwap = Effect.fnUntraced(function* (slots: CoachKeySlot[], i: number, j: number) {
  const next = slots.map((s) => ({ ...s }));
  const a = next[i]!;
  const b = next[j]!;
  next[i] = { ...a, code: b.code };
  next[j] = { ...b, code: a.code };
  return next;
});

const diffsFromSwap = Effect.fnUntraced(function* (a: CoachKeySlot, b: CoachKeySlot) {
  return [
    { keyId: a.keyId, layerId: a.layerId, before: a.code, after: b.code },
    { keyId: b.keyId, layerId: b.layerId, before: b.code, after: a.code },
  ] satisfies BindingDiff[];
});

type Candidate = { i: number; j: number; delta: number; moveId: string };

/**
 * Oxeylyzer-style score + simulated annealing over movable layer bindings.
 * Never relocates sacred/numpad/trackball/alpha-pinned slots.
 * Respects never-list + churn budget on recently accepted keys.
 */
export const suggestCoach = Effect.fn("Coach.suggestCoach")(function* (input: SuggestInput) {
  const personal = input.personal ?? [];
  const confusion = input.confusion ?? [];
  const recent = input.recentAccepts ?? [];
  const personalSamples = personal.reduce((n, p) => n + p.samples, 0);
  if (input.requirePersonal && personalSamples < PERSONAL_SAMPLE_THRESHOLD) {
    return CoachSuggestResult.cases.LowData.make({
      message: "Practice more before suggestions use your own stats.",
      sampleCount: personalSamples,
    });
  }

  const movableIdx: { slot: CoachKeySlot; index: number }[] = [];
  for (let index = 0; index < input.layout.slots.length; index++) {
    const slot = input.layout.slots[index]!;
    if (yield* isMovable(slot)) movableIdx.push({ slot, index });
  }

  if (movableIdx.length < 2) {
    return CoachSuggestResult.cases.Empty.make({
      message: "No keys I can swap. Sacred and numpad keys stay put.",
    });
  }

  const never = new Set(input.neverMoveIds ?? []);
  const rng = yield* mulberry32(input.seed ?? 42);
  let current = input.layout.slots.map((s) => ({ ...s }));
  let currentScore = (yield* scoreLayout(current, input.ngrams, personal, confusion)).total;

  let bestSwap: Candidate | undefined;
  let temperature = 1.2;
  const steps = 80;

  for (let step = 0; step < steps; step++) {
    const aPick = movableIdx[Math.floor(rng() * movableIdx.length)]!;
    const bPick = movableIdx[Math.floor(rng() * movableIdx.length)]!;
    if (aPick.index === bPick.index) continue;

    const a = current[aPick.index]!;
    const b = current[bPick.index]!;
    if (a.code === b.code) continue;
    const moveId = yield* moveIdFor(a, b);
    if (never.has(moveId)) continue;

    const trial = yield* applySwap(current, aPick.index, bPick.index);
    const trialScore = (yield* scoreLayout(trial, input.ngrams, personal, confusion)).total;
    const delta = currentScore - trialScore;
    const accept = delta > 0 || rng() < Math.exp(delta / Math.max(temperature, 0.05));
    if (accept) {
      current = trial;
      currentScore = trialScore;
      if (!bestSwap || delta > bestSwap.delta) {
        bestSwap = { i: aPick.index, j: bPick.index, delta, moveId };
      }
    }
    temperature *= 0.96;
  }

  const start = input.layout.slots.map((s) => ({ ...s }));
  const startScore = (yield* scoreLayout(start, input.ngrams, personal, confusion)).total;
  const candidates: Candidate[] = [];
  if (bestSwap && bestSwap.delta > 0) candidates.push(bestSwap);

  for (let ai = 0; ai < movableIdx.length; ai++) {
    for (let bi = ai + 1; bi < movableIdx.length; bi++) {
      const i = movableIdx[ai]!.index;
      const j = movableIdx[bi]!.index;
      const a = start[i]!;
      const b = start[j]!;
      if (a.code === b.code) continue;
      const moveId = yield* moveIdFor(a, b);
      if (never.has(moveId)) continue;
      const trial = yield* applySwap(start, i, j);
      const trialScore = (yield* scoreLayout(trial, input.ngrams, personal, confusion)).total;
      const delta = startScore - trialScore;
      if (delta > 0) candidates.push({ i, j, delta, moveId });
    }
  }

  candidates.sort((x, y) => y.delta - x.delta);

  let chosen: Candidate | undefined;
  for (const candidate of candidates) {
    const a = start[candidate.i]!;
    const b = start[candidate.j]!;
    const blocked = yield* isChurnBlocked({
      keyIds: [a.keyId, b.keyId],
      moveId: candidate.moveId,
      scoreDelta: candidate.delta,
      recent,
    });
    if (!blocked) {
      chosen = candidate;
      break;
    }
  }

  if (!chosen) {
    return CoachSuggestResult.cases.Empty.make({
      message:
        candidates.length > 0
          ? "Better swaps exist, but they hit the never-list or recent-move limit. Practice more, or reject fewer suggestions."
          : "No swap on this layout beats the current score.",
    });
  }

  const a = start[chosen.i]!;
  const b = start[chosen.j]!;
  const basedOnPersonal = personalSamples >= PERSONAL_SAMPLE_THRESHOLD;
  const confidence =
    chosen.delta > 1.5 && basedOnPersonal
      ? "high"
      : chosen.delta > 0.4
        ? "medium"
        : "low";

  return CoachSuggestResult.cases.Suggestion.make({
    suggestion: {
      moveId: chosen.moveId,
      rationale: basedOnPersonal
        ? `This swap raises the Oxeylyzer score by ${chosen.delta.toFixed(2)} from your latency, errors, and mix-ups.`
        : `This swap raises the Oxeylyzer score by ${chosen.delta.toFixed(2)} from the coding corpus.`,
      confidence,
      scoreDelta: chosen.delta,
      diffs: yield* diffsFromSwap(a, b),
      basedOnPersonalStats: basedOnPersonal,
    },
  });
});

export { PERSONAL_SAMPLE_THRESHOLD };
