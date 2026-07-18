import { describe, expect, it } from "vite-plus/test";

import { connectViaAndActivate } from "$lib/app/connect-flow";
import { runApp } from "$lib/app/runtime";
import { ShellStore } from "$lib/app/shell-store.svelte";
import { WorkbenchStore } from "$lib/app/workbench-store.svelte";
import { qmkKeycodeValue } from "$lib/keyboard/schema";
import { MockHidKeyboardDevice, createMockViaTransport } from "$lib/keyboard/transport-mock";

import { ViaLiveSyncEngine, type ViaLiveSyncOptions } from "./via-live-sync.svelte";

async function createLiveSyncHarness(
  debounceMs = 8,
  writeKeycode?: ViaLiveSyncOptions["writeKeycode"],
) {
  const shell = new ShellStore();
  const workbench = new WorkbenchStore({ persist: false });
  await connectViaAndActivate({
    shell,
    transport: createMockViaTransport(),
    workbench,
  });
  const engine = new ViaLiveSyncEngine({
    debounceMs,
    editor: workbench,
    shell,
    ...(writeKeycode ? { writeKeycode } : {}),
  });
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
    await runApp("test.via-live-sync.flush", engine.flushEffect());

    const expectedKeycode = qmkKeycodeValue("KC_G");
    expect(setKeycodeWrites(hidDevice).length - beforeWrites).toBe(1);
    expect(hidDevice.definition.keymap[0][2][4]).toBe(expectedKeycode);
    expect(workbench.profile.layers[0].bindings["k2-4"].code).toBe("KC_G");
    expect(workbench.baseProfile.layers[0].bindings["k2-4"].code).toBe("KC_G");
    expect(engine.status).toBe("synced");
  });

  it("flags rebuild-required edits without blocking live keymap writes", async () => {
    const { engine, hidDevice, workbench } = await createLiveSyncHarness();
    workbench.addCombo();
    const beforeWrites = setKeycodeWrites(hidDevice).length;

    engine.processChanges();
    await engine.flush();
    expect(setKeycodeWrites(hidDevice).length).toBe(beforeWrites);
    expect(engine.rebuildRequiredChanges).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "combo" })]),
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

  it("reports connected VIA lighting edits as local-only without device writes", async () => {
    const { engine, hidDevice, workbench } = await createLiveSyncHarness();
    const beforeWrites = setKeycodeWrites(hidDevice).length;
    const baseBrightness = workbench.baseProfile.lighting.brightness;

    workbench.setBrightness(baseBrightness === 35 ? 36 : 35);
    engine.processChanges();
    await engine.flush();

    expect(setKeycodeWrites(hidDevice).length).toBe(beforeWrites);
    expect(workbench.baseProfile.lighting.brightness).toBe(baseBrightness);
    expect(engine.status).toBe("local-only");
    expect(engine.localOnlyChanges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          classification: "localOnly",
          localOnlyCategory: "lighting",
          reason: "VIA lighting is not writable over this transport.",
        }),
      ]),
    );
    expect(engine.localOnlySummary).toMatchObject({
      count: 1,
      reasons: [
        {
          category: "lighting",
          count: 1,
          label: "lighting",
          reason: "VIA lighting is not writable over this transport.",
        },
      ],
    });
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

  it("interrupts an in-flight write when destroyed", async () => {
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const { engine, workbench } = await createLiveSyncHarness(1, async (_connection, input) => {
      started.resolve();
      await release.promise;
      return { requestedKeycode: input.keycode, verifiedKeycode: input.keycode };
    });
    const originalBaseCode = workbench.baseProfile.layers[0].bindings["k2-4"].code;

    workbench.selectKey("k2-4");
    workbench.applyKeycode("KC_G");
    engine.processChanges();
    await started.promise;

    engine.destroy();
    release.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(workbench.baseProfile.layers[0].bindings["k2-4"].code).toBe(originalBaseCode);
  });
});
