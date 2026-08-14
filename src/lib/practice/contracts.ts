import { Effect, Schema } from "effect";

const requiredText = (minimum: number, maximum: number) =>
  Schema.Trim.check(Schema.isMinLength(minimum), Schema.isMaxLength(maximum));

const optionalText = (maximum: number) =>
  Schema.optionalKey(Schema.NullOr(Schema.Trim.check(Schema.isMaxLength(maximum))));

export const PracticeSourceSchema = Schema.Literals(["trainer-local-v1"]);
export type PracticeSource = typeof PracticeSourceSchema.Type;

/** Action-stream kinds — text inserts are buffer atoms, not action chips. */
export const PracticeActionKindSchema = Schema.Literals(["motion", "chord"]);
export type PracticeActionKind = typeof PracticeActionKindSchema.Type;

export const PracticeModeSchema = Schema.Literals(["rust-text", "symbols", "nav"]);
export type PracticeMode = typeof PracticeModeSchema.Type;

export const BufferCursor = Schema.Struct({
  row: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  col: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export interface BufferCursor extends Schema.Schema.Type<typeof BufferCursor> {}

export const IndentWidthSchema = Schema.Literals([2, 4]);
export type IndentWidth = typeof IndentWidthSchema.Type;

export const IndentStyle = Schema.TaggedUnion({
  Spaces: { width: IndentWidthSchema },
  Tabs: {},
});
export type IndentStyle = typeof IndentStyle.Type;

/** How indent runs are authored/accepted during a text drill. */
export const IndentPolicy = Schema.TaggedUnion({
  /** Lock after first indent keystroke (Tab vs Space×width). */
  Detect: { candidateWidth: IndentWidthSchema },
  Fixed: { style: IndentStyle },
});
export type IndentPolicy = typeof IndentPolicy.Type;

/** Semantic buffer atoms — indent is not a sequence of space characters. */
export const BufferAtom = Schema.TaggedUnion({
  Char: { char: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1)) },
  Indent: { units: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 16 })) },
  Newline: {},
});
export type BufferAtom = typeof BufferAtom.Type;

export const KeyStroke = Schema.TaggedUnion({
  Char: { char: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1)) },
  Space: {},
  Tab: {},
  Enter: {},
  Backspace: {},
});
export type KeyStroke = typeof KeyStroke.Type;

export const PracticeAction = Schema.Struct({
  id: requiredText(1, 80),
  kind: PracticeActionKindSchema,
  glyph: requiredText(1, 40),
  label: requiredText(1, 160),
  expected: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(2_000))),
  cursor: Schema.optionalKey(BufferCursor),
});
export interface PracticeAction extends Schema.Schema.Type<typeof PracticeAction> {}

/**
 * How a session ends — keybr-style until the buffer/action stream is done,
 * or a fixed clock (Monkeytype-style timed runs).
 */
export const SessionGoal = Schema.TaggedUnion({
  UntilComplete: {},
  Timed: {
    seconds: Schema.Int.check(Schema.isBetween({ minimum: 5, maximum: 600 })),
  },
});
export type SessionGoal = typeof SessionGoal.Type;

export const SESSION_GOAL_UNTIL_COMPLETE = SessionGoal.cases.UntilComplete.make({});
export const SESSION_GOAL_TIMED_60 = SessionGoal.cases.Timed.make({ seconds: 60 });

export const PracticeScript = Schema.Struct({
  id: requiredText(1, 80),
  mode: PracticeModeSchema,
  title: requiredText(1, 160),
  /** End condition — default corpora use UntilComplete (finish the text). */
  goal: SessionGoal,
  /** Source lines; leading spaces/tabs compile into Indent atoms. */
  lines: Schema.Array(Schema.String.check(Schema.isMaxLength(500))).check(Schema.isMaxLength(200)),
  /** Width used when compiling leading spaces into indent units. */
  indentUnitWidth: IndentWidthSchema,
  indentPolicy: IndentPolicy,
  /** Motion/chord only — empty for Monkeytype-style text drills. */
  actions: Schema.Array(PracticeAction).check(Schema.isMaxLength(500)),
});
export interface PracticeScript extends Schema.Schema.Type<typeof PracticeScript> {}

/** Deadline in ms for Timed goals; null means run until complete. */
export const goalDeadlineMs = Effect.fn("Practice.goalDeadlineMs")(function* (goal: SessionGoal) {
  return goal._tag === "Timed" ? goal.seconds * 1000 : null;
});

export const isTimedGoal = Effect.fn("Practice.isTimedGoal")(function* (goal: SessionGoal) {
  return goal._tag === "Timed";
});

export const withSessionGoal = Effect.fn("Practice.withSessionGoal")(function* (
  script: PracticeScript,
  goal: SessionGoal,
) {
  return { ...script, goal } satisfies PracticeScript;
});

export const ModState = Schema.Struct({
  shift: Schema.Boolean,
  ctrl: Schema.Boolean,
  alt: Schema.Boolean,
  gui: Schema.Boolean,
});
export interface ModState extends Schema.Schema.Type<typeof ModState> {}

export const ProductionPathSchema = Schema.Literals([
  "direct",
  "modded",
  "layer",
  "layer-modded",
]);
/** Legacy aliases still accepted when reading old session JSON via normalizePathKind. */
export const ModActivationKindSchema = Schema.Literals([
  "hold",
  "one-shot",
  "mod-tap",
  "sticky",
]);
export type ModActivationKind = typeof ModActivationKindSchema.Type;

export const LayerAccessKindSchema = Schema.Literals([
  "momentary",
  "one-shot",
  "toggle",
  "switch",
  "default",
  "tap-toggle",
  "layer-tap",
]);
export type LayerAccessKind = typeof LayerAccessKindSchema.Type;

/** Intent vs observed context for juggling / predictive learning. */
export const StrokeContext = Schema.Struct({
  activeLayerId: requiredText(1, 80),
  mods: ModState,
  predictedLayerId: optionalText(80),
  predictedKeyIds: Schema.optionalKey(
    Schema.Array(requiredText(1, 40)).check(Schema.isMaxLength(16)),
  ),
  /** Raw binding code (e.g. KC_EQL), not the display hint. */
  predictedCode: optionalText(80),
  /** Human-readable path hint (e.g. OSM+S(KC_EQL)). */
  predictedHint: optionalText(120),
  predictedPath: Schema.optionalKey(ProductionPathSchema),
  modActivation: Schema.optionalKey(ModActivationKindSchema),
  layerAccessKind: Schema.optionalKey(LayerAccessKindSchema),
  modKeyIds: Schema.optionalKey(
    Schema.Array(requiredText(1, 40)).check(Schema.isMaxLength(8)),
  ),
  modHomeLayerId: optionalText(80),
  layerActivatorKeyIds: Schema.optionalKey(
    Schema.Array(requiredText(1, 40)).check(Schema.isMaxLength(4)),
  ),
  layerHopsSinceLast: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
});
export interface StrokeContext extends Schema.Schema.Type<typeof StrokeContext> {}

export const PracticeInput = Schema.Struct({
  atMs: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  stroke: KeyStroke,
  context: Schema.optionalKey(StrokeContext),
});
export interface PracticeInput extends Schema.Schema.Type<typeof PracticeInput> {}

export const IndentKeySchema = Schema.Literals(["Tab", "Space"]);
export type IndentKey = typeof IndentKeySchema.Type;

export const PracticeEvent = Schema.TaggedUnion({
  ActionStarted: {
    actionId: requiredText(1, 80),
    atMs: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  },
  ActionCompleted: {
    actionId: requiredText(1, 80),
    atMs: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    correct: Schema.Boolean,
    latencyMs: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  },
  CharTyped: {
    atMs: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    expected: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1)),
    observed: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(8)),
    correct: Schema.Boolean,
    /** Inter-key latency; optional for sessions persisted before v2. */
    latencyMs: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
    context: Schema.optionalKey(StrokeContext),
  },
  IndentResolved: {
    atMs: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    units: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 16 })),
    style: IndentStyle,
    key: IndentKeySchema,
    correct: Schema.Boolean,
    latencyMs: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
    context: Schema.optionalKey(StrokeContext),
  },
  LayerHopped: {
    atMs: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    fromLayerId: requiredText(1, 80),
    toLayerId: requiredText(1, 80),
  },
  SessionEnded: {
    atMs: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    reason: Schema.Literals(["completed", "timeout", "aborted"]),
  },
});
export type PracticeEvent = typeof PracticeEvent.Type;

export const KeyboardLayoutRef = Schema.Struct({
  keyboardId: requiredText(1, 160),
  keyboardName: requiredText(1, 160),
  layoutId: requiredText(1, 180),
  layoutName: requiredText(1, 160),
  layoutHash: optionalText(160),
  profileId: optionalText(160),
});
export interface KeyboardLayoutRef extends Schema.Schema.Type<typeof KeyboardLayoutRef> {}

export const PracticeSessionSummary = Schema.Struct({
  id: requiredText(1, 160),
  source: PracticeSourceSchema,
  scriptId: requiredText(1, 80),
  mode: PracticeModeSchema,
  startedAt: requiredText(1, 80),
  endedAt: requiredText(1, 80),
  durationMs: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  wpm: Schema.NullOr(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))),
  accuracy: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
  actionsTotal: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  actionsCorrect: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  indentStyle: Schema.optionalKey(IndentStyle),
  events: Schema.Array(PracticeEvent).check(Schema.isMaxLength(5_000)),
  keyboard: KeyboardLayoutRef,
});
export interface PracticeSessionSummary extends Schema.Schema.Type<typeof PracticeSessionSummary> {}

export const PracticeSessionSummaryList = Schema.Array(PracticeSessionSummary).check(
  Schema.isMaxLength(200),
);
export type PracticeSessionSummaryList = typeof PracticeSessionSummaryList.Type;

export class UnknownKeyStrokeError extends Schema.TaggedErrorClass<UnknownKeyStrokeError>()(
  "Practice.UnknownKeyStroke",
  { key: Schema.String },
) {}

export const modsFromKeyboardEvent = Effect.fn("Practice.modsFromKeyboardEvent")(function* (
  ev: KeyboardEvent,
) {
  return ModState.make({
    shift: ev.shiftKey,
    ctrl: ev.ctrlKey,
    alt: ev.altKey,
    gui: ev.metaKey,
  });
});

/** Map a browser keydown into a typed stroke (Space/Tab distinct from Char). */
export const strokeFromKeyboardEvent = Effect.fn("Practice.strokeFromKeyboardEvent")(function* (
  ev: KeyboardEvent,
) {
  if (ev.key === "Tab") return KeyStroke.cases.Tab.make({});
  if (ev.key === "Enter") return KeyStroke.cases.Enter.make({});
  if (ev.key === "Backspace") return KeyStroke.cases.Backspace.make({});
  if (ev.key === " ") return KeyStroke.cases.Space.make({});
  if (ev.key.length === 1) return KeyStroke.cases.Char.make({ char: ev.key });
  return yield* new UnknownKeyStrokeError({ key: ev.key });
});

export const strokeChar = Effect.fn("Practice.strokeChar")(function* (char: string) {
  if (char === " ") return KeyStroke.cases.Space.make({});
  if (char === "\t") return KeyStroke.cases.Tab.make({});
  if (char === "\n") return KeyStroke.cases.Enter.make({});
  return KeyStroke.cases.Char.make({ char });
});
