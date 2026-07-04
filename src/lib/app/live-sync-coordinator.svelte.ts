import type { EditorStore } from "$lib/app/editor-store.svelte";
import type { ShellStore } from "$lib/app/shell-store.svelte";
import type { ConnectionState } from "$lib/keyboard/transport";

import { ViaLiveSyncEngine, type LiveSyncView } from "./via-live-sync.svelte";
import { ZmkLiveSyncEngine } from "./zmk-live-sync.svelte";

export interface KeyboardLiveSyncOptions {
  debounceMs?: number;
  editor: EditorStore;
  shell: ShellStore;
}

export class KeyboardLiveSyncEngine implements LiveSyncView {
  readonly via: ViaLiveSyncEngine;
  readonly zmk: ZmkLiveSyncEngine;
  readonly editor: EditorStore;
  readonly shell: ShellStore;

  readonly active = $derived.by(() =>
    this.editor.profile.protocol === "zmk-studio" ||
    this.shell.liveConnection?.protocol === "zmk-studio"
      ? this.zmk
      : this.via,
  );

  readonly activeLaneCount = $derived(this.active.activeLaneCount);
  readonly changes = $derived(this.active.changes);
  readonly dot = $derived(this.active.dot);
  readonly failedLanes = $derived(this.active.failedLanes);
  readonly invalidChanges = $derived(this.active.invalidChanges);
  readonly label = $derived(this.active.label);
  readonly laneStatuses = $derived(this.active.laneStatuses);
  readonly liveWritableChanges = $derived(this.active.liveWritableChanges);
  readonly localOnlyChanges = $derived(this.active.localOnlyChanges);
  readonly localOnlySummary = $derived(this.active.localOnlySummary);
  readonly paused = $derived(this.active.paused);
  readonly rebuildRequiredChanges = $derived(this.active.rebuildRequiredChanges);
  readonly status = $derived(this.active.status);
  readonly summary = $derived(this.active.summary);
  readonly title = $derived(this.active.title);

  constructor(options: KeyboardLiveSyncOptions) {
    this.editor = options.editor;
    this.shell = options.shell;
    this.via = new ViaLiveSyncEngine(options);
    this.zmk = new ZmkLiveSyncEngine(options);
  }

  processChanges(connection: ConnectionState | null = this.shell.liveConnection) {
    this.via.processChanges(connection);
    this.zmk.processChanges(connection);
  }

  pause() {
    this.active.pause();
  }

  resume() {
    this.active.resume();
  }

  retryFailed() {
    this.active.retryFailed();
  }

  destroy() {
    this.via.destroy();
    this.zmk.destroy();
  }

  async flush() {
    await Promise.all([this.via.flush(), this.zmk.flush()]);
  }
}
