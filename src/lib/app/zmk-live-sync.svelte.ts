import type { EditorStore } from "$lib/app/editor-store.svelte";
import type { ShellStore } from "$lib/app/shell-store.svelte";
import { summarizeLiveSyncLocalOnly } from "$lib/keyboard/live-sync-classification";
import type { KeyBinding } from "$lib/keyboard/schema";
import type { ConnectionState } from "$lib/keyboard/transport";
import { zmkBindingsEqual, type ZmkStudioKeymap } from "$lib/keyboard/zmk-studio";
import {
  classifyZmkProfileChanges,
  zmkBindingSignature,
  type ClassifiedZmkChange,
  type ZmkLiveWriteTarget,
} from "$lib/keyboard/zmk-live";

export type ZmkLiveSyncStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "locked"
  | "syncing"
  | "synced"
  | "local-only"
  | "rebuild-required"
  | "invalid"
  | "sync-failed";

export type ZmkLaneSyncState = "pending" | "syncing" | "synced" | "sync-failed";

export interface ZmkLaneSyncStatus {
  changeId: string;
  code: string;
  error?: string;
  keyId: string;
  label: string;
  laneKey: string;
  layerId: string;
  signature: string;
  state: ZmkLaneSyncState;
  updatedAt: string;
}

export interface ZmkLiveSyncOptions {
  debounceMs?: number;
  editor: EditorStore;
  shell: ShellStore;
}

interface PendingWrite {
  change: ClassifiedZmkChange;
  connection: ConnectionState;
  connectionRevision: number;
}

interface SuccessfulWrite {
  change: ClassifiedZmkChange;
  connection: ConnectionState;
  keymap: ZmkStudioKeymap;
  target: ZmkLiveWriteTarget;
}

function nowIso() {
  return new Date().toISOString();
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function currentBinding(editor: EditorStore, target: ZmkLiveWriteTarget): KeyBinding | undefined {
  return editor.profile.layers.find((layer) => layer.id === target.profileLayerId)?.bindings[
    target.keyId
  ];
}

function statusLabel(status: ZmkLiveSyncStatus) {
  if (status === "disconnected") return "Disconnected";
  if (status === "connecting") return "Connecting";
  if (status === "connected") return "Connected";
  if (status === "locked") return "Locked";
  if (status === "syncing") return "Syncing";
  if (status === "synced") return "Synced";
  if (status === "local-only") return "Local only";
  if (status === "rebuild-required") return "Rebuild required";
  if (status === "invalid") return "Invalid";
  return "Sync failed";
}

export function zmkSyncStatusDot(status: ZmkLiveSyncStatus) {
  if (status === "synced" || status === "connected") return "var(--mint)";
  if (status === "syncing" || status === "connecting" || status === "local-only")
    return "var(--mustard)";
  if (status === "sync-failed") return "var(--removed)";
  if (status === "rebuild-required" || status === "locked" || status === "invalid")
    return "var(--coral)";
  return "var(--ink-3)";
}

export function zmkSyncStatusTitle(status: ZmkLiveSyncStatus) {
  if (status === "disconnected") return "Edits are local until a ZMK Studio device is connected.";
  if (status === "connecting") return "Opening or probing the keyboard connection.";
  if (status === "connected") return "A ZMK Studio keyboard is connected.";
  if (status === "locked") return "ZMK Studio is locked - unlock on the keyboard to write edits.";
  if (status === "syncing")
    return "Writing settled ZMK Studio key edits, verifying readback, and saving the batch.";
  if (status === "synced") return "Live-writable keymap edits match the connected ZMK device.";
  if (status === "local-only")
    return "Some edits were applied locally and were not written to the connected ZMK device.";
  if (status === "rebuild-required")
    return "Some edits require generated ZMK firmware and a build.";
  if (status === "invalid") return "Some edits are incomplete or invalid and were not written.";
  return "A ZMK Studio write failed; the local edit is preserved.";
}

export class ZmkLiveSyncEngine {
  readonly debounceMs: number;
  readonly editor: EditorStore;
  readonly shell: ShellStore;

  laneStatuses = $state<Record<string, ZmkLaneSyncStatus>>({});
  paused = $state(false);

  readonly changes = $derived.by(() =>
    classifyZmkProfileChanges(
      this.editor.baseProfile,
      this.editor.profile,
      this.shell.liveConnection,
    ),
  );
  readonly liveWritableChanges = $derived.by(() =>
    this.changes.filter((change) => change.classification === "liveZmkWritable"),
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
  readonly dot = $derived(zmkSyncStatusDot(this.status));
  readonly title = $derived(zmkSyncStatusTitle(this.status));
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

  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pendingWrites = new Map<string, PendingWrite>();
  private readonly readyWrites = new Map<string, PendingWrite>();
  private readonly failedSignatures = new Map<string, string>();
  private lastConnectionRevision = 0;
  private writeQueue: Promise<void> = Promise.resolve();
  private drainScheduled = false;

  constructor(options: ZmkLiveSyncOptions) {
    this.debounceMs = options.debounceMs ?? 160;
    this.editor = options.editor;
    this.shell = options.shell;
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
    this.readyWrites.clear();
  }

  async flush() {
    await new Promise((resolve) => setTimeout(resolve, this.debounceMs + 10));
    await this.writeQueue;
  }

  private computeStatus(): ZmkLiveSyncStatus {
    if (this.shell.device.status === "connecting") return "connecting";
    const connection = this.shell.liveConnection;
    if (connection?.protocol === "zmk-studio" && connection.zmkStudio?.lockState === "locked") {
      return "locked";
    }
    if (!this.isZmkConnection(connection)) return "disconnected";
    if (this.failedLanes.length > 0) return "sync-failed";
    if (this.activeLaneCount > 0) return "syncing";
    if (this.rebuildRequiredChanges.length > 0) return "rebuild-required";
    if (this.invalidChanges.length > 0) return "invalid";
    if (this.localOnlyChanges.length > 0) return "local-only";
    if (this.shell.device.status === "connected") return "synced";
    return "connected";
  }

  private isZmkConnection(
    connection: ConnectionState | null | undefined,
  ): connection is ConnectionState {
    return (
      connection?.status === "connected" &&
      connection.protocol === "zmk-studio" &&
      !!connection.zmkStudio
    );
  }

  private canWrite(connection: ConnectionState | null | undefined): connection is ConnectionState {
    return this.isZmkConnection(connection) && connection.zmkStudio?.lockState === "unlocked";
  }

  private scheduleWrite(change: ClassifiedZmkChange, connection: ConnectionState) {
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
    this.readyWrites.set(laneKey, pending);
    this.setLaneStatus(pending.change, "syncing");

    if (this.drainScheduled) return;
    this.drainScheduled = true;
    this.writeQueue = this.writeQueue.then(() => this.drainReadyWrites()).catch(() => undefined);
  }

  private async drainReadyWrites() {
    this.drainScheduled = false;
    const batch = [...this.readyWrites.values()];
    this.readyWrites.clear();
    const successes: SuccessfulWrite[] = [];

    for (const pending of batch) {
      const success = await this.writeOne(pending).catch((error: unknown) => {
        const target = pending.change.liveWrite;
        if (target) {
          this.failedSignatures.set(target.laneKey, target.signature);
          this.setLaneStatus(pending.change, "sync-failed", errorMessage(error));
        }
        return undefined;
      });
      if (success) successes.push(success);
    }

    if (successes.length === 0) return;

    try {
      const zmk = successes[0].connection.zmkStudio;
      if (!zmk) throw new Error("ZMK Studio connection disappeared.");
      const save = await zmk.call({ type: "save_changes" });
      if (save.type !== "save_changes" || save.status !== "ok") {
        throw new Error(
          `ZMK save_changes failed: ${save.type === "save_changes" ? save.status : "bad response"}`,
        );
      }

      for (const success of successes) await this.markSuccess(success);
    } catch (error) {
      for (const success of successes) {
        this.failedSignatures.set(success.target.laneKey, success.target.signature);
        this.setLaneStatus(success.change, "sync-failed", errorMessage(error));
      }
    }
  }

  private async writeOne(pending: PendingWrite): Promise<SuccessfulWrite | undefined> {
    const target = pending.change.liveWrite;
    if (!target) return undefined;

    if (pending.connectionRevision !== this.shell.connectionRevision) {
      this.removeLaneStatus(target.laneKey);
      return undefined;
    }

    if (!this.canWrite(pending.connection)) {
      this.removeLaneStatus(target.laneKey);
      return undefined;
    }

    const binding = currentBinding(this.editor, target);
    if (zmkBindingSignature(binding) !== target.signature) {
      this.removeLaneStatus(target.laneKey);
      return undefined;
    }

    const zmk = pending.connection.zmkStudio;
    if (!zmk) throw new Error("ZMK Studio connection handle is unavailable.");

    const response = await zmk.call({
      type: "set_layer_binding",
      layerId: target.studioLayerId,
      keyPosition: target.keyPosition,
      binding: target.encodedBinding,
    });
    if (response.type !== "set_layer_binding" || response.status !== "ok") {
      throw new Error(
        `ZMK set_layer_binding failed: ${response.type === "set_layer_binding" ? response.status : "bad response"}`,
      );
    }

    const readback = await zmk.call({ type: "get_keymap" });
    if (readback.type !== "get_keymap") throw new Error("ZMK get_keymap response mismatch.");

    const layer = readback.keymap.layers.find((candidate) => candidate.id === target.studioLayerId);
    const verified = layer?.bindings[target.keyPosition];
    if (!verified || !zmkBindingsEqual(verified, target.encodedBinding)) {
      throw new Error("ZMK readback mismatch after set_layer_binding.");
    }

    return {
      change: pending.change,
      connection: pending.connection,
      keymap: readback.keymap,
      target,
    };
  }

  private async markSuccess(success: SuccessfulWrite) {
    this.patchConnectionKeymap(success.keymap);
    this.failedSignatures.delete(success.target.laneKey);

    const latestBinding = currentBinding(this.editor, success.target);
    if (zmkBindingSignature(latestBinding) === success.target.signature) {
      await this.editor.markBindingSyncedToBase(
        success.target.profileLayerId,
        success.target.keyId,
        latestBinding,
      );
      this.setLaneStatus(success.change, "synced");
    } else {
      this.removeLaneStatus(success.target.laneKey);
      this.processChanges();
    }
  }

  private patchConnectionKeymap(keymap: ZmkStudioKeymap) {
    const connection = this.shell.connection;
    if (!connection?.zmkStudio) return;

    connection.zmkStudio.keymap = keymap;
    this.shell.connection = {
      ...connection,
      zmkStudio: connection.zmkStudio,
    };
  }

  private setLaneStatus(change: ClassifiedZmkChange, state: ZmkLaneSyncState, error?: string) {
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
        layerId: target.profileLayerId,
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

  private pruneResolvedLanes(liveChanges: readonly ClassifiedZmkChange[]) {
    const liveLanes = new Set(
      liveChanges.map((change) => change.liveWrite?.laneKey).filter(Boolean),
    );
    for (const laneKey of Object.keys(this.laneStatuses)) {
      if (!liveLanes.has(laneKey)) {
        this.failedSignatures.delete(laneKey);
        this.pendingWrites.delete(laneKey);
        this.readyWrites.delete(laneKey);
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
    this.readyWrites.clear();
  }
}
