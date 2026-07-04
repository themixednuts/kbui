import { describe, expect, it } from "vite-plus/test";

import { connectViaAndActivate } from "$lib/app/connect-flow";
import { ShellStore } from "$lib/app/shell-store.svelte";
import { WorkbenchStore } from "$lib/app/workbench-store.svelte";
import { qmkKeycodeValue } from "$lib/keyboard/schema";
import { MockHidKeyboardDevice, createMockViaTransport } from "$lib/keyboard/transport-mock";

import { ViaLiveSyncEngine } from "./via-live-sync.svelte";

async function createLiveSyncHarness(debounceMs = 8) {
  const shell = new ShellStore();
  const workbench = new WorkbenchStore({ persist: false });
  await connectViaAndActivate({
    shell,
    transport: createMockViaTransport(),
    workbench,
  });
  const engine = new ViaLiveSyncEngine({ debounceMs, editor: workbench, shell });
  const hidDevice = shell.liveConnection?.hidDevice as MockHidKeyboardDevice;

  return { engine, hidDevice, shell, workbench };
}

function setKeycodeWrites(hidDevice: MockHidKeyboardDevice) {
  return hidDevice.validationResults.filter(
    (result) => result.commandName === "dynamicKeymapSetKeycode",
  );
}

describe("VIA live sync engine", () => {
  it("writes an editor keycode edit to the mock VIA device and advances only that clean base binding", async () => {
    const { engine, hidDevice, workbench } = await createLiveSyncHarness();
    const beforeWrites = setKeycodeWrites(hidDevice).length;

    workbench.selectKey("k2-4");
    workbench.applyKeycode("KC_G");
    engine.processChanges();
    await engine.flush();

    const expectedKeycode = qmkKeycodeValue("KC_G");
    expect(setKeycodeWrites(hidDevice).length - beforeWrites).toBe(1);
    expect(hidDevice.definition.keymap[0][2][4]).toBe(expectedKeycode);
    expect(workbench.profile.layers[0].bindings["k2-4"].code).toBe("KC_G");
    expect(workbench.baseProfile.layers[0].bindings["k2-4"].code).toBe("KC_G");
    expect(engine.status).toBe("synced");
  });

  it("flags rebuild-required edits without blocking live keymap writes", async () => {
    const { engine, hidDevice, workbench } = await createLiveSyncHarness();
    const combo = workbench.addCombo();
    const beforeWrites = setKeycodeWrites(hidDevice).length;

    engine.processChanges();
    await engine.flush();
    expect(setKeycodeWrites(hidDevice).length).toBe(beforeWrites);
    expect(engine.rebuildRequiredChanges).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: `combos/${combo.name}` })]),
    );

    workbench.selectKey("k2-4");
    workbench.applyKeycode("KC_H");
    engine.processChanges();
    await engine.flush();

    expect(setKeycodeWrites(hidDevice).length - beforeWrites).toBe(1);
    expect(workbench.baseProfile.layers[0].bindings["k2-4"].code).toBe("KC_H");
    expect(workbench.dirty).toBe(1);
    expect(engine.status).toBe("rebuild-required");
  });

  it("preserves local edits on readback failure and retries on user action", async () => {
    const { engine, hidDevice, workbench } = await createLiveSyncHarness();
    const originalBaseCode = workbench.baseProfile.layers[0].bindings["k2-4"].code;

    hidDevice.nextReadbackKeycode = qmkKeycodeValue("KC_A");
    workbench.selectKey("k2-4");
    workbench.applyKeycode("KC_G");
    engine.processChanges();
    await engine.flush();

    expect(engine.status).toBe("sync-failed");
    expect(engine.failedLanes).toHaveLength(1);
    expect(workbench.profile.layers[0].bindings["k2-4"].code).toBe("KC_G");
    expect(workbench.baseProfile.layers[0].bindings["k2-4"].code).toBe(originalBaseCode);

    engine.retryFailed();
    await engine.flush();

    expect(engine.failedLanes).toHaveLength(0);
    expect(workbench.baseProfile.layers[0].bindings["k2-4"].code).toBe("KC_G");
    expect(engine.status).toBe("synced");
  });

  it("debounces rapid edits per key lane and writes only the settled value", async () => {
    const { engine, hidDevice, workbench } = await createLiveSyncHarness();
    const beforeWrites = setKeycodeWrites(hidDevice).length;

    workbench.selectKey("k2-4");
    workbench.applyKeycode("KC_G");
    engine.processChanges();
    workbench.applyKeycode("KC_H");
    engine.processChanges();
    workbench.applyKeycode("KC_J");
    engine.processChanges();
    await engine.flush();

    expect(setKeycodeWrites(hidDevice).length - beforeWrites).toBe(1);
    expect(hidDevice.definition.keymap[0][2][4]).toBe(qmkKeycodeValue("KC_J"));
    expect(workbench.baseProfile.layers[0].bindings["k2-4"].code).toBe("KC_J");
  });
});
