import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import {
  activateViaConnectionAndProfile,
  connectZmkStudioAndActivate,
  connectViaAndActivate,
  connectViaAndActivateEffect,
  continueWithoutDevice,
  importViaJsonAndActivate,
  profileFromConnectedViaEffect,
  profileFromViaJson,
} from "$lib/app/connect-flow";
import { runApp } from "$lib/app/runtime";
import { ShellStore, type ShellConnectionStatus } from "$lib/app/shell-store.svelte";
import { WorkbenchStore } from "$lib/app/workbench-store.svelte";
import { platformError } from "$lib/effect/errors";
import { starterBoardProfile } from "$lib/keyboard/sample-boards";
import { createMockViaTransport } from "$lib/keyboard/transport-mock";
import { createMockZmkStudioTransport } from "$lib/keyboard/transport-mock-zmk";
import type { ConnectionState, KeyboardTransport } from "$lib/keyboard/transport";

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

class PromiseFacadeTrapWorkbenchStore extends WorkbenchStore {
  override activateConnectedProfile(): never {
    throw new Error("connect flow called the activateConnectedProfile Promise facade");
  }

  override replaceProfile(): never {
    throw new Error("connect flow called the replaceProfile Promise facade");
  }

  override commitCurrentDraftAsBase(): never {
    throw new Error("connect flow called the commitCurrentDraftAsBase Promise facade");
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

function unknownRealViaTransport(): KeyboardTransport {
  return {
    id: "real-via:unknown-test",
    label: "Unknown VIA",
    mode: "real",
    transport: "webhid",
    connect: async () => unknownViaConnection(),
  };
}

function unknownViaConnection(): ConnectionState {
  const identity = {
    key: "keyboard:1209:0002:UNKNOWN-VIA",
    transport: "webhid" as const,
    vendorId: 0x1209,
    productId: 0x0002,
    productName: "Mystery Pad",
    serialNumber: "UNKNOWN-VIA",
  };

  return {
    status: "connected",
    transport: "webhid",
    protocol: "via-v3",
    deviceKey: identity.key,
    productName: identity.productName,
    vendorId: identity.vendorId,
    productId: identity.productId,
    serialNumber: identity.serialNumber,
    detection: {
      identity,
      protocolVersion: 12,
      layerCount: 2,
      capabilities: ["keymap", "layers"],
      notes: ["VIA protocol responded, but no keyboard definition was resolved."],
    },
    message: "Connected",
    webBluetoothSupported: false,
    webHidSupported: true,
    webSerialSupported: false,
    webUsbSupported: false,
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
    expect(result.profile.origin).toBe("device");
    expect(result.connection?.status).toBe("connected");
    expect(result.connection?.detection?.identity.productName).toBe("Workbench 65");
    expect(result.connection?.detection?.keymap?.[0]?.[0]?.[0]).toBe(0x0029);
    expect(workbench.profile.name).toBe("Workbench 65");
    expect(workbench.profile.origin).toBe("device");
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
    expect(result.profile.origin).toBe("imported");
    expect(result.profile.name).toBe("Test Pad");
    expect(workbench.profile.name).toBe("Test Pad");
    expect(workbench.profile.origin).toBe("imported");
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
    expect(result.profile.origin).toBe("device");
    expect(result.connection?.status).toBe("connected");
    expect(result.connection?.protocol).toBe("zmk-studio");
    expect(result.connection?.zmkStudio?.keyPositionByKeyId["k2-4"]).toBe(32);
    expect(result.profile.firmware).toBe("zmk");
    expect(result.profile.protocol).toBe("zmk-studio");
    expect(result.profile.name).toBe("Workbench ZMK 65");
    expect(result.profile.layers[0].id).toBe("zmk-layer-100");
    expect(result.profile.macros).toEqual([]);
    expect(result.profile.combos).toEqual([]);
    expect(result.profile.tapDances).toEqual([]);
    expect(result.profile.keyOverrides).toEqual([]);
    expect(result.profile.lighting.keys).toEqual({});
    expect(result.profile.settings.permissiveHold).toBe(false);
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
    expect(result.profile.origin).toBe("starter");
    expect(workbench.profile.id).toBe("local:local-keyboard-profile");
    expect(workbench.profile.origin).toBe("starter");
    expect(workbench.profile.identity).toBeUndefined();
    expect(workbench.profile.detectionNotes).toContain(
      "Created a local-only profile without a connected keyboard.",
    );
    expect(shell.device.status).toBe("disconnected");
    expect(shell.device.message).toBe("Editing Local keyboard without a connected device.");
    expect(shell.transitions).toEqual(["connecting", "disconnected"]);
  });

  it("does not turn an unidentified real VIA device into the starter board", async () => {
    const { shell, workbench } = createStores();

    await expect(
      connectViaAndActivate({
        shell,
        transport: unknownRealViaTransport(),
        workbench,
      }),
    ).rejects.toThrow(/No device changes were made/);

    expect(workbench.profile.name).toBe("Local keyboard");
    expect(workbench.profile.origin).toBe("starter");
    expect(shell.device.status).toBe("error");
    expect(shell.device.message).toContain("No device changes were made");
    expect(shell.transitions).toEqual(["connecting", "error"]);
  });

  it("activates an already granted VIA connection without prompting again", async () => {
    const { shell, workbench } = createStores();
    const baseProfile = profileFromViaJson("test-pad.json", tinyViaDefinition());

    const result = await activateViaConnectionAndProfile({
      connection: unknownViaConnection(),
      displayTransport: "WebHID",
      resolveBaseProfile: () => baseProfile,
      shell,
      workbench,
    });

    expect(result.source).toBe("device");
    expect(result.profile.name).toBe("Mystery Pad");
    expect(workbench.profile.origin).toBe("device");
    expect(shell.device).toMatchObject({
      board: "Mystery Pad",
      protocol: "VIA v3",
      status: "connected",
      transport: "WebHID",
    });
  });

  it("composes workbench Effects without calling Promise facades", async () => {
    const connectedWorkbench = new PromiseFacadeTrapWorkbenchStore({ persist: false });
    const connected = await runApp(
      "test.connect-via-effect",
      connectViaAndActivateEffect({
        shell: new RecordingShellStore(),
        transport: createMockViaTransport(),
        workbench: connectedWorkbench,
      }),
    );

    const localWorkbench = new PromiseFacadeTrapWorkbenchStore({ persist: false });
    const local = await continueWithoutDevice({
      shell: new RecordingShellStore(),
      workbench: localWorkbench,
    });

    expect(connected.profile.origin).toBe("device");
    expect(connectedWorkbench.profile.origin).toBe("device");
    expect(local.profile.origin).toBe("starter");
    expect(localWorkbench.profile.origin).toBe("starter");
  });

  it("reports direct activation failures without flattening them through a Promise facade", async () => {
    const shell = new RecordingShellStore();
    const workbench = new PromiseFacadeTrapWorkbenchStore({
      loadDraft: () =>
        Effect.fail(platformError("test.load-connected-draft", "Connected draft unavailable")),
      persist: false,
    });

    await expect(
      connectViaAndActivate({
        shell,
        transport: createMockViaTransport(),
        workbench,
      }),
    ).rejects.toThrow(/Connected draft unavailable/);

    expect(shell.device.status).toBe("error");
    expect(shell.device.message).toBe("Connected draft unavailable");
    expect(workbench.persistenceError).toBe("Connected draft unavailable");
  });

  it("fails missing VIA detection through the typed channel", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        profileFromConnectedViaEffect(
          {
            status: "connected",
            message: "Connected without VIA metadata",
            webBluetoothSupported: true,
            webSerialSupported: true,
            webUsbSupported: true,
            webHidSupported: true,
          },
          starterBoardProfile(),
        ),
      ),
    );

    expect(error._tag).toBe("PlatformError");
    expect(error.operation).toBe("connect.via.profile");
  });
});
