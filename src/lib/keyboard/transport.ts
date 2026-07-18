import { browser } from "$app/environment";
import { Cause, Deferred, Effect, Schema } from "effect";

import { runApp } from "$lib/app/runtime";
import { platformError } from "$lib/effect/errors";
import { tryMaybePromise } from "$lib/effect/maybe-promise";
import type { Capability, DeviceProfile, KeyboardDetection } from "./schema";
import { viaCommand, viaReportSize } from "./via-protocol";
import type { ZmkStudioConnection } from "./zmk-studio";

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
    bluetooth?: unknown;
    usb?: UsbController;
    hid?: HidController;
    serial?: unknown;
  }
}

export type TransportKind = "webusb" | "webhid" | "webbluetooth" | "webserial";
export type KeyboardProtocol = "via-v3" | "zmk-studio";

export interface KeyboardTransportConnectOptions extends TransportOptions {
  filters?: Array<{ vendorId?: number; productId?: number }>;
}

export interface KeyboardTransport {
  id: string;
  label: string;
  mode: "real" | "mock";
  transport: TransportKind;
  defaultProfile?: DeviceProfile;
  connect: (options?: KeyboardTransportConnectOptions) => Promise<ConnectionState>;
}

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
  bluetooth?: unknown;
  usb?: UsbController;
  hid?: HidController;
  serial?: unknown;
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
  protocol?: KeyboardProtocol;
  hidDevice?: MinimalHidDevice;
  zmkStudio?: ZmkStudioConnection;
  deviceKey?: string;
  productName?: string;
  vendorId?: number;
  productId?: number;
  serialNumber?: string;
  detection?: KeyboardDetection;
  message: string;
  webBluetoothSupported: boolean;
  webSerialSupported: boolean;
  webUsbSupported: boolean;
  webHidSupported: boolean;
}

export class ViaReportUnavailableError extends Schema.TaggedErrorClass<ViaReportUnavailableError>()(
  "ViaReportUnavailableError",
  {},
) {
  override get message() {
    return "WebHID reports are unavailable for this device";
  }
}

export class ViaCommandTimeoutError extends Schema.TaggedErrorClass<ViaCommandTimeoutError>()(
  "ViaCommandTimeoutError",
  { command: Schema.Int },
) {
  override get message() {
    return `VIA command 0x${this.command.toString(16)} timed out`;
  }
}

export class ViaNotConnectedError extends Schema.TaggedErrorClass<ViaNotConnectedError>()(
  "ViaNotConnectedError",
  {},
) {
  override get message() {
    return "Connect a WebHID VIA keyboard before saving to the device.";
  }
}

export class ViaDeviceUnavailableError extends Schema.TaggedErrorClass<ViaDeviceUnavailableError>()(
  "ViaDeviceUnavailableError",
  {},
) {
  override get message() {
    return "The WebHID device handle is unavailable. Reconnect the keyboard.";
  }
}

export class ViaWriteValidationError extends Schema.TaggedErrorClass<ViaWriteValidationError>()(
  "ViaWriteValidationError",
  {
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export class ViaReadbackMismatchError extends Schema.TaggedErrorClass<ViaReadbackMismatchError>()(
  "ViaReadbackMismatchError",
  {
    actualKeycode: Schema.Int,
    expectedKeycode: Schema.Int,
  },
) {
  override get message() {
    return `VIA readback mismatch: wrote 0x${this.expectedKeycode.toString(16).padStart(4, "0")}, read 0x${this.actualKeycode.toString(16).padStart(4, "0")}.`;
  }
}

export class ViaMatrixDefinitionRequiredError extends Schema.TaggedErrorClass<ViaMatrixDefinitionRequiredError>()(
  "ViaMatrixDefinitionRequiredError",
  {},
) {
  override get message() {
    return "A verified keyboard definition is required before reading or writing the VIA matrix.";
  }
}

export class ViaNoWritableLayersError extends Schema.TaggedErrorClass<ViaNoWritableLayersError>()(
  "ViaNoWritableLayersError",
  {},
) {
  override get message() {
    return "VIA reported no writable layers.";
  }
}

function browserTransportEnvironment(): TransportEnvironment {
  return {
    isBrowser: browser,
    bluetooth: browser ? navigator.bluetooth : undefined,
    usb: browser ? navigator.usb : undefined,
    hid: browser ? navigator.hid : undefined,
    serial: browser ? navigator.serial : undefined,
  };
}

export function getConnectionState(
  environment: TransportEnvironment = browserTransportEnvironment(),
): ConnectionState {
  const webUsbSupported = environment.isBrowser && Boolean(environment.usb);
  const webHidSupported = environment.isBrowser && Boolean(environment.hid);
  const webBluetoothSupported = environment.isBrowser && Boolean(environment.bluetooth);
  const webSerialSupported = environment.isBrowser && Boolean(environment.serial);

  return {
    status:
      webUsbSupported || webHidSupported || webBluetoothSupported || webSerialSupported
        ? "idle"
        : "unsupported",
    message:
      webUsbSupported || webHidSupported || webBluetoothSupported || webSerialSupported
        ? "Plug in to begin"
        : "Browser does not support WebHID/USB/Bluetooth/Serial",
    webBluetoothSupported,
    webSerialSupported,
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

function deviceIdentity(device: {
  vendorId?: number;
  productId?: number;
  productName?: string;
  serialNumber?: string;
}) {
  // Browser device handles are host objects, not plain JavaScript objects.
  // Never let one cross a SvelteKit remote-call or reactive-state boundary.
  return {
    vendorId: device.vendorId,
    productId: device.productId,
    productName: device.productName,
    serialNumber: device.serialNumber,
  };
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
  const label =
    transport === "webusb"
      ? "WebUSB"
      : transport === "webhid"
        ? "WebHID"
        : transport === "webbluetooth"
          ? "Web Bluetooth"
          : "Web Serial";
  if (error.name === "NotFoundError") return `No ${label} keyboard selected`;
  if (error.name === "SecurityError") return `${label} permission was blocked`;
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

function grantedViaHidDevice(
  devices: MinimalHidDevice[],
  filters: Array<{ vendorId?: number; productId?: number }>,
) {
  const viaDevices = devices.filter(isViaHidDevice);
  const rankedFilters = [...filters].sort(
    (left, right) =>
      Number(right.productId !== undefined) - Number(left.productId !== undefined) ||
      Number(right.vendorId !== undefined) - Number(left.vendorId !== undefined),
  );

  for (const filter of rankedFilters) {
    const matches = viaDevices.filter(
      (device) =>
        (filter.vendorId === undefined || device.vendorId === filter.vendorId) &&
        (filter.productId === undefined || device.productId === filter.productId),
    );
    if (matches.length === 1) return matches[0];
  }

  return viaDevices.length === 1 ? viaDevices[0] : undefined;
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

function connectUsbDeviceEffect(
  device: MinimalUsbDevice,
  environment: TransportEnvironment,
): Effect.Effect<ConnectionState, Error> {
  return Effect.gen(function* () {
    yield* hostPromise("keyboard.webusb.open", () => device.open());

    if (!device.configuration && device.selectConfiguration) {
      yield* hostPromise("keyboard.webusb.select-configuration", () =>
        device.selectConfiguration!(1),
      );
    }

    const interfaceNumber = claimableUsbInterface(device);
    if (interfaceNumber !== undefined && device.claimInterface) {
      yield* hostPromise("keyboard.webusb.claim-interface", () =>
        device.claimInterface!(interfaceNumber),
      );
    }

    return {
      ...getConnectionState(environment),
      status: "connected" as const,
      transport: "webusb" as const,
      protocol: "via-v3" as const,
      deviceKey: deviceKey(device),
      productName: device.productName ?? "QMK device",
      vendorId: device.vendorId,
      productId: device.productId,
      serialNumber: device.serialNumber,
      detection: {
        identity: {
          key: deviceKey(device),
          transport: "webusb" as const,
          vendorId: device.vendorId,
          productId: device.productId,
          productName: device.productName,
          serialNumber: device.serialNumber,
        },
        capabilities: ["keymap", "layers"] as Capability[],
        notes: ["WebUSB connected. Use WebHID/VIA to read live keymap data."],
      },
      message: "Connected",
    };
  });
}

function connectHidDeviceEffect(
  device: MinimalHidDevice,
  options: TransportOptions,
  environment: TransportEnvironment,
): Effect.Effect<ConnectionState, Error> {
  return Effect.gen(function* () {
    if (!device.opened) yield* hostPromise("keyboard.webhid.open", () => device.open());
    const resolvedMatrix = options.resolveMatrixHint
      ? yield* tryMaybePromise(
          () => options.resolveMatrixHint!(deviceIdentity(device)),
          (cause) => platformError("keyboard.resolve-matrix", cause),
        )
      : undefined;
    const matrixHint = resolvedMatrix ?? options.matrixHint;
    const detection = yield* detectViaHidEffect(device, matrixHint);

    return {
      ...getConnectionState(environment),
      status: "connected" as const,
      transport: "webhid" as const,
      protocol: "via-v3" as const,
      hidDevice: device,
      deviceKey: detection.identity.key,
      productName: device.productName ?? "HID keyboard",
      vendorId: device.vendorId,
      productId: device.productId,
      serialNumber: device.serialNumber,
      detection,
      message: "Connected",
    };
  });
}

function hidCommandEffect(device: MinimalHidDevice, command: number, payload: number[] = []) {
  return Effect.gen(function* () {
    if (!device.sendReport || !device.addEventListener || !device.removeEventListener) {
      return yield* Effect.fail(new ViaReportUnavailableError({}));
    }

    const sendReport = device.sendReport.bind(device);
    const addEventListener = device.addEventListener.bind(device);
    const removeEventListener = device.removeEventListener.bind(device);
    const request = new Uint8Array(viaReportSize);
    request[0] = command;
    request.set(payload.slice(0, viaReportSize - 1), 1);

    return yield* Effect.scoped(
      Effect.gen(function* () {
        const response = yield* Deferred.make<Uint8Array>();
        const onInputReport = (event: MinimalHidInputReportEvent) => {
          if (event.device !== device) return;

          const bytes = new Uint8Array(
            event.data.buffer.slice(
              event.data.byteOffset,
              event.data.byteOffset + event.data.byteLength,
            ),
          );
          if (bytes[0] !== command) return;
          Deferred.doneUnsafe(response, Effect.succeed(bytes));
        };

        yield* Effect.acquireRelease(
          Effect.sync(() => addEventListener("inputreport", onInputReport)),
          () => Effect.sync(() => removeEventListener("inputreport", onInputReport)),
        );
        yield* Effect.tryPromise({
          try: () => sendReport(0, request),
          catch: (cause) => platformError("via.send-report", cause),
        });
        return yield* Deferred.await(response).pipe(
          Effect.timeout(800),
          Effect.mapError((error) =>
            Cause.isTimeoutError(error) ? new ViaCommandTimeoutError({ command }) : error,
          ),
        );
      }),
    );
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

export function writeViaKeycode(
  connection: ConnectionState,
  input: ViaKeycodeWriteInput,
): Promise<ViaKeycodeWriteResult> {
  return runApp("keyboard.via.write-keycode", writeViaKeycodeEffect(connection, input));
}

export function writeViaKeycodeEffect(connection: ConnectionState, input: ViaKeycodeWriteInput) {
  return Effect.gen(function* () {
    if (connection.status !== "connected" || connection.transport !== "webhid") {
      return yield* Effect.fail(new ViaNotConnectedError({}));
    }

    const device = connection.hidDevice;
    if (!device) {
      return yield* Effect.fail(new ViaDeviceUnavailableError({}));
    }

    yield* Effect.try({
      try: () => assertViaKeycodeWriteInput(input),
      catch: (cause) =>
        new ViaWriteValidationError({
          cause,
          message: cause instanceof Error ? cause.message : String(cause),
        }),
    });

    yield* hidCommandEffect(device, viaCommand.dynamicKeymapSetKeycode, [
      input.layer,
      input.row,
      input.col,
      (input.keycode >> 8) & 0xff,
      input.keycode & 0xff,
    ]);

    const readback = yield* hidCommandEffect(device, viaCommand.dynamicKeymapGetKeycode, [
      input.layer,
      input.row,
      input.col,
    ]);
    const verifiedKeycode = keycodeFromResponse(readback);

    if (verifiedKeycode !== input.keycode) {
      return yield* Effect.fail(
        new ViaReadbackMismatchError({
          actualKeycode: verifiedKeycode,
          expectedKeycode: input.keycode,
        }),
      );
    }

    return {
      requestedKeycode: input.keycode,
      verifiedKeycode,
    };
  });
}

function readViaKeymapEffect(
  device: MinimalHidDevice,
  layerCount: number,
  matrixHint?: { rows: number; cols: number },
) {
  if (!matrixHint) return Effect.succeed<number[][][] | undefined>(undefined);
  const cappedLayerCount = Math.min(layerCount, 8);
  return Effect.forEach(
    Array.from({ length: cappedLayerCount }, (_, layer) => layer),
    (layer) =>
      Effect.forEach(
        Array.from({ length: matrixHint.rows }, (_, row) => row),
        (row) =>
          Effect.forEach(
            Array.from({ length: matrixHint.cols }, (_, col) => col),
            (col) =>
              hidCommandEffect(device, viaCommand.dynamicKeymapGetKeycode, [layer, row, col]).pipe(
                Effect.map(keycodeFromResponse),
              ),
            { concurrency: 1 },
          ),
        { concurrency: 1 },
      ),
    { concurrency: 1 },
  );
}

function detectViaHidEffect(
  device: MinimalHidDevice,
  matrixHint?: { rows: number; cols: number },
): Effect.Effect<KeyboardDetection, Error> {
  if (!matrixHint) {
    return Effect.fail(new ViaMatrixDefinitionRequiredError({}));
  }
  return Effect.gen(function* () {
    const capabilities = new Set<Capability>(["keymap", "layers"]);
    const protocolResponse = yield* hidCommandEffect(device, viaCommand.getProtocolVersion);
    const protocolVersion = (protocolResponse[1] << 8) | protocolResponse[2];

    const layerResponse = yield* hidCommandEffect(device, viaCommand.dynamicKeymapGetLayerCount);
    const layerCount = layerResponse[1];
    if (!layerCount) return yield* Effect.fail(new ViaNoWritableLayersError({}));

    const macroResponse = yield* hidCommandEffect(device, viaCommand.dynamicKeymapMacroGetCount);
    if (macroResponse?.[1]) capabilities.add("macros");

    const keymap = yield* readViaKeymapEffect(device, layerCount, matrixHint);
    return {
      identity: {
        key: deviceKey(device),
        transport: "webhid" as const,
        vendorId: device.vendorId,
        productId: device.productId,
        productName: device.productName,
        serialNumber: device.serialNumber,
      },
      protocolVersion,
      layerCount,
      keymap,
      capabilities: Array.from(capabilities),
      notes: [],
    };
  });
}

export function connectKeyboard(
  transport: TransportKind,
  filters: Array<{ vendorId?: number; productId?: number }>,
  options: TransportOptions = {},
) {
  return runApp("keyboard.connect", connectKeyboardEffect(transport, filters, options));
}

export function createWebHidViaTransport(
  defaultFilters: Array<{ vendorId?: number; productId?: number }> = [],
): KeyboardTransport {
  return {
    id: "webhid-via",
    label: "WebHID VIA",
    mode: "real",
    transport: "webhid",
    connect: (options = {}) =>
      connectKeyboard("webhid", options.filters ?? defaultFilters, options),
  };
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

  return Effect.gen(function* () {
    if (transport === "webusb") {
      if (!environment.usb) {
        return {
          ...getConnectionState(environment),
          status: "unsupported" as const,
          transport,
          message: "WebUSB unavailable",
        };
      }

      const device = yield* hostPromise("keyboard.webusb.request-device", () =>
        environment.usb!.requestDevice({ filters: webUsbFilters(filters) }),
      );
      return yield* connectUsbDeviceEffect(device, environment);
    }

    if (transport === "webbluetooth" || transport === "webserial") {
      return {
        ...getConnectionState(environment),
        status: "unsupported" as const,
        transport,
        protocol: "zmk-studio" as const,
        message: "Use the dedicated ZMK Studio Bluetooth or Serial transport.",
      };
    }

    if (!environment.hid) {
      return {
        ...getConnectionState(environment),
        status: "unsupported" as const,
        transport,
        message: "WebHID unavailable",
      };
    }

    const grantedDevices = environment.hid.getDevices
      ? yield* hostPromise("keyboard.webhid.get-devices", () => environment.hid!.getDevices!())
      : [];
    const grantedDevice = grantedViaHidDevice(grantedDevices, filters);
    const [requestedDevice] = grantedDevice
      ? [undefined]
      : yield* hostPromise("keyboard.webhid.request-device", () =>
          environment.hid!.requestDevice({ filters: webHidFilters(filters) }),
        );
    const device = grantedDevice ?? requestedDevice;
    if (!device) {
      return {
        ...getConnectionState(environment),
        status: "idle" as const,
        transport,
        message: "No device selected",
      };
    }

    return yield* connectHidDeviceEffect(device, options, environment);
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed({
        ...getConnectionState(environment),
        status: "error" as const,
        transport,
        message: connectionErrorMessage(error, transport),
      }),
    ),
  );
}

export function detectGrantedKeyboard(
  options: TransportOptions = {},
): Promise<ConnectionState | undefined> {
  return runApp("keyboard.detect-granted", detectGrantedKeyboardEffect(options));
}

export function detectGrantedKeyboardEffect(options: TransportOptions = {}) {
  const environment = options.environment ?? browserTransportEnvironment();
  if (!environment.isBrowser) return Effect.succeed(undefined);

  return Effect.gen(function* () {
    const hidDevices = environment.hid?.getDevices
      ? yield* hostPromise("keyboard.webhid.get-granted", () => environment.hid!.getDevices!())
      : [];
    const hidDevice = hidDevices.find(isViaHidDevice);
    if (hidDevice) return yield* connectHidDeviceEffect(hidDevice, options, environment);

    const usbDevices = environment.usb?.getDevices
      ? yield* hostPromise("keyboard.webusb.get-granted", () => environment.usb!.getDevices!())
      : [];
    const usbDevice = usbDevices.find(isKeyboardLikeUsbDevice);
    if (usbDevice) return yield* connectUsbDeviceEffect(usbDevice, environment);

    return undefined;
  }).pipe(
    Effect.catch((error) =>
      Effect.succeed({
        ...getConnectionState(environment),
        status: "error" as const,
        message: connectionErrorMessage(error, "webhid"),
      }),
    ),
  );
}

function hostPromise<A>(operation: string, run: () => PromiseLike<A>) {
  return Effect.tryPromise({
    try: run,
    catch: (cause) => platformError(operation, cause),
  }).pipe(Effect.withSpan(operation));
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
export const forgetGrantedKeyboardEffect = Effect.fn("Keyboard.forgetGranted")(function* (
  identity: { vendorId?: number; productId?: number; serialNumber?: string },
  environment: TransportEnvironment = browserTransportEnvironment(),
) {
  if (!environment.isBrowser) return getConnectionState(environment);

  const matches = (device: { vendorId?: number; productId?: number; serialNumber?: string }) =>
    (identity.vendorId === undefined || device.vendorId === identity.vendorId) &&
    (identity.productId === undefined || device.productId === identity.productId) &&
    (!identity.serialNumber || device.serialNumber === identity.serialNumber);

  const getHidDevices = environment.hid?.getDevices?.bind(environment.hid);
  const hidDevices = getHidDevices
    ? yield* hostPromise("keyboard.webhid.get-granted-forget", getHidDevices)
    : [];
  yield* Effect.forEach(
    hidDevices,
    (device) => {
      const forget = device.forget?.bind(device);
      return matches(device) && forget
        ? hostPromise("keyboard.webhid.forget", forget)
        : Effect.void;
    },
    { discard: true },
  );

  const getUsbDevices = environment.usb?.getDevices?.bind(environment.usb);
  const usbDevices = getUsbDevices
    ? yield* hostPromise("keyboard.webusb.get-granted-forget", getUsbDevices)
    : [];
  yield* Effect.forEach(
    usbDevices,
    (device) => {
      const forget = device.forget?.bind(device);
      return matches(device) && forget
        ? hostPromise("keyboard.webusb.forget", forget)
        : Effect.void;
    },
    { discard: true },
  );

  return getConnectionState(environment);
});
