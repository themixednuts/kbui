import type { ShellStore } from "./shell-store.svelte";
import type { LiveSyncView } from "./via-live-sync.svelte";

export interface LiveSyncCoordinatorEffectHarness {
  cleanup: () => void;
  runs: () => number;
}

export function startLiveSyncCoordinatorEffectHarness(
  engine: LiveSyncView,
  shell: ShellStore,
): LiveSyncCoordinatorEffectHarness {
  let runs = 0;

  const cleanup = $effect.root(() => {
    $effect(() => {
      runs += 1;
      engine.processChanges(shell.liveConnection);
    });

    return () => engine.destroy();
  });

  return {
    cleanup,
    runs: () => runs,
  };
}
