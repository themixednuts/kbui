import { Effect } from "effect";

import { adaptScript } from "./adaptive";
import {
  SESSION_GOAL_TIMED_60,
  SESSION_GOAL_UNTIL_COMPLETE,
  withSessionGoal,
  type PracticeMode,
  type PracticeScript,
  type PracticeSessionSummary,
  type SessionGoal,
} from "./contracts";
import { formatPracticeScript } from "./format-rust";
import { defaultNavScript } from "./nav-corpus";
import { pickRustTextScript } from "./rust-corpus";
import { createSessionState, type SessionState } from "./session";
import { pickSymbolsScript } from "./symbols-corpus";

export interface PreparedDrill {
  readonly script: PracticeScript;
  readonly session: SessionState;
}

export type GoalKind = "until-complete" | "timed";

export const goalFromKind = Effect.fn("Practice.goalFromKind")(function* (kind: GoalKind) {
  return kind === "timed" ? SESSION_GOAL_TIMED_60 : SESSION_GOAL_UNTIL_COMPLETE;
});

const pickBaseScript = Effect.fn("Practice.pickBaseScript")(function* (
  mode: PracticeMode,
  seed?: number,
) {
  if (mode === "symbols") return yield* pickSymbolsScript(seed);
  if (mode === "nav") return yield* defaultNavScript();
  return yield* pickRustTextScript(seed);
});

/**
 * Build an idle-ready drill (script + session at atom 0).
 * First valid keystroke should arm the clock — keybr/Monkeytype style.
 */
export const prepareDrill = Effect.fn("Practice.prepareDrill")(function* (input: {
  readonly mode: PracticeMode;
  readonly adaptive: boolean;
  readonly sessions: readonly PracticeSessionSummary[];
  readonly goal?: SessionGoal;
  readonly goalKind?: GoalKind;
  readonly seed?: number;
}) {
  let script = yield* pickBaseScript(input.mode, input.seed);
  if (input.adaptive && input.mode !== "nav") {
    script = yield* adaptScript(script, input.sessions, input.seed ?? Date.now());
  }
  const goal =
    input.goal ?? (yield* goalFromKind(input.goalKind ?? "until-complete"));
  script = yield* withSessionGoal(script, goal);
  script = yield* formatPracticeScript(script);
  const session = yield* createSessionState(script, 0);
  return { script, session } satisfies PreparedDrill;
});

/** Keys that should not arm / feed a practice session. */
export const isPracticeArmKey = Effect.fn("Practice.isPracticeArmKey")(function* (
  ev: KeyboardEvent,
) {
  if (ev.metaKey || ev.altKey) return false;
  if (ev.ctrlKey && ev.key !== "Control") return false;
  const target = ev.target as { tagName?: string; isContentEditable?: boolean } | null;
  if (target && typeof target.tagName === "string") {
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || target.isContentEditable) {
      return false;
    }
  }
  if (ev.key === "Escape" || ev.key === "F5" || ev.key.startsWith("Arrow")) return false;
  if (ev.key === "Shift" || ev.key === "Control" || ev.key === "Alt" || ev.key === "Meta") {
    return false;
  }
  if (ev.key === "Backspace" || ev.key === "Delete") return false;
  // Printable, Tab, Enter, Space arm the session.
  if (ev.key === "Tab" || ev.key === "Enter" || ev.key === " ") return true;
  return ev.key.length === 1;
});
