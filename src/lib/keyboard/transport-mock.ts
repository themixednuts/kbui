import type {
  HidController,
  MinimalHidDevice,
  MinimalHidInputReportEvent,
  MinimalUsbDevice,
  TransportEnvironment,
  UsbController,
} from "./transport";
import {
  validateViaReport,
  viaCommand,
  viaReportSize,
  type ViaValidationResult,
} from "./via-protocol";

const viaUsagePage = 0xff60;
const viaUsage = 0x61;
const vendorSpecificClass = 0xff;

export interface MockKeyboardDefinition {
  productName?: string;
  vendorId?: number;
  productId?: number;
  serialNumber?: string;
  protocolVersion?: number;
  layerCount?: number;
  matrix?: { rows: number; cols: number };
  macroCount?: number;
  keymap?: number[][][];
}

function bufferSourceBytes(data: BufferSource) {
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

function defaultKeymap(layerCount: number, matrix: { rows: number; cols: number }) {
  return Array.from({ length: layerCount }, (_, layer) =>
    Array.from({ length: matrix.rows }, (_, row) =>
      Array.from({ length: matrix.cols }, (_, col) =>
        layer === 0 ? 0x0004 + ((row * matrix.cols + col) % 26) : 0x0001,
      ),
    ),
  );
}

export class MockHidKeyboardDevice implements MinimalHidDevice {
  productName: string;
  vendorId: number;
  productId: number;
  collections = [{ usagePage: viaUsagePage, usage: viaUsage }];
  opened = false;

  readonly definition: Required<Omit<MockKeyboardDefinition, "serialNumber">> & {
    serialNumber?: string;
  };
  readonly sentReports: Uint8Array[] = [];
  readonly validationResults: ViaValidationResult[] = [];
  private readonly listeners = new Set<(event: MinimalHidInputReportEvent) => void>();

  constructor(definition: MockKeyboardDefinition = {}) {
    const matrix = definition.matrix ?? { rows: 5, cols: 15 };
    const layerCount = definition.layerCount ?? definition.keymap?.length ?? 4;

    this.definition = {
      productName: definition.productName ?? "Mock VIA Keyboard",
      vendorId: definition.vendorId ?? 0xfeed,
      productId: definition.productId ?? 0x6060,
      serialNumber: definition.serialNumber,
      protocolVersion: definition.protocolVersion ?? 12,
      layerCount,
      matrix,
      macroCount: definition.macroCount ?? 2,
      keymap: definition.keymap ?? defaultKeymap(layerCount, matrix),
    };
    this.productName = this.definition.productName;
    this.vendorId = this.definition.vendorId;
    this.productId = this.definition.productId;
  }

  async open() {
    this.opened = true;
  }

  async sendReport(_reportId: number, data: BufferSource) {
    const request = bufferSourceBytes(data);
    const report = new Uint8Array(request);
    const validation = validateViaReport(report, {
      cols: this.definition.matrix.cols,
      layers: this.definition.layerCount,
      macroCount: this.definition.macroCount,
      rows: this.definition.matrix.rows,
    });

    this.sentReports.push(report);
    this.validationResults.push(validation);
    this.applyReport(validation);
    const response = this.responseFor(report);

    queueMicrotask(() => {
      const event = {
        data: new DataView(response.buffer),
        device: this,
        reportId: 0,
      };
      for (const listener of this.listeners) listener(event);
    });
  }

  addEventListener(_type: "inputreport", listener: (event: MinimalHidInputReportEvent) => void) {
    this.listeners.add(listener);
  }

  removeEventListener(_type: "inputreport", listener: (event: MinimalHidInputReportEvent) => void) {
    this.listeners.delete(listener);
  }

  private applyReport(validation: ViaValidationResult) {
    if (!validation.ok || validation.commandName !== "dynamicKeymapSetKeycode") return;

    const { col, keycode, layer, row } = validation.decoded ?? {};
    if (col === undefined || keycode === undefined || layer === undefined || row === undefined) {
      return;
    }

    this.definition.keymap[layer][row][col] = keycode;
  }

  private responseFor(request: Uint8Array) {
    const response = new Uint8Array(viaReportSize);
    response[0] = request[0];

    if (request[0] === viaCommand.getProtocolVersion) {
      response[1] = (this.definition.protocolVersion >> 8) & 0xff;
      response[2] = this.definition.protocolVersion & 0xff;
    }

    if (request[0] === viaCommand.dynamicKeymapGetLayerCount) {
      response[1] = this.definition.layerCount;
    }

    if (request[0] === viaCommand.dynamicKeymapMacroGetCount) {
      response[1] = this.definition.macroCount;
    }

    if (request[0] === viaCommand.dynamicKeymapGetKeycode) {
      const layer = request[1];
      const row = request[2];
      const col = request[3];
      const keycode = this.definition.keymap[layer]?.[row]?.[col] ?? 0x0000;
      response[4] = (keycode >> 8) & 0xff;
      response[5] = keycode & 0xff;
    }

    return response;
  }
}

export class MockUsbKeyboardDevice implements MinimalUsbDevice {
  productName: string;
  manufacturerName = "Mock";
  vendorId: number;
  productId: number;
  serialNumber?: string;
  configuration?: MinimalUsbDevice["configuration"];
  opened = false;
  selectedConfiguration?: number;
  claimedInterface?: number;

  constructor(definition: MockKeyboardDefinition = {}) {
    this.productName = definition.productName ?? "Mock WebUSB Keyboard";
    this.vendorId = definition.vendorId ?? 0xfeed;
    this.productId = definition.productId ?? 0x6060;
    this.serialNumber = definition.serialNumber ?? "MOCK-USB-001";
    this.configuration = {
      interfaces: [
        {
          interfaceNumber: 1,
          alternates: [{ interfaceClass: vendorSpecificClass }],
        },
      ],
    };
  }

  async open() {
    this.opened = true;
  }

  async selectConfiguration(configurationValue: number) {
    this.selectedConfiguration = configurationValue;
  }

  async claimInterface(interfaceNumber: number) {
    this.claimedInterface = interfaceNumber;
  }
}

export function createMockHidController(device = new MockHidKeyboardDevice()): HidController {
  return {
    getDevices: async () => [device],
    requestDevice: async () => [device],
  };
}

export function createMockUsbController(device = new MockUsbKeyboardDevice()): UsbController {
  return {
    getDevices: async () => [device],
    requestDevice: async () => device,
  };
}

export function createMockTransportEnvironment(
  definition: MockKeyboardDefinition = {},
): TransportEnvironment {
  return {
    isBrowser: true,
    hid: createMockHidController(new MockHidKeyboardDevice(definition)),
    usb: createMockUsbController(new MockUsbKeyboardDevice(definition)),
  };
}
