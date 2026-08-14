import { Effect } from "effect";

import {
  ActionId,
  Builder,
  CommandToken,
  EngineResult,
  feedKeyEffect,
  Key,
  KeyCode,
  Lookup,
  MotionId,
  modalEngineFactoryLayer,
  ModalEngineFactoryService,
  type EditingParadigm,
  type EngineResultT,
  type KeyT,
  type KeymapQuery,
  type LookupT,
  type Registry,
  type SyncEngine,
} from "$lib/modal-engine";

import type { PracticeAction } from "./contracts";
import { completeCurrentAction, type SessionState } from "./session";
import type { PracticeScript } from "./contracts";

export interface NavBufferCtx {
  cursorRow: number;
  cursorCol: number;
  lastCommand: string | undefined;
}

export function createNavBufferCtx(row = 0, col = 0): NavBufferCtx {
  return { cursorRow: row, cursorCol: col, lastCommand: undefined };
}

export function buildNavRegistry(): Registry<NavBufferCtx> {
  return new Builder<NavBufferCtx>()
    .motionCounted(MotionId("down"), (count) => (ctx) => {
      ctx.cursorRow += count;
      ctx.lastCommand = "motion:down";
    })
    .motionCounted(MotionId("up"), (count) => (ctx) => {
      ctx.cursorRow = Math.max(0, ctx.cursorRow - count);
      ctx.lastCommand = "motion:up";
    })
    .motionCounted(MotionId("word"), (count) => (ctx) => {
      ctx.cursorCol += count * 4;
      ctx.lastCommand = "motion:word";
    })
    .action(ActionId("half-page"), (ctx) => {
      ctx.cursorRow += 2;
      ctx.lastCommand = "chord:half-page";
    })
    .action(ActionId("goto-def"), (ctx) => {
      ctx.lastCommand = "action:goto-def";
    })
    .freeze();
}

const keymaps: KeymapQuery = {
  containsKey: () => false,
  pendingIsEmpty: () => true,
};

function modifiersFromBrowser(key: string, ctrl: boolean, shift: boolean, alt: boolean, meta: boolean) {
  return {
    control: ctrl || undefined,
    shift: shift || undefined,
    alt: alt || undefined,
    super: meta || undefined,
  };
}

export function browserKeyToModalKey(
  key: string,
  mods: { control?: boolean; shift?: boolean; alt?: boolean; meta?: boolean } = {},
): KeyT {
  if (key === "Escape") return Key.make({ code: KeyCode.cases.Esc.make({}), modifiers: {} });
  if (key === "Enter") return Key.make({ code: KeyCode.cases.Enter.make({}), modifiers: {} });
  if (key.length === 1) {
    return Key.make({
      code: KeyCode.cases.Char.make({ char: key }),
      modifiers: modifiersFromBrowser(key, !!mods.control, !!mods.shift, !!mods.alt, !!mods.meta),
    });
  }
  return Key.make({
    code: KeyCode.cases.Other.make({ code: 0 }),
    modifiers: modifiersFromBrowser(key, !!mods.control, !!mods.shift, !!mods.alt, !!mods.meta),
  });
}

/** Map raw keys → Lookup for Helix / Vim / VS Code nav drills. */
export function lookupNavKey(paradigm: EditingParadigm, key: KeyT): LookupT {
  const ch = key.code._tag === "Char" ? key.code.char : "";
  const ctrl = key.modifiers.control === true;

  if (paradigm === "vscode") {
    if (ctrl && ch.toLowerCase() === "d") {
      return Lookup.cases.Matched.make({
        token: CommandToken.cases.Action.make({ id: ActionId("half-page") }),
      });
    }
    if (ctrl && ch.toLowerCase() === "g") {
      return Lookup.cases.Pending.make({});
    }
    if (ctrl && ch.toLowerCase() === "d" /* after g pending handled separately */) {
      return Lookup.cases.NotFound.make({});
    }
  }

  // Helix + Vim share hjkl / w; goto-def as `g` then `d` via sequence in host.
  if (ch === "j") {
    return Lookup.cases.Matched.make({
      token: CommandToken.cases.Motion.make({ id: MotionId("down") }),
    });
  }
  if (ch === "k") {
    return Lookup.cases.Matched.make({
      token: CommandToken.cases.Motion.make({ id: MotionId("up") }),
    });
  }
  if (ch === "w") {
    return Lookup.cases.Matched.make({
      token: CommandToken.cases.Motion.make({ id: MotionId("word") }),
    });
  }
  if (ctrl && ch.toLowerCase() === "d") {
    return Lookup.cases.Matched.make({
      token: CommandToken.cases.Action.make({ id: ActionId("half-page") }),
    });
  }
  if (ch === "g") {
    return Lookup.cases.Pending.make({});
  }
  if (ch === "d") {
    // Second key of `gd` — host passes Matched action when pending was g.
    return Lookup.cases.Matched.make({
      token: CommandToken.cases.Action.make({ id: ActionId("goto-def") }),
    });
  }

  return Lookup.cases.NotFound.make({});
}

export interface NavDrillHandle {
  readonly engine: SyncEngine<NavBufferCtx>;
  readonly ctx: NavBufferCtx;
  readonly paradigm: EditingParadigm;
  pendingGoto: boolean;
}

export const createNavDrillEffect = Effect.fn("Practice.createNavDrill")(function* (
  paradigm: EditingParadigm,
) {
  const factory = yield* ModalEngineFactoryService;
  const registry = buildNavRegistry();
  const engine = yield* factory.create(paradigm, registry);
  const handle: NavDrillHandle = {
    engine,
    ctx: createNavBufferCtx(),
    paradigm,
    pendingGoto: false,
  };
  return handle;
});

export const feedNavKeyEffect = Effect.fn("Practice.feedNavKey")(function* (input: {
  handle: NavDrillHandle;
  script: PracticeScript;
  state: SessionState;
  atMs: number;
  key: KeyT;
}) {
  const { handle, script, state, atMs, key } = input;
  const action = script.actions[state.actionIndex] as PracticeAction | undefined;
  if (!action || state.finished) {
    return { state, result: EngineResult.cases.Unbound.make({}), handle };
  }

  let lookup = lookupNavKey(handle.paradigm, key);
  const ch = key.code._tag === "Char" ? key.code.char : "";

  if (handle.pendingGoto && ch === "d") {
    lookup = Lookup.cases.Matched.make({
      token: CommandToken.cases.Action.make({ id: ActionId("goto-def") }),
    });
    handle.pendingGoto = false;
  } else if (lookup._tag === "Pending" && ch === "g") {
    handle.pendingGoto = true;
  } else if (lookup._tag !== "Pending") {
    handle.pendingGoto = false;
  }

  const result = yield* feedKeyEffect({
    engine: handle.engine,
    ctx: handle.ctx,
    mode: "Normal",
    keymaps,
    key,
    lookup,
  });

  if (result._tag !== "Executed" || !handle.ctx.lastCommand) {
    return { state, result, handle };
  }

  const expected = action.expected ?? "";
  const correct = handle.ctx.lastCommand === expected;
  const nextState = yield* completeCurrentAction(script, state, atMs, correct);
  if (correct && action.cursor) {
    handle.ctx.cursorRow = action.cursor.row;
    handle.ctx.cursorCol = action.cursor.col;
  }
  handle.ctx.lastCommand = undefined;
  return { state: nextState, result, handle };
});

export const navDrillLayer = modalEngineFactoryLayer;
