import { Context, Effect, Layer, Ref, Schema } from "effect";

import type { KeymapQuery, SyncEngine } from "./helix";
import { HelixEngine } from "./helix";
import type { Registry } from "./registry";
import {
  EditingParadigmSchema,
  type EditingParadigm,
  type EngineResult,
  type Key,
  type Lookup,
  type Mode,
} from "./schema";
import { VimEngine } from "./vim";
import { VsCodeEngine } from "./vscode";

export class UnknownEditingParadigmError extends Schema.TaggedErrorClass<UnknownEditingParadigmError>()(
  "ModalEngine.UnknownEditingParadigm",
  { paradigm: EditingParadigmSchema },
) {}

export interface FeedInput<Ctx> {
  readonly engine: SyncEngine<Ctx>;
  readonly ctx: Ctx;
  readonly mode: Mode;
  readonly keymaps: KeymapQuery;
  readonly key: Key;
  readonly lookup: Lookup;
}

/** Host feed helper: pre_resolve then process_lookup (helix-modal standalone). */
export const feedKeyEffect = Effect.fn("ModalEngine.feedKey")(function* <Ctx>(input: FeedInput<Ctx>) {
  const early = input.engine.preResolve(input.ctx, input.mode, input.keymaps, input.key);
  if (early !== undefined) return early;
  return input.engine.processLookup(input.ctx, input.mode, input.key, input.lookup);
});

export interface Interface {
  readonly create: <Ctx>(
    paradigm: EditingParadigm,
    registry: Registry<Ctx>,
  ) => Effect.Effect<SyncEngine<Ctx>, UnknownEditingParadigmError>;
  readonly register: (
    paradigm: string,
    factory: <Ctx>(registry: Registry<Ctx>) => SyncEngine<Ctx>,
  ) => Effect.Effect<void>;
}

export class Service extends Context.Service<Service, Interface>()("@kbgui/ModalEngineFactory") {}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const customs = yield* Ref.make(
      new Map<string, <Ctx>(registry: Registry<Ctx>) => SyncEngine<Ctx>>(),
    );

    const create = Effect.fn("ModalEngineFactory.create")(function* <Ctx>(
      paradigm: EditingParadigm,
      registry: Registry<Ctx>,
    ) {
      switch (paradigm) {
        case "helix":
          return new HelixEngine(registry);
        case "vim":
          return new VimEngine(registry);
        case "vscode":
          return new VsCodeEngine(registry);
        default: {
          const map = yield* Ref.get(customs);
          const factory = map.get(paradigm);
          if (!factory) {
            return yield* new UnknownEditingParadigmError({ paradigm });
          }
          return factory(registry);
        }
      }
    });

    const register = Effect.fn("ModalEngineFactory.register")(function* (
      paradigm: string,
      factory: <Ctx>(registry: Registry<Ctx>) => SyncEngine<Ctx>,
    ) {
      yield* Ref.update(customs, (map) => {
        const next = new Map(map);
        next.set(paradigm, factory);
        return next;
      });
    });

    return Service.of({ create, register });
  }),
);
