import { Effect, Schema } from "effect";

import { IndentPolicy, PracticeScript, SESSION_GOAL_UNTIL_COMPLETE, type PracticeMode, type PracticeSessionSummary, type SessionGoal } from "./contracts";
import { formatRustLines } from "./format-rust";
import { RUST_TEXT_DRILLS } from "./rust-corpus";
import { SYMBOLS_DRILLS } from "./symbols-corpus";

export const WeakTarget = Schema.Struct({
  char: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1)),
  accuracy: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
  samples: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  weight: Schema.Finite.check(Schema.isGreaterThan(0)),
});
export interface WeakTarget extends Schema.Schema.Type<typeof WeakTarget> {}

const detect4 = IndentPolicy.cases.Detect.make({ candidateWidth: 4 });

/** Dense atoms — `formatRustLines` expands spacing/breaks for the buffer. */
const RUST_ATOMS: readonly string[] = [
  "fn main(){",
  "let x=a+b;",
  "foo::<T>(&bar)?;",
  "match n{Ok(v)=>v,Err(e)=>return Err(e)}",
  "vec![1,2,3]",
  "hash.insert(k,v);",
  "path.to_str()?.to_owned()",
  "s.parse::<u32>()?",
  "||a+b",
  "items.iter().map(|x|x*2).collect::<Vec<_>>()",
  "println!(\"{:?}\",value);",
  "use std::collections::HashMap;",
  "#[derive(Debug,Clone)]",
  "async fn fetch()->Result<String,Error>",
  "client.get(url).send().await?",
  "&'a [u8]",
  "Option<&str>",
  "Result<(),Box<dyn Error>>",
  "x<<=2;y&=!mask;",
  "a?.b()?.c",
  "\"{name}: {value:?}\"",
  "FromStr::from_str::<i64>(s)",
  "buf.push_str(\"hello\");",
  "self.x.pow(2)+self.y.pow(2)",
];

const SYMBOL_ATOMS: readonly string[] = [
  "()[]{}",
  "<T as Trait>",
  "a + b * (c - d)",
  "foo::<T>(&bar)?.await",
  "|| x => Ok(())",
  "x <<= 2; y &= !z;",
  "\"{x:?}\"",
  "a?.b??c",
  "#[derive(Debug)]",
  "use std::io::{Read, Write};",
  "match n { 0 => Ok(()), _ => Err(()) }",
  "arr[i] = map[&k];",
];

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function pickWeighted<T>(items: readonly T[], weight: (item: T) => number, rng: () => number): T {
  const weights = items.map(weight);
  const sum = weights.reduce((a, b) => a + Math.max(0, b), 0);
  if (sum <= 0) return items[Math.floor(rng() * items.length)]!;
  let cursor = rng() * sum;
  for (let i = 0; i < items.length; i++) {
    cursor -= Math.max(0, weights[i]!);
    if (cursor <= 0) return items[i]!;
  }
  return items[items.length - 1]!;
}

/**
 * Rank characters that need practice — keybr-style confidence from error rate,
 * with a floor so brand-new misses still surface.
 */
export const rankWeakTargets = Effect.fn("Practice.rankWeakTargets")(function* (
  sessions: readonly PracticeSessionSummary[],
  limit = 12,
) {
  const map = new Map<string, { correct: number; total: number; latencySum: number }>();
  const bump = (ch: string, correct: boolean, latencyMs = 0) => {
    if (!ch || ch.length !== 1) return;
    if (ch === "↵" || ch === "⇥") return;
    const prev = map.get(ch) ?? { correct: 0, total: 0, latencySum: 0 };
    prev.total += 1;
    if (correct) prev.correct += 1;
    prev.latencySum += latencyMs;
    map.set(ch, prev);
  };

  for (const session of sessions.slice(0, 50)) {
    for (const event of session.events) {
      if (event._tag === "CharTyped") bump(event.expected, event.correct, event.latencyMs ?? 0);
      if (event._tag === "IndentResolved") {
        bump(event.key === "Tab" ? "\t" : " ", event.correct, event.latencyMs ?? 0);
      }
    }
  }

  const ranked: WeakTarget[] = [];
  for (const [char, s] of map) {
    if (s.total < 1) continue;
    const accuracy = (s.correct / s.total) * 100;
    const missRate = 1 - s.correct / s.total;
    const meanLatency = s.latencySum / s.total;
    // Weight: misses + slow inter-key times (keybr confidence), log-scaled by samples.
    const weight =
      Math.max(
        0.05,
        missRate * 4 +
          (accuracy < 95 ? (100 - accuracy) / 40 : 0) +
          Math.min(meanLatency, 800) / 900,
      ) * Math.log2(s.total + 1);
    if (weight < 0.08 && accuracy >= 97 && meanLatency < 220) continue;
    ranked.push(WeakTarget.make({ char, accuracy, samples: s.total, weight }));
  }

  return ranked.sort((a, b) => b.weight - a.weight).slice(0, limit);
});

function atomScore(atom: string, weak: readonly WeakTarget[]): number {
  if (weak.length === 0) return 1;
  let score = 0.15;
  for (const w of weak) {
    const count = atom.split(w.char).length - 1;
    if (count > 0) score += w.weight * count;
  }
  return score;
}

function injectWeakChar(char: string, rng: () => number): string {
  if (char === " ") return "let _ = ();";
  if (char === "\t") return "    let indented = true;";
  const patterns = [
    `${char}`,
    `(${char})`,
    `{${char}}`,
    `[${char}]`,
    `${char}${char}`,
    `::${char}`,
    `->${char}`,
    `${char}?`,
    `"${char}"`,
    `${char}_`,
  ];
  return patterns[Math.floor(rng() * patterns.length)]!;
}

function buildLine(
  atoms: readonly string[],
  weak: readonly WeakTarget[],
  rng: () => number,
  targetLen: number,
): string {
  const parts: string[] = [];
  let len = 0;
  // Force at least one weak injection when we have targets.
  if (weak.length > 0 && rng() < 0.85) {
    const w = pickWeighted(weak, (t) => t.weight, rng);
    const injected = injectWeakChar(w.char, rng);
    parts.push(injected);
    len += injected.length;
  }
  while (len < targetLen) {
    const atom = pickWeighted(atoms, (a) => atomScore(a, weak), rng);
    parts.push(atom);
    len += atom.length + 1;
    if (parts.length > 6) break;
  }
  return parts.join(" ");
}

function corpusLines(mode: PracticeMode): string[] {
  const drills = mode === "symbols" ? SYMBOLS_DRILLS : RUST_TEXT_DRILLS;
  return drills.flatMap((d) => [...d.lines]).filter((l) => l.trim().length > 0);
}

/**
 * Keybr-style adaptive lesson: synthesize a PracticeScript whose buffer
 * over-represents weak characters while staying coding-shaped (Rust/symbols).
 */
export const synthesizeAdaptiveScript = Effect.fn("Practice.synthesizeAdaptiveScript")(function* (input: {
  readonly mode: PracticeMode;
  readonly sessions: readonly PracticeSessionSummary[];
  readonly seed?: number;
  readonly goal?: SessionGoal;
  readonly lineCount?: number;
}) {
  const mode = input.mode === "nav" ? "rust-text" : input.mode;
  const weak = yield* rankWeakTargets(input.sessions, 10);
  const rng = mulberry32(input.seed ?? Date.now());
  const atoms = mode === "symbols" ? SYMBOL_ATOMS : RUST_ATOMS;
  const fromCorpus = corpusLines(mode);
  const goal = input.goal ?? SESSION_GOAL_UNTIL_COMPLETE;

  const lineCount = input.lineCount ?? (mode === "symbols" ? 5 : 6);
  const lines: string[] = [];

  // Prefer high-density corpus lines first.
  const scoredCorpus = fromCorpus
    .map((line) => ({ line, score: atomScore(line, weak) }))
    .sort((a, b) => b.score - a.score);
  for (const row of scoredCorpus.slice(0, Math.min(2, lineCount))) {
    if (row.score > 0.2) lines.push(row.line);
  }

  while (lines.length < lineCount) {
    lines.push(buildLine(atoms, weak, rng, mode === "symbols" ? 28 : 42));
  }

  const focusLabel =
    weak.length > 0
      ? weak
          .slice(0, 4)
          .map((w) => (w.char === " " ? "␠" : w.char === "\t" ? "⇥" : w.char))
          .join("")
      : "";

  const formattedLines = mode === "rust-text" ? yield* formatRustLines(lines) : lines;

  return PracticeScript.make({
    id: `adaptive-${mode}-${(input.seed ?? Date.now()).toString(36)}`,
    mode,
    title: focusLabel ? focusLabel : mode === "symbols" ? "Symbols" : "Rust",
    goal,
    lines: formattedLines,
    indentUnitWidth: 4,
    indentPolicy: detect4,
    actions: [],
  });
});

/** Focus characters for the current adaptive lesson (for heatmap tint). */
export const focusCharsFromScript = Effect.fn("Practice.focusCharsFromScript")(function* (
  script: PracticeScript,
) {
  if (!script.id.startsWith("adaptive-") && !script.title.startsWith("Adaptive")) {
    return [] as string[];
  }
  const counts = new Map<string, number>();
  for (const line of script.lines) {
    for (const ch of line) {
      if (ch === "\n") continue;
      counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
  }
  // Characters denser than baseline in short adaptive lessons are focus candidates;
  // return top punctuation + letters by relative frequency.
  return [...counts.entries()]
    .filter(([ch]) => ch.trim().length > 0 || ch === " ")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([ch]) => ch);
});
