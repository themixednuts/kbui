// DEV/TEST-ONLY mock. Not shipped in production (dev-gated + tests only).
// Do not import from shipping code paths.
import type { KeyboardTransport } from "./transport";
import { getConnectionState } from "./transport";
import { encodeZmkBinding } from "./zmk-binding";
import {
  cloneZmkBinding,
  cloneZmkKeymap,
  createZmkBehaviorCatalog,
  type ZmkBehaviorBinding,
  type ZmkBehaviorCatalog,
  type ZmkBehaviorDetails,
  type ZmkLockState,
  type ZmkPhysicalLayout,
  type ZmkSaveChangesStatus,
  type ZmkSetLayerBindingStatus,
  type ZmkStudioConnection,
  type ZmkStudioKeymap,
  type ZmkStudioRequest,
  type ZmkStudioResponse,
} from "./zmk-studio";
import { behaviorDetails } from "./zmk-binding";
import {
  cloneDevice,
  qmkKeycodeValue,
  sampleKeyboard,
  type DeviceProfile,
  type KeyBinding,
  type Layer,
} from "./schema";

const mockDeviceInfo = {
  deviceName: "Workbench ZMK 65",
  firmwareVersion: "ZMK Studio mock 4c-i",
  manufacturer: "Mock ZMK",
  serialNumber: "MOCK-ZMK-001",
};

const layerColors = ["#2f7f79", "#d96f32", "#5d6fb8", "#39945f"];
const mockLayerIds = [100, 101, 102];
const unknownCompiledBehaviorId = 99;

export interface MockZmkStudioTransportOptions {
  lockedAfterConnect?: boolean;
}

export interface MockZmkStudioBoard {
  id: string;
  name: string;
  profile: DeviceProfile;
}

function parameterRange(name: string, min: number, max: number) {
  return [{ name, min, max }];
}

function createMockBehaviorDetails(layerIds: readonly number[]): ZmkBehaviorDetails[] {
  return [
    behaviorDetails(1, "&kp", "Key press", "keyPress", [
      {
        param1: parameterRange("usage", 0, 0xffff),
        param2: parameterRange("unused", 0, 0),
      },
    ]),
    behaviorDetails(2, "&trans", "Transparent", "transparent"),
    behaviorDetails(3, "&none", "No operation", "none"),
    behaviorDetails(4, "&mo", "Momentary layer", "momentaryLayer", [
      {
        param1: [{ name: "layer", values: [...layerIds] }],
        param2: parameterRange("unused", 0, 0),
      },
    ]),
    behaviorDetails(5, "&to", "To layer", "toLayer", [
      {
        param1: [{ name: "layer", values: [...layerIds] }],
        param2: parameterRange("unused", 0, 0),
      },
    ]),
    behaviorDetails(6, "&tog", "Toggle layer", "toggleLayer", [
      {
        param1: [{ name: "layer", values: [...layerIds] }],
        param2: parameterRange("unused", 0, 0),
      },
    ]),
    behaviorDetails(7, "&studio_unlock", "Studio unlock", "studioUnlock"),
    behaviorDetails(unknownCompiledBehaviorId, "&mock_compiled", "Compiled behavior", "unknown", [
      {
        param1: parameterRange("param1", -0x7fffffff, 0x7fffffff),
        param2: parameterRange("param2", -0x7fffffff, 0x7fffffff),
      },
    ]),
  ];
}

export function createMockZmkBehaviorCatalog(
  layerIds: readonly number[] = mockLayerIds,
): ZmkBehaviorCatalog {
  return createZmkBehaviorCatalog(createMockBehaviorDetails(layerIds), layerIds);
}

function keyPositionByKeyId() {
  return Object.fromEntries(sampleKeyboard.keys.map((key, keyPosition) => [key.id, keyPosition]));
}

function mockPhysicalLayout(): ZmkPhysicalLayout {
  return {
    id: 1,
    name: "Default 65%",
    keys: sampleKeyboard.keys.map((key, keyPosition) => ({
      ...key,
      keyPosition,
    })),
  };
}

function fallbackBinding(code: string, layerIndex: number): ZmkBehaviorBinding {
  const value = qmkKeycodeValue(code);
  return {
    behaviorId: unknownCompiledBehaviorId,
    param1: value ?? layerIndex,
    param2: value === undefined ? stableStringCode(code) : 0,
  };
}

function stableStringCode(value: string) {
  let hash = 0;
  for (const char of value) hash = (hash * 31 + char.charCodeAt(0)) & 0x7fffffff;
  return hash;
}

function sanitizedBindingForMock(binding: KeyBinding, layerIndex: number): KeyBinding {
  if (encodeZmkBinding(binding, createMockZmkBehaviorCatalog(), mockLayersForCodec())) {
    return binding;
  }

  return { code: layerIndex === 0 ? "KC_NO" : "KC_TRNS" };
}

function mockLayersForCodec(): Layer[] {
  return mockLayerIds.map((layerId, index) => ({
    id: `zmk-layer-${layerId}`,
    name: index === 0 ? "Base" : index === 1 ? "Fn" : `Layer ${index}`,
    color: layerColors[index % layerColors.length],
    bindings: {},
  }));
}

function layerBindingsFromProfileLayer(
  profileLayer: Layer | undefined,
  layerIndex: number,
  catalog: ZmkBehaviorCatalog,
  layers: readonly Layer[],
) {
  return sampleKeyboard.keys.map((key) => {
    const source = profileLayer?.bindings[key.id] ?? {
      code: layerIndex === 0 ? "KC_NO" : "KC_TRNS",
    };
    const sanitized = sanitizedBindingForMock(source, layerIndex);
    return encodeZmkBinding(sanitized, catalog, layers) ?? fallbackBinding(source.code, layerIndex);
  });
}

function createStockKeymap(catalog: ZmkBehaviorCatalog): ZmkStudioKeymap {
  const layers = mockLayersForCodec();
  return {
    availableLayers: mockLayerIds.length,
    layers: mockLayerIds.map((layerId, layerIndex) => ({
      id: layerId,
      name: layerIndex === 0 ? "Base" : layerIndex === 1 ? "Fn" : "Nav",
      bindings: layerBindingsFromProfileLayer(
        sampleKeyboard.layers[layerIndex],
        layerIndex,
        catalog,
        layers,
      ),
    })),
  };
}

function createMockZmkProfile(): DeviceProfile {
  const profile = cloneDevice(sampleKeyboard);
  profile.id = "mock:zmk-workbench-65";
  profile.name = mockDeviceInfo.deviceName;
  profile.vendor = mockDeviceInfo.manufacturer;
  profile.firmware = "zmk";
  profile.protocol = "zmk-studio";
  profile.firmwareVersion = mockDeviceInfo.firmwareVersion;
  profile.identity = {
    key: "keyboard:zmk-studio:mock-zmk-001",
    transport: "webbluetooth",
    productName: mockDeviceInfo.deviceName,
    serialNumber: mockDeviceInfo.serialNumber,
  };
  profile.detectionNotes = ["Seed profile for the mock ZMK Studio Workbench 65 harness."];
  return profile;
}

export const mockZmkStudioBoards = {
  workbench65: {
    id: "workbench-zmk-65",
    name: mockDeviceInfo.deviceName,
    profile: createMockZmkProfile(),
  },
} as const satisfies Record<string, MockZmkStudioBoard>;

export class MockZmkStudioConnection implements ZmkStudioConnection {
  readonly label = `${mockDeviceInfo.deviceName} demo`;
  readonly mode = "mock";
  readonly sentRequests: ZmkStudioRequest[] = [];
  readonly behaviorCatalog = createMockZmkBehaviorCatalog(mockLayerIds);
  readonly layerIdByLayerIndex = [...mockLayerIds];
  readonly keyPositionByKeyId = keyPositionByKeyId();

  lockState: ZmkLockState;
  keymap: ZmkStudioKeymap;
  nextSetBindingResponse?: ZmkSetLayerBindingStatus;
  nextReadbackBinding?: ZmkBehaviorBinding;
  nextSaveResponse?: ZmkSaveChangesStatus;

  private readonly physicalLayout = mockPhysicalLayout();
  private readonly stockKeymap: ZmkStudioKeymap;
  private savedKeymap: ZmkStudioKeymap;
  private workingKeymap: ZmkStudioKeymap;
  private hasUnsavedChanges = false;
  private lastWrite:
    | {
        keyPosition: number;
        layerId: number;
      }
    | undefined;

  constructor(options: MockZmkStudioTransportOptions = {}) {
    this.lockState = options.lockedAfterConnect ? "locked" : "unlocked";
    this.stockKeymap = createStockKeymap(this.behaviorCatalog);
    this.savedKeymap = cloneZmkKeymap(this.stockKeymap);
    this.workingKeymap = cloneZmkKeymap(this.stockKeymap);
    this.keymap = cloneZmkKeymap(this.workingKeymap);
  }

  async close() {
    return undefined;
  }

  mockUnlock() {
    this.lockState = "unlocked";
  }

  async call(request: ZmkStudioRequest): Promise<ZmkStudioResponse> {
    this.sentRequests.push(cloneRequest(request));

    if (request.type === "get_device_info") {
      return { type: "get_device_info", ...mockDeviceInfo };
    }

    if (request.type === "get_lock_state") {
      return { type: "get_lock_state", lockState: this.lockState };
    }

    if (request.type === "list_all_behaviors") {
      return {
        type: "list_all_behaviors",
        behaviorIds: Object.keys(this.behaviorCatalog.behaviors).map(Number),
      };
    }

    if (request.type === "get_behavior_details") {
      const behavior = this.behaviorCatalog.behaviors[request.behaviorId];
      if (!behavior) throw new Error(`Unknown ZMK behavior ${request.behaviorId}`);
      return { type: "get_behavior_details", behavior };
    }

    if (request.type === "get_physical_layouts") {
      return {
        type: "get_physical_layouts",
        activeLayoutIndex: 0,
        layouts: [this.physicalLayout],
      };
    }

    if (request.type === "get_keymap") {
      const keymap = cloneZmkKeymap(this.workingKeymap);
      if (this.nextReadbackBinding && this.lastWrite) {
        const layer = keymap.layers.find((candidate) => candidate.id === this.lastWrite?.layerId);
        if (layer?.bindings[this.lastWrite.keyPosition]) {
          layer.bindings[this.lastWrite.keyPosition] = cloneZmkBinding(this.nextReadbackBinding);
        }
        this.nextReadbackBinding = undefined;
      }
      this.keymap = cloneZmkKeymap(keymap);
      return { type: "get_keymap", keymap };
    }

    if (request.type === "set_layer_binding") {
      return this.setLayerBinding(request);
    }

    if (request.type === "check_unsaved_changes") {
      return { type: "check_unsaved_changes", hasUnsavedChanges: this.hasUnsavedChanges };
    }

    if (request.type === "save_changes") {
      const status = this.nextSaveResponse ?? "ok";
      this.nextSaveResponse = undefined;
      if (status === "ok") {
        this.savedKeymap = cloneZmkKeymap(this.workingKeymap);
        this.hasUnsavedChanges = false;
        this.keymap = cloneZmkKeymap(this.workingKeymap);
      }
      return { type: "save_changes", status };
    }

    if (request.type === "discard_changes") {
      this.workingKeymap = cloneZmkKeymap(this.savedKeymap);
      this.hasUnsavedChanges = false;
      this.keymap = cloneZmkKeymap(this.workingKeymap);
      return { type: "discard_changes", status: "ok" };
    }

    this.workingKeymap = cloneZmkKeymap(this.stockKeymap);
    this.savedKeymap = cloneZmkKeymap(this.stockKeymap);
    this.hasUnsavedChanges = false;
    this.keymap = cloneZmkKeymap(this.workingKeymap);
    return { type: "reset_settings", status: "ok" };
  }

  private setLayerBinding(
    request: Extract<ZmkStudioRequest, { type: "set_layer_binding" }>,
  ): ZmkStudioResponse {
    if (this.lockState === "locked") return { type: "set_layer_binding", status: "locked" };

    const hook = this.nextSetBindingResponse;
    this.nextSetBindingResponse = undefined;
    if (hook && hook !== "ok") return { type: "set_layer_binding", status: hook };

    const layer = this.workingKeymap.layers.find((candidate) => candidate.id === request.layerId);
    if (!layer || !layer.bindings[request.keyPosition]) {
      return { type: "set_layer_binding", status: "invalid-location" };
    }

    if (!this.behaviorCatalog.behaviors[request.binding.behaviorId]) {
      return { type: "set_layer_binding", status: "invalid-behavior" };
    }

    layer.bindings[request.keyPosition] = cloneZmkBinding(request.binding);
    this.lastWrite = {
      keyPosition: request.keyPosition,
      layerId: request.layerId,
    };
    this.hasUnsavedChanges = true;
    this.keymap = cloneZmkKeymap(this.workingKeymap);
    return { type: "set_layer_binding", status: hook ?? "ok" };
  }
}

function cloneRequest(request: ZmkStudioRequest): ZmkStudioRequest {
  if (request.type !== "set_layer_binding") return { ...request } as ZmkStudioRequest;
  return {
    ...request,
    binding: cloneZmkBinding(request.binding),
  };
}

export function createMockZmkStudioTransport(
  options: MockZmkStudioTransportOptions = {},
): KeyboardTransport {
  const board = mockZmkStudioBoards.workbench65;

  return {
    id: `mock-zmk-studio:${board.id}`,
    label: `${board.name} demo`,
    mode: "mock",
    transport: "webbluetooth",
    defaultProfile: cloneDevice(board.profile),
    connect: async () => {
      const connection = new MockZmkStudioConnection(options);
      const state = getConnectionState({
        bluetooth: {},
        isBrowser: true,
        serial: {},
      });

      return {
        ...state,
        status: "connected" as const,
        transport: "webbluetooth" as const,
        protocol: "zmk-studio" as const,
        zmkStudio: connection,
        deviceKey: "keyboard:zmk-studio:mock-zmk-001",
        productName: mockDeviceInfo.deviceName,
        serialNumber: mockDeviceInfo.serialNumber,
        detection: {
          identity: {
            key: "keyboard:zmk-studio:mock-zmk-001",
            transport: "webbluetooth" as const,
            productName: mockDeviceInfo.deviceName,
            serialNumber: mockDeviceInfo.serialNumber,
          },
          capabilities: ["keymap", "layers", "settings", "firmware"],
          notes: ["Mock ZMK Studio RPC-shaped device connected without hardware."],
        },
        message:
          connection.lockState === "locked"
            ? "Connected, but ZMK Studio is locked. Unlock on the keyboard."
            : "Connected",
      };
    },
  };
}
