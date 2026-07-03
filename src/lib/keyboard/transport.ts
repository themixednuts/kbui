import { browser } from "$app/environment";
import { catchCompat } from "$lib/effect/compat";
import { Effect } from "effect";

import type { Capability, KeyboardDetection } from "./schema";
import { viaCommand, viaReportSize } from "./via-protocol";

export type MinimalUsbDevice = {
  manufacturerName?: string;
  productName?: string;
  serialNumber?: string;
  vendorId?: number;
  productId?: number;
  configuration?: {
    interfaces: Array<{
      interfaceNumber: number;
      alternates: Array<{ interfaceClass: number }>;
    }>;
  };
  open: () => Promise<void>;
  close?: () => Promise<void>;
  forget?: () => Promise<void>;
  selectConfiguration?: (configurationValue: number) => Promise<void>;
  claimInterface?: (interfaceNumber: number) => Promise<void>;
};

export type MinimalHidDevice = {
  productName?: string;
  vendorId?: number;
  productId?: number;
  serialNumber?: string;
  collections?: Array<{ usagePage?: number; usage?: number }>;
  opened: boolean;
  open: () => Promise<void>;
  close?: () => Promise<void>;
  forget?: () => Promise<void>;
  sendReport?: (reportId: number, data: BufferSource) => Promise<void>;
  addEventListener?: (
    type: "inputreport",
    listener: (event: MinimalHidInputReportEvent) => void,
  ) => void;
  removeEventListener?: (
    type: "inputreport",
    listener: (event: MinimalHidInputReportEvent) => void,
  ) => void;
};

export type MinimalHidInputReportEvent = {
  data: DataView;
  device: MinimalHidDevice;
  reportId: number;
};

export type UsbController = {
  getDevices?: () => Promise<MinimalUsbDevice[]>;
  requestDevice: (options: { filters: UsbDeviceFilter[] }) => Promise<MinimalUsbDevice>;
};

export type HidController = {
  getDevices?: () => Promise<MinimalHidDevice[]>;
  requestDevice: (options: { filters: HidDeviceFilter[] }) => Promise<MinimalHidDevice[]>;
};

declare global {
  interface Navigator {
    usb?: UsbController;
    hid?: HidController;
  }
}

export type TransportKind = "webusb" | "webhid";

interface UsbDeviceFilter {
  vendorId?: number;
  productId?: number;
  classCode?: number;
  subclassCode?: number;
  protocolCode?: number;
}

interface HidDeviceFilter {
  vendorId?: number;
  productId?: number;
  usagePage?: number;
  usage?: number;
}

export interface TransportEnvironment {
  isBrowser: boolean;
  usb?: UsbController;
  hid?: HidController;
}

export interface TransportOptions {
  matrixHint?: { rows: number; cols: number };
  resolveMatrixHint?: (identity: {
    vendorId?: number;
    productId?: number;
    productName?: string;
    serialNumber?: string;
  }) =>
    | { rows: number; cols: number }
    | undefined
    | Promise<{ rows: number; cols: number } | undefined>;
  environment?: TransportEnvironment;
}

export interface ConnectionState {
  status: "idle" | "unsupported" | "requesting" | "connected" | "error";
  transport?: TransportKind;
  hidDevice?: MinimalHidDevice;
  deviceKey?: string;
  productName?: string;
  vendorId?: number;
  productId?: number;
  serialNumber?: string;
  detection?: KeyboardDetection;
  message: string;
  webUsbSupported: boolean;
  webHidSupported: boolean;
}

function browserTransportEnvironment(): TransportEnvironment {
  return {
    isBrowser: browser,
    usb: browser ? navigator.usb : undefined,
    hid: browser ? navigator.hid : undefined,
  };
}

export function getConnectionState(
  environment: TransportEnvironment = browserTransportEnvironment(),
): ConnectionState {
  const webUsbSupported = environment.isBrowser && Boolean(environment.usb);
  const webHidSupported = environment.isBrowser && Boolean(environment.hid);

  return {
    status: webUsbSupported || webHidSupported ? "idle" : "unsupported",
    message:
      webUsbSupported || webHidSupported
        ? "Plug in to begin"
        : "Browser does not support WebHID/USB",
    webUsbSupported,
    webHidSupported,
  };
}

const qmkVendorId = 0xfeed;
const viaUsagePage = 0xff60;
const viaUsage = 0x61;
const vendorSpecificClass = 0xff;

function hexId(value?: number) {
  return typeof value === "number" ? value.toString(16).padStart(4, "0") : "unknown";
}

function deviceKey(device: {
  vendorId?: number;
  productId?: number;
  productName?: string;
  serialNumber?: string;
}) {
  const serial = device.serialNumber?.trim();
  if (serial) return `keyboard:${hexId(device.vendorId)}:${hexId(device.productId)}:${serial}`;

  const product =
    device.productName
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-") || "keyboard";
  return `keyboard:${hexId(device.vendorId)}:${hexId(device.productId)}:${product}`;
}

function uniqueFilters<T extends object>(filters: T[]): T[] {
  const seen = new Set<string>();

  return filters.filter((filter) => {
    const entries = Object.entries(filter)
      .filter(([, value]) => typeof value === "number")
      .sort(([left], [right]) => left.localeCompare(right));
    if (entries.length === 0) return false;

    const key = JSON.stringify(entries);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function webUsbFilters(
  filters: Array<{ vendorId?: number; productId?: number }>,
): UsbDeviceFilter[] {
  return uniqueFilters<UsbDeviceFilter>([
    ...filters,
    ...filters.map((filter) => ({ vendorId: filter.vendorId })),
    { vendorId: qmkVendorId },
    { classCode: vendorSpecificClass },
  ]);
}

function webHidFilters(
  filters: Array<{ vendorId?: number; productId?: number }>,
): HidDeviceFilter[] {
  return uniqueFilters<HidDeviceFilter>([
    ...filters.map((filter) => ({ ...filter, usagePage: viaUsagePage, usage: viaUsage })),
    ...filters.map((filter) => ({ vendorId: filter.vendorId, usagePage: viaUsagePage })),
    { vendorId: qmkVendorId, usagePage: viaUsagePage },
    { usagePage: viaUsagePage, usage: viaUsage },
    { usagePage: viaUsagePage },
  ]);
}

function claimableUsbInterface(device: MinimalUsbDevice) {
  const interfaces = device.configuration?.interfaces ?? [];
  const vendorInterface = interfaces.find((usbInterface) =>
    usbInterface.alternates.some((alternate) => alternate.interfaceClass === vendorSpecificClass),
  );

  return vendorInterface?.interfaceNumber ?? interfaces[0]?.interfaceNumber;
}

function connectionErrorMessage(error: unknown, transport: TransportKind) {
  if (!(error instanceof Error)) return "Connection failed";
  if (error.name === "NotFoundError")
    return `No ${transport === "webusb" ? "WebUSB" : "WebHID"} keyboard selected`;
  if (error.name === "SecurityError")
    return `${transport === "webusb" ? "WebUSB" : "WebHID"} permission was blocked`;
  return error.message;
}

function isViaHidDevice(device: MinimalHidDevice) {
  return (
    device.vendorId === qmkVendorId ||
    device.collections?.some(
      (collection) => collection.usagePage === viaUsagePage && collection.usage === viaUsage,
    ) === true
  );
}

function isKeyboardLikeUsbDevice(device: MinimalUsbDevice) {
  const productName = device.productName?.toLowerCase() ?? "";
  return (
    device.vendorId === qmkVendorId ||
    productName.includes("keyboard") ||
    productName.includes("qmk") ||
    productName.includes("via")
  );
}

async function connectUsbDevice(
  device: MinimalUsbDevice,
  environment: TransportEnvironment,
): Promise<ConnectionState> {
  await device.open();

  if (!device.configuration) {
    await device.selectConfiguration?.(1);
  }

  const interfaceNumber = claimableUsbInterface(device);
  if (interfaceNumber !== undefined) {
    await device.claimInterface?.(interfaceNumber);
  }

  return {
    ...getConnectionState(environment),
    status: "connected",
    transport: "webusb",
    deviceKey: deviceKey(device),
    productName: device.productName ?? "QMK device",
    vendorId: device.vendorId,
    productId: device.productId,
    serialNumber: device.serialNumber,
    detection: {
      identity: {
        key: deviceKey(device),
        transport: "webusb",
        vendorId: device.vendorId,
        productId: device.productId,
        productName: device.productName,
        serialNumber: device.serialNumber,
      },
      capabilities: ["keymap", "layers"],
      notes: ["WebUSB connected. Use WebHID/VIA to read live keymap data."],
    },
    message: "Connected",
  };
}

async function connectHidDevice(
  device: MinimalHidDevice,
  options: TransportOptions,
  environment: TransportEnvironment,
): Promise<ConnectionState> {
  if (!device.opened) await device.open();
  const matrixHint = (await options.resolveMatrixHint?.(device)) ?? options.matrixHint;

  const detection = await detectViaHid(device, matrixHint).catch((error: unknown) => ({
    identity: {
      key: deviceKey(device),
      transport: "webhid" as const,
      vendorId: device.vendorId,
      productId: device.productId,
      productName: device.productName,
    },
    capabilities: ["keymap" as const, "layers" as const],
    notes: [error instanceof Error ? error.message : "Could not probe VIA protocol"],
  }));

  return {
    ...getConnectionState(environment),
    status: "connected",
    transport: "webhid",
    hidDevice: device,
    deviceKey: detection.identity.key,
    productName: device.productName ?? "HID keyboard",
    vendorId: device.vendorId,
    productId: device.productId,
    detection,
    message: "Connected",
  };
}

function hidCommand(device: MinimalHidDevice, command: number, payload: number[] = []) {
  if (!device.sendReport || !device.addEventListener || !device.removeEventListener) {
    throw new Error("WebHID reports are unavailable for this device");
  }

  const sendReport = device.sendReport.bind(device);
  const addEventListener = device.addEventListener.bind(device);
  const removeEventListener = device.removeEventListener.bind(device);
  const request = new Uint8Array(viaReportSize);
  request[0] = command;
  request.set(payload.slice(0, viaReportSize - 1), 1);

  return new Promise<Uint8Array>((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      removeEventListener("inputreport", onInputReport);
      reject(new Error(`VIA command 0x${command.toString(16)} timed out`));
    }, 800);

    function onInputReport(event: MinimalHidInputReportEvent) {
      if (event.device !== device) return;

      const response = new Uint8Array(
        event.data.buffer.slice(
          event.data.byteOffset,
          event.data.byteOffset + event.data.byteLength,
        ),
      );
      if (response[0] !== command) return;

      globalThis.clearTimeout(timeout);
      removeEventListener("inputreport", onInputReport);
      resolve(response);
    }

    addEventListener("inputreport", onInputReport);
    void sendReport(0, request).catch((error: unknown) => {
      globalThis.clearTimeout(timeout);
      removeEventListener("inputreport", onInputReport);
      reject(error);
    });
  });
}

function keycodeFromResponse(response: Uint8Array) {
  return (response[4] << 8) | response[5];
}

export interface ViaKeycodeWriteInput {
  col: number;
  keycode: number;
  layer: number;
  row: number;
}

function assertViaKeycodeWriteInput(input: ViaKeycodeWriteInput) {
  for (const [label, value] of Object.entries(input)) {
    if (!Number.isInteger(value)) throw new RangeError(`${label} must be an integer`);
  }

  if (input.layer < 0 || input.layer > 0xff) throw new RangeError("layer must fit in one byte");
  if (input.row < 0 || input.row > 0xff) throw new RangeError("row must fit in one byte");
  if (input.col < 0 || input.col > 0xff) throw new RangeError("col must fit in one byte");
  if (input.keycode < 0 || input.keycode > 0xffff) {
    throw new RangeError("keycode must fit in two bytes");
  }
}

export interface ViaKeycodeWriteResult {
  requestedKeycode: number;
  verifiedKeycode: number;
}

export async function writeViaKeycode(
  connection: ConnectionState,
  input: ViaKeycodeWriteInput,
): Promise<ViaKeycodeWriteResult> {
  return Effect.runPromise(writeViaKeycodeEffect(connection, input));
}

export function writeViaKeycodeEffect(connection: ConnectionState, input: ViaKeycodeWriteInput) {
  return Effect.tryPromise({
    try: async () => {
      if (connection.status !== "connected" || connection.transport !== "webhid") {
        throw new Error("Connect a WebHID VIA keyboard before saving to the device.");
      }

      const device = connection.hidDevice;
      if (!device) {
        throw new Error("The WebHID device handle is unavailable. Reconnect the keyboard.");
      }

      assertViaKeycodeWriteInput(input);

      await hidCommand(device, viaCommand.dynamicKeymapSetKeycode, [
        input.layer,
        input.row,
        input.col,
        (input.keycode >> 8) & 0xff,
        input.keycode & 0xff,
      ]);

      const readback = await hidCommand(device, viaCommand.dynamicKeymapGetKeycode, [
        input.layer,
        input.row,
        input.col,
      ]);
      const verifiedKeycode = keycodeFromResponse(readback);

      if (verifiedKeycode !== input.keycode) {
        throw new Error(
          `VIA readback mismatch: wrote 0x${input.keycode.toString(16).padStart(4, "0")}, read 0x${verifiedKeycode.toString(16).padStart(4, "0")}.`,
        );
      }

      return {
        requestedKeycode: input.keycode,
        verifiedKeycode,
      };
    },
    catch: (error) => error,
  });
}

async function readViaKeymap(
  device: MinimalHidDevice,
  layerCount: number,
  matrixHint?: { rows: number; cols: number },
) {
  if (!matrixHint) return undefined;

  const keymap: number[][][] = [];
  const cappedLayerCount = Math.min(layerCount, 8);

  for (let layer = 0; layer < cappedLayerCount; layer += 1) {
    const rows: number[][] = [];

    for (let row = 0; row < matrixHint.rows; row += 1) {
      const cols: number[] = [];

      for (let col = 0; col < matrixHint.cols; col += 1) {
        const response = await hidCommand(device, viaCommand.dynamicKeymapGetKeycode, [
          layer,
          row,
          col,
        ]);
        cols.push((response[4] << 8) | response[5]);
      }

      rows.push(cols);
    }

    keymap.push(rows);
  }

  return keymap;
}

async function detectViaHid(
  device: MinimalHidDevice,
  matrixHint?: { rows: number; cols: number },
): Promise<KeyboardDetection> {
  const notes: string[] = [];
  const capabilities = new Set<Capability>(["keymap", "layers"]);
  const protocolResponse = await hidCommand(device, viaCommand.getProtocolVersion);
  const protocolVersion = (protocolResponse[1] << 8) | protocolResponse[2];

  const layerResponse = await hidCommand(device, viaCommand.dynamicKeymapGetLayerCount).catch(
    (error: unknown) => {
      notes.push(error instanceof Error ? error.message : "Could not read VIA layer count");
      return undefined;
    },
  );
  const layerCount = layerResponse?.[1];

  const macroResponse = await hidCommand(device, viaCommand.dynamicKeymapMacroGetCount).catch(
    () => undefined,
  );
  if (macroResponse?.[1]) capabilities.add("macros");

  let keymap: number[][][] | undefined;
  if (layerCount && matrixHint) {
    keymap = await readViaKeymap(device, layerCount, matrixHint).catch((error: unknown) => {
      notes.push(error instanceof Error ? error.message : "Could not read current VIA keymap");
      return undefined;
    });
  } else {
    notes.push(
      "Need a keyboard definition to map physical layout dimensions before reading all keys.",
    );
  }

  return {
    identity: {
      key: deviceKey(device),
      transport: "webhid",
      vendorId: device.vendorId,
      productId: device.productId,
      productName: device.productName,
    },
    protocolVersion,
    layerCount,
    keymap,
    capabilities: Array.from(capabilities),
    notes,
  };
}

export async function connectKeyboard(
  transport: TransportKind,
  filters: Array<{ vendorId?: number; productId?: number }>,
  options: TransportOptions = {},
) {
  return Effect.runPromise(connectKeyboardEffect(transport, filters, options));
}

export function connectKeyboardEffect(
  transport: TransportKind,
  filters: Array<{ vendorId?: number; productId?: number }>,
  options: TransportOptions = {},
) {
  const environment = options.environment ?? browserTransportEnvironment();

  if (!environment.isBrowser) {
    return Effect.succeed({
      ...getConnectionState(environment),
      status: "unsupported" as const,
      transport,
      message: "Browser required",
    });
  }

  return Effect.tryPromise({
    try: async () => {
      if (transport === "webusb") {
        if (!environment.usb) {
          return {
            ...getConnectionState(environment),
            status: "unsupported" as const,
            transport,
            message: "WebUSB unavailable",
          };
        }

        const device = await environment.usb.requestDevice({ filters: webUsbFilters(filters) });
        return connectUsbDevice(device, environment);
      }

      if (!environment.hid) {
        return {
          ...getConnectionState(environment),
          status: "unsupported" as const,
          transport,
          message: "WebHID unavailable",
        };
      }

      const [device] = await environment.hid.requestDevice({ filters: webHidFilters(filters) });
      if (!device) {
        return {
          ...getConnectionState(environment),
          status: "idle" as const,
          transport,
          message: "No device selected",
        };
      }

      return connectHidDevice(device, options, environment);
    },
    catch: (error) => error,
  }).pipe(
    catchCompat((error) =>
      Effect.succeed({
        ...getConnectionState(environment),
        status: "error" as const,
        transport,
        message: connectionErrorMessage(error, transport),
      }),
    ),
  );
}

export async function detectGrantedKeyboard(
  options: TransportOptions = {},
): Promise<ConnectionState | undefined> {
  return Effect.runPromise(detectGrantedKeyboardEffect(options));
}

export function detectGrantedKeyboardEffect(options: TransportOptions = {}) {
  const environment = options.environment ?? browserTransportEnvironment();
  if (!environment.isBrowser) return Effect.succeed(undefined);

  return Effect.tryPromise({
    try: async () => {
      const hidDevices = (await environment.hid?.getDevices?.()) ?? [];
      const hidDevice = hidDevices.find(isViaHidDevice);
      if (hidDevice) return connectHidDevice(hidDevice, options, environment);

      const usbDevices = (await environment.usb?.getDevices?.()) ?? [];
      const usbDevice = usbDevices.find(isKeyboardLikeUsbDevice);
      if (usbDevice) return connectUsbDevice(usbDevice, environment);

      return undefined;
    },
    catch: (error) => error,
  }).pipe(
    catchCompat((error) =>
      Effect.succeed({
        ...getConnectionState(environment),
        status: "error" as const,
        message: connectionErrorMessage(error, "webhid"),
      }),
    ),
  );
}

/**
 * Revokes the per-origin grant for a previously paired keyboard. After this
 * runs, `navigator.hid.getDevices()` / `navigator.usb.getDevices()` will no
 * longer return the device, so the next page load won't auto-attach. The
 * user has to click Connect again to re-pair.
 *
 * Matches by vendor id + product id + serial number (when available). If no
 * match is found, this is a no-op — we just return a fresh idle state.
 */
export function forgetGrantedKeyboardEffect(
  identity: { vendorId?: number; productId?: number; serialNumber?: string },
  environment: TransportEnvironment = browserTransportEnvironment(),
) {
  if (!environment.isBrowser) return Effect.succeed(getConnectionState(environment));

  return Effect.tryPromise(async () => {
    const matches = (device: { vendorId?: number; productId?: number; serialNumber?: string }) =>
      (identity.vendorId === undefined || device.vendorId === identity.vendorId) &&
      (identity.productId === undefined || device.productId === identity.productId) &&
      (!identity.serialNumber || device.serialNumber === identity.serialNumber);

    const hidDevices = (await environment.hid?.getDevices?.()) ?? [];
    for (const device of hidDevices) {
      if (matches(device) && device.forget) {
        await device.forget().catch(() => undefined);
      }
    }

    const usbDevices = (await environment.usb?.getDevices?.()) ?? [];
    for (const device of usbDevices) {
      if (matches(device) && device.forget) {
        await device.forget().catch(() => undefined);
      }
    }

    return getConnectionState(environment);
  });
}
