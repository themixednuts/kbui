// DEV/TEST-ONLY mock. Not shipped in production (dev-gated + tests only).
// Do not import from shipping code paths.
import type {
  HidController,
  KeyboardTransport,
  MinimalHidDevice,
  MinimalHidInputReportEvent,
  MinimalUsbDevice,
  TransportEnvironment,
  UsbController,
} from "./transport";
import { connectKeyboard } from "./transport";
import { cloneDevice, qmkKeycodeValue, sampleKeyboard, type DeviceProfile } from "./schema";
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

export interface MockViaBoard {
  id: string;
  name: string;
  definition: MockKeyboardDefinition;
  profile: DeviceProfile;
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

function keymapFromProfile(profile: DeviceProfile) {
  const keymap: number[][][] = Array.from({ length: profile.layers.length }, (_, layerIndex) =>
    Array.from({ length: profile.matrix.rows }, () =>
      Array.from({ length: profile.matrix.cols }, () => (layerIndex === 0 ? 0x0000 : 0x0001)),
    ),
  );

  for (const [layerIndex, layer] of profile.layers.entries()) {
    for (const key of profile.keys) {
      const binding = layer.bindings[key.id];
      const keycode = binding ? qmkKeycodeValue(binding.code) : undefined;
      keymap[layerIndex][key.row][key.col] = keycode ?? (layerIndex === 0 ? 0x0000 : 0x0001);
    }
  }

  return keymap;
}

function createWorkbench65MockBoard(): MockViaBoard {
  const profile = cloneDevice(sampleKeyboard);
  profile.id = "mock:workbench-65";
  profile.name = "Workbench 65";
  profile.vendor = "Mock VIA";
  profile.identity = {
    key: "keyboard:feed:6060:MOCK-WB65-001",
    transport: "webhid",
    vendorId: profile.vendorId,
    productId: profile.productId,
    productName: profile.name,
    serialNumber: "MOCK-WB65-001",
  };
  profile.detectionNotes = ["Seed profile for the mock VIA Workbench 65 harness."];

  return {
    id: "workbench-65",
    name: "Workbench 65",
    profile,
    definition: {
      productName: profile.name,
      vendorId: profile.vendorId,
      productId: profile.productId,
      serialNumber: "MOCK-WB65-001",
      protocolVersion: 12,
      layerCount: profile.layers.length,
      matrix: profile.matrix,
      macroCount: profile.macros.length,
      keymap: keymapFromProfile(profile),
    },
  };
}

export const mockViaBoards = {
  workbench65: createWorkbench65MockBoard(),
} as const;

export class MockHidKeyboardDevice implements MinimalHidDevice {
  productName: string;
  vendorId: number;
  productId: number;
  serialNumber?: string;
  collections = [{ usagePage: viaUsagePage, usage: viaUsage }];
  opened = false;

  readonly definition: Required<Omit<MockKeyboardDefinition, "serialNumber">> & {
    serialNumber?: string;
  };
  readonly sentReports: Uint8Array[] = [];
  readonly validationResults: ViaValidationResult[] = [];
  nextReadbackKeycode?: number;
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
    this.serialNumber = this.definition.serialNumber;
  }

  async open() {
    this.opened = true;
  }

  async close() {
    this.opened = false;
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
      const keycode =
        this.nextReadbackKeycode ?? this.definition.keymap[layer]?.[row]?.[col] ?? 0x0000;
      this.nextReadbackKeycode = undefined;
      response[4] = (keycode >> 8) & 0xff;
      response[5] = keycode & 0xff;
    }

    if (request[0] === viaCommand.dynamicKeymapGetBuffer) {
      const offset = (request[1] << 8) | request[2];
      const size = Math.min(request[3], viaReportSize - 4);
      response.set(this.keymapBuffer().slice(offset, offset + size), 4);
    }

    return response;
  }

  private keymapBuffer() {
    const size =
      this.definition.layerCount * this.definition.matrix.rows * this.definition.matrix.cols * 2;
    const buffer = new Uint8Array(size);
    let index = 0;

    for (let layer = 0; layer < this.definition.layerCount; layer += 1) {
      for (let row = 0; row < this.definition.matrix.rows; row += 1) {
        for (let col = 0; col < this.definition.matrix.cols; col += 1) {
          const keycode = this.definition.keymap[layer]?.[row]?.[col] ?? 0x0000;
          buffer[index] = (keycode >> 8) & 0xff;
          buffer[index + 1] = keycode & 0xff;
          index += 2;
        }
      }
    }

    return buffer;
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

export function createMockViaTransport(
  board: MockViaBoard = mockViaBoards.workbench65,
): KeyboardTransport {
  return {
    id: `mock-via:${board.id}`,
    label: `${board.name} demo`,
    mode: "mock",
    transport: "webhid",
    defaultProfile: cloneDevice(board.profile),
    connect: (options = {}) =>
      connectKeyboard("webhid", options.filters ?? [], {
        ...options,
        environment: createMockTransportEnvironment(board.definition),
        matrixHint: options.matrixHint ?? board.definition.matrix,
      }),
  };
}
