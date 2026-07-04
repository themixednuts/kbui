import { browser } from "$app/environment";

import {
  getConnectionState,
  type ConnectionState,
  type KeyboardTransport,
  type KeyboardTransportConnectOptions,
  type TransportEnvironment,
} from "./transport";
import {
  RealZmkStudioConnection,
  zmkStudioDeviceKey,
  type ZmkStudioByteTransport,
} from "./zmk-studio-rpc";

export const zmkStudioBleServiceUuid = "00000000-0196-6107-c967-c5cfb1c2482a";
export const zmkStudioBleRpcCharacteristicUuid = "00000001-0196-6107-c967-c5cfb1c2482a";

interface ZmkBluetoothController {
  requestDevice: (options: {
    filters: Array<{ services: string[] }>;
    optionalServices?: string[];
  }) => Promise<ZmkBluetoothDevice>;
}

interface ZmkBluetoothDevice extends EventTarget {
  gatt?: ZmkBluetoothRemoteGattServer;
  name?: string;
}

interface ZmkBluetoothRemoteGattServer {
  connected: boolean;
  connect: () => Promise<ZmkBluetoothRemoteGattServer>;
  disconnect: () => void;
  getPrimaryService: (service: string) => Promise<ZmkBluetoothRemoteGattService>;
}

interface ZmkBluetoothRemoteGattService {
  getCharacteristic: (characteristic: string) => Promise<ZmkBluetoothRemoteGattCharacteristic>;
}

interface ZmkBluetoothRemoteGattCharacteristic extends EventTarget {
  startNotifications: () => Promise<ZmkBluetoothRemoteGattCharacteristic>;
  stopNotifications?: () => Promise<ZmkBluetoothRemoteGattCharacteristic>;
  writeValue?: (value: BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (value: BufferSource) => Promise<void>;
}

function browserTransportEnvironment(): TransportEnvironment {
  return {
    bluetooth: browser ? navigator.bluetooth : undefined,
    hid: browser ? navigator.hid : undefined,
    isBrowser: browser,
    serial: browser ? navigator.serial : undefined,
    usb: browser ? navigator.usb : undefined,
  };
}

function bluetoothController(environment: TransportEnvironment) {
  return environment.bluetooth as ZmkBluetoothController | undefined;
}

function connectionErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Web Bluetooth ZMK Studio connection failed";
  if (error.name === "NotFoundError") return "No Web Bluetooth ZMK Studio keyboard selected";
  if (error.name === "SecurityError") return "Web Bluetooth permission was blocked";
  return error.message;
}

function closeController(controller: ReadableStreamDefaultController<Uint8Array>) {
  try {
    controller.close();
  } catch {
    // The stream may already be closed by an abort or disconnect event.
  }
}

function chunkBufferSource(chunk: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(chunk.byteLength);
  copy.set(chunk);
  return copy.buffer as ArrayBuffer;
}

function createGattByteTransport(input: {
  characteristic: ZmkBluetoothRemoteGattCharacteristic;
  device: ZmkBluetoothDevice;
  label: string;
}): ZmkStudioByteTransport {
  const abortController = new AbortController();
  let cleanup = () => undefined;

  const readable = new ReadableStream<Uint8Array>({
    async start(controller) {
      const onValue = (event: Event) => {
        const value = (event.target as { value?: DataView } | null)?.value;
        if (!value) return;

        controller.enqueue(
          new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength)),
        );
      };
      const onDisconnect = () => {
        cleanup();
        closeController(controller);
      };

      cleanup = () => {
        input.characteristic.removeEventListener("characteristicvaluechanged", onValue);
        input.device.removeEventListener("gattserverdisconnected", onDisconnect);
      };

      await input.characteristic.startNotifications();
      input.characteristic.addEventListener("characteristicvaluechanged", onValue);
      input.device.addEventListener("gattserverdisconnected", onDisconnect);
    },
    async cancel() {
      cleanup();
      await input.characteristic.stopNotifications?.().catch(() => undefined);
    },
  });

  const writable = new WritableStream<Uint8Array>({
    async write(chunk) {
      const value = chunkBufferSource(chunk);
      if (input.characteristic.writeValueWithoutResponse) {
        await input.characteristic.writeValueWithoutResponse(value);
        return;
      }
      if (input.characteristic.writeValue) {
        await input.characteristic.writeValue(value);
        return;
      }
      throw new Error("The ZMK Studio BLE characteristic is not writable.");
    },
  });

  abortController.signal.addEventListener("abort", () => {
    cleanup();
    void input.characteristic.stopNotifications?.().catch(() => undefined);
    input.device.gatt?.disconnect();
  });

  return {
    abortController,
    close: async () => {
      cleanup();
      await input.characteristic.stopNotifications?.().catch(() => undefined);
      input.device.gatt?.disconnect();
    },
    label: input.label,
    readable,
    writable,
  };
}

async function connectBleDevice(environment: TransportEnvironment): Promise<ConnectionState> {
  const bluetooth = bluetoothController(environment);
  if (!environment.isBrowser) {
    return {
      ...getConnectionState(environment),
      message: "Browser required",
      protocol: "zmk-studio",
      status: "unsupported",
      transport: "webbluetooth",
    };
  }
  if (!bluetooth) {
    return {
      ...getConnectionState(environment),
      message: "Web Bluetooth unavailable",
      protocol: "zmk-studio",
      status: "unsupported",
      transport: "webbluetooth",
    };
  }

  let connection: RealZmkStudioConnection | undefined;

  try {
    const device = await bluetooth.requestDevice({
      filters: [{ services: [zmkStudioBleServiceUuid] }],
      optionalServices: [zmkStudioBleServiceUuid],
    });

    const gatt = device.gatt;
    if (!gatt) throw new Error("Selected BLE device does not expose a GATT server.");
    const server = gatt.connected ? gatt : await gatt.connect();
    const service = await server.getPrimaryService(zmkStudioBleServiceUuid);
    const characteristic = await service.getCharacteristic(zmkStudioBleRpcCharacteristicUuid);

    // Hardware-unverified until tested with a real ZMK Studio board.
    connection = new RealZmkStudioConnection(
      createGattByteTransport({
        characteristic,
        device,
        label: device.name ?? "ZMK Studio BLE keyboard",
      }),
    );

    const info = await connection.call({ type: "get_device_info" });
    const lock = await connection.call({ type: "get_lock_state" });
    if (info.type !== "get_device_info" || lock.type !== "get_lock_state") {
      throw new Error("ZMK Studio BLE probe returned an unexpected response.");
    }

    connection.label = info.deviceName;
    const deviceKey = zmkStudioDeviceKey({
      productName: info.deviceName,
      serialNumber: info.serialNumber,
      transport: "webbluetooth",
    });
    const notes = [
      "Real Web Bluetooth ZMK Studio transport is implemented but hardware-unverified.",
    ];
    if (lock.lockState === "locked") {
      notes.push("ZMK Studio is locked; unlock on the keyboard (&studio_unlock) before writes.");
    }

    return {
      ...getConnectionState(environment),
      detection: {
        capabilities: ["keymap", "layers", "settings", "firmware"],
        identity: {
          key: deviceKey,
          productName: info.deviceName,
          serialNumber: info.serialNumber,
          transport: "webbluetooth",
        },
        notes,
      },
      deviceKey,
      message:
        lock.lockState === "locked"
          ? "Connected, but ZMK Studio is locked. Unlock on the keyboard (&studio_unlock)."
          : "Connected. Real ZMK Studio BLE is hardware-unverified.",
      productName: info.deviceName,
      protocol: "zmk-studio",
      serialNumber: info.serialNumber,
      status: "connected",
      transport: "webbluetooth",
      zmkStudio: connection,
    };
  } catch (error) {
    await connection?.close().catch(() => undefined);
    return {
      ...getConnectionState(environment),
      message: connectionErrorMessage(error),
      protocol: "zmk-studio",
      status: "error",
      transport: "webbluetooth",
    };
  }
}

export function createWebBluetoothZmkStudioTransport(): KeyboardTransport {
  return {
    connect: (options: KeyboardTransportConnectOptions = {}) =>
      connectBleDevice(options.environment ?? browserTransportEnvironment()),
    id: "webbluetooth-zmk-studio",
    label: "Web Bluetooth ZMK Studio",
    mode: "real",
    transport: "webbluetooth",
  };
}
