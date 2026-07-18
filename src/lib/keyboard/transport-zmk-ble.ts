import { browser } from "$app/environment";
import { Effect } from "effect";

import { forkApp, runApp } from "$lib/app/runtime";
import { platformError } from "$lib/effect/errors";
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
      await input.characteristic.stopNotifications?.();
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
    const stopNotificationsCall = input.characteristic.stopNotifications?.bind(
      input.characteristic,
    );
    const stopNotifications = stopNotificationsCall
      ? Effect.tryPromise({
          try: stopNotificationsCall,
          catch: (cause) => platformError("zmk-studio.ble.abort", cause),
        })
      : Effect.void;
    forkApp(
      "zmk-studio.ble.abort",
      stopNotifications.pipe(Effect.ensuring(Effect.sync(() => input.device.gatt?.disconnect()))),
    );
  });

  return {
    abortController,
    close: async () => {
      cleanup();
      await input.characteristic.stopNotifications?.();
      input.device.gatt?.disconnect();
    },
    label: input.label,
    readable,
    writable,
  };
}

function connectBleDeviceEffect(environment: TransportEnvironment) {
  const bluetooth = bluetoothController(environment);
  if (!environment.isBrowser) {
    return Effect.succeed({
      ...getConnectionState(environment),
      message: "Browser required",
      protocol: "zmk-studio",
      status: "unsupported",
      transport: "webbluetooth",
    } satisfies ConnectionState);
  }
  if (!bluetooth) {
    return Effect.succeed({
      ...getConnectionState(environment),
      message: "Web Bluetooth unavailable",
      protocol: "zmk-studio",
      status: "unsupported",
      transport: "webbluetooth",
    } satisfies ConnectionState);
  }

  let connection: RealZmkStudioConnection | undefined;
  const connect = Effect.gen(function* () {
    const device = yield* Effect.tryPromise({
      try: () =>
        bluetooth.requestDevice({
          filters: [{ services: [zmkStudioBleServiceUuid] }],
          optionalServices: [zmkStudioBleServiceUuid],
        }),
      catch: (cause) => platformError("zmk-studio.ble.select", cause),
    });

    const gatt = device.gatt;
    if (!gatt) {
      return yield* Effect.fail(
        platformError("zmk-studio.ble.gatt", "Selected BLE device has no GATT server."),
      );
    }
    const server = gatt.connected
      ? gatt
      : yield* Effect.tryPromise({
          try: () => gatt.connect(),
          catch: (cause) => platformError("zmk-studio.ble.connect", cause),
        });
    const service = yield* Effect.tryPromise({
      try: () => server.getPrimaryService(zmkStudioBleServiceUuid),
      catch: (cause) => platformError("zmk-studio.ble.service", cause),
    });
    const characteristic = yield* Effect.tryPromise({
      try: () => service.getCharacteristic(zmkStudioBleRpcCharacteristicUuid),
      catch: (cause) => platformError("zmk-studio.ble.characteristic", cause),
    });

    connection = new RealZmkStudioConnection(
      createGattByteTransport({
        characteristic,
        device,
        label: device.name ?? "ZMK Studio BLE keyboard",
      }),
    );
    const activeConnection = connection;
    const [info, lock] = yield* Effect.all(
      [
        Effect.tryPromise({
          try: () => activeConnection.call({ type: "get_device_info" }),
          catch: (cause) => platformError("zmk-studio.ble.device-info", cause),
        }),
        Effect.tryPromise({
          try: () => activeConnection.call({ type: "get_lock_state" }),
          catch: (cause) => platformError("zmk-studio.ble.lock-state", cause),
        }),
      ],
      { concurrency: 2 },
    );
    if (info.type !== "get_device_info" || lock.type !== "get_lock_state") {
      return yield* Effect.fail(
        platformError("zmk-studio.ble.probe", "ZMK Studio returned an unexpected response."),
      );
    }

    activeConnection.label = info.deviceName;
    const deviceKey = zmkStudioDeviceKey({
      productName: info.deviceName,
      serialNumber: info.serialNumber,
      transport: "webbluetooth",
    });
    const notes = ["Connected through the ZMK Studio Bluetooth service."];
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
          : "Connected over ZMK Studio Bluetooth.",
      productName: info.deviceName,
      protocol: "zmk-studio",
      serialNumber: info.serialNumber,
      status: "connected",
      transport: "webbluetooth",
      zmkStudio: activeConnection,
    } satisfies ConnectionState;
  });

  return Effect.matchEffect(connect, {
    onFailure: (error) => {
      const cleanup = connection
        ? Effect.tryPromise({
            try: () => connection!.close(),
            catch: (cause) => platformError("zmk-studio.ble.cleanup", cause),
          })
        : Effect.void;
      return Effect.match(cleanup, {
        onFailure: (cleanupError) =>
          errorState(
            environment,
            `${connectionErrorMessage(error)}; cleanup failed: ${connectionErrorMessage(cleanupError)}`,
          ),
        onSuccess: () => errorState(environment, connectionErrorMessage(error)),
      });
    },
    onSuccess: Effect.succeed,
  });
}

function errorState(environment: TransportEnvironment, message: string): ConnectionState {
  return {
    ...getConnectionState(environment),
    message,
    protocol: "zmk-studio",
    status: "error",
    transport: "webbluetooth",
  };
}

export function createWebBluetoothZmkStudioTransport(): KeyboardTransport {
  return {
    connect: (options: KeyboardTransportConnectOptions = {}) =>
      runApp(
        "zmk-studio.ble.connect",
        connectBleDeviceEffect(options.environment ?? browserTransportEnvironment()),
      ),
    id: "webbluetooth-zmk-studio",
    label: "Web Bluetooth ZMK Studio",
    mode: "real",
    transport: "webbluetooth",
  };
}
