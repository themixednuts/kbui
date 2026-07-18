import { getContext, setContext } from "svelte";
import { Effect, Exit, Scope } from "effect";

import type { EditorStore } from "$lib/app/editor-store.svelte";
import { makeLiveSyncLaneQueue, type LiveSyncLaneQueue } from "$lib/app/live-sync-lifecycle";
import { forkApp, runApp, runAppSync } from "$lib/app/runtime";
import type { ShellStore } from "$lib/app/shell-store.svelte";
import { platformError } from "$lib/effect/errors";
import {
  summarizeLiveSyncLocalOnly,
  type LiveSyncLocalOnlyCategory,
  type LiveSyncLocalOnlySummary,
} from "$lib/keyboard/live-sync-classification";
import type { KeyBinding } from "$lib/keyboard/schema";
import {
  writeViaKeycode,
  type ConnectionState,
  type ViaKeycodeWriteInput,
  type ViaKeycodeWriteResult,
} from "$lib/keyboard/transport";
import {
  bindingSignature,
  classifyViaProfileChanges,
  type ClassifiedViaChange,
  type ViaLiveWriteTarget,
} from "$lib/keyboard/via-live";

export type ViaLiveSyncStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "syncing"
  | "synced"
  | "local-only"
  | "rebuild-required"
  | "invalid"
  | "sync-failed";

export type ViaLaneSyncState = "pending" | "syncing" | "synced" | "sync-failed";

export interface ViaLaneSyncStatus {
  changeId: string;
  code: string;
  error?: string;
  keyId: string;
  label: string;
  laneKey: string;
  layerId: string;
  signature: string;
  state: ViaLaneSyncState;
  updatedAt: string;
}

export interface ViaLiveSyncOptions {
  debounceMs?: number;
  editor: EditorStore;
  shell: ShellStore;
  writeKeycode?: (
    connection: ConnectionState,
    input: ViaKeycodeWriteInput,
  ) => Promise<ViaKeycodeWriteResult>;
}

interface PendingWrite {
  change: ClassifiedViaChange;
  connection: ConnectionState;
  connectionRevision: number;
}

const VIA_LIVE_SYNC_CONTEXT = Symbol("kbgui.via-live-sync");

export interface LiveSyncLaneStatus {
  changeId: string;
  code: string;
  error?: string;
  keyId: string;
  label: string;
  laneKey: string;
  layerId: string;
  signature: string;
  state: "pending" | "syncing" | "synced" | "sync-failed";
  updatedAt: string;
}

export interface LiveSyncChangeNotice {
  id: string;
  localOnlyCategory?: LiveSyncLocalOnlyCategory;
  path: string;
  reason: string;
  scope: string;
}

export interface LiveSyncView {
  activeLaneCount: number;
  changes: readonly LiveSyncChangeNotice[];
  dot: string;
  failedLanes: readonly LiveSyncLaneStatus[];
  invalidChanges: readonly LiveSyncChangeNotice[];
  label: string;
  laneStatuses: Record<string, LiveSyncLaneStatus>;
  liveWritableChanges: readonly LiveSyncChangeNotice[];
  localOnlyChanges: readonly LiveSyncChangeNotice[];
  localOnlySummary: LiveSyncLocalOnlySummary;
  paused: boolean;
  rebuildRequiredChanges: readonly LiveSyncChangeNotice[];
  status: string;
  summary: {
    failed: number;
    invalid: number;
    liveWritable: number;
    localOnly: number;
    rebuildRequired: number;
    syncing: number;
    total: number;
  };
  title: string;
  destroy: () => void;
  flush: () => Promise<void>;
  flushEffect: () => Effect.Effect<void>;
  pause: () => void;
  processChanges: (connection?: ConnectionState | null) => void;
  resume: () => void;
  retryFailed: () => void;
}

function nowIso() {
  return new Date().toISOString();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function currentBinding(editor: EditorStore, target: ViaLiveWriteTarget): KeyBinding | undefined {
  return editor.profile.layers.find((layer) => layer.id === target.layerId)?.bindings[target.keyId];
}

function statusLabel(status: ViaLiveSyncStatus) {
  if (status === "disconnected") return "Disconnected";
  if (status === "connecting") return "Connecting";
  if (status === "connected") return "Connected";
  if (status === "syncing") return "Syncing";
  if (status === "synced") return "Synced";
  if (status === "local-only") return "Local only";
  if (status === "rebuild-required") return "Rebuild required";
  if (status === "invalid") return "Invalid";
  return "Sync failed";
}

export function viaSyncStatusDot(status: ViaLiveSyncStatus) {
  if (status === "synced" || status === "connected") return "var(--mint)";
  if (status === "syncing" || status === "connecting" || status === "local-only")
    return "var(--mustard)";
  if (status === "sync-failed") return "var(--removed)";
  if (status === "rebuild-required" || status === "invalid") return "var(--coral)";
  return "var(--ink-3)";
}

export function viaSyncStatusTitle(status: ViaLiveSyncStatus) {
  if (status === "disconnected") return "Edits are local until a VIA device is connected.";
  if (status === "connecting") return "Opening or probing the keyboard connection.";
  if (status === "connected") return "A VIA keyboard is connected.";
  if (status === "syncing")
    return "Writing settled live-writable key edits and verifying readback.";
  if (status === "synced") return "Live-writable keymap edits match the connected device.";
  if (status === "local-only")
    return "Some edits were applied locally and were not written to the connected VIA device.";
  if (status === "rebuild-required") return "Some edits require generated firmware and a build.";
  if (status === "invalid") return "Some edits are incomplete or invalid and were not written.";
  return "A VIA write failed; the local edit is preserved.";
}

export class ViaLiveSyncEngine {
  readonly debounceMs: number;
  readonly editor: EditorStore;
  readonly shell: ShellStore;

  laneStatuses = $state<Record<string, ViaLaneSyncStatus>>({});
  paused = $state(false);

  readonly changes = $derived.by(() =>
    classifyViaProfileChanges(this.editor.baseProfile, this.editor.profile),
  );
  readonly liveWritableChanges = $derived.by(() =>
    this.changes.filter((change) => change.classification === "liveViaWritable"),
  );
  readonly rebuildRequiredChanges = $derived.by(() =>
    this.changes.filter((change) => change.classification === "firmwareRebuildRequired"),
  );
  readonly localOnlyChanges = $derived.by(() =>
    this.changes.filter((change) => change.classification === "localOnly"),
  );
  readonly invalidChanges = $derived.by(() =>
    this.changes.filter((change) => change.classification === "invalid"),
  );
  readonly failedLanes = $derived.by(() =>
    Object.values(this.laneStatuses).filter((status) => status.state === "sync-failed"),
  );
  readonly activeLaneCount = $derived.by(
    () =>
      Object.values(this.laneStatuses).filter(
        (status) => status.state === "pending" || status.state === "syncing",
      ).length,
  );
  readonly status = $derived.by(() => this.computeStatus());
  readonly label = $derived(statusLabel(this.status));
  readonly dot = $derived(viaSyncStatusDot(this.status));
  readonly title = $derived(viaSyncStatusTitle(this.status));
  readonly summary = $derived.by(() => ({
    failed: this.failedLanes.length,
    invalid: this.invalidChanges.length,
    liveWritable: this.liveWritableChanges.length,
    localOnly: this.localOnlyChanges.length,
    rebuildRequired: this.rebuildRequiredChanges.length,
    syncing: this.activeLaneCount,
    total: this.changes.length,
  }));
  readonly localOnlySummary = $derived.by(() => summarizeLiveSyncLocalOnly(this.localOnlyChanges));

  private readonly writeKeycode: NonNullable<ViaLiveSyncOptions["writeKeycode"]>;
  private readonly lifecycleScope = Scope.makeUnsafe();
  private readonly lanes: LiveSyncLaneQueue<PendingWrite>;
  private readonly failedSignatures = new Map<string, string>();
  private lastConnectionRevision = 0;
  private destroyed = false;

  constructor(options: ViaLiveSyncOptions) {
    this.debounceMs = options.debounceMs ?? 160;
    this.editor = options.editor;
    this.shell = options.shell;
    this.writeKeycode = options.writeKeycode ?? writeViaKeycode;
    this.lanes = runAppSync(
      makeLiveSyncLaneQueue({
        debounceMs: this.debounceMs,
        processBatch: (batch: readonly PendingWrite[]) => this.drainBatchEffect(batch),
      }).pipe(Effect.provideService(Scope.Scope, this.lifecycleScope)),
    );
  }

  processChanges(connection = this.shell.liveConnection) {
    if (this.destroyed) return;

    if (this.lastConnectionRevision !== this.shell.connectionRevision) {
      this.failedSignatures.clear();
      this.lastConnectionRevision = this.shell.connectionRevision;
    }

    const liveChanges = this.liveWritableChanges;
    this.pruneResolvedLanes(liveChanges);

    if (
      this.editor.profile.firmwareEditIntent === "source" ||
      !this.canWrite(connection) ||
      this.paused
    ) {
      this.lanes.clear();
      return;
    }

    for (const change of liveChanges) {
      const target = change.liveWrite;
      if (!target) continue;

      const laneStatus = this.laneStatuses[target.laneKey];
      const failedSignature = this.failedSignatures.get(target.laneKey);
      if (failedSignature === target.signature) continue;
      if (
        laneStatus &&
        laneStatus.signature === target.signature &&
        (laneStatus.state === "pending" || laneStatus.state === "syncing")
      ) {
        continue;
      }

      this.scheduleWrite(change, connection);
    }
  }

  pause() {
    this.paused = true;
    this.lanes.clear();
  }

  resume() {
    this.paused = false;
    this.processChanges();
  }

  retryFailed() {
    if (!this.canWrite(this.shell.liveConnection)) return;

    for (const lane of this.failedLanes) {
      this.failedSignatures.delete(lane.laneKey);
      this.removeLaneStatus(lane.laneKey);
    }
    this.processChanges();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.lanes.clear();
    forkApp("via-live-sync.destroy", Scope.close(this.lifecycleScope, Exit.succeed(undefined)));
  }

  flush() {
    return runApp("via-live-sync.flush", this.flushEffect());
  }

  flushEffect() {
    return this.destroyed ? Effect.void : this.lanes.flushEffect();
  }

  private computeStatus(): ViaLiveSyncStatus {
    if (this.shell.device.status === "connecting") return "connecting";
    if (!this.canWrite(this.shell.liveConnection)) return "disconnected";
    if (this.failedLanes.length > 0) return "sync-failed";
    if (this.activeLaneCount > 0) return "syncing";
    if (this.rebuildRequiredChanges.length > 0) return "rebuild-required";
    if (this.invalidChanges.length > 0) return "invalid";
    if (this.localOnlyChanges.length > 0) return "local-only";
    if (this.shell.device.status === "connected") return "synced";
    return "connected";
  }

  private canWrite(connection: ConnectionState | null | undefined): connection is ConnectionState {
    return connection?.status === "connected" && connection.transport === "webhid";
  }

  private scheduleWrite(change: ClassifiedViaChange, connection: ConnectionState) {
    const target = change.liveWrite;
    if (!target) return;

    this.setLaneStatus(change, "pending");
    this.lanes.schedule(target.laneKey, {
      change,
      connection,
      connectionRevision: this.shell.connectionRevision,
    });
  }

  private drainBatchEffect(batch: readonly PendingWrite[]) {
    return Effect.forEach(
      batch,
      (pending) =>
        Effect.sync(() => this.setLaneStatus(pending.change, "syncing")).pipe(
          Effect.andThen(this.writeOneEffect(pending)),
        ),
      { discard: true },
    );
  }

  private writeOneEffect(pending: PendingWrite) {
    const target = pending.change.liveWrite;
    if (!target) return Effect.void;

    if (pending.connectionRevision !== this.shell.connectionRevision) {
      this.removeLaneStatus(target.laneKey);
      return Effect.void;
    }

    const binding = currentBinding(this.editor, target);
    if (bindingSignature(binding) !== target.signature) {
      this.removeLaneStatus(target.laneKey);
      return Effect.void;
    }

    const write = Effect.gen({ self: this }, function* () {
      yield* Effect.tryPromise({
        try: () =>
          this.writeKeycode(pending.connection, {
            col: target.col,
            keycode: target.keycode,
            layer: target.layerIndex,
            row: target.row,
          }),
        catch: (cause) => platformError("via-live-sync.write-keycode", cause),
      });
      this.patchConnectionKeymap(pending.connection, target);
      this.failedSignatures.delete(target.laneKey);

      const latestBinding = currentBinding(this.editor, target);
      if (bindingSignature(latestBinding) === target.signature) {
        yield* this.editor.markBindingSyncedToBaseEffect(
          target.layerId,
          target.keyId,
          latestBinding,
        );
        this.setLaneStatus(pending.change, "synced");
      } else {
        this.removeLaneStatus(target.laneKey);
        this.processChanges();
      }
    });

    return Effect.match(write, {
      onFailure: (error) => {
        this.failedSignatures.set(target.laneKey, target.signature);
        this.setLaneStatus(pending.change, "sync-failed", errorMessage(error));
      },
      onSuccess: () => undefined,
    });
  }

  private patchConnectionKeymap(connection: ConnectionState, target: ViaLiveWriteTarget) {
    if (connection !== this.shell.connection) return;

    const detection = connection.detection;
    const keymap = detection?.keymap;
    if (!detection || !keymap?.[target.layerIndex]?.[target.row]) return;

    const nextKeymap = keymap.map((layerRows, layerIndex) =>
      layerIndex === target.layerIndex
        ? layerRows.map((cols, rowIndex) =>
            rowIndex === target.row
              ? cols.map((value, colIndex) => (colIndex === target.col ? target.keycode : value))
              : [...cols],
          )
        : layerRows.map((cols) => [...cols]),
    );

    this.shell.connection = {
      ...connection,
      detection: {
        ...detection,
        keymap: nextKeymap,
      },
    };
  }

  private setLaneStatus(change: ClassifiedViaChange, state: ViaLaneSyncState, error?: string) {
    const target = change.liveWrite;
    if (!target) return;

    this.laneStatuses = {
      ...this.laneStatuses,
      [target.laneKey]: {
        changeId: change.id,
        code: target.code,
        error,
        keyId: target.keyId,
        label: `${target.layerName} ${target.keyLabel}`,
        laneKey: target.laneKey,
        layerId: target.layerId,
        signature: target.signature,
        state,
        updatedAt: nowIso(),
      },
    };
  }

  private removeLaneStatus(laneKey: string) {
    const { [laneKey]: _removed, ...rest } = this.laneStatuses;
    this.laneStatuses = rest;
  }

  private pruneResolvedLanes(liveChanges: readonly ClassifiedViaChange[]) {
    const liveLanes = new Set(
      liveChanges.map((change) => change.liveWrite?.laneKey).filter(Boolean),
    );
    for (const laneKey of Object.keys(this.laneStatuses)) {
      if (!liveLanes.has(laneKey)) {
        this.failedSignatures.delete(laneKey);
        this.lanes.cancel(laneKey);
        this.removeLaneStatus(laneKey);
      }
    }
  }
}

export function setViaLiveSyncContext(sync: LiveSyncView) {
  setContext(VIA_LIVE_SYNC_CONTEXT, sync);
}

export function getViaLiveSyncContext(): LiveSyncView {
  return getContext<LiveSyncView>(VIA_LIVE_SYNC_CONTEXT);
}
