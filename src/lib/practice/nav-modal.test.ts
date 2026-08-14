import { Effect } from "effect";
import { describe, expect, it } from "@effect/vitest";

import { keyChar } from "$lib/modal-engine";

import { NAV_DRILL_V1 } from "./nav-corpus";
import {
  createNavDrillEffect,
  feedNavKeyEffect,
  navDrillLayer,
} from "./nav-modal";
import { createSessionState, type SessionState } from "./session";

describe("nav drills via modal engine", () => {
  for (const paradigm of ["helix", "vim", "vscode"] as const) {
    it.effect(`${paradigm}: j executes down motion against registry`, () =>
      Effect.gen(function* () {
        const handle = yield* createNavDrillEffect(paradigm);
        const state0 = yield* createSessionState(NAV_DRILL_V1, 0);
        const { state, result } = yield* feedNavKeyEffect({
          handle,
          script: NAV_DRILL_V1,
          state: state0,
          atMs: 50,
          key: keyChar("j"),
        });
        expect(result._tag).toBe("Executed");
        expect(state.actionIndex).toBe(1);
        expect(state.events.some((e) => e._tag === "ActionCompleted" && e.actionId === "n1")).toBe(
          true,
        );
      }).pipe(Effect.provide(navDrillLayer)),
    );
  }

  it.effect("helix: gd chord sequence completes goto-def action", () =>
    Effect.gen(function* () {
      const handle = yield* createNavDrillEffect("helix");
      let state: SessionState = yield* createSessionState(NAV_DRILL_V1, 0);
      // skip to goto-def action
      for (const key of ["j", "w"]) {
        const out = yield* feedNavKeyEffect({
          handle,
          script: NAV_DRILL_V1,
          state,
          atMs: 10,
          key: keyChar(key),
        });
        state = out.state;
      }
      // Ctrl+D for chord
      {
        const out = yield* feedNavKeyEffect({
          handle,
          script: NAV_DRILL_V1,
          state,
          atMs: 20,
          key: keyChar("d", { control: true }),
        });
        state = out.state;
      }
      // up
      {
        const out = yield* feedNavKeyEffect({
          handle,
          script: NAV_DRILL_V1,
          state,
          atMs: 30,
          key: keyChar("k"),
        });
        state = out.state;
      }
      expect(state.actionIndex).toBe(4);
      const g = yield* feedNavKeyEffect({
        handle,
        script: NAV_DRILL_V1,
        state,
        atMs: 40,
        key: keyChar("g"),
      });
      expect(g.result._tag).toBe("Pending");
      const d = yield* feedNavKeyEffect({
        handle,
        script: NAV_DRILL_V1,
        state: g.state,
        atMs: 50,
        key: keyChar("d"),
      });
      expect(d.result._tag).toBe("Executed");
      expect(d.state.finished).toBe(true);
    }).pipe(Effect.provide(navDrillLayer)),
  );
});
