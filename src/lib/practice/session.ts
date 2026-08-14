import { Effect } from "effect";

import {
  advanceBufferAtom,
  compileBufferDocument,
  cursorAfterAtoms,
  initialIndentState,
  type BufferDocument,
  type IndentDetectState,
} from "./buffer";
import {
  PracticeEvent,
  goalDeadlineMs,
  type BufferCursor,
  type IndentStyle,
  type KeyboardLayoutRef,
  type PracticeInput,
  type PracticeScript,
  type PracticeSessionSummary,
} from "./contracts";

export interface SessionState {
  readonly document: BufferDocument;
  readonly atomIndex: number;
  readonly indent: IndentDetectState;
  readonly actionIndex: number;
  readonly events: readonly PracticeEvent[];
  readonly finished: boolean;
  readonly textCharsTyped: number;
  readonly textCharsCorrect: number;
  readonly actionStartedAtMs: number;
  /** Last text stroke timestamp — drives inter-key latency on CharTyped. */
  readonly lastStrokeAtMs: number | null;
  /** Layer hops since last correct text advance — juggling signal. */
  readonly layerHopsSinceLast: number;
  readonly cursor: BufferCursor;
  readonly motionLatencyTotalMs: number;
  readonly motionAttempts: number;
  readonly motionCorrect: number;
}

export const createSessionState = Effect.fn("Practice.createSessionState")(function* (
  script: PracticeScript,
  atMs = 0,
): Generator<Effect.Effect<unknown>, SessionState, never> {
  const document = yield* compileBufferDocument(script);
  const indent = yield* initialIndentState(script.indentPolicy);
  const isNav = script.mode === "nav";
  const firstAction = script.actions[0];

  const events: PracticeEvent[] = isNav
    ? firstAction
      ? [PracticeEvent.cases.ActionStarted.make({ actionId: firstAction.id, atMs })]
      : [PracticeEvent.cases.SessionEnded.make({ atMs, reason: "completed" })]
    : document.atoms.length === 0
      ? [PracticeEvent.cases.SessionEnded.make({ atMs, reason: "completed" })]
      : [];

  const state: SessionState = {
    document,
    atomIndex: 0,
    indent,
    actionIndex: 0,
    events,
    finished: isNav ? !firstAction : document.atoms.length === 0,
    textCharsTyped: 0,
    textCharsCorrect: 0,
    actionStartedAtMs: atMs,
    lastStrokeAtMs: null,
    layerHopsSinceLast: 0,
    cursor: { row: 0, col: 0 },
    motionLatencyTotalMs: 0,
    motionAttempts: 0,
    motionCorrect: 0,
  };
  return state;
});

const interKeyLatencyMs = Effect.fnUntraced(function* (state: SessionState, atMs: number) {
  if (state.lastStrokeAtMs === null) return 0;
  return Math.max(0, atMs - state.lastStrokeAtMs);
});

const endSession = Effect.fn("Practice.endSession")(function* (
  state: SessionState,
  atMs: number,
  reason: "completed" | "timeout" | "aborted",
) {
  if (state.finished) return state;
  return {
    ...state,
    finished: true,
    events: [...state.events, PracticeEvent.cases.SessionEnded.make({ atMs, reason })],
  } satisfies SessionState;
});

const advanceNavAction = Effect.fn("Practice.advanceNavAction")(function* (
  script: PracticeScript,
  state: SessionState,
  atMs: number,
  correct: boolean,
) {
  const current = script.actions[state.actionIndex];
  if (!current) return yield* endSession(state, atMs, "completed");

  const latencyMs = Math.max(0, atMs - state.actionStartedAtMs);
  const events: PracticeEvent[] = [
    ...state.events,
    PracticeEvent.cases.ActionCompleted.make({
      actionId: current.id,
      atMs,
      correct,
      latencyMs,
    }),
  ];

  const nextIndex = state.actionIndex + 1;
  const next = script.actions[nextIndex];
  if (!next) {
    return {
      ...state,
      actionIndex: nextIndex,
      events: [...events, PracticeEvent.cases.SessionEnded.make({ atMs, reason: "completed" })],
      finished: true,
      motionLatencyTotalMs: state.motionLatencyTotalMs + latencyMs,
      motionAttempts: state.motionAttempts + 1,
      motionCorrect: state.motionCorrect + (correct ? 1 : 0),
    } satisfies SessionState;
  }

  return {
    ...state,
    actionIndex: nextIndex,
    events: [...events, PracticeEvent.cases.ActionStarted.make({ actionId: next.id, atMs })],
    actionStartedAtMs: atMs,
    cursor: next.cursor ?? state.cursor,
    motionLatencyTotalMs: state.motionLatencyTotalMs + latencyMs,
    motionAttempts: state.motionAttempts + 1,
    motionCorrect: state.motionCorrect + (correct ? 1 : 0),
  } satisfies SessionState;
});

export const applyPracticeInput = Effect.fn("Practice.applyPracticeInput")(function* (
  script: PracticeScript,
  state: SessionState,
  input: PracticeInput,
): Generator<Effect.Effect<unknown>, SessionState, never> {
  if (state.finished) return state;
  const deadlineMs = yield* goalDeadlineMs(script.goal);
  if (deadlineMs !== null && input.atMs >= deadlineMs) {
    return yield* endSession(state, input.atMs, "timeout");
  }

  if (script.mode === "nav") {
    const action = script.actions[state.actionIndex];
    if (!action) return yield* endSession(state, input.atMs, "completed");
    const expected = action.expected ?? "";
    const observed =
      input.stroke._tag === "Char"
        ? input.stroke.char
        : input.stroke._tag === "Space"
          ? " "
          : input.stroke._tag;
    if (observed !== expected) {
      return { ...state, motionAttempts: state.motionAttempts + 1 };
    }
    return yield* advanceNavAction(script, state, input.atMs, true);
  }

  if (input.stroke._tag === "Backspace") {
    return yield* rewindTextStroke(script, state, input.atMs);
  }

  if (state.atomIndex >= state.document.atoms.length) {
    return yield* endSession(state, input.atMs, "completed");
  }

  const result = yield* advanceBufferAtom({
    document: state.document,
    atomIndex: state.atomIndex,
    indent: state.indent,
    stroke: input.stroke,
  });

  if (result._tag === "PendingIndent") {
    return { ...state, indent: result.indent };
  }

  const latencyMs = yield* interKeyLatencyMs(state, input.atMs);
  const strokeContext =
    input.context !== undefined
      ? {
          ...input.context,
          layerHopsSinceLast: input.context.layerHopsSinceLast ?? state.layerHopsSinceLast,
        }
      : undefined;

  if (result._tag === "Miss") {
    const event =
      result.event._tag === "CharTyped"
        ? PracticeEvent.cases.CharTyped.make({
            atMs: input.atMs,
            expected: result.event.expected,
            observed: result.event.observed,
            correct: false,
            latencyMs,
            ...(strokeContext ? { context: strokeContext } : {}),
          })
        : PracticeEvent.cases.IndentResolved.make({
            atMs: input.atMs,
            units: result.event.units,
            style: result.event.style,
            key: result.event.key,
            correct: false,
            latencyMs,
            ...(strokeContext ? { context: strokeContext } : {}),
          });
    return {
      ...state,
      indent: result.indent,
      lastStrokeAtMs: input.atMs,
      textCharsTyped: state.textCharsTyped + 1,
      events: [...state.events, event],
    };
  }

  const event =
    result.event._tag === "CharTyped"
      ? PracticeEvent.cases.CharTyped.make({
          atMs: input.atMs,
          expected: result.event.expected,
          observed: result.event.observed,
          correct: true,
          latencyMs,
          ...(strokeContext ? { context: strokeContext } : {}),
        })
      : PracticeEvent.cases.IndentResolved.make({
          atMs: input.atMs,
          units: result.event.units,
          style: result.event.style,
          key: result.event.key,
          correct: true,
          latencyMs,
          ...(strokeContext ? { context: strokeContext } : {}),
        });

  const nextIndex = result.atomIndex;
  const finished = nextIndex >= state.document.atoms.length;
  const cursor = yield* cursorAfterAtoms(
    state.document.atoms,
    nextIndex,
    result.indent.locked,
    script.indentUnitWidth,
  );

  return {
    ...state,
    atomIndex: nextIndex,
    indent: result.indent,
    lastStrokeAtMs: input.atMs,
    layerHopsSinceLast: 0,
    cursor,
    textCharsTyped: state.textCharsTyped + 1,
    textCharsCorrect: state.textCharsCorrect + 1,
    events: finished
      ? [
          ...state.events,
          event,
          PracticeEvent.cases.SessionEnded.make({ atMs: input.atMs, reason: "completed" }),
        ]
      : [...state.events, event],
    finished,
  } satisfies SessionState;
});

const rewindTextStroke = Effect.fn("Practice.rewindTextStroke")(function* (
  script: PracticeScript,
  state: SessionState,
  atMs: number,
) {
  if (state.indent.pendingSpaces > 0) {
    return {
      ...state,
      indent: { ...state.indent, pendingSpaces: state.indent.pendingSpaces - 1 },
      lastStrokeAtMs: atMs,
    } satisfies SessionState;
  }
  if (state.atomIndex <= 0) return state;
  const nextIndex = state.atomIndex - 1;
  const cursor = yield* cursorAfterAtoms(
    state.document.atoms,
    nextIndex,
    state.indent.locked,
    script.indentUnitWidth,
  );
  return {
    ...state,
    atomIndex: nextIndex,
    cursor,
    lastStrokeAtMs: atMs,
  } satisfies SessionState;
});

export const recordLayerHop = Effect.fn("Practice.recordLayerHop")(function* (
  state: SessionState,
  atMs: number,
  fromLayerId: string,
  toLayerId: string,
) {
  if (fromLayerId === toLayerId || state.finished) return state;
  return {
    ...state,
    layerHopsSinceLast: state.layerHopsSinceLast + 1,
    events: [
      ...state.events,
      PracticeEvent.cases.LayerHopped.make({ atMs, fromLayerId, toLayerId }),
    ],
  } satisfies SessionState;
});

/** Atom progress for UntilComplete UI (nav uses actionIndex). */
export const sessionProgress = Effect.fn("Practice.sessionProgress")(function* (
  script: PracticeScript,
  state: SessionState,
) {
  if (script.mode === "nav") {
    const total = Math.max(1, script.actions.length);
    return {
      done: Math.min(state.actionIndex, total),
      total,
      ratio: Math.min(1, state.actionIndex / total),
    };
  }
  const total = Math.max(1, state.document.atoms.length);
  return {
    done: Math.min(state.atomIndex, total),
    total,
    ratio: Math.min(1, state.atomIndex / total),
  };
});

export const summarizeSession = Effect.fn("Practice.summarizeSession")(function* (
  script: PracticeScript,
  state: SessionState,
  keyboard: KeyboardLayoutRef,
  id: string,
  startedAt: string,
  endedAt: string,
) {
  const durationMs = Math.max(0, new Date(endedAt).getTime() - new Date(startedAt).getTime());
  const actionsCorrect = state.events.filter(
    (e) => e._tag === "ActionCompleted" && e.correct,
  ).length;
  const actionsTotal = state.events.filter((e) => e._tag === "ActionCompleted").length;
  const accuracy =
    state.textCharsTyped > 0
      ? (state.textCharsCorrect / state.textCharsTyped) * 100
      : actionsTotal > 0
        ? (actionsCorrect / actionsTotal) * 100
        : 100;

  const minutes = durationMs / 60_000;
  const wpm =
    script.mode === "nav" || state.textCharsCorrect === 0 || minutes <= 0
      ? null
      : Math.round(state.textCharsCorrect / 5 / minutes);

  const indentStyle: IndentStyle | undefined = state.indent.locked;

  return {
    id,
    source: "trainer-local-v1",
    scriptId: script.id,
    mode: script.mode,
    startedAt,
    endedAt,
    durationMs,
    wpm,
    accuracy: Math.round(accuracy * 10) / 10,
    actionsTotal,
    actionsCorrect,
    ...(indentStyle ? { indentStyle } : {}),
    events: [...state.events],
    keyboard,
  } satisfies PracticeSessionSummary;
});

export const completeCurrentAction = Effect.fn("Practice.completeCurrentAction")(function* (
  script: PracticeScript,
  state: SessionState,
  atMs: number,
  correct: boolean,
) {
  if (state.finished || script.mode !== "nav") return state;
  return yield* advanceNavAction(script, state, atMs, correct);
});

export const abortSession = Effect.fn("Practice.abortSession")(function* (
  state: SessionState,
  atMs: number,
) {
  return yield* endSession(state, atMs, "aborted");
});

export const timeoutSession = Effect.fn("Practice.timeoutSession")(function* (
  state: SessionState,
  atMs: number,
) {
  return yield* endSession(state, atMs, "timeout");
});

export const hasActionStream = Effect.fn("Practice.hasActionStream")(function* (
  script: PracticeScript,
) {
  return script.mode === "nav" && script.actions.length > 0;
});
