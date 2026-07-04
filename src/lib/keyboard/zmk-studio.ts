import type { DeviceProfile, KeyboardKey } from "./schema";

export type ZmkLockState = "locked" | "unlocked";
export type ZmkTransportMode = "real" | "mock";

export interface ZmkBehaviorBinding {
  behaviorId: number;
  param1: number;
  param2: number;
}

export type ZmkBehaviorKind =
  | "keyPress"
  | "transparent"
  | "none"
  | "momentaryLayer"
  | "toLayer"
  | "toggleLayer"
  | "studioUnlock"
  | "unknown";

export interface ZmkParameterDescription {
  name: string;
  min?: number;
  max?: number;
  values?: number[];
}

export interface ZmkBehaviorDetails {
  id: number;
  code: string;
  displayName: string;
  kind: ZmkBehaviorKind;
  parameterSets: Array<{
    param1: ZmkParameterDescription[];
    param2: ZmkParameterDescription[];
  }>;
}

export interface ZmkBehaviorCatalog {
  behaviors: Record<number, ZmkBehaviorDetails>;
  idsByKind: Partial<Record<ZmkBehaviorKind, number>>;
  layerIdByLayerIndex: number[];
  layerIndexByLayerId: Record<number, number>;
}

export interface ZmkPhysicalLayoutKey extends KeyboardKey {
  keyPosition: number;
}

export interface ZmkPhysicalLayout {
  id: number;
  name: string;
  keys: ZmkPhysicalLayoutKey[];
}

export interface ZmkKeymapLayer {
  id: number;
  name: string;
  bindings: ZmkBehaviorBinding[];
}

export interface ZmkStudioKeymap {
  availableLayers: number;
  layers: ZmkKeymapLayer[];
}

export type ZmkSetLayerBindingStatus =
  | "ok"
  | "locked"
  | "invalid-location"
  | "invalid-behavior"
  | "invalid-parameters"
  | "error";

export type ZmkSaveChangesStatus = "ok" | "no-space" | "error";

export type ZmkStudioRequest =
  | { type: "get_device_info" }
  | { type: "get_lock_state" }
  | { type: "list_all_behaviors" }
  | { type: "get_behavior_details"; behaviorId: number }
  | { type: "get_physical_layouts" }
  | { type: "get_keymap" }
  | {
      type: "set_layer_binding";
      binding: ZmkBehaviorBinding;
      keyPosition: number;
      layerId: number;
    }
  | { type: "check_unsaved_changes" }
  | { type: "save_changes" }
  | { type: "discard_changes" }
  | { type: "reset_settings" };

export type ZmkStudioResponse =
  | {
      type: "get_device_info";
      deviceName: string;
      firmwareVersion: string;
      manufacturer: string;
      serialNumber: string;
    }
  | { type: "get_lock_state"; lockState: ZmkLockState }
  | { type: "list_all_behaviors"; behaviorIds: number[] }
  | { type: "get_behavior_details"; behavior: ZmkBehaviorDetails }
  | {
      type: "get_physical_layouts";
      activeLayoutIndex: number;
      layouts: ZmkPhysicalLayout[];
    }
  | { type: "get_keymap"; keymap: ZmkStudioKeymap }
  | { type: "set_layer_binding"; status: ZmkSetLayerBindingStatus }
  | { type: "check_unsaved_changes"; hasUnsavedChanges: boolean }
  | { type: "save_changes"; status: ZmkSaveChangesStatus }
  | { type: "discard_changes"; status: "ok" | "error" }
  | { type: "reset_settings"; status: "ok" | "error" };

export interface ZmkStudioConnection {
  label: string;
  mode: ZmkTransportMode;
  lockState: ZmkLockState;
  behaviorCatalog: ZmkBehaviorCatalog;
  layerIdByLayerIndex: number[];
  keyPositionByKeyId: Record<string, number>;
  keymap?: ZmkStudioKeymap;
  call: (request: ZmkStudioRequest) => Promise<ZmkStudioResponse>;
  close: () => Promise<void>;
}

export function createZmkBehaviorCatalog(
  behaviors: readonly ZmkBehaviorDetails[],
  layerIdByLayerIndex: readonly number[] = [],
): ZmkBehaviorCatalog {
  const behaviorEntries = behaviors.map((behavior) => [behavior.id, behavior] as const);
  const idsByKind: Partial<Record<ZmkBehaviorKind, number>> = {};

  for (const behavior of behaviors) {
    idsByKind[behavior.kind] ??= behavior.id;
  }

  const layers = [...layerIdByLayerIndex];
  return {
    behaviors: Object.fromEntries(behaviorEntries),
    idsByKind,
    layerIdByLayerIndex: layers,
    layerIndexByLayerId: Object.fromEntries(layers.map((layerId, index) => [layerId, index])),
  };
}

export function cloneZmkBinding(binding: ZmkBehaviorBinding): ZmkBehaviorBinding {
  return {
    behaviorId: binding.behaviorId,
    param1: binding.param1,
    param2: binding.param2,
  };
}

export function cloneZmkKeymap(keymap: ZmkStudioKeymap): ZmkStudioKeymap {
  return {
    availableLayers: keymap.availableLayers,
    layers: keymap.layers.map((layer) => ({
      id: layer.id,
      name: layer.name,
      bindings: layer.bindings.map(cloneZmkBinding),
    })),
  };
}

export function zmkBindingsEqual(left: ZmkBehaviorBinding, right: ZmkBehaviorBinding) {
  return (
    left.behaviorId === right.behaviorId &&
    left.param1 === right.param1 &&
    left.param2 === right.param2
  );
}

export function zmkProfileLayerId(studioLayerId: number) {
  return `zmk-layer-${studioLayerId}`;
}

export function zmkProfileLayerIndex(profile: Pick<DeviceProfile, "layers">, layerId: string) {
  return profile.layers.findIndex((layer) => layer.id === layerId);
}
