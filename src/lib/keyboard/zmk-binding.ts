import type { KeyBinding, Layer } from "./schema";
import { qmkKeycodeName, qmkKeycodeValue } from "./schema";
import { qmkDirectKeycodes } from "./qmk-keycodes";
import type {
  ZmkBehaviorBinding,
  ZmkBehaviorCatalog,
  ZmkBehaviorDetails,
  ZmkBehaviorKind,
} from "./zmk-studio";

const supportedQmkGroups = new Set(["basic", "internal", "media", "modifiers", "system"]);
const unknownBehaviorPattern = /^ZMK_BEHAVIOR\((-?\d+),(-?\d+),(-?\d+)\)$/i;
const layerCodePattern = /^(MO|TO|TG)\((\d+)\)$/i;

function normalizedCode(code: string) {
  return code.trim().replace(/\s+/g, "").toUpperCase();
}

function behaviorForKind(catalog: ZmkBehaviorCatalog, kind: ZmkBehaviorKind) {
  const id = catalog.idsByKind[kind];
  return id === undefined ? undefined : catalog.behaviors[id];
}

function bindingForKind(
  catalog: ZmkBehaviorCatalog,
  kind: ZmkBehaviorKind,
  param1 = 0,
  param2 = 0,
): ZmkBehaviorBinding | undefined {
  const behavior = behaviorForKind(catalog, kind);
  if (!behavior) return undefined;

  const binding = { behaviorId: behavior.id, param1, param2 };
  return validateZmkBinding(binding, catalog) ? binding : undefined;
}

function layerBehaviorKind(code: string): ZmkBehaviorKind | undefined {
  if (code === "MO") return "momentaryLayer";
  if (code === "TO") return "toLayer";
  if (code === "TG") return "toggleLayer";
  return undefined;
}

function layerBehaviorName(kind: ZmkBehaviorKind) {
  if (kind === "momentaryLayer") return "MO";
  if (kind === "toLayer") return "TO";
  if (kind === "toggleLayer") return "TG";
  return undefined;
}

function layerIdForCodeLayerIndex(
  layerIndex: number,
  catalog: ZmkBehaviorCatalog,
  layers: readonly Layer[],
) {
  if (!Number.isInteger(layerIndex) || layerIndex < 0 || layerIndex >= layers.length) {
    return undefined;
  }

  return catalog.layerIdByLayerIndex[layerIndex] ?? numericLayerId(layers[layerIndex]?.id);
}

function numericLayerId(layerId: string | undefined) {
  if (!layerId) return undefined;
  const direct = Number(layerId);
  if (Number.isInteger(direct)) return direct;
  const match = layerId.match(/(\d+)$/);
  return match ? Number(match[1]) : undefined;
}

function supportedKeyPressUsage(code: string) {
  const value = qmkKeycodeValue(code);
  if (value === undefined) return undefined;

  const direct = qmkDirectKeycodes[value];
  if (!direct?.group || !supportedQmkGroups.has(direct.group)) return undefined;
  return value;
}

function parameterAllows(
  value: number,
  descriptions: readonly { min?: number; max?: number; values?: number[] }[],
) {
  if (descriptions.length === 0) return value === 0;

  return descriptions.some((description) => {
    if (description.values && !description.values.includes(value)) return false;
    if (description.min !== undefined && value < description.min) return false;
    if (description.max !== undefined && value > description.max) return false;
    return true;
  });
}

export function validateZmkBinding(
  binding: ZmkBehaviorBinding,
  catalog: ZmkBehaviorCatalog,
): boolean {
  if (!Number.isInteger(binding.behaviorId) || !Number.isInteger(binding.param1)) return false;
  if (!Number.isInteger(binding.param2)) return false;

  const behavior = catalog.behaviors[binding.behaviorId];
  if (!behavior) return false;

  if (
    (behavior.kind === "none" ||
      behavior.kind === "transparent" ||
      behavior.kind === "studioUnlock") &&
    (binding.param1 !== 0 || binding.param2 !== 0)
  ) {
    return false;
  }

  if (behavior.kind === "keyPress" && supportedQmkUsageName(binding.param1) === undefined) {
    return false;
  }

  if (
    (behavior.kind === "momentaryLayer" ||
      behavior.kind === "toLayer" ||
      behavior.kind === "toggleLayer") &&
    catalog.layerIndexByLayerId[binding.param1] === undefined
  ) {
    return false;
  }

  if (behavior.kind === "unknown") return true;

  const parameterSet = behavior.parameterSets[0];
  if (!parameterSet) return binding.param1 === 0 && binding.param2 === 0;

  return (
    parameterAllows(binding.param1, parameterSet.param1) &&
    parameterAllows(binding.param2, parameterSet.param2)
  );
}

function supportedQmkUsageName(value: number) {
  const direct = qmkDirectKeycodes[value];
  if (!direct?.group || !supportedQmkGroups.has(direct.group)) return undefined;
  return qmkKeycodeName(value);
}

export function decodeZmkBinding(
  binding: ZmkBehaviorBinding,
  catalog: ZmkBehaviorCatalog,
): KeyBinding {
  const behavior = catalog.behaviors[binding.behaviorId];
  if (!behavior) return { code: unknownBehaviorCode(binding) };

  if (behavior.kind === "none") return { code: "KC_NO" };
  if (behavior.kind === "transparent") return { code: "KC_TRNS" };
  if (behavior.kind === "keyPress") {
    return { code: supportedQmkUsageName(binding.param1) ?? unknownBehaviorCode(binding) };
  }

  const layerName = layerBehaviorName(behavior.kind);
  if (layerName) {
    const layerIndex = catalog.layerIndexByLayerId[binding.param1];
    return {
      code: layerIndex === undefined ? unknownBehaviorCode(binding) : `${layerName}(${layerIndex})`,
    };
  }

  return { code: unknownBehaviorCode(binding) };
}

export function encodeZmkBinding(
  binding: KeyBinding,
  catalog: ZmkBehaviorCatalog,
  layers: readonly Layer[],
): ZmkBehaviorBinding | undefined {
  const code = normalizedCode(binding.code);

  if (code === "KC_NO" || code === "XXXXXXX") return bindingForKind(catalog, "none");
  if (code === "KC_TRNS" || code === "KC_TRANSPARENT" || code === "_______") {
    return bindingForKind(catalog, "transparent");
  }

  const unknown = unknownBehaviorPattern.exec(code);
  if (unknown) {
    const next = {
      behaviorId: Number(unknown[1]),
      param1: Number(unknown[2]),
      param2: Number(unknown[3]),
    };
    return Number.isInteger(next.behaviorId) &&
      Number.isInteger(next.param1) &&
      Number.isInteger(next.param2)
      ? next
      : undefined;
  }

  const layer = layerCodePattern.exec(code);
  if (layer) {
    const kind = layerBehaviorKind(layer[1].toUpperCase());
    const layerId = layerIdForCodeLayerIndex(Number(layer[2]), catalog, layers);
    return kind && layerId !== undefined ? bindingForKind(catalog, kind, layerId) : undefined;
  }

  const usage = supportedKeyPressUsage(code);
  return usage === undefined ? undefined : bindingForKind(catalog, "keyPress", usage);
}

export function unknownBehaviorCode(binding: ZmkBehaviorBinding) {
  return `ZMK_BEHAVIOR(${binding.behaviorId},${binding.param1},${binding.param2})`;
}

export function behaviorDetails(
  id: number,
  code: string,
  displayName: string,
  kind: ZmkBehaviorKind,
  parameterSets: ZmkBehaviorDetails["parameterSets"] = [{ param1: [], param2: [] }],
): ZmkBehaviorDetails {
  return {
    code,
    displayName,
    id,
    kind,
    parameterSets,
  };
}
