import { Context, Effect, Layer } from "effect";

import { adaptScript, confidenceChips, type ConfidenceChip } from "./adaptive";
import { bufferCells, compileBufferDocument, type BufferCell, type BufferDocument } from "./buffer";
import type {
  IndentStyle,
  KeyboardLayoutRef,
  PracticeInput,
  PracticeMode,
  PracticeScript,
  PracticeSessionSummary,
} from "./contracts";
import { defaultNavScript } from "./nav-corpus";
import { loadPracticeSessionsEffect, savePracticeSessionEffect } from "./persist";
import { prepareDrill, type PreparedDrill } from "./prepare";
import { pickRustTextScript } from "./rust-corpus";
import {
  abortSession,
  applyPracticeInput,
  createSessionState,
  hasActionStream,
  summarizeSession,
  timeoutSession,
  type SessionState,
} from "./session";
import { pickSymbolsScript } from "./symbols-corpus";

export interface Interface {
  readonly loadSessions: typeof loadPracticeSessionsEffect;
  readonly saveSession: typeof savePracticeSessionEffect;
  readonly pickScript: (
    mode: PracticeMode,
    seed?: number,
  ) => Effect.Effect<PracticeScript>;
  readonly prepare: typeof prepareDrill;
  readonly createSession: typeof createSessionState;
  readonly feedStroke: typeof applyPracticeInput;
  readonly summarize: typeof summarizeSession;
  readonly abort: typeof abortSession;
  readonly timeout: typeof timeoutSession;
  readonly adapt: (
    base: PracticeScript,
    sessions: readonly PracticeSessionSummary[],
    seed?: number,
  ) => Effect.Effect<PracticeScript>;
  readonly chips: typeof confidenceChips;
  readonly cells: typeof bufferCells;
  readonly compile: typeof compileBufferDocument;
  readonly showsActionStream: typeof hasActionStream;
}

export class Service extends Context.Service<Service, Interface>()("@kbgui/Practice") {}

export const layer = Layer.succeed(
  Service,
  Service.of({
    loadSessions: loadPracticeSessionsEffect,
    saveSession: savePracticeSessionEffect,
    pickScript: Effect.fn("Practice.Service.pickScript")(function* (
      mode: PracticeMode,
      seed?: number,
    ) {
      if (mode === "symbols") return yield* pickSymbolsScript(seed);
      if (mode === "nav") return yield* defaultNavScript();
      return yield* pickRustTextScript(seed);
    }),
    prepare: prepareDrill,
    createSession: createSessionState,
    feedStroke: applyPracticeInput,
    summarize: summarizeSession,
    abort: abortSession,
    timeout: timeoutSession,
    adapt: Effect.fn("Practice.Service.adapt")(function* (
      base: PracticeScript,
      sessions: readonly PracticeSessionSummary[],
      seed?: number,
    ) {
      return yield* adaptScript(base, sessions, seed);
    }),
    chips: confidenceChips,
    cells: bufferCells,
    compile: compileBufferDocument,
    showsActionStream: hasActionStream,
  }),
);

export const loadSessions = () => Effect.flatMap(Service, (s) => s.loadSessions());
export const saveSession = (summary: PracticeSessionSummary) =>
  Effect.flatMap(Service, (s) => s.saveSession(summary));
export const pickScript = (mode: PracticeMode, seed?: number) =>
  Effect.flatMap(Service, (s) => s.pickScript(mode, seed));
export const prepare = (
  ...args: Parameters<typeof prepareDrill>
) => Effect.flatMap(Service, (s) => s.prepare(...args));
export const createSession = (script: PracticeScript, atMs?: number) =>
  Effect.flatMap(Service, (s) => s.createSession(script, atMs));
export const feedStroke = (
  script: PracticeScript,
  state: SessionState,
  input: PracticeInput,
) => Effect.flatMap(Service, (s) => s.feedStroke(script, state, input));
export const summarize = (
  script: PracticeScript,
  state: SessionState,
  keyboard: KeyboardLayoutRef,
  id: string,
  startedAt: string,
  endedAt: string,
) => Effect.flatMap(Service, (s) => s.summarize(script, state, keyboard, id, startedAt, endedAt));
export const adapt = (
  base: PracticeScript,
  sessions: readonly PracticeSessionSummary[],
  seed?: number,
) => Effect.flatMap(Service, (s) => s.adapt(base, sessions, seed));
export const chips = (
  script: PracticeScript,
  sessions: readonly PracticeSessionSummary[],
  limit?: number,
) => Effect.flatMap(Service, (s) => s.chips(script, sessions, limit));
export const cells = (document: BufferDocument, style: IndentStyle | undefined) =>
  Effect.flatMap(Service, (s) => s.cells(document, style));
export const showsActionStream = (script: PracticeScript) =>
  Effect.flatMap(Service, (s) => s.showsActionStream(script));

export type { BufferCell, ConfidenceChip, PreparedDrill, SessionState };
