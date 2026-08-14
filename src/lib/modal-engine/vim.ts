import type { KeymapQuery, SyncEngine } from "./helix";
import type { Registry } from "./registry";
import {
  EngineResult,
  keyCharValue,
  keyDigit,
  keyIsChar,
  type CommandToken,
  type EditingParadigm,
  type EngineResult as EngineResultT,
  type InputState,
  type Key,
  type Lookup as LookupT,
  type Mode,
  type OperatorId,
  type TextObjectKind,
} from "./schema";

interface PendingOp {
  operator: OperatorId;
  register: string | undefined;
  count: number;
  textObjectKind: TextObjectKind | undefined;
}

type SubMode =
  | { readonly _tag: "Normal" }
  | { readonly _tag: "OperatorPending"; readonly pending: PendingOp };

export class VimEngine<Ctx> implements SyncEngine<Ctx> {
  readonly paradigm: EditingParadigm = "vim";
  private subMode: SubMode = { _tag: "Normal" };
  private count: number | undefined;
  private motionCount: number | undefined;
  private register: string | undefined;
  private pending = "";

  constructor(private readonly registry: Registry<Ctx>) {}

  modeName(): string {
    return "vim";
  }

  pendingDisplay(): string {
    return this.pending;
  }

  isPending(): boolean {
    return this.subMode._tag === "OperatorPending" || this.count !== undefined;
  }

  reset(): void {
    this.subMode = { _tag: "Normal" };
    this.count = undefined;
    this.motionCount = undefined;
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

  preResolve(ctx: Ctx, mode: Mode, _keymaps: KeymapQuery, key: Key): EngineResultT | undefined {
    if (this.subMode._tag === "Normal") {
      if (mode === "Insert") return undefined;
      const digit = keyDigit(key);
      if (digit !== undefined && (this.count !== undefined || digit > 0)) {
        const current = this.count ?? 0;
        const next = current * 10 + digit;
        if (next <= 100_000_000) this.count = next;
        return EngineResult.cases.Pending.make({});
      }
      return undefined;
    }

    const pending = this.subMode.pending;
    if (key.code._tag === "Esc") {
      this.subMode = { _tag: "Normal" };
      this.pending = "";
      return EngineResult.cases.Executed.make({});
    }

    const digit = keyDigit(key);
    if (digit !== undefined && (this.motionCount !== undefined || digit > 0)) {
      const current = this.motionCount ?? 0;
      const next = current * 10 + digit;
      if (next <= 100_000_000) this.motionCount = next;
      return EngineResult.cases.Pending.make({});
    }

    if (pending.textObjectKind === undefined) {
      if (keyIsChar(key, "i")) {
        this.subMode = {
          _tag: "OperatorPending",
          pending: { ...pending, textObjectKind: "Inside" },
        };
        return EngineResult.cases.Pending.make({});
      }
      if (keyIsChar(key, "a")) {
        this.subMode = {
          _tag: "OperatorPending",
          pending: { ...pending, textObjectKind: "Around" },
        };
        return EngineResult.cases.Pending.make({});
      }
    }

    const operator = this.registry.operator(pending.operator);
    if (operator?.doubledKey !== undefined && keyIsChar(key, operator.doubledKey)) {
      this.subMode = { _tag: "Normal" };
      this.pending = "";
      this.motionCount = undefined;
      operator.execute(ctx, { register: pending.register });
      return EngineResult.cases.Executed.make({});
    }

    return undefined;
  }

  processLookup(ctx: Ctx, mode: Mode, key: Key, lookup: LookupT): EngineResultT {
    if (this.subMode._tag === "OperatorPending") {
      return this.processOperatorPending(ctx, lookup);
    }

    if (mode === "Insert") {
      switch (lookup._tag) {
        case "Matched": {
          const resolved = this.registry.resolve(lookup.token);
          if (resolved?._tag === "Action") {
            resolved.entry.execute(ctx, { count: 1 });
          }
          return EngineResult.cases.Executed.make({});
        }
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
        case "MatchedSequence":
          return EngineResult.cases.Unbound.make({});
        case "Fallback":
          return EngineResult.cases.Unbound.make({});
        default: {
          const _exhaustive: never = lookup;
          return _exhaustive;
        }
      }
    }

    const count = this.count;
    const register = this.register;
    this.count = undefined;
    this.register = undefined;

    switch (lookup._tag) {
      case "Matched":
        return this.dispatchNormal(ctx, lookup.token, count ?? 1, register);
      case "MatchedSequence":
        for (const token of lookup.tokens) {
          this.dispatchNormal(ctx, token, count ?? 1, register);
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
      case "Fallback": {
        const entry = this.registry.charPendingEntry(lookup.id);
        if (!entry) return EngineResult.cases.Unbound.make({});
        const command = entry.resolve(lookup.char, count ?? 1);
        if (command._tag === "Motion") {
          command.run(ctx, { count: count ?? 1, kind: "Move" });
        } else {
          command.run(ctx, { count: count ?? 1, register, ch: lookup.char });
        }
        return EngineResult.cases.Executed.make({});
      }
      default: {
        const _exhaustive: never = lookup;
        return _exhaustive;
      }
    }
  }

  private processOperatorPending(ctx: Ctx, lookup: LookupT): EngineResultT {
    if (this.subMode._tag !== "OperatorPending") {
      return EngineResult.cases.Unbound.make({});
    }
    const pending = this.subMode.pending;
    const motionCount = this.motionCount ?? 1;
    this.motionCount = undefined;
    const total = pending.count * motionCount;

    switch (lookup._tag) {
      case "Matched": {
        const resolved = this.registry.resolve(lookup.token);
        if (resolved?._tag === "Motion") {
          this.subMode = { _tag: "Normal" };
          this.pending = "";
          resolved.entry.make(total)(ctx, { count: total, kind: "Extend" });
          this.registry.operator(pending.operator)?.execute(ctx, { register: pending.register });
          return EngineResult.cases.Executed.make({});
        }
        if (resolved?._tag === "TextObject") {
          this.subMode = { _tag: "Normal" };
          this.pending = "";
          const kind = pending.textObjectKind ?? "Inside";
          resolved.entry.make(total)(ctx, { count: total, kind });
          this.registry.operator(pending.operator)?.execute(ctx, { register: pending.register });
          return EngineResult.cases.Executed.make({});
        }
        this.subMode = { _tag: "Normal" };
        this.pending = "";
        return EngineResult.cases.Unbound.make({});
      }
      case "Pending":
        return EngineResult.cases.Pending.make({});
      case "NotFound":
      case "MatchedSequence":
      case "Cancelled":
      case "Fallback":
        this.subMode = { _tag: "Normal" };
        this.pending = "";
        return EngineResult.cases.Unbound.make({});
      default: {
        const _exhaustive: never = lookup;
        return _exhaustive;
      }
    }
  }

  private dispatchNormal(
    ctx: Ctx,
    token: CommandToken,
    count: number,
    register: string | undefined,
  ): EngineResultT {
    const resolved = this.registry.resolve(token);
    if (!resolved) return EngineResult.cases.Unbound.make({});

    switch (resolved._tag) {
      case "Operator":
        this.subMode = {
          _tag: "OperatorPending",
          pending: {
            operator: resolved.entry.id,
            register,
            count: Math.max(1, count),
            textObjectKind: undefined,
          },
        };
        this.pending = resolved.entry.pendingDisplay;
        return EngineResult.cases.Pending.make({});
      case "Motion":
        resolved.entry.make(count)(ctx, { count, kind: "Move" });
        return EngineResult.cases.Executed.make({});
      case "Action":
        resolved.entry.execute(ctx, { count, register });
        return EngineResult.cases.Executed.make({});
      case "TextObject":
      case "CharPending":
        return EngineResult.cases.Unbound.make({});
      default: {
        const _exhaustive: never = resolved;
        return _exhaustive;
      }
    }
  }
}
