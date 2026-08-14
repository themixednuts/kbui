export {
  adaptScript,
  confidenceChips,
  type ConfidenceChip,
} from "./adaptive";
export {
  focusCharsFromScript,
  rankWeakTargets,
  synthesizeAdaptiveScript,
  type WeakTarget,
} from "./adaptive-lesson";
export {
  heatmapFromPractice,
  resolveBoardPulse,
  resolveTextPulse,
  type BoardPulseTarget,
} from "./board-targets";
export { charToKeycode } from "./keycodes";
export {
  bestLayerAccess,
  bestModCompanions,
  collectModSources,
  enumerateModCompanionPlans,
  parseModActivation,
  type LayerAccess,
  type ModActivationKind,
  type ModCompanionPlan,
  type ModName,
  type ModSource,
} from "./activations";
export {
  hintForCandidate,
  pathHistoryFromSessions,
  predictKeyTargets,
  scoreCandidate,
  shiftBaseChar,
  unwrapShiftedBinding,
  parseModBinding,
  derivePathKind,
  normalizePathKind,
  type KeyCandidate,
  type KeyPrediction,
  type PathHistory,
  type ProductionPath,
} from "./predict";
export {
  PathKind,
  hostShiftBaseChar,
  scoreProductionAxes,
  hintFromAxes,
  effectiveMods,
  type ProductionAxes,
} from "./production";
export {
  advanceBufferAtom,
  bufferCells,
  BufferAdvanceResult,
  compileBufferDocument,
  cursorAfterAtoms,
  indentDisplayWidth,
  initialIndentState,
  type BufferCell,
  type BufferDocument,
  type IndentDetectState,
} from "./buffer";
export {
  applyScrollDelta,
  PRACTICE_CARET_PAD_PX,
  scrollDeltaToKeepInView,
  type BoxEdges,
  type ScrollableBox,
} from "./caret-in-view";
export type {
  BufferAtom,
  BufferCursor,
  IndentPolicy,
  IndentStyle,
  KeyStroke,
  KeyboardLayoutRef,
  PracticeAction,
  PracticeEvent,
  PracticeInput,
  PracticeMode,
  PracticeScript,
  PracticeSessionSummary,
  SessionGoal,
  StrokeContext,
  ModState,
} from "./contracts";
export {
  IndentPolicy as IndentPolicySchema,
  IndentStyle as IndentStyleSchema,
  KeyStroke as KeyStrokeSchema,
  PracticeScript as PracticeScriptSchema,
  SESSION_GOAL_TIMED_60,
  SESSION_GOAL_UNTIL_COMPLETE,
  SessionGoal as SessionGoalSchema,
  goalDeadlineMs,
  isTimedGoal,
  strokeChar,
  strokeFromKeyboardEvent,
  modsFromKeyboardEvent,
  withSessionGoal,
  UnknownKeyStrokeError,
} from "./contracts";
export { loadPracticeSessionsEffect, savePracticeSessionEffect, PracticePersistError } from "./persist";
export {
  formatPracticeScript,
  formatRustLines,
  formatRustSource,
  RustFormatError,
} from "./format-rust";
export {
  goalFromKind,
  isPracticeArmKey,
  prepareDrill,
  type GoalKind,
  type PreparedDrill,
} from "./prepare";
export { defaultNavScript, NAV_BOARD_PULSE, NAV_DRILL_V1 } from "./nav-corpus";
export {
  browserKeyToModalKey,
  createNavDrillEffect,
  feedNavKeyEffect,
  navDrillLayer,
  type NavDrillHandle,
} from "./nav-modal";
export {
  defaultRustTextScript,
  pickRustTextScript,
  RUST_TEXT_DRILL_V1,
  RUST_TEXT_DRILLS,
} from "./rust-corpus";
export {
  abortSession,
  applyPracticeInput,
  completeCurrentAction,
  createSessionState,
  hasActionStream,
  recordLayerHop,
  sessionProgress,
  summarizeSession,
  timeoutSession,
  type SessionState,
} from "./session";
export {
  defaultSymbolsScript,
  pickSymbolsScript,
  SYMBOLS_DRILL_V1,
  SYMBOLS_DRILLS,
} from "./symbols-corpus";
export * as Practice from "./service";
