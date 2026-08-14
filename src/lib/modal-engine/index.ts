/**
 * Modal editing engines for Layout Coach / trainer drills.
 *
 * Effect v4 port of the dependency-free **core** layer from:
 *   e:/helix/helix-fork/helix-modal  (`helix_modal::core`)
 *
 * Not ported: Helix-editor host integration (`feature = "helix"`).
 * Extension point: SyncEngine + ModalEngineFactoryService (open paradigms).
 * v1 builtins: helix | vim | vscode.
 */

export {
  feedKeyEffect,
  layer as modalEngineFactoryLayer,
  Service as ModalEngineFactoryService,
  UnknownEditingParadigmError,
  type FeedInput,
  type Interface as ModalEngineFactoryInterface,
} from "./factory";
export { HelixEngine, type KeymapQuery, type SyncEngine } from "./helix";
export { Builder, Registry } from "./registry";
export type {
  ActionEntry,
  ActionFn,
  CharPendingCommand,
  CharPendingEntry,
  CommandRef,
  MotionEntry,
  MotionFn,
  OperatorEntry,
  OperatorFn,
  TextObjectEntry,
  TextObjectFn,
} from "./registry";
export {
  ActionIdMake as ActionId,
  BuiltinParadigmSchema,
  CharPendingIdMake as CharPendingId,
  CommandToken,
  EditingParadigmSchema,
  EngineResult,
  Key,
  KeyCode,
  Lookup,
  Mode,
  MotionIdMake as MotionId,
  OperatorIdMake as OperatorId,
  TextObjectIdMake as TextObjectId,
  keyChar,
  keyCharValue,
  keyDigit,
  keyEsc,
  keyIsChar,
  type BuiltinParadigm,
  type EditingParadigm,
  type EngineResult as EngineResultT,
  type InputState,
  type Key as KeyT,
  type Lookup as LookupT,
  type Mode as ModeT,
} from "./schema";
export { VimEngine } from "./vim";
export { VsCodeEngine } from "./vscode";
