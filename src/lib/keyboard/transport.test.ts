import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import {
  connectKeyboard,
  connectKeyboardEffect,
  detectGrantedKeyboard,
  detectGrantedKeyboardEffect,
  getConnectionState,
  writeViaKeycodeEffect,
} from "./transport";
import {
  MockHidKeyboardDevice,
  MockUsbKeyboardDevice,
  createMockHidController,
  createMockTransportEnvironment,
  createMockUsbController,
} from "./transport-mock";
import {
  encodeViaCommandReport,
  encodeViaSetKeycodeReport,
  validateViaReport,
  viaCommand,
} from "./via-protocol";

describe("keyboard transports", () => {
  it("reads VIA protocol, layers, macros, and keymap through a mock WebHID device", async () => {
    const environment = createMockTransportEnvironment({
      productName: "Mock Charybdis",
      vendorId: 0xa8f8,
      productId: 0x1836,
      layerCount: 2,
      matrix: { rows: 2, cols: 3 },
      macroCount: 4,
      keymap: [
        [
          [0x0004, 0x0005, 0x0006],
          [0x0007, 0x0008, 0x0009],
        ],
        [
          [0x0001, 0x0001, 0x0001],
          [0x0001, 0x0001, 0x0001],
        ],
      ],
    });

    const connection = await Effect.runPromise(
      connectKeyboardEffect("webhid", [], {
        environment,
        matrixHint: { rows: 2, cols: 3 },
      }),
    );

    expect(connection.status).toBe("connected");
    expect(connection.detection?.protocolVersion).toBe(12);
    expect(connection.detection?.layerCount).toBe(2);
    expect(connection.detection?.capabilities).toContain("macros");
    expect(connection.detection?.keymap?.[0]?.[0]?.[0]).toBe(0x0004);
    expect(connection.detection?.keymap?.[1]?.[1]?.[2]).toBe(0x0001);
  });

  it("does not guess a matrix when no VIA definition is resolved", async () => {
    const environment = createMockTransportEnvironment({
      productName: "Generic QMK Keyboard",
      vendorId: 0xfeed,
      productId: 0x6060,
      layerCount: 1,
      matrix: { rows: 1, cols: 1 },
      keymap: [[[0x0028]]],
    });

    const connection = await connectKeyboard("webhid", [], { environment });

    expect(connection.status).toBe("connected");
    expect(connection.detection?.keymap).toBeUndefined();
    expect(connection.detection?.notes).toContain(
      "Need a keyboard definition to map physical layout dimensions before reading all keys.",
    );
  });

  it("opens and claims a mock WebUSB keyboard", async () => {
    const usbDevice = new MockUsbKeyboardDevice({
      productName: "Mock USB Board",
      vendorId: 0x3434,
      productId: 0x0107,
      serialNumber: "SERIAL-1",
    });
    const environment = {
      isBrowser: true,
      hid: createMockHidController(new MockHidKeyboardDevice()),
      usb: createMockUsbController(usbDevice),
    };

    const connection = await connectKeyboard("webusb", [], { environment });

    expect(connection.status).toBe("connected");
    expect(connection.deviceKey).toBe("keyboard:3434:0107:SERIAL-1");
    expect(usbDevice.opened).toBe(true);
    expect(usbDevice.claimedInterface).toBe(1);
  });

  it("auto-detects an already granted mock WebHID keyboard before WebUSB", async () => {
    const environment = createMockTransportEnvironment({
      productName: "Granted VIA Board",
      vendorId: 0xfeed,
      productId: 0x6060,
      layerCount: 1,
      matrix: { rows: 1, cols: 1 },
      keymap: [[[0x0028]]],
    });

    const connection = await Effect.runPromise(
      detectGrantedKeyboardEffect({
        environment,
        resolveMatrixHint: () => ({ rows: 1, cols: 1 }),
      }),
    );

    expect(connection?.transport).toBe("webhid");
    expect(connection?.detection?.keymap?.[0]?.[0]?.[0]).toBe(0x0028);
  });

  it("validates and applies VIA set-keycode reports sent to the mock WebHID device", async () => {
    const hidDevice = new MockHidKeyboardDevice({
      layerCount: 1,
      matrix: { rows: 1, cols: 1 },
      keymap: [[[0x0004]]],
    });

    await hidDevice.open();
    await hidDevice.sendReport(
      0,
      encodeViaSetKeycodeReport({ col: 0, keycode: 0x0028, layer: 0, row: 0 }),
    );

    expect(hidDevice.validationResults.at(-1)?.ok).toBe(true);
    expect(hidDevice.validationResults.at(-1)?.commandName).toBe("dynamicKeymapSetKeycode");
    expect(hidDevice.definition.keymap[0][0][0]).toBe(0x0028);
  });

  it("writes a VIA keycode through an established WebHID connection and verifies readback", async () => {
    const environment = createMockTransportEnvironment({
      productName: "Writable VIA Board",
      vendorId: 0xfeed,
      productId: 0x6060,
      layerCount: 1,
      matrix: { rows: 1, cols: 1 },
      keymap: [[[0x0004]]],
    });

    const connection = await Effect.runPromise(
      connectKeyboardEffect("webhid", [], {
        environment,
        matrixHint: { rows: 1, cols: 1 },
      }),
    );

    const result = await Effect.runPromise(
      writeViaKeycodeEffect(connection, { col: 0, keycode: 0x0028, layer: 0, row: 0 }),
    );

    const hidDevice = connection.hidDevice as MockHidKeyboardDevice;
    expect(result).toEqual({ requestedKeycode: 0x0028, verifiedKeycode: 0x0028 });
    expect(hidDevice.definition.keymap[0][0][0]).toBe(0x0028);
    expect(hidDevice.validationResults.at(-2)?.commandName).toBe("dynamicKeymapSetKeycode");
    expect(hidDevice.validationResults.at(-1)?.commandName).toBe("dynamicKeymapGetKeycode");
  });

  it("blocks VIA writes when the connection is not a live WebHID device", async () => {
    await expect(
      Effect.runPromise(
        writeViaKeycodeEffect(
          {
            message: "Ready",
            status: "idle",
            webHidSupported: true,
            webUsbSupported: true,
          },
          { col: 0, keycode: 0x0028, layer: 0, row: 0 },
        ),
      ),
    ).rejects.toThrow("Connect a WebHID VIA keyboard before saving to the device.");
  });

  it("captures VIA validation failures without mutating mock keyboard state", async () => {
    const hidDevice = new MockHidKeyboardDevice({
      layerCount: 1,
      matrix: { rows: 1, cols: 1 },
      keymap: [[[0x0004]]],
    });

    await hidDevice.open();
    await hidDevice.sendReport(
      0,
      encodeViaSetKeycodeReport({ col: 0, keycode: 0x0028, layer: 1, row: 0 }),
    );

    expect(hidDevice.validationResults.at(-1)?.ok).toBe(false);
    expect(hidDevice.validationResults.at(-1)?.errors).toContain("Layer 1 is outside 0..0");
    expect(hidDevice.definition.keymap[0][0][0]).toBe(0x0004);
  });

  it("validates VIA report length and unknown commands", () => {
    const shortReport = new Uint8Array([viaCommand.dynamicKeymapGetKeycode, 0, 0, 0]);
    const unknownReport = encodeViaCommandReport(0x7e);

    expect(validateViaReport(shortReport).errors).toContain(
      "VIA report must be 32 bytes, received 4",
    );
    expect(validateViaReport(unknownReport).errors).toContain("Unknown VIA command 0x7e");
  });

  it("reports unsupported when no browser transport exists", async () => {
    const environment = { isBrowser: false };

    expect(getConnectionState(environment).status).toBe("unsupported");
    expect(await detectGrantedKeyboard({ environment })).toBeUndefined();
  });
});
