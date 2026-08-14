import { Effect } from "effect";

import type { CodingNgram, ConfusionPair, PersonalKeyStat } from "./contracts";
import type { CoachKeySlot } from "./contracts";
import {
  effortForGeometry,
  geometryForKey,
  type Finger,
  type KeyGeometry,
} from "./geometry";

export interface ScoreBreakdown {
  readonly total: number;
  readonly effort: number;
  readonly sameFinger: number;
  readonly redirects: number;
  readonly rolls: number;
  readonly stretch: number;
  readonly handBalance: number;
  readonly personal: number;
  readonly confusion: number;
}

const FINGER_RANK: Record<Finger, number> = {
  pinky: 0,
  ring: 1,
  middle: 2,
  index: 3,
  thumb: 4,
};

function codeToSlot(slots: readonly CoachKeySlot[], code: string): CoachKeySlot | undefined {
  return slots.find((s) => s.code === code && !s.trackball);
}

/** +1 = toward index (inroll), -1 = toward pinky (outroll), 0 = same finger. */
const rollDirection = Effect.fnUntraced(function* (from: KeyGeometry, to: KeyGeometry) {
  if (from.hand !== to.hand) return 0;
  return FINGER_RANK[to.finger] - FINGER_RANK[from.finger];
});

/**
 * Oxeylyzer-style layout score on coding n-grams:
 * effort + SFB + redirects − inrolls + stretch/scissors + hand balance + personal.
 */
export const scoreLayout = Effect.fn("Coach.scoreLayout")(function* (
  slots: readonly CoachKeySlot[],
  ngrams: readonly CodingNgram[],
  personal: readonly PersonalKeyStat[] = [],
  confusion: readonly ConfusionPair[] = [],
) {
  let effort = 0;
  let sameFinger = 0;
  let redirects = 0;
  let rolls = 0;
  let stretch = 0;
  let leftLoad = 0;
  let rightLoad = 0;
  let personalPenalty = 0;
  let confusionPenalty = 0;
  const personalByCode = new Map(personal.map((p) => [p.code, p]));
  const confusionByExpected = new Map<string, number>();
  for (const pair of confusion) {
    confusionByExpected.set(
      pair.expected,
      (confusionByExpected.get(pair.expected) ?? 0) + pair.count,
    );
  }

  for (const ng of ngrams) {
    const chars = [...ng.grams];
    let prevGeo: KeyGeometry | undefined;
    let prevDir = 0;
    for (const ch of chars) {
      const code = yield* charToKeycode(ch);
      const slot = codeToSlot(slots, code);
      if (!slot) continue;
      const geo = yield* geometryForKey(slot.keyId);
      if (!geo) continue;

      const unitEffort = yield* effortForGeometry(geo);
      effort += unitEffort * ng.weight;
      stretch += geo.stretch * 1.4 * ng.weight;
      if (geo.hand === "left") leftLoad += unitEffort * ng.weight;
      else rightLoad += unitEffort * ng.weight;

      if (prevGeo) {
        if (prevGeo.hand === geo.hand && prevGeo.finger === geo.finger) {
          sameFinger += 1.2 * ng.weight;
        }

        const dir = yield* rollDirection(prevGeo, geo);
        if (prevGeo.hand === geo.hand && dir !== 0) {
          // Prefer inrolls (toward index); penalize outrolls lightly.
          if (dir > 0) rolls -= 0.35 * ng.weight;
          else rolls += 0.25 * ng.weight;

          // Redirect: same-hand direction flip between bigrams.
          if (prevDir !== 0 && Math.sign(prevDir) !== Math.sign(dir)) {
            redirects += 0.9 * ng.weight;
          }
          prevDir = dir;
        } else if (prevGeo.hand !== geo.hand) {
          prevDir = 0;
        }

        // Scissors: adjacent fingers jumping across non-home rows.
        const fingerGap = Math.abs(FINGER_RANK[prevGeo.finger] - FINGER_RANK[geo.finger]);
        if (
          prevGeo.hand === geo.hand &&
          fingerGap === 1 &&
          prevGeo.rowClass !== geo.rowClass &&
          (prevGeo.rowClass !== "home" || geo.rowClass !== "home")
        ) {
          stretch += 0.55 * ng.weight;
        }
      }

      prevGeo = geo;
      const stat = personalByCode.get(code);
      if (stat && stat.samples >= 3) {
        personalPenalty +=
          (stat.errorRate * 2.2 + Math.min(stat.meanLatencyMs, 800) / 700) * ng.weight;
      }
      const confuseCount = confusionByExpected.get(code) ?? 0;
      if (confuseCount > 0) {
        // Harder keys amplify confusion cost (pinky/stretch placements hurt more).
        confusionPenalty += Math.min(confuseCount, 12) * 0.08 * (1 + unitEffort) * ng.weight;
      }
    }
  }

  const handTotal = leftLoad + rightLoad;
  const handBalance =
    handTotal > 0 ? (Math.abs(leftLoad - rightLoad) / handTotal) * handTotal * 0.35 : 0;

  return {
    effort,
    sameFinger,
    redirects,
    rolls,
    stretch,
    handBalance,
    personal: personalPenalty,
    confusion: confusionPenalty,
    total:
      effort +
      sameFinger +
      redirects +
      rolls +
      stretch +
      handBalance +
      personalPenalty +
      confusionPenalty,
  } satisfies ScoreBreakdown;
});

const charToKeycode = Effect.fnUntraced(function* (ch: string) {
  const map: Record<string, string> = {
    " ": "KC_SPC",
    ";": "KC_SCLN",
    ",": "KC_COMM",
    ".": "KC_DOT",
    "/": "KC_SLSH",
    "-": "KC_MINS",
    "=": "KC_EQL",
    "[": "KC_LBRC",
    "]": "KC_RBRC",
    "\\": "KC_BSLS",
    "'": "KC_QUOT",
    "(": "KC_LPRN",
    ")": "KC_RPRN",
    "<": "KC_LT",
    ">": "KC_GT",
    ":": "KC_COLN",
    "!": "KC_EXLM",
    "@": "KC_AT",
    "#": "KC_HASH",
    "*": "KC_ASTR",
    "+": "KC_PLUS",
    "&": "KC_AMPR",
    "?": "KC_QUES",
    "_": "KC_UNDS",
    "{": "KC_LCBR",
    "}": "KC_RCBR",
    "|": "KC_PIPE",
    "`": "KC_GRV",
    "~": "KC_TILD",
    "^": "KC_CIRC",
    "%": "KC_PERC",
    "$": "KC_DLR",
    '"': "KC_DQUO",
  };
  if (map[ch]) return map[ch]!;
  if (/^[a-z]$/i.test(ch)) return `KC_${ch.toUpperCase()}`;
  if (/^[0-9]$/.test(ch)) return `KC_${ch}`;
  return `KC_NO`;
});
