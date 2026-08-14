import type { Registry } from "./registry";
import {
  EngineResult,
  keyCharValue,
  keyDigit,
  type CharPendingId,
  type CommandToken,
  type EditingParadigm,
  type EngineResult as EngineResultT,
  type InputState,
  type Key,
  type Lookup as LookupT,
  type Mode,
  type MotionMode,
} from "./schema";

export interface KeymapQuery {
  containsKey(mode: Mode, key: Key): boolean;
  pendingIsEmpty(): boolean;
}

export interface SyncEngine<Ctx> {
  readonly paradigm: EditingParadigm;
  preResolve(ctx: Ctx, mode: Mode, keymaps: KeymapQuery, key: Key): EngineResultT | undefined;
  processLookup(ctx: Ctx, mode: Mode, key: Key, lookup: LookupT): EngineResultT;
  modeName(): string;
  pendingDisplay(): string;
  isPending(): boolean;
  reset(): void;
  inputState(): InputState;
  setInputState(state: InputState): void;
}

export class HelixEngine<Ctx> implements SyncEngine<Ctx> {
  readonly paradigm: EditingParadigm = "helix";
  private count: number | undefined;
  private register: string | undefined;
  private pending = "";

  constructor(private readonly registry: Registry<Ctx>) {}

  modeName(): string {
    return "helix";
  }

  pendingDisplay(): string {
    return this.pending;
  }

  isPending(): boolean {
    return this.count !== undefined;
  }

  reset(): void {
    this.count = undefined;
    this.register = undefined;
    this.pending = "";
  }

  inputState(): InputState {
    return { count: this.count, selectedRegister: this.register };
  }

  setInputState(state: InputState): void {
    this.count = state.count;
    this.register = state.selectedRegister;
  }

  preResolve(
    _ctx: Ctx,
    mode: Mode,
    keymaps: KeymapQuery,
    key: Key,
  ): EngineResultT | undefined {
    if (mode === "Insert") return undefined;

    const digit = keyDigit(key);
    if (digit !== undefined) {
      if (this.count !== undefined) {
        const next = this.count * 10 + digit;
        if (next <= 100_000_000) this.count = next;
        return EngineResult.cases.Pending.make({});
      }
      if (digit > 0 && !keymaps.containsKey(mode, key)) {
        this.count = digit;
        return EngineResult.cases.Pending.make({});
      }
    }

    return undefined;
  }

  processLookup(ctx: Ctx, mode: Mode, key: Key, lookup: LookupT): EngineResultT {
    if (mode === "Insert") {
      return this.processInsert(ctx, key, lookup);
    }

    const count = this.count;
    const countValue = count ?? 1;
    const register = this.register;
    const extend = mode === "Select";
    this.count = undefined;
    this.register = undefined;

    switch (lookup._tag) {
      case "Matched":
        return this.execute(ctx, lookup.token, countValue, register, extend);
      case "MatchedSequence":
        for (const token of lookup.tokens) {
          this.execute(ctx, token, countValue, register, extend);
        }
        return EngineResult.cases.Executed.make({});
      case "Pending":
        this.count = count;
        this.register = register;
        return EngineResult.cases.Pending.make({});
      case "NotFound":
        return EngineResult.cases.Unbound.make({});
      case "Cancelled":
        return EngineResult.cases.Executed.make({});
      case "Fallback":
        return this.executeCharPending(
          ctx,
          lookup.id,
          lookup.char,
          countValue,
          register,
          extend,
        );
      default: {
        const _exhaustive: never = lookup;
        return _exhaustive;
      }
    }
  }

  private processInsert(ctx: Ctx, key: Key, lookup: LookupT): EngineResultT {
    switch (lookup._tag) {
      case "Matched":
        return this.execute(ctx, lookup.token, 1, undefined, false);
      case "MatchedSequence":
        for (const token of lookup.tokens) {
          this.execute(ctx, token, 1, undefined, false);
        }
        return EngineResult.cases.Executed.make({});
      case "Pending":
        return EngineResult.cases.Pending.make({});
      case "NotFound": {
        const ch = keyCharValue(key);
        return ch !== undefined
          ? EngineResult.cases.InsertChar.make({ char: ch })
          : EngineResult.cases.Unbound.make({});
      }
      case "Cancelled":
        return EngineResult.cases.CancelledInsert.make({ keys: [...lookup.keys] });
      case "Fallback":
        return this.executeCharPending(ctx, lookup.id, lookup.char, 1, undefined, false);
      default: {
        const _exhaustive: never = lookup;
        return _exhaustive;
      }
    }
  }

  private execute(
    ctx: Ctx,
    token: CommandToken,
    count: number,
    register: string | undefined,
    extend: boolean,
  ): EngineResultT {
    const resolved = this.registry.resolve(token);
    if (!resolved) return EngineResult.cases.Unbound.make({});

    const kind: MotionMode = extend ? "Extend" : "Move";
    switch (resolved._tag) {
      case "Motion":
        resolved.entry.make(count)(ctx, { count, kind });
        return EngineResult.cases.Executed.make({});
      case "Operator":
        resolved.entry.execute(ctx, { register });
        return EngineResult.cases.Executed.make({});
      case "TextObject":
        resolved.entry.make(count)(ctx, { count, kind: "Around" });
        return EngineResult.cases.Executed.make({});
      case "Action":
        resolved.entry.execute(ctx, { count, register });
        return EngineResult.cases.Executed.make({});
      case "CharPending":
        return EngineResult.cases.Unbound.make({});
      default: {
        const _exhaustive: never = resolved;
        return _exhaustive;
      }
    }
  }

  private executeCharPending(
    ctx: Ctx,
    id: CharPendingId,
    ch: string,
    count: number,
    register: string | undefined,
    extend: boolean,
  ): EngineResultT {
    const entry = this.registry.charPendingEntry(id);
    if (!entry) return EngineResult.cases.Unbound.make({});
    const command = entry.resolve(ch, count);
    if (command._tag === "Motion") {
      command.run(ctx, { count, kind: extend ? "Extend" : "Move" });
    } else {
      command.run(ctx, { count, register, ch });
    }
    return EngineResult.cases.Executed.make({});
  }
}
