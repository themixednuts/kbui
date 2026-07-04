import { getContext, setContext } from "svelte";

import type { EditorStore } from "$lib/app/editor-store.svelte";
import type { ShellStore } from "$lib/app/shell-store.svelte";
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
  return "Sync failed";
}

export function viaSyncStatusDot(status: ViaLiveSyncStatus) {
  if (status === "synced" || status === "connected") return "var(--mint)";
  if (status === "syncing" || status === "connecting") return "var(--mustard)";
  if (status === "sync-failed") return "var(--removed)";
  if (status === "rebuild-required") return "var(--coral)";
  return "var(--ink-3)";
}

export function viaSyncStatusTitle(status: ViaLiveSyncStatus) {
  if (status === "disconnected") return "Edits are local until a VIA device is connected.";
  if (status === "connecting") return "Opening or probing the keyboard connection.";
  if (status === "connected") return "A VIA keyboard is connected.";
  if (status === "syncing")
    return "Writing settled live-writable key edits and verifying readback.";
  if (status === "synced") return "Live-writable keymap edits match the connected device.";
  if (status === "local-only") return "Some valid edits are not supported by generic VIA writes.";
  if (status === "rebuild-required") return "Some edits require generated firmware and a build.";
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
    this.changes.filter((change) => change.classification === "sourceOnlyUnsupported"),
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

  private readonly writeKeycode: NonNullable<ViaLiveSyncOptions["writeKeycode"]>;
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pendingWrites = new Map<string, PendingWrite>();
  private readonly failedSignatures = new Map<string, string>();
  private lastConnectionRevision = 0;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(options: ViaLiveSyncOptions) {
    this.debounceMs = options.debounceMs ?? 160;
    this.editor = options.editor;
    this.shell = options.shell;
    this.writeKeycode = options.writeKeycode ?? writeViaKeycode;
  }

  processChanges(connection = this.shell.liveConnection) {
    if (this.lastConnectionRevision !== this.shell.connectionRevision) {
      this.failedSignatures.clear();
      this.lastConnectionRevision = this.shell.connectionRevision;
    }

    const liveChanges = this.liveWritableChanges;
    this.pruneResolvedLanes(liveChanges);

    if (!this.canWrite(connection) || this.paused) {
      this.clearTimers();
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
    this.clearTimers();
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
    this.clearTimers();
    this.pendingWrites.clear();
  }

  async flush() {
    await new Promise((resolve) => setTimeout(resolve, this.debounceMs + 10));
    await this.writeQueue;
  }

  private computeStatus(): ViaLiveSyncStatus {
    if (this.shell.device.status === "connecting") return "connecting";
    if (!this.canWrite(this.shell.liveConnection)) return "disconnected";
    if (this.failedLanes.length > 0) return "sync-failed";
    if (this.activeLaneCount > 0) return "syncing";
    if (this.rebuildRequiredChanges.length > 0) return "rebuild-required";
    if (this.invalidChanges.length > 0 || this.localOnlyChanges.length > 0) return "local-only";
    if (this.shell.device.status === "connected") return "synced";
    return "connected";
  }

  private canWrite(connection: ConnectionState | null | undefined): connection is ConnectionState {
    return connection?.status === "connected" && connection.transport === "webhid";
  }

  private scheduleWrite(change: ClassifiedViaChange, connection: ConnectionState) {
    const target = change.liveWrite;
    if (!target) return;

    const previousTimer = this.timers.get(target.laneKey);
    if (previousTimer) clearTimeout(previousTimer);

    this.pendingWrites.set(target.laneKey, {
      change,
      connection,
      connectionRevision: this.shell.connectionRevision,
    });
    this.setLaneStatus(change, "pending");

    const timer = setTimeout(() => {
      this.timers.delete(target.laneKey);
      this.enqueueWrite(target.laneKey);
    }, this.debounceMs);
    this.timers.set(target.laneKey, timer);
  }

  private enqueueWrite(laneKey: string) {
    const pending = this.pendingWrites.get(laneKey);
    if (!pending) return;
    this.pendingWrites.delete(laneKey);
    this.setLaneStatus(pending.change, "syncing");

    this.writeQueue = this.writeQueue.then(() => this.writeOne(pending)).catch(() => undefined);
  }

  private async writeOne(pending: PendingWrite) {
    const target = pending.change.liveWrite;
    if (!target) return;

    if (pending.connectionRevision !== this.shell.connectionRevision) {
      this.removeLaneStatus(target.laneKey);
      return;
    }

    const binding = currentBinding(this.editor, target);
    if (bindingSignature(binding) !== target.signature) {
      this.removeLaneStatus(target.laneKey);
      return;
    }

    try {
      await this.writeKeycode(pending.connection, {
        col: target.col,
        keycode: target.keycode,
        layer: target.layerIndex,
        row: target.row,
      });
      this.patchConnectionKeymap(pending.connection, target);
      this.failedSignatures.delete(target.laneKey);

      const latestBinding = currentBinding(this.editor, target);
      if (bindingSignature(latestBinding) === target.signature) {
        await this.editor.markBindingSyncedToBase(target.layerId, target.keyId, latestBinding);
        this.setLaneStatus(pending.change, "synced");
      } else {
        this.removeLaneStatus(target.laneKey);
        this.processChanges();
      }
    } catch (error) {
      this.failedSignatures.set(target.laneKey, target.signature);
      this.setLaneStatus(pending.change, "sync-failed", errorMessage(error));
    }
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
        this.pendingWrites.delete(laneKey);
        const timer = this.timers.get(laneKey);
        if (timer) clearTimeout(timer);
        this.timers.delete(laneKey);
        this.removeLaneStatus(laneKey);
      }
    }
  }

  private clearTimers() {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    this.pendingWrites.clear();
  }
}

export function setViaLiveSyncContext(sync: ViaLiveSyncEngine) {
  setContext(VIA_LIVE_SYNC_CONTEXT, sync);
}

export function getViaLiveSyncContext(): ViaLiveSyncEngine {
  return getContext<ViaLiveSyncEngine>(VIA_LIVE_SYNC_CONTEXT);
}
