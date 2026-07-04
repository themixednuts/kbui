import { describe, expect, it } from "vite-plus/test";

import {
  connectZmkStudioAndActivate,
  connectViaAndActivate,
  continueWithoutDevice,
  importViaJsonAndActivate,
} from "$lib/app/connect-flow";
import { ShellStore, type ShellConnectionStatus } from "$lib/app/shell-store.svelte";
import { WorkbenchStore } from "$lib/app/workbench-store.svelte";
import { createMockViaTransport } from "$lib/keyboard/transport-mock";
import { createMockZmkStudioTransport } from "$lib/keyboard/transport-mock-zmk";

class RecordingShellStore extends ShellStore {
  transitions: ShellConnectionStatus[] = [];

  private record() {
    this.transitions.push(this.device.status);
  }

  override setConnecting(message?: string, transport?: string) {
    super.setConnecting(message, transport);
    this.record();
  }

  override setConnected(input: Parameters<ShellStore["setConnected"]>[0]) {
    super.setConnected(input);
    this.record();
  }

  override setDisconnected(message?: string) {
    super.setDisconnected(message);
    this.record();
  }

  override setConnectionError(message: string, transport?: string) {
    super.setConnectionError(message, transport);
    this.record();
  }
}

function createStores() {
  return {
    shell: new RecordingShellStore(),
    workbench: new WorkbenchStore({ persist: false }),
  };
}

function tinyViaDefinition() {
  return {
    name: "Test Pad",
    vendorId: "0x1209",
    productId: "0x0001",
    matrix: { rows: 1, cols: 2 },
    layouts: {
      keymap: [["0,0\nA", "0,1\nB"]],
    },
    layers: [
      {
        id: "base",
        name: "Base",
        bindings: {
          "k0-0": "KC_A",
          "k0-1": "KC_B",
        },
      },
    ],
  };
}

describe("connect flow", () => {
  it("connects the mock VIA device, imports identity/keymap, and sets the active profile", async () => {
    const { shell, workbench } = createStores();

    const result = await connectViaAndActivate({
      shell,
      transport: createMockViaTransport(),
      workbench,
    });

    expect(result.source).toBe("device");
    expect(result.connection?.status).toBe("connected");
    expect(result.connection?.detection?.identity.productName).toBe("Workbench 65");
    expect(result.connection?.detection?.keymap?.[0]?.[0]?.[0]).toBe(0x0029);
    expect(workbench.profile.name).toBe("Workbench 65");
    expect(workbench.profile.identity?.serialNumber).toBe("MOCK-WB65-001");
    expect(workbench.profile.layers[0].bindings["k0-0"]?.code).toBe("KC_ESC");
    expect(shell.device).toMatchObject({
      board: "Workbench 65",
      protocol: "VIA v3",
      status: "connected",
      transport: "Mock VIA",
    });
    expect(shell.transitions).toEqual(["connecting", "connected"]);
  });

  it("imports a VIA JSON definition into a local DeviceProfile", async () => {
    const { shell, workbench } = createStores();

    const result = await importViaJsonAndActivate({
      fileName: "test-pad.json",
      json: tinyViaDefinition(),
      shell,
      workbench,
    });

    expect(result.source).toBe("import");
    expect(result.profile.name).toBe("Test Pad");
    expect(workbench.profile.name).toBe("Test Pad");
    expect(workbench.profile.vendorId).toBe(0x1209);
    expect(workbench.profile.productId).toBe(0x0001);
    expect(workbench.profile.layers[0].bindings["k0-1"]?.code).toBe("KC_B");
    expect(shell.device.status).toBe("disconnected");
    expect(shell.primaryActionLabel).toBe("Connect");
    expect(shell.transitions).toEqual(["connecting", "disconnected"]);
  });

  it("connects the mock ZMK Studio device and imports key positions into the active profile", async () => {
    const { shell, workbench } = createStores();

    const result = await connectZmkStudioAndActivate({
      shell,
      transport: createMockZmkStudioTransport(),
      workbench,
    });

    expect(result.source).toBe("device");
    expect(result.connection?.status).toBe("connected");
    expect(result.connection?.protocol).toBe("zmk-studio");
    expect(result.connection?.zmkStudio?.keyPositionByKeyId["k2-4"]).toBe(32);
    expect(result.profile.firmware).toBe("zmk");
    expect(result.profile.protocol).toBe("zmk-studio");
    expect(result.profile.name).toBe("Workbench ZMK 65");
    expect(result.profile.layers[0].id).toBe("zmk-layer-100");
    expect(workbench.profile.layers[0].bindings["k2-4"]?.code).toBe("KC_F");
    expect(shell.device).toMatchObject({
      board: "Workbench ZMK 65",
      protocol: "ZMK Studio",
      status: "connected",
      transport: "Mock ZMK",
    });
  });

  it("continues without a device using a local-only profile", async () => {
    const { shell, workbench } = createStores();

    const result = await continueWithoutDevice({ shell, workbench });

    expect(result.source).toBe("local");
    expect(workbench.profile.id).toBe("local:keeb-workbench-devboard");
    expect(workbench.profile.identity).toBeUndefined();
    expect(workbench.profile.detectionNotes).toContain(
      "Created a local-only profile without a connected keyboard.",
    );
    expect(shell.device.status).toBe("disconnected");
    expect(shell.device.message).toBe("Editing Workbench 65 without a connected device.");
    expect(shell.transitions).toEqual(["connecting", "disconnected"]);
  });
});
