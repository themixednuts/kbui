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

export const zmkStudioSerialBaudRate = 12_500;

interface ZmkSerialController {
  requestPort: (options?: Record<string, never>) => Promise<ZmkSerialPort>;
}

interface ZmkSerialPort {
  close: () => Promise<void>;
  getInfo?: () => { usbProductId?: number; usbVendorId?: number };
  open: (options: { baudRate: number }) => Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
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

function serialController(environment: TransportEnvironment) {
  return environment.serial as ZmkSerialController | undefined;
}

function connectionErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Web Serial ZMK Studio connection failed";
  if (error.name === "NotFoundError") return "No Web Serial ZMK Studio keyboard selected";
  if (error.name === "SecurityError") return "Web Serial permission was blocked";
  if (error.name === "NetworkError") {
    return "Failed to open the serial port. Check permissions and verify it is not in use.";
  }
  return error.message;
}

function serialLabel(port: ZmkSerialPort) {
  const info = port.getInfo?.();
  if (!info?.usbVendorId && !info?.usbProductId) return "ZMK Studio serial keyboard";
  return `${info.usbVendorId?.toString(16).padStart(4, "0") ?? "unknown"}:${
    info.usbProductId?.toString(16).padStart(4, "0") ?? "unknown"
  }`;
}

function createSerialByteTransport(port: ZmkSerialPort): ZmkStudioByteTransport {
  if (!port.readable || !port.writable) {
    throw new Error("The selected serial port did not expose readable and writable streams.");
  }

  const abortController = new AbortController();
  abortController.signal.addEventListener("abort", () => {
    forkApp(
      "zmk-studio.serial.abort",
      Effect.tryPromise({
        try: () => port.close(),
        catch: (cause) => platformError("zmk-studio.serial.abort", cause),
      }),
    );
  });

  return {
    abortController,
    close: () => port.close(),
    label: serialLabel(port),
    readable: port.readable,
    writable: port.writable,
  };
}

function connectSerialDeviceEffect(environment: TransportEnvironment) {
  const serial = serialController(environment);
  if (!environment.isBrowser) {
    return Effect.succeed({
      ...getConnectionState(environment),
      message: "Browser required",
      protocol: "zmk-studio",
      status: "unsupported",
      transport: "webserial",
    } satisfies ConnectionState);
  }
  if (!serial) {
    return Effect.succeed({
      ...getConnectionState(environment),
      message: "Web Serial unavailable",
      protocol: "zmk-studio",
      status: "unsupported",
      transport: "webserial",
    } satisfies ConnectionState);
  }

  let connection: RealZmkStudioConnection | undefined;
  let port: ZmkSerialPort | undefined;
  const connect = Effect.gen(function* () {
    port = yield* Effect.tryPromise({
      try: () => serial.requestPort({}),
      catch: (cause) => platformError("zmk-studio.serial.select", cause),
    });
    const activePort = port;
    yield* Effect.tryPromise({
      try: () => activePort.open({ baudRate: zmkStudioSerialBaudRate }),
      catch: (cause) => platformError("zmk-studio.serial.open", cause),
    });

    const byteTransport = yield* Effect.try({
      try: () => createSerialByteTransport(activePort),
      catch: (cause) => platformError("zmk-studio.serial.transport", cause),
    });
    connection = new RealZmkStudioConnection(byteTransport);
    const activeConnection = connection;
    const [info, lock] = yield* Effect.all(
      [
        Effect.tryPromise({
          try: () => activeConnection.call({ type: "get_device_info" }),
          catch: (cause) => platformError("zmk-studio.serial.device-info", cause),
        }),
        Effect.tryPromise({
          try: () => activeConnection.call({ type: "get_lock_state" }),
          catch: (cause) => platformError("zmk-studio.serial.lock-state", cause),
        }),
      ],
      { concurrency: 2 },
    );
    if (info.type !== "get_device_info" || lock.type !== "get_lock_state") {
      return yield* Effect.fail(
        platformError("zmk-studio.serial.probe", "ZMK Studio returned an unexpected response."),
      );
    }

    activeConnection.label = info.deviceName;
    const deviceKey = zmkStudioDeviceKey({
      productName: info.deviceName,
      serialNumber: info.serialNumber,
      transport: "webserial",
    });
    const notes = ["Connected through the ZMK Studio serial protocol."];
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
          transport: "webserial",
        },
        notes,
      },
      deviceKey,
      message:
        lock.lockState === "locked"
          ? "Connected, but ZMK Studio is locked. Unlock on the keyboard (&studio_unlock)."
          : "Connected over ZMK Studio serial.",
      productName: info.deviceName,
      protocol: "zmk-studio",
      serialNumber: info.serialNumber,
      status: "connected",
      transport: "webserial",
      zmkStudio: activeConnection,
    } satisfies ConnectionState;
  });

  return Effect.matchEffect(connect, {
    onFailure: (error) => {
      const cleanup = connection
        ? Effect.tryPromise({
            try: () => connection!.close(),
            catch: (cause) => platformError("zmk-studio.serial.cleanup-connection", cause),
          })
        : port
          ? Effect.tryPromise({
              try: () => port!.close(),
              catch: (cause) => platformError("zmk-studio.serial.cleanup-port", cause),
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
    transport: "webserial",
  };
}

export function createWebSerialZmkStudioTransport(): KeyboardTransport {
  return {
    connect: (options: KeyboardTransportConnectOptions = {}) =>
      runApp(
        "zmk-studio.serial.connect",
        connectSerialDeviceEffect(options.environment ?? browserTransportEnvironment()),
      ),
    id: "webserial-zmk-studio",
    label: "Web Serial ZMK Studio",
    mode: "real",
    transport: "webserial",
  };
}
