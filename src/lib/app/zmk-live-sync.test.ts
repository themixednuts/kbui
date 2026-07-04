import { describe, expect, it } from "vite-plus/test";
import { tick } from "svelte";

import { connectZmkStudioAndActivate } from "$lib/app/connect-flow";
import { startLiveSyncCoordinatorEffectHarness } from "$lib/app/live-sync-coordinator-regression-harness.svelte";
import { ShellStore } from "$lib/app/shell-store.svelte";
import { WorkbenchStore } from "$lib/app/workbench-store.svelte";
import { splitDemoKeyboard } from "$lib/keyboard/sample-boards";
import {
  MockZmkStudioConnection,
  createMockZmkStudioTransport,
  type MockZmkStudioTransportOptions,
} from "$lib/keyboard/transport-mock-zmk";

import { KeyboardLiveSyncEngine } from "./live-sync-coordinator.svelte";
import { ZmkLiveSyncEngine } from "./zmk-live-sync.svelte";

async function createLiveSyncHarness(options: MockZmkStudioTransportOptions = {}, debounceMs = 8) {
  const shell = new ShellStore();
  const workbench = new WorkbenchStore({ persist: false });
  await connectZmkStudioAndActivate({
    shell,
    transport: createMockZmkStudioTransport(options),
    workbench,
  });
  const engine = new ZmkLiveSyncEngine({ debounceMs, editor: workbench, shell });
  const zmk = shell.liveConnection?.zmkStudio as MockZmkStudioConnection;

  return { engine, shell, workbench, zmk };
}

function requestsOf<T extends MockZmkStudioConnection["sentRequests"][number]["type"]>(
  zmk: MockZmkStudioConnection,
  type: T,
) {
  return zmk.sentRequests.filter((request) => request.type === type);
}

describe("ZMK live sync engine", () => {
  it("writes an editor keycode edit to the mock ZMK device, verifies readback, saves, and advances the clean base", async () => {
    const { engine, workbench, zmk } = await createLiveSyncHarness();
    const beforeWrites = requestsOf(zmk, "set_layer_binding").length;
    const beforeReads = requestsOf(zmk, "get_keymap").length;
    const beforeSaves = requestsOf(zmk, "save_changes").length;

    workbench.selectKey("k2-4");
    workbench.applyKeycode("KC_B");
    engine.processChanges();
    await engine.flush();

    expect(requestsOf(zmk, "set_layer_binding").length - beforeWrites).toBe(1);
    expect(requestsOf(zmk, "get_keymap").length - beforeReads).toBe(1);
    expect(requestsOf(zmk, "save_changes").length - beforeSaves).toBe(1);
    expect(workbench.profile.layers[0].bindings["k2-4"].code).toBe("KC_B");
    expect(workbench.baseProfile.layers[0].bindings["k2-4"].code).toBe("KC_B");
    expect(engine.status).toBe("synced");
  });

  it("blocks writes while locked and writes after mockUnlock", async () => {
    const { engine, workbench, zmk } = await createLiveSyncHarness({ lockedAfterConnect: true });
    const beforeWrites = requestsOf(zmk, "set_layer_binding").length;

    workbench.selectKey("k2-4");
    workbench.applyKeycode("KC_B");
    engine.processChanges();
    await engine.flush();

    expect(engine.status).toBe("locked");
    expect(requestsOf(zmk, "set_layer_binding").length).toBe(beforeWrites);
    expect(workbench.baseProfile.layers[0].bindings["k2-4"].code).not.toBe("KC_B");

    zmk.mockUnlock();
    engine.processChanges();
    await engine.flush();

    expect(requestsOf(zmk, "set_layer_binding").length - beforeWrites).toBe(1);
    expect(workbench.baseProfile.layers[0].bindings["k2-4"].code).toBe("KC_B");
  });

  it("debounces rapid edits per ZMK lane and writes only the settled binding", async () => {
    const { engine, workbench, zmk } = await createLiveSyncHarness();
    const beforeWrites = requestsOf(zmk, "set_layer_binding").length;

    workbench.selectKey("k2-4");
    workbench.applyKeycode("KC_B");
    engine.processChanges();
    workbench.applyKeycode("KC_H");
    engine.processChanges();
    workbench.applyKeycode("KC_J");
    engine.processChanges();
    await engine.flush();

    const writes = requestsOf(zmk, "set_layer_binding").slice(beforeWrites);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      binding: { behaviorId: 1, param1: 0x000d, param2: 0 },
      keyPosition: 32,
      layerId: 100,
    });
    expect(workbench.baseProfile.layers[0].bindings["k2-4"].code).toBe("KC_J");
  });

  it("preserves local edits and marks sync-failed when save_changes fails", async () => {
    const { engine, workbench, zmk } = await createLiveSyncHarness();
    const originalBaseCode = workbench.baseProfile.layers[0].bindings["k2-4"].code;
    zmk.nextSaveResponse = "no-space";

    workbench.selectKey("k2-4");
    workbench.applyKeycode("KC_B");
    engine.processChanges();
    await engine.flush();

    expect(engine.status).toBe("sync-failed");
    expect(engine.failedLanes).toHaveLength(1);
    expect(workbench.profile.layers[0].bindings["k2-4"].code).toBe("KC_B");
    expect(workbench.baseProfile.layers[0].bindings["k2-4"].code).toBe(originalBaseCode);
  });

  it("does not write rebuild-required ZMK combo, macro, or settings edits", async () => {
    const { engine, workbench, zmk } = await createLiveSyncHarness();
    const beforeWrites = requestsOf(zmk, "set_layer_binding").length;

    workbench.addCombo();
    workbench.addMacro();
    workbench.updateSettings({ tappingTerm: workbench.profile.settings.tappingTerm + 5 });
    engine.processChanges();
    await engine.flush();

    expect(requestsOf(zmk, "set_layer_binding").length).toBe(beforeWrites);
    expect(engine.rebuildRequiredChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "combo" }),
        expect.objectContaining({ kind: "macro" }),
        expect.objectContaining({ kind: "setting" }),
      ]),
    );
  });

  it("does not self-invalidate the coordinator effect or reset explicit editor state", async () => {
    const shell = new ShellStore();
    const workbench = new WorkbenchStore({ persist: false });
    const engine = new KeyboardLiveSyncEngine({ debounceMs: 1, editor: workbench, shell });
    const harness = startLiveSyncCoordinatorEffectHarness(engine, shell);

    try {
      await tick();
      expect(harness.runs()).toBeLessThanOrEqual(2);

      await workbench.switchSampleBoard("split");
      workbench.setLens("lighting");
      await tick();
      await tick();

      expect(harness.runs()).toBeLessThan(8);
      expect(workbench.activeBoardId).toBe("split");
      expect(workbench.profile.id).toBe(splitDemoKeyboard.id);
      expect(workbench.lens).toBe("lighting");
    } finally {
      harness.cleanup();
    }
  });
});
