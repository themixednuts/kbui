import {
  ActionIdMake,
  CharPendingIdMake,
  CommandToken,
  MotionIdMake,
  OperatorIdMake,
  TextObjectIdMake,
  type ActionArgs,
  type ActionId,
  type CharActionArgs,
  type CharPendingId,
  type MotionArgs,
  type MotionId,
  type OperatorArgs,
  type OperatorId,
  type TextObjectArgs,
  type TextObjectId,
} from "./schema";

export type MotionFn<Ctx> = (ctx: Ctx, args: MotionArgs) => void;
export type OperatorFn<Ctx> = (ctx: Ctx, args: OperatorArgs) => void;
export type TextObjectFn<Ctx> = (ctx: Ctx, args: TextObjectArgs) => void;
export type ActionFn<Ctx> = (ctx: Ctx, args: ActionArgs) => void;
export type CharActionFn<Ctx> = (ctx: Ctx, args: CharActionArgs) => void;

export type CharPendingCommand<Ctx> =
  | { readonly _tag: "Motion"; readonly run: MotionFn<Ctx> }
  | { readonly _tag: "Action"; readonly run: CharActionFn<Ctx> };

export interface MotionEntry<Ctx> {
  readonly id: MotionId;
  readonly make: (count: number | undefined) => MotionFn<Ctx>;
}

export interface OperatorEntry<Ctx> {
  readonly id: OperatorId;
  readonly execute: OperatorFn<Ctx>;
  readonly pendingDisplay: string;
  readonly doubledKey: string | undefined;
}

export interface TextObjectEntry<Ctx> {
  readonly id: TextObjectId;
  readonly make: (count: number) => TextObjectFn<Ctx>;
}

export interface ActionEntry<Ctx> {
  readonly id: ActionId;
  readonly execute: ActionFn<Ctx>;
}

export interface CharPendingEntry<Ctx> {
  readonly id: CharPendingId;
  readonly resolve: (ch: string, count: number) => CharPendingCommand<Ctx>;
}

export type CommandRef<Ctx> =
  | { readonly _tag: "Motion"; readonly entry: MotionEntry<Ctx> }
  | { readonly _tag: "Operator"; readonly entry: OperatorEntry<Ctx> }
  | { readonly _tag: "TextObject"; readonly entry: TextObjectEntry<Ctx> }
  | { readonly _tag: "Action"; readonly entry: ActionEntry<Ctx> }
  | { readonly _tag: "CharPending"; readonly entry: CharPendingEntry<Ctx> };

export class Builder<Ctx> {
  private readonly motions: MotionEntry<Ctx>[] = [];
  private readonly operators: OperatorEntry<Ctx>[] = [];
  private readonly textObjects: TextObjectEntry<Ctx>[] = [];
  private readonly actions: ActionEntry<Ctx>[] = [];
  private readonly charPendingEntries: CharPendingEntry<Ctx>[] = [];

  motionCounted(id: MotionId | string, make: (count: number) => MotionFn<Ctx>): this {
    const motionId = typeof id === "string" ? MotionIdMake(id) : id;
    this.motions.push({
      id: motionId,
      make: (count) => make(count ?? 1),
    });
    return this;
  }

  operator(
    id: OperatorId | string,
    execute: OperatorFn<Ctx>,
    options?: { pendingDisplay?: string; doubledKey?: string },
  ): this {
    const operatorId = typeof id === "string" ? OperatorIdMake(id) : id;
    this.operators.push({
      id: operatorId,
      execute,
      pendingDisplay: options?.pendingDisplay ?? String(operatorId),
      doubledKey: options?.doubledKey,
    });
    return this;
  }

  textObject(id: TextObjectId | string, make: (count: number) => TextObjectFn<Ctx>): this {
    const textId = typeof id === "string" ? TextObjectIdMake(id) : id;
    this.textObjects.push({ id: textId, make });
    return this;
  }

  action(id: ActionId | string, execute: ActionFn<Ctx>): this {
    const actionId = typeof id === "string" ? ActionIdMake(id) : id;
    this.actions.push({ id: actionId, execute });
    return this;
  }

  charPending(
    id: CharPendingId | string,
    resolve: (ch: string, count: number) => CharPendingCommand<Ctx>,
  ): this {
    const pendingId = typeof id === "string" ? CharPendingIdMake(id) : id;
    this.charPendingEntries.push({ id: pendingId, resolve });
    return this;
  }

  freeze(): Registry<Ctx> {
    return new Registry(
      [...this.motions].sort((a, b) => String(a.id).localeCompare(String(b.id))),
      [...this.operators].sort((a, b) => String(a.id).localeCompare(String(b.id))),
      [...this.textObjects].sort((a, b) => String(a.id).localeCompare(String(b.id))),
      [...this.actions].sort((a, b) => String(a.id).localeCompare(String(b.id))),
      [...this.charPendingEntries].sort((a, b) => String(a.id).localeCompare(String(b.id))),
    );
  }
}

export class Registry<Ctx> {
  constructor(
    private readonly motions: readonly MotionEntry<Ctx>[],
    private readonly operators: readonly OperatorEntry<Ctx>[],
    private readonly textObjects: readonly TextObjectEntry<Ctx>[],
    private readonly actions: readonly ActionEntry<Ctx>[],
    private readonly charPending: readonly CharPendingEntry<Ctx>[],
  ) {}

  resolve(token: CommandToken): CommandRef<Ctx> | undefined {
    switch (token._tag) {
      case "Motion": {
        const entry = this.motions.find((m) => m.id === token.id);
        return entry ? { _tag: "Motion", entry } : undefined;
      }
      case "Operator": {
        const entry = this.operators.find((m) => m.id === token.id);
        return entry ? { _tag: "Operator", entry } : undefined;
      }
      case "TextObject": {
        const entry = this.textObjects.find((m) => m.id === token.id);
        return entry ? { _tag: "TextObject", entry } : undefined;
      }
      case "Action": {
        const entry = this.actions.find((m) => m.id === token.id);
        return entry ? { _tag: "Action", entry } : undefined;
      }
      case "CharPending": {
        const entry = this.charPending.find((m) => m.id === token.id);
        return entry ? { _tag: "CharPending", entry } : undefined;
      }
      default: {
        const _exhaustive: never = token;
        return _exhaustive;
      }
    }
  }

  operator(id: OperatorId): OperatorEntry<Ctx> | undefined {
    return this.operators.find((entry) => entry.id === id);
  }

  charPendingEntry(id: CharPendingId): CharPendingEntry<Ctx> | undefined {
    return this.charPending.find((entry) => entry.id === id);
  }
}
