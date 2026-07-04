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
    void port.close().catch(() => undefined);
  });

  return {
    abortController,
    close: () => port.close(),
    label: serialLabel(port),
    readable: port.readable,
    writable: port.writable,
  };
}

async function connectSerialDevice(environment: TransportEnvironment): Promise<ConnectionState> {
  const serial = serialController(environment);
  if (!environment.isBrowser) {
    return {
      ...getConnectionState(environment),
      message: "Browser required",
      protocol: "zmk-studio",
      status: "unsupported",
      transport: "webserial",
    };
  }
  if (!serial) {
    return {
      ...getConnectionState(environment),
      message: "Web Serial unavailable",
      protocol: "zmk-studio",
      status: "unsupported",
      transport: "webserial",
    };
  }

  let connection: RealZmkStudioConnection | undefined;
  let port: ZmkSerialPort | undefined;

  try {
    port = await serial.requestPort({});
    await port.open({ baudRate: zmkStudioSerialBaudRate });

    // Hardware-unverified until tested with a real ZMK Studio USB CDC/ACM board.
    connection = new RealZmkStudioConnection(createSerialByteTransport(port));

    const info = await connection.call({ type: "get_device_info" });
    const lock = await connection.call({ type: "get_lock_state" });
    if (info.type !== "get_device_info" || lock.type !== "get_lock_state") {
      throw new Error("ZMK Studio serial probe returned an unexpected response.");
    }

    connection.label = info.deviceName;
    const deviceKey = zmkStudioDeviceKey({
      productName: info.deviceName,
      serialNumber: info.serialNumber,
      transport: "webserial",
    });
    const notes = ["Real Web Serial ZMK Studio transport is implemented but hardware-unverified."];
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
          : "Connected. Real ZMK Studio serial is hardware-unverified.",
      productName: info.deviceName,
      protocol: "zmk-studio",
      serialNumber: info.serialNumber,
      status: "connected",
      transport: "webserial",
      zmkStudio: connection,
    };
  } catch (error) {
    await connection?.close().catch(() => undefined);
    if (!connection) await port?.close().catch(() => undefined);
    return {
      ...getConnectionState(environment),
      message: connectionErrorMessage(error),
      protocol: "zmk-studio",
      status: "error",
      transport: "webserial",
    };
  }
}

export function createWebSerialZmkStudioTransport(): KeyboardTransport {
  return {
    connect: (options: KeyboardTransportConnectOptions = {}) =>
      connectSerialDevice(options.environment ?? browserTransportEnvironment()),
    id: "webserial-zmk-studio",
    label: "Web Serial ZMK Studio",
    mode: "real",
    transport: "webserial",
  };
}
