import { Effect, Result } from "effect";
import { describe, expect, it } from "@effect/vitest";

import {
  ActionId,
  Builder,
  CommandToken,
  feedKeyEffect,
  HelixEngine,
  keyChar,
  keyEsc,
  Lookup,
  modalEngineFactoryLayer,
  ModalEngineFactoryService,
  MotionId,
  OperatorId,
  UnknownEditingParadigmError,
  type KeyT,
  type KeymapQuery,
  type LookupT,
  type Registry,
  type SyncEngine,
} from "./index";

interface Toy {
  cursor: number;
  deleted: number;
  actions: string[];
}

function toy(): Toy {
  return { cursor: 0, deleted: 0, actions: [] };
}

function sharedRegistry(): Registry<Toy> {
  return new Builder<Toy>()
    .motionCounted(MotionId("word"), (count) => (ctx) => {
      ctx.cursor += count;
    })
    .operator(
      OperatorId("delete"),
      (ctx) => {
        ctx.deleted += 1;
      },
      { pendingDisplay: "d", doubledKey: "d" },
    )
    .action(ActionId("save"), (ctx) => {
      ctx.actions.push("save");
    })
    .freeze();
}

const keymaps: KeymapQuery = {
  containsKey: (_mode, key) => {
    const ch = key.code._tag === "Char" ? key.code.char : "";
    return ch === "w" || ch === "d" || ch === "s" || key.modifiers.control === true;
  },
  pendingIsEmpty: () => true,
};

function lookupFor(key: KeyT): LookupT {
  if (key.modifiers.control && key.code._tag === "Char" && key.code.char.toLowerCase() === "k") {
    return Lookup.cases.Pending.make({});
  }
  if (key.modifiers.control && key.code._tag === "Char" && key.code.char.toLowerCase() === "s") {
    return Lookup.cases.Matched.make({
      token: CommandToken.cases.Action.make({ id: ActionId("save") }),
    });
  }
  const ch = key.code._tag === "Char" && !key.modifiers.control ? key.code.char : undefined;
  if (ch === "w") {
    return Lookup.cases.Matched.make({
      token: CommandToken.cases.Motion.make({ id: MotionId("word") }),
    });
  }
  if (ch === "d") {
    return Lookup.cases.Matched.make({
      token: CommandToken.cases.Operator.make({ id: OperatorId("delete") }),
    });
  }
  if (ch === "s") {
    return Lookup.cases.Matched.make({
      token: CommandToken.cases.Action.make({ id: ActionId("save") }),
    });
  }
  return Lookup.cases.NotFound.make({});
}

function feed(engine: SyncEngine<Toy>, ctx: Toy, key: KeyT) {
  return feedKeyEffect({
    engine,
    ctx,
    mode: "Normal",
    keymaps,
    key,
    lookup: lookupFor(key),
  });
}

describe("modal-engine Effect port (helix-modal core)", () => {
  it.effect("helix executes motions immediately with counts", () =>
    Effect.gen(function* () {
      const factory = yield* ModalEngineFactoryService;
      const engine = yield* factory.create("helix", sharedRegistry());
      const ctx = toy();

      expect((yield* feed(engine, ctx, keyChar("2")))._tag).toBe("Pending");
      expect((yield* feed(engine, ctx, keyChar("w")))._tag).toBe("Executed");
      expect(ctx.cursor).toBe(2);
    }).pipe(Effect.provide(modalEngineFactoryLayer)),
  );

  it.effect("vim enters operator-pending then applies motion", () =>
    Effect.gen(function* () {
      const factory = yield* ModalEngineFactoryService;
      const engine = yield* factory.create("vim", sharedRegistry());
      const ctx = toy();

      expect((yield* feed(engine, ctx, keyChar("d")))._tag).toBe("Pending");
      expect(engine.isPending()).toBe(true);
      expect((yield* feed(engine, ctx, keyChar("w")))._tag).toBe("Executed");
      expect(ctx.deleted).toBe(1);
      expect(ctx.cursor).toBe(1);
    }).pipe(Effect.provide(modalEngineFactoryLayer)),
  );

  it.effect("vim doubled operator executes linewise delete", () =>
    Effect.gen(function* () {
      const factory = yield* ModalEngineFactoryService;
      const engine = yield* factory.create("vim", sharedRegistry());
      const ctx = toy();

      yield* feed(engine, ctx, keyChar("d"));
      expect((yield* feed(engine, ctx, keyChar("d")))._tag).toBe("Executed");
      expect(ctx.deleted).toBe(1);
    }).pipe(Effect.provide(modalEngineFactoryLayer)),
  );

  it.effect("vscode treats Ctrl+K as chord pending then Ctrl+S action", () =>
    Effect.gen(function* () {
      const factory = yield* ModalEngineFactoryService;
      const engine = yield* factory.create("vscode", sharedRegistry());
      const ctx = toy();

      const ctrlK = keyChar("k", { control: true });
      const ctrlS = keyChar("s", { control: true });

      expect((yield* feed(engine, ctx, ctrlK))._tag).toBe("Pending");
      expect(engine.pendingDisplay()).toContain("Ctrl");
      expect((yield* feed(engine, ctx, ctrlS))._tag).toBe("Executed");
      expect(ctx.actions).toEqual(["save"]);
    }).pipe(Effect.provide(modalEngineFactoryLayer)),
  );

  it.effect("vscode Esc cancels chord pending", () =>
    Effect.gen(function* () {
      const factory = yield* ModalEngineFactoryService;
      const engine = yield* factory.create("vscode", sharedRegistry());
      const ctx = toy();

      yield* feed(engine, ctx, keyChar("k", { control: true }));
      const result = yield* feedKeyEffect({
        engine,
        ctx,
        mode: "Normal",
        keymaps,
        key: keyEsc(),
        lookup: Lookup.cases.NotFound.make({}),
      });
      expect(result._tag).toBe("Executed");
      expect(engine.isPending()).toBe(false);
    }).pipe(Effect.provide(modalEngineFactoryLayer)),
  );

  it.effect("factory registers custom paradigms and rejects unknown", () =>
    Effect.gen(function* () {
      const factory = yield* ModalEngineFactoryService;
      yield* factory.register("toy", (registry) => new HelixEngine(registry));

      const engine = yield* factory.create("toy", sharedRegistry());
      expect(engine.paradigm).toBe("helix");

      const unknown = yield* Effect.result(factory.create("nope", sharedRegistry()));
      expect(Result.isFailure(unknown)).toBe(true);
      if (Result.isFailure(unknown)) {
        expect(unknown.failure).toBeInstanceOf(UnknownEditingParadigmError);
      }
    }).pipe(Effect.provide(modalEngineFactoryLayer)),
  );
});
