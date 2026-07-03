import {
  bindingFor,
  keyById,
  qmkKeycodeValue,
  type DeviceProfile,
  type KeyBinding,
} from "./schema";
import {
  encodeViaSetKeycodeReport,
  validateViaReport,
  type ViaValidationResult,
} from "./via-protocol";

export type MockKeyboardOperation =
  | "attach"
  | "behavior.write"
  | "catalog.load"
  | "feature.write"
  | "keymap.write"
  | "layer.rename"
  | "lighting.write"
  | "lighting.key.write"
  | "macro.remove"
  | "macro.write"
  | "press"
  | "reset"
  | "setting.write";

export interface MockKeyboardTarget {
  col?: number;
  keyId?: string;
  keyLabel?: string;
  layerId?: string;
  layerName?: string;
  path?: string;
  row?: number;
}

export type MockKeyboardPayload =
  | boolean
  | number
  | string
  | null
  | string[]
  | Record<string, boolean | number | string | null | string[]>;

export interface MockKeyboardPacket {
  label?: string;
  operation: MockKeyboardOperation;
  payload: MockKeyboardPayload;
  target?: MockKeyboardTarget;
}

export interface MockKeyboardSnapshot {
  binding: KeyBinding;
  capabilities: string[];
  deviceId: string;
  deviceName: string;
  keyId: string;
  keyLabel: string;
  layerId: string;
  layerName: string;
  lighting: DeviceProfile["lighting"];
  macroCount: number;
  online: boolean;
  settings: DeviceProfile["settings"];
}

export interface MockKeyboardCaptureEvent extends MockKeyboardPacket {
  accepted: boolean;
  after: MockKeyboardSnapshot;
  at: string;
  before: MockKeyboardSnapshot;
  errors: string[];
  id: string;
  sequence: number;
  via?: ViaValidationResult;
}

export interface MockKeyboardCapture {
  events: MockKeyboardCaptureEvent[];
  online: boolean;
  rejected: number;
  sequence: number;
}

export interface MockKeyboardSelection {
  keyId: string;
  layerId: string;
}

const writeOperations = new Set<MockKeyboardOperation>([
  "catalog.load",
  "behavior.write",
  "feature.write",
  "keymap.write",
  "lighting.write",
  "lighting.key.write",
  "macro.remove",
  "macro.write",
  "setting.write",
]);

const keyWriteOperations = new Set<MockKeyboardOperation>([
  "behavior.write",
  "keymap.write",
  "macro.write",
  "press",
]);

function eventId(sequence: number) {
  return `mock-event-${sequence.toString().padStart(4, "0")}`;
}

function fallbackSelection(profile: DeviceProfile, selection?: Partial<MockKeyboardSelection>) {
  return {
    layerId: selection?.layerId ?? profile.layers[0]?.id ?? "",
    keyId: selection?.keyId ?? profile.keys[0]?.id ?? "",
  };
}

function targetForSelection(profile: DeviceProfile, selection?: Partial<MockKeyboardSelection>) {
  const resolved = fallbackSelection(profile, selection);
  const layer =
    profile.layers.find((candidate) => candidate.id === resolved.layerId) ?? profile.layers[0];
  const key = keyById(profile, resolved.keyId) ?? profile.keys[0];

  return {
    col: key?.col,
    keyId: key?.id,
    keyLabel: key?.label,
    layerId: layer?.id,
    layerName: layer?.name,
    row: key?.row,
  };
}

function validateKeycode(code: unknown) {
  if (typeof code !== "string" || code.trim().length === 0) return "Keycode is empty";
  if (/\s/.test(code)) return "Keycode contains whitespace";
  if (code.length > 72) return "Keycode is too long";
  return undefined;
}

function payloadValue(payload: MockKeyboardPayload, key: string) {
  return typeof payload === "object" && payload !== null && !Array.isArray(payload)
    ? payload[key]
    : undefined;
}

function payloadLabel(value: unknown) {
  if (Array.isArray(value)) return value.join(" + ");
  if (typeof value === "object" && value !== null) return JSON.stringify(value);
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return value.toString();
  }
  return "";
}

function validatePacket(profile: DeviceProfile, packet: MockKeyboardPacket) {
  const errors: string[] = [];
  const target = packet.target;

  if (keyWriteOperations.has(packet.operation)) {
    if (!target?.layerId || !profile.layers.some((layer) => layer.id === target.layerId)) {
      errors.push("Target layer is not in the current keyboard profile");
    }

    if (!target?.keyId || !profile.keys.some((key) => key.id === target.keyId)) {
      errors.push("Target key is not in the current keyboard profile");
    }
  }

  if (
    packet.operation === "keymap.write" ||
    packet.operation === "behavior.write" ||
    packet.operation === "macro.write"
  ) {
    const error = validateKeycode(payloadValue(packet.payload, "code") ?? packet.payload);
    if (error) errors.push(error);
  }

  if (packet.operation === "setting.write") {
    const key = payloadValue(packet.payload, "key");
    if (typeof key !== "string" || !(key in profile.settings)) {
      errors.push("Setting write targets an unknown setting");
    }
  }

  if (packet.operation === "lighting.write") {
    const key = payloadValue(packet.payload, "key");
    const globalFields = new Set(["mode", "hue", "saturation", "brightness", "speed"]);
    if (typeof key !== "string" || !globalFields.has(key)) {
      errors.push("Lighting write targets an unknown lighting field");
    }
  }

  if (packet.operation === "lighting.key.write") {
    const keyIds = payloadValue(packet.payload, "keyIds");
    const keyId = payloadValue(packet.payload, "keyId");

    if (Array.isArray(keyIds)) {
      if (keyIds.length === 0) {
        errors.push("Lighting key write is missing key ids");
      } else {
        for (const id of keyIds) {
          if (typeof id !== "string" || !profile.keys.some((candidate) => candidate.id === id)) {
            errors.push("Lighting key write targets an unknown key");
            break;
          }
        }
      }
    } else if (typeof keyId === "string") {
      if (!profile.keys.some((candidate) => candidate.id === keyId)) {
        errors.push("Lighting key write targets an unknown key");
      }
    } else {
      errors.push("Lighting key write is missing a key id");
    }
  }

  if (packet.operation === "feature.write") {
    const capability = payloadValue(packet.payload, "capability");
    if (typeof capability !== "string" || capability.trim().length === 0) {
      errors.push("Feature write is missing a capability");
    }
  }

  if (packet.operation === "macro.remove") {
    const macroId = payloadValue(packet.payload, "macroId") ?? packet.payload;
    if (typeof macroId !== "string" || macroId.trim().length === 0) {
      errors.push("Macro remove is missing a macro id");
    }
  }

  return errors;
}

function viaValidationForPacket(profile: DeviceProfile, packet: MockKeyboardPacket) {
  if (packet.operation !== "keymap.write") return undefined;

  const code = payloadValue(packet.payload, "code") ?? packet.payload;
  if (typeof code !== "string") return undefined;

  const keycode = qmkKeycodeValue(code);
  if (keycode === undefined) return undefined;

  const layer = profile.layers.findIndex((candidate) => candidate.id === packet.target?.layerId);
  const row = packet.target?.row;
  const col = packet.target?.col;
  if (layer < 0 || row === undefined || col === undefined) return undefined;

  return validateViaReport(encodeViaSetKeycodeReport({ col, keycode, layer, row }), {
    cols: profile.matrix.cols,
    layers: profile.layers.length,
    rows: profile.matrix.rows,
  });
}

export function createMockKeyboardCapture(
  profile: DeviceProfile,
  online = false,
): MockKeyboardCapture {
  void profile;

  return {
    events: [],
    online,
    rejected: 0,
    sequence: 0,
  };
}

export function mockKeyboardSnapshot(
  profile: DeviceProfile,
  selection?: Partial<MockKeyboardSelection>,
  online = false,
): MockKeyboardSnapshot {
  const resolved = fallbackSelection(profile, selection);
  const layer =
    profile.layers.find((candidate) => candidate.id === resolved.layerId) ?? profile.layers[0];
  const key = keyById(profile, resolved.keyId) ?? profile.keys[0];

  return {
    binding: layer && key ? { ...bindingFor(profile, layer.id, key.id) } : { code: "KC_NO" },
    capabilities: [...profile.capabilities],
    deviceId: profile.id,
    deviceName: profile.name,
    keyId: key?.id ?? "",
    keyLabel: key?.label ?? "",
    layerId: layer?.id ?? "",
    layerName: layer?.name ?? "",
    lighting: { ...profile.lighting },
    macroCount: profile.macros.length,
    online,
    settings: { ...profile.settings },
  };
}

export function captureMockKeyboardPacket(
  capture: MockKeyboardCapture,
  beforeProfile: DeviceProfile,
  afterProfile: DeviceProfile,
  packet: MockKeyboardPacket,
  selection?: Partial<MockKeyboardSelection>,
): MockKeyboardCapture {
  const sequence = capture.sequence + 1;
  const nextOnline = packet.operation === "attach" ? true : capture.online;
  const target = packet.target ?? targetForSelection(afterProfile, selection);
  const completedPacket = { ...packet, target };
  const via = viaValidationForPacket(afterProfile, completedPacket);
  const errors = [...validatePacket(afterProfile, completedPacket), ...(via?.errors ?? [])];
  const event: MockKeyboardCaptureEvent = {
    ...completedPacket,
    accepted: errors.length === 0,
    after: mockKeyboardSnapshot(afterProfile, target, nextOnline),
    at: new Date().toISOString(),
    before: mockKeyboardSnapshot(beforeProfile, target, capture.online),
    errors,
    id: eventId(sequence),
    sequence,
    via,
  };

  return {
    events: [event, ...capture.events].slice(0, 40),
    online: nextOnline,
    rejected: capture.rejected + (event.accepted ? 0 : 1),
    sequence,
  };
}

export function countMockKeyboardWrites(capture: MockKeyboardCapture) {
  return capture.events.filter((event) => event.accepted && writeOperations.has(event.operation))
    .length;
}

export function mockKeyboardEventSummary(event?: MockKeyboardCaptureEvent) {
  if (!event) return "No packets captured";
  if (!event.accepted) return `Rejected ${event.operation}: ${event.errors[0] ?? "invalid packet"}`;

  if (event.label) return event.label;

  const keyTarget = event.target?.keyLabel
    ? `${event.target.layerName}/${event.target.keyLabel}`
    : event.target?.path;
  const code = payloadValue(event.payload, "code") ?? event.payload;

  if (event.operation === "press")
    return `Pressed ${event.after.keyLabel}: ${event.after.binding.code}`;
  if (event.operation === "attach") return `Attached ${event.after.deviceName}`;
  if (event.operation === "reset") return "Mock bus reset";
  if (event.operation === "keymap.write") return `Keymap write ${keyTarget}: ${payloadLabel(code)}`;
  if (event.operation === "behavior.write")
    return `Behavior write ${keyTarget}: ${payloadLabel(code)}`;
  if (event.operation === "macro.write") return `Macro write ${keyTarget}: ${payloadLabel(code)}`;
  if (event.operation === "macro.remove") return `Macro removed ${payloadLabel(code)}`;
  if (event.operation === "setting.write" || event.operation === "lighting.write") {
    return `${event.operation} ${String(payloadValue(event.payload, "key"))}=${String(payloadValue(event.payload, "value"))}`;
  }
  if (event.operation === "lighting.key.write") {
    const keyIds = payloadValue(event.payload, "keyIds");
    if (Array.isArray(keyIds)) {
      const count = keyIds.length;
      return `lighting.key.write ${count} key${count === 1 ? "" : "s"}`;
    }
    return `lighting.key.write ${String(payloadValue(event.payload, "keyId"))}`;
  }
  if (event.operation === "feature.write")
    return `Feature write ${String(payloadValue(event.payload, "capability"))}`;
  if (event.operation === "catalog.load") return `Loaded ${event.after.deviceName}`;

  return event.operation;
}

export function isMockKeyboardWrite(operation: MockKeyboardOperation) {
  return writeOperations.has(operation);
}
