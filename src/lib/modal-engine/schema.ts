/**
 * Schema atoms for the modal engine.
 * Upstream: e:/helix/helix-fork/helix-modal (`helix_modal::core`).
 */
import { Schema } from "effect";

export const EditingParadigmSchema = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(64));
export type EditingParadigm = typeof EditingParadigmSchema.Type;

export const BuiltinParadigmSchema = Schema.Literals(["helix", "vim", "vscode"]);
export type BuiltinParadigm = typeof BuiltinParadigmSchema.Type;

export const Mode = Schema.Literals(["Normal", "Insert", "Select"]);
export type Mode = typeof Mode.Type;

export const KeyCode = Schema.TaggedUnion({
  Char: { char: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(8)) },
  Esc: {},
  Enter: {},
  Tab: {},
  Backspace: {},
  Other: { code: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)) },
});
export type KeyCode = typeof KeyCode.Type;

export const Modifiers = Schema.Struct({
  shift: Schema.optionalKey(Schema.Boolean),
  control: Schema.optionalKey(Schema.Boolean),
  alt: Schema.optionalKey(Schema.Boolean),
  super: Schema.optionalKey(Schema.Boolean),
});
export interface Modifiers extends Schema.Schema.Type<typeof Modifiers> {}

export const Key = Schema.Struct({
  code: KeyCode,
  modifiers: Modifiers,
});
export interface Key extends Schema.Schema.Type<typeof Key> {}

export const CommandId = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120));
export type CommandId = typeof CommandId.Type;

export const MotionId = CommandId.pipe(Schema.brand("MotionId"));
export type MotionId = typeof MotionId.Type;

export const OperatorId = CommandId.pipe(Schema.brand("OperatorId"));
export type OperatorId = typeof OperatorId.Type;

export const TextObjectId = CommandId.pipe(Schema.brand("TextObjectId"));
export type TextObjectId = typeof TextObjectId.Type;

export const ActionId = CommandId.pipe(Schema.brand("ActionId"));
export type ActionId = typeof ActionId.Type;

export const CharPendingId = CommandId.pipe(Schema.brand("CharPendingId"));
export type CharPendingId = typeof CharPendingId.Type;

export const CommandToken = Schema.TaggedUnion({
  Motion: { id: MotionId },
  Operator: { id: OperatorId },
  TextObject: { id: TextObjectId },
  Action: { id: ActionId },
  CharPending: { id: CharPendingId },
});
export type CommandToken = typeof CommandToken.Type;

export const Lookup = Schema.TaggedUnion({
  Matched: { token: CommandToken },
  MatchedSequence: { tokens: Schema.Array(CommandToken).check(Schema.isMaxLength(32)) },
  Pending: {},
  NotFound: {},
  Cancelled: { keys: Schema.Array(Key).check(Schema.isMaxLength(64)) },
  Fallback: {
    id: CharPendingId,
    char: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(8)),
  },
});
export type Lookup = typeof Lookup.Type;

export const MotionMode = Schema.Literals(["Move", "Extend"]);
export type MotionMode = typeof MotionMode.Type;

export const MotionArgs = Schema.Struct({
  count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  kind: MotionMode,
});
export interface MotionArgs extends Schema.Schema.Type<typeof MotionArgs> {}

export const OperatorArgs = Schema.Struct({
  register: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(1))),
});
export interface OperatorArgs extends Schema.Schema.Type<typeof OperatorArgs> {}

export const TextObjectKind = Schema.Literals(["Inside", "Around"]);
export type TextObjectKind = typeof TextObjectKind.Type;

export const TextObjectArgs = Schema.Struct({
  count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  kind: TextObjectKind,
});
export interface TextObjectArgs extends Schema.Schema.Type<typeof TextObjectArgs> {}

export const ActionArgs = Schema.Struct({
  count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  register: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(1))),
});
export interface ActionArgs extends Schema.Schema.Type<typeof ActionArgs> {}

export const CharActionArgs = Schema.Struct({
  count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(1)),
  register: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(1))),
  ch: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(8)),
});
export interface CharActionArgs extends Schema.Schema.Type<typeof CharActionArgs> {}

export const EngineResult = Schema.TaggedUnion({
  Executed: {},
  Pending: {},
  InsertChar: { char: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(8)) },
  CancelledInsert: { keys: Schema.Array(Key).check(Schema.isMaxLength(64)) },
  Unbound: {},
  ReplayInsert: {
    entryCommand: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(120)),
    keys: Schema.Array(Key).check(Schema.isMaxLength(512)),
  },
});
export type EngineResult = typeof EngineResult.Type;

export const InputState = Schema.Struct({
  count: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
  selectedRegister: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(1))),
});
export interface InputState extends Schema.Schema.Type<typeof InputState> {}

export function keyChar(char: string, modifiers: Modifiers = {}): Key {
  return Key.make({ code: KeyCode.cases.Char.make({ char }), modifiers });
}

export function keyEsc(): Key {
  return Key.make({ code: KeyCode.cases.Esc.make({}), modifiers: {} });
}

export function modifiersEmpty(m: Modifiers): boolean {
  return !m.shift && !m.control && !m.alt && !m.super;
}

export function keyCharValue(key: Key): string | undefined {
  if (key.code._tag !== "Char" || !modifiersEmpty(key.modifiers)) return undefined;
  return key.code.char;
}

export function keyIsChar(key: Key, char: string): boolean {
  return keyCharValue(key) === char;
}

export function keyDigit(key: Key): number | undefined {
  const ch = keyCharValue(key);
  if (ch === undefined || ch < "0" || ch > "9") return undefined;
  return ch.charCodeAt(0) - 48;
}

export const MotionIdMake = (name: string) => MotionId.make(name);
export const OperatorIdMake = (name: string) => OperatorId.make(name);
export const TextObjectIdMake = (name: string) => TextObjectId.make(name);
export const ActionIdMake = (name: string) => ActionId.make(name);
export const CharPendingIdMake = (name: string) => CharPendingId.make(name);
