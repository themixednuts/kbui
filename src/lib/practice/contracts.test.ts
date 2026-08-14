import { Effect } from "effect";
import { describe, expect, it } from "@effect/vitest";

import { adaptScript, confidenceChips } from "./adaptive";
import { compileBufferDocument } from "./buffer";
import {
  SESSION_GOAL_TIMED_60,
  strokeChar,
  withSessionGoal,
  type KeyboardLayoutRef,
  type PracticeScript,
} from "./contracts";
import { formatPracticeScript } from "./format-rust";
import { RUST_TEXT_DRILL_V1, RUST_TEXT_DRILLS } from "./rust-corpus";
import {
  applyPracticeInput,
  createSessionState,
  summarizeSession,
  type SessionState,
} from "./session";
import { SYMBOLS_DRILL_V1 } from "./symbols-corpus";

const keyboard: KeyboardLayoutRef = {
  keyboardId: "bastardkb/charybdis/4x6",
  keyboardName: "Charybdis",
  layoutId: "daily",
  layoutName: "Daily",
  layoutHash: "abc",
};

/** Dense corpus → rustfmt, matching prepareDrill. */
const formattedRustV1 = Effect.fn("test.formattedRustV1")(function* () {
  return yield* formatPracticeScript(RUST_TEXT_DRILL_V1);
});

const typeExact = Effect.fn("test.typeExact")(function* (
  script: PracticeScript,
  preferTabIndent: boolean,
) {
  let state: SessionState = yield* createSessionState(script, 0);
  expect(state.cursor).toEqual({ row: 0, col: 0 });
  let t = 0;
  const doc = yield* compileBufferDocument(script);
  for (const atom of doc.atoms) {
    if (atom._tag === "Char") {
      t += 40;
      state = yield* applyPracticeInput(script, state, {
        atMs: t,
        stroke: yield* strokeChar(atom.char),
      });
    } else if (atom._tag === "Newline") {
      t += 40;
      state = yield* applyPracticeInput(script, state, {
        atMs: t,
        stroke: yield* strokeChar("\n"),
      });
    } else if (atom._tag === "Indent") {
      if (preferTabIndent) {
        t += 40;
        state = yield* applyPracticeInput(script, state, {
          atMs: t,
          stroke: yield* strokeChar("\t"),
        });
      } else {
        const spaces = atom.units * script.indentUnitWidth;
        for (let i = 0; i < spaces; i++) {
          t += 20;
          state = yield* applyPracticeInput(script, state, {
            atMs: t,
            stroke: yield* strokeChar(" "),
          });
        }
      }
    }
  }
  return state;
});

describe("practice buffer primitives (Effect)", () => {
  it.effect("starts the caret at the beginning of the buffer", () =>
    Effect.gen(function* () {
      const script = yield* formattedRustV1();
      const state = yield* createSessionState(script, 0);
      expect(state.cursor).toEqual({ row: 0, col: 0 });
      expect(state.atomIndex).toBe(0);
      expect(script.actions).toEqual([]);
    }),
  );

  it.effect("compiles leading spaces into Indent atoms (not Char spaces)", () =>
    Effect.gen(function* () {
      const script = yield* formattedRustV1();
      const doc = yield* compileBufferDocument(script);
      expect(doc.atoms.some((a) => a._tag === "Indent")).toBe(true);
      const indent = doc.atoms.find((a) => a._tag === "Indent");
      expect(indent).toMatchObject({ _tag: "Indent", units: 1 });
    }),
  );

  it.effect("accepts Tab for indent and locks Tabs style", () =>
    Effect.gen(function* () {
      const script = yield* formattedRustV1();
      let state: SessionState = yield* createSessionState(script, 0);
      for (const ch of "fn main() {") {
        state = yield* applyPracticeInput(script, state, {
          atMs: state.textCharsTyped + 1,
          stroke: yield* strokeChar(ch),
        });
      }
      state = yield* applyPracticeInput(script, state, {
        atMs: 100,
        stroke: yield* strokeChar("\n"),
      });
      state = yield* applyPracticeInput(script, state, {
        atMs: 120,
        stroke: yield* strokeChar("\t"),
      });
      expect(state.indent.locked).toMatchObject({ _tag: "Tabs" });
      expect(state.events.some((e) => e._tag === "IndentResolved" && e.key === "Tab")).toBe(true);
    }),
  );

  it.effect("accepts Space×width for indent and locks Spaces style", () =>
    Effect.gen(function* () {
      const script = yield* formattedRustV1();
      let state: SessionState = yield* createSessionState(script, 0);
      for (const ch of "fn main() {") {
        state = yield* applyPracticeInput(script, state, {
          atMs: state.textCharsTyped + 1,
          stroke: yield* strokeChar(ch),
        });
      }
      state = yield* applyPracticeInput(script, state, {
        atMs: 100,
        stroke: yield* strokeChar("\n"),
      });
      for (let i = 0; i < 4; i++) {
        state = yield* applyPracticeInput(script, state, {
          atMs: 110 + i,
          stroke: yield* strokeChar(" "),
        });
      }
      expect(state.indent.locked).toMatchObject({ _tag: "Spaces", width: 4 });
      expect(state.events.some((e) => e._tag === "IndentResolved" && e.key === "Space")).toBe(true);
    }),
  );

  it.effect("counts wrong keys toward accuracy without advancing the atom", () =>
    Effect.gen(function* () {
      const script = yield* formattedRustV1();
      let state: SessionState = yield* createSessionState(script, 0);
      state = yield* applyPracticeInput(script, state, {
        atMs: 50,
        stroke: yield* strokeChar("x"),
      });
      expect(state.atomIndex).toBe(0);
      expect(state.textCharsTyped).toBe(1);
      expect(state.textCharsCorrect).toBe(0);
    }),
  );

  it.effect("records inter-key latency on CharTyped events", () =>
    Effect.gen(function* () {
      const script = yield* formattedRustV1();
      let state: SessionState = yield* createSessionState(script, 0);
      state = yield* applyPracticeInput(script, state, {
        atMs: 100,
        stroke: yield* strokeChar("f"),
      });
      state = yield* applyPracticeInput(script, state, {
        atMs: 280,
        stroke: yield* strokeChar("n"),
      });
      const second = state.events.find(
        (e) => e._tag === "CharTyped" && e.expected === "n" && e.correct,
      );
      expect(second).toMatchObject({ _tag: "CharTyped", latencyMs: 180 });
    }),
  );

  it.effect("ends on timeout only for Timed goals", () =>
    Effect.gen(function* () {
      const script = yield* formattedRustV1();
      const timed = yield* withSessionGoal(script, SESSION_GOAL_TIMED_60);
      let state: SessionState = yield* createSessionState(timed, 0);
      state = yield* applyPracticeInput(timed, state, {
        atMs: 61_000,
        stroke: yield* strokeChar("f"),
      });
      expect(state.finished).toBe(true);
      expect(state.events.at(-1)).toMatchObject({ _tag: "SessionEnded", reason: "timeout" });

      const summary = yield* summarizeSession(
        timed,
        state,
        keyboard,
        "sess-1",
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:01:01.000Z",
      );
      expect(summary.source).toBe("trainer-local-v1");
      expect(summary.keyboard.keyboardId).toBe("bastardkb/charybdis/4x6");
    }),
  );

  it.effect("UntilComplete ignores the clock and finishes on last atom", () =>
    Effect.gen(function* () {
      const script = yield* formattedRustV1();
      expect(script.goal._tag).toBe("UntilComplete");
      let state: SessionState = yield* createSessionState(script, 0);
      // Far past 60s — still not timed out.
      state = yield* applyPracticeInput(script, state, {
        atMs: 120_000,
        stroke: yield* strokeChar("f"),
      });
      expect(state.finished).toBe(false);
      expect(state.atomIndex).toBe(1);

      const done = yield* typeExact(script, false);
      expect(done.finished).toBe(true);
      expect(done.events.at(-1)).toMatchObject({ _tag: "SessionEnded", reason: "completed" });
    }),
  );

  it.effect("completes a rust drill when the full buffer is typed (spaces indent)", () =>
    Effect.gen(function* () {
      const script = yield* formattedRustV1();
      const state = yield* typeExact(script, false);
      expect(state.finished).toBe(true);
      expect(state.events.at(-1)).toMatchObject({ _tag: "SessionEnded", reason: "completed" });
    }),
  );

  it("ships multiple rust text examples", () => {
    expect(RUST_TEXT_DRILLS.length).toBeGreaterThanOrEqual(5);
    expect(RUST_TEXT_DRILLS.every((s) => s.actions.length === 0)).toBe(true);
  });

  it("runs symbol drills without numpad targets", () => {
    expect(SYMBOLS_DRILL_V1.mode).toBe("symbols");
    expect(SYMBOLS_DRILL_V1.lines.join("")).not.toMatch(/KC_P[0-9]/);
  });

  it.effect("adaptive mode still works for nav-style action boosts", () =>
    Effect.gen(function* () {
      const script = yield* formattedRustV1();
      let state: SessionState = yield* createSessionState(script, 0);
      state = yield* applyPracticeInput(script, state, {
        atMs: 10,
        stroke: yield* strokeChar("x"),
      });
      const weakSummary = yield* summarizeSession(
        script,
        state,
        keyboard,
        "s",
        "2026-01-01T00:00:00.000Z",
        "2026-01-01T00:00:10.000Z",
      );
      const adapted = yield* adaptScript(script, [weakSummary]);
      expect(adapted.id).toContain("adaptive");
      const chips = yield* confidenceChips(script, [weakSummary]);
      expect(chips.length).toBeGreaterThan(0);
    }),
  );
});
