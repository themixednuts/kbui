import { diffProfiles } from "./changes";
import { incompleteLogicBindingReason } from "./logic-bindings";
import { encodeZmkBinding } from "./zmk-binding";
import { type ChangeRecord, type DeviceProfile, type KeyBinding, type KeyboardKey } from "./schema";
import type { ConnectionState } from "./transport";
import type { ZmkBehaviorBinding } from "./zmk-studio";

export type ZmkChangeClassification =
  | "liveZmkWritable"
  | "firmwareRebuildRequired"
  | "sourceOnlyUnsupported"
  | "invalid";

export type ZmkClassifiedChangeKind =
  | ChangeRecord["kind"]
  | "keyOverride"
  | "layerCount"
  | "layout"
  | "matrix";

export interface ZmkLiveWriteTarget {
  binding: KeyBinding;
  code: string;
  encodedBinding: ZmkBehaviorBinding;
  keyId: string;
  keyLabel: string;
  keyPosition: number;
  laneKey: string;
  layerIndex: number;
  layerName: string;
  profileLayerId: string;
  signature: string;
  studioLayerId: number;
}

export interface ClassifiedZmkChange {
  after: string;
  before: string;
  classification: ZmkChangeClassification;
  id: string;
  kind: ZmkClassifiedChangeKind;
  liveWrite?: ZmkLiveWriteTarget;
  path: string;
  reason: string;
  scope: string;
}

const bindingFields = ["code", "tap", "hold", "macroId", "notes"] as const;

export function zmkBindingSignature(binding: KeyBinding | undefined): string {
  return bindingFields.map((field) => binding?.[field] ?? "").join("\u001f");
}

function changedBindingFields(base: KeyBinding | undefined, draft: KeyBinding | undefined) {
  return bindingFields.filter((field) => (base?.[field] ?? "") !== (draft?.[field] ?? ""));
}

function bindingChangeTarget(change: ChangeRecord) {
  if (!change.id.startsWith("binding:")) return undefined;

  const target = change.id.slice("binding:".length);
  const separator = target.indexOf(".");
  if (separator < 1 || separator === target.length - 1) return undefined;

  return {
    keyId: target.slice(separator + 1),
    layerId: target.slice(0, separator),
  };
}

function syntheticChange(
  id: string,
  kind: ZmkClassifiedChangeKind,
  path: string,
  before: string,
  after: string,
): ChangeRecord {
  return {
    id,
    kind: "metadata",
    scope: kind === "keyOverride" ? "Key Overrides" : "Device",
    path,
    before,
    after,
    staged: true,
  };
}

function layerCountSignature(profile: DeviceProfile) {
  return String(profile.layers.length);
}

function matrixSignature(profile: DeviceProfile) {
  return `${profile.matrix.rows}x${profile.matrix.cols}`;
}

function layoutSignature(keys: readonly KeyboardKey[]) {
  return JSON.stringify(
    keys.map((key) => [
      key.id,
      key.row,
      key.col,
      key.x ?? null,
      key.y ?? null,
      key.width ?? null,
      key.height ?? null,
      key.rotation ?? null,
      key.encoder ?? false,
    ]),
  );
}

function keyOverridesSignature(profile: DeviceProfile) {
  return JSON.stringify(
    profile.keyOverrides.map((override) => [
      override.id,
      override.trigger,
      override.replacement,
      override.modifiers,
    ]),
  );
}

function withClassification(
  change: ChangeRecord,
  classification: ZmkChangeClassification,
  reason: string,
  kind: ZmkClassifiedChangeKind = change.kind,
  liveWrite?: ZmkLiveWriteTarget,
): ClassifiedZmkChange {
  return {
    after: change.after,
    before: change.before,
    classification,
    id: change.id,
    kind,
    liveWrite,
    path: change.path,
    reason,
    scope: change.scope,
  };
}

function classifyBindingChange(
  base: DeviceProfile,
  draft: DeviceProfile,
  change: ChangeRecord,
  connection?: ConnectionState | null,
): ClassifiedZmkChange {
  const target = bindingChangeTarget(change);
  if (!target) {
    return withClassification(change, "invalid", "Binding change target could not be parsed.");
  }

  const layerIndex = draft.layers.findIndex((layer) => layer.id === target.layerId);
  const layer = draft.layers[layerIndex];
  const baseLayer = base.layers.find((candidate) => candidate.id === target.layerId);
  const key = draft.keys.find((candidate) => candidate.id === target.keyId);
  if (!layer || !baseLayer || !key) {
    return withClassification(change, "invalid", "Binding change target is missing.");
  }

  const baseBinding = baseLayer.bindings[target.keyId];
  const draftBinding = layer.bindings[target.keyId];
  const changedFields = changedBindingFields(baseBinding, draftBinding);
  if (changedFields.length === 0) {
    return withClassification(change, "invalid", "Binding change did not alter the profile.");
  }

  if (changedFields.some((field) => field !== "code")) {
    const localOnly = changedFields.every((field) => field === "notes");
    return withClassification(
      change,
      localOnly ? "sourceOnlyUnsupported" : "firmwareRebuildRequired",
      localOnly
        ? "Binding notes are profile metadata and are not written through ZMK Studio."
        : "Binding hold/tap/macro metadata needs generated ZMK source.",
    );
  }

  const code = draftBinding?.code;
  const incompleteLogic = code ? incompleteLogicBindingReason(draft, code) : undefined;
  if (incompleteLogic) {
    return withClassification(change, "invalid", incompleteLogic);
  }

  if (draft.firmware !== "zmk" || draft.protocol !== "zmk-studio") {
    return withClassification(
      change,
      "sourceOnlyUnsupported",
      "The active profile is not a ZMK Studio live-edit profile.",
    );
  }

  const zmk = connection?.protocol === "zmk-studio" ? connection.zmkStudio : undefined;
  if (!zmk) {
    return withClassification(
      change,
      "invalid",
      "A ZMK Studio connection is required to map layers and key positions.",
    );
  }

  if (!code) return withClassification(change, "invalid", "Binding code is missing.");

  if (/^ZMK_BEHAVIOR\(/i.test(code.trim())) {
    return withClassification(
      change,
      "sourceOnlyUnsupported",
      "Unknown ZMK behavior bindings are preserved but not edited live in this slice.",
    );
  }

  const studioLayerId = zmk.layerIdByLayerIndex[layerIndex];
  if (studioLayerId === undefined) {
    return withClassification(change, "invalid", "ZMK Studio layer id mapping is missing.");
  }

  const keyPosition = zmk.keyPositionByKeyId[target.keyId];
  if (keyPosition === undefined) {
    return withClassification(change, "invalid", "ZMK Studio key position mapping is missing.");
  }

  const encodedBinding = encodeZmkBinding(draftBinding, zmk.behaviorCatalog, draft.layers);
  if (!encodedBinding) {
    return withClassification(
      change,
      "sourceOnlyUnsupported",
      `${code} is not supported by the first ZMK Studio binding codec slice.`,
    );
  }

  const liveWrite: ZmkLiveWriteTarget = {
    binding: { ...draftBinding },
    code,
    encodedBinding,
    keyId: target.keyId,
    keyLabel: key.label,
    keyPosition,
    laneKey: `zmk:${studioLayerId}:${keyPosition}`,
    layerIndex,
    layerName: layer.name,
    profileLayerId: target.layerId,
    signature: zmkBindingSignature(draftBinding),
    studioLayerId,
  };

  return withClassification(
    change,
    "liveZmkWritable",
    "Per-key binding code is encodable as a ZMK Studio set_layer_binding write.",
    change.kind,
    liveWrite,
  );
}

export function classifyZmkChange(
  base: DeviceProfile,
  draft: DeviceProfile,
  change: ChangeRecord,
  connection?: ConnectionState | null,
): ClassifiedZmkChange {
  if (change.kind === "binding") return classifyBindingChange(base, draft, change, connection);

  if (change.id === "metadata:key-overrides") {
    return withClassification(
      change,
      "firmwareRebuildRequired",
      "Key override-like behavior is compiled ZMK source.",
      "keyOverride",
    );
  }

  if (change.id === "metadata:layer-count") {
    return withClassification(
      change,
      "firmwareRebuildRequired",
      "Changing the layer count requires ZMK devicetree or Studio layer management outside this slice.",
      "layerCount",
    );
  }

  if (change.id === "metadata:matrix") {
    return withClassification(
      change,
      "firmwareRebuildRequired",
      "Matrix metadata changes are ZMK devicetree work.",
      "matrix",
    );
  }

  if (change.id === "metadata:layout") {
    return withClassification(
      change,
      "firmwareRebuildRequired",
      "Physical layout changes require ZMK source metadata.",
      "layout",
    );
  }

  if (change.kind === "combo") {
    return withClassification(
      change,
      "firmwareRebuildRequired",
      "ZMK combo definitions are compiled firmware source.",
    );
  }

  if (change.kind === "tapDance") {
    return withClassification(
      change,
      "firmwareRebuildRequired",
      "ZMK tap-dance definitions are compiled firmware source.",
    );
  }

  if (change.kind === "macro") {
    return withClassification(
      change,
      "firmwareRebuildRequired",
      "ZMK macro definitions are compiled firmware source.",
    );
  }

  if (change.kind === "setting") {
    return withClassification(
      change,
      "firmwareRebuildRequired",
      "ZMK settings require .conf, Kconfig, devicetree, or firmware rebuild work.",
    );
  }

  if (change.kind === "metadata") {
    return withClassification(
      change,
      "firmwareRebuildRequired",
      "Device metadata changes affect ZMK source identity, protocol, layout, or layer metadata.",
    );
  }

  if (change.kind === "lighting") {
    return withClassification(
      change,
      "sourceOnlyUnsupported",
      "ZMK lighting writes are outside the first ZMK Studio live-edit slice.",
    );
  }

  return withClassification(change, "sourceOnlyUnsupported", "Change is local to the profile.");
}

export function classifyZmkProfileChanges(
  base: DeviceProfile,
  draft: DeviceProfile,
  connection?: ConnectionState | null,
): ClassifiedZmkChange[] {
  const changes = diffProfiles(base, draft);
  const synthetic: ChangeRecord[] = [];

  if (
    layerCountSignature(base) !== layerCountSignature(draft) &&
    !changes.some((change) => change.id.startsWith("metadata:layers."))
  ) {
    synthetic.push(
      syntheticChange(
        "metadata:layer-count",
        "layerCount",
        "device/layers",
        layerCountSignature(base),
        layerCountSignature(draft),
      ),
    );
  }

  if (matrixSignature(base) !== matrixSignature(draft)) {
    synthetic.push(
      syntheticChange(
        "metadata:matrix",
        "matrix",
        "device/matrix",
        matrixSignature(base),
        matrixSignature(draft),
      ),
    );
  }

  if (layoutSignature(base.keys) !== layoutSignature(draft.keys)) {
    synthetic.push(
      syntheticChange(
        "metadata:layout",
        "layout",
        "device/layout",
        `${base.keys.length} keys`,
        `${draft.keys.length} keys`,
      ),
    );
  }

  if (keyOverridesSignature(base) !== keyOverridesSignature(draft)) {
    synthetic.push(
      syntheticChange(
        "metadata:key-overrides",
        "keyOverride",
        "key-overrides",
        `${base.keyOverrides.length} override${base.keyOverrides.length === 1 ? "" : "s"}`,
        `${draft.keyOverrides.length} override${draft.keyOverrides.length === 1 ? "" : "s"}`,
      ),
    );
  }

  return [...changes, ...synthetic].map((change) =>
    classifyZmkChange(base, draft, change, connection),
  );
}

export function summarizeZmkClassifications(changes: readonly ClassifiedZmkChange[]) {
  return {
    firmwareRebuildRequired: changes.filter(
      (change) => change.classification === "firmwareRebuildRequired",
    ).length,
    invalid: changes.filter((change) => change.classification === "invalid").length,
    liveZmkWritable: changes.filter((change) => change.classification === "liveZmkWritable").length,
    sourceOnlyUnsupported: changes.filter(
      (change) => change.classification === "sourceOnlyUnsupported",
    ).length,
    total: changes.length,
  };
}
