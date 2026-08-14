import type { KeymapQuery, SyncEngine } from "./helix";
import type { Registry } from "./registry";
import {
  EngineResult,
  keyCharValue,
  type CommandToken,
  type EditingParadigm,
  type EngineResult as EngineResultT,
  type InputState,
  type Key,
  type Lookup as LookupT,
  type Mode,
} from "./schema";

/** VS Code-style chord pending on the same Registry/Lookup surface. */
export class VsCodeEngine<Ctx> implements SyncEngine<Ctx> {
  readonly paradigm: EditingParadigm = "vscode";
  private chordPending = false;
  private pending = "";

  constructor(private readonly registry: Registry<Ctx>) {}

  modeName(): string {
    return "vscode";
  }

  pendingDisplay(): string {
    return this.pending;
  }

  isPending(): boolean {
    return this.chordPending;
  }

  reset(): void {
    this.chordPending = false;
    this.pending = "";
  }

  inputState(): InputState {
    return {};
  }

  setInputState(_state: InputState): void {}

  preResolve(_ctx: Ctx, _mode: Mode, _keymaps: KeymapQuery, key: Key): EngineResultT | undefined {
    if (key.code._tag === "Esc" && this.chordPending) {
      this.chordPending = false;
      this.pending = "";
      return EngineResult.cases.Executed.make({});
    }
    return undefined;
  }

  processLookup(ctx: Ctx, _mode: Mode, key: Key, lookup: LookupT): EngineResultT {
    switch (lookup._tag) {
      case "Pending":
        this.chordPending = true;
        this.pending = describeKey(key);
        return EngineResult.cases.Pending.make({});
      case "Matched":
        this.chordPending = false;
        this.pending = "";
        return this.execute(ctx, lookup.token);
      case "MatchedSequence":
        this.chordPending = false;
        this.pending = "";
        for (const token of lookup.tokens) {
          const result = this.execute(ctx, token);
          if (result._tag === "Unbound") return result;
        }
        return EngineResult.cases.Executed.make({});
      case "NotFound": {
        if (this.chordPending) {
          this.chordPending = false;
          this.pending = "";
          return EngineResult.cases.Unbound.make({});
        }
        const ch = keyCharValue(key);
        return ch !== undefined
          ? EngineResult.cases.InsertChar.make({ char: ch })
          : EngineResult.cases.Unbound.make({});
      }
      case "Cancelled":
        this.chordPending = false;
        this.pending = "";
        return EngineResult.cases.CancelledInsert.make({ keys: [...lookup.keys] });
      case "Fallback": {
        this.chordPending = false;
        this.pending = "";
        const entry = this.registry.charPendingEntry(lookup.id);
        if (!entry) return EngineResult.cases.Unbound.make({});
        const command = entry.resolve(lookup.char, 1);
        if (command._tag === "Motion") {
          command.run(ctx, { count: 1, kind: "Move" });
        } else {
          command.run(ctx, { count: 1, ch: lookup.char });
        }
        return EngineResult.cases.Executed.make({});
      }
      default: {
        const _exhaustive: never = lookup;
        return _exhaustive;
      }
    }
  }

  private execute(ctx: Ctx, token: CommandToken): EngineResultT {
    const resolved = this.registry.resolve(token);
    if (!resolved) return EngineResult.cases.Unbound.make({});
    switch (resolved._tag) {
      case "Motion":
        resolved.entry.make(1)(ctx, { count: 1, kind: "Move" });
        return EngineResult.cases.Executed.make({});
      case "Operator":
        resolved.entry.execute(ctx, {});
        return EngineResult.cases.Executed.make({});
      case "TextObject":
        resolved.entry.make(1)(ctx, { count: 1, kind: "Inside" });
        return EngineResult.cases.Executed.make({});
      case "Action":
        resolved.entry.execute(ctx, { count: 1 });
        return EngineResult.cases.Executed.make({});
      case "CharPending":
        return EngineResult.cases.Unbound.make({});
      default: {
        const _exhaustive: never = resolved;
        return _exhaustive;
      }
    }
  }
}

function describeKey(key: Key): string {
  const parts: string[] = [];
  if (key.modifiers.control) parts.push("Ctrl");
  if (key.modifiers.super) parts.push("Cmd");
  if (key.modifiers.alt) parts.push("Alt");
  if (key.modifiers.shift) parts.push("Shift");
  if (key.code._tag === "Char") parts.push(key.code.char.toUpperCase());
  else parts.push(key.code._tag);
  return parts.join("+");
}
