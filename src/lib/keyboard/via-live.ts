import { diffProfiles } from "./changes";
import {
  defaultLiveSyncLocalOnlyCategory,
  type LiveSyncChangeOutcome,
  type LiveSyncLocalOnlyCategory,
} from "./live-sync-classification";
import { incompleteLogicBindingReason } from "./logic-bindings";
import {
  qmkKeycodeValue,
  type ChangeRecord,
  type DeviceProfile,
  type KeyBinding,
  type KeyboardKey,
} from "./schema";

export type ViaChangeClassification =
  | "liveViaWritable"
  | "firmwareRebuildRequired"
  | "localOnly"
  | "invalid";

export type ViaClassifiedChangeKind =
  | ChangeRecord["kind"]
  | "keyOverride"
  | "layerCount"
  | "layout"
  | "matrix";

export interface ViaLiveWriteTarget {
  binding: KeyBinding;
  code: string;
  col: number;
  keyId: string;
  keyLabel: string;
  keycode: number;
  laneKey: string;
  layerId: string;
  layerIndex: number;
  layerName: string;
  row: number;
  signature: string;
}

export interface ClassifiedViaChange {
  after: string;
  before: string;
  classification: ViaChangeClassification;
  id: string;
  kind: ViaClassifiedChangeKind;
  live: boolean;
  liveWrite?: ViaLiveWriteTarget;
  localOnlyCategory?: LiveSyncLocalOnlyCategory;
  outcome: LiveSyncChangeOutcome;
  path: string;
  reason: string;
  scope: string;
}

const bindingFields = ["code", "tap", "hold", "macroId", "notes"] as const;

export function bindingSignature(binding: KeyBinding | undefined): string {
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
  kind: ViaClassifiedChangeKind,
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
  classification: ViaChangeClassification,
  reason: string,
  kind: ViaClassifiedChangeKind = change.kind,
  liveWrite?: ViaLiveWriteTarget,
  localOnlyCategory = defaultLiveSyncLocalOnlyCategory(kind),
): ClassifiedViaChange {
  const outcome = viaOutcomeFor(classification, reason, localOnlyCategory);

  return {
    after: change.after,
    before: change.before,
    classification,
    id: change.id,
    kind,
    live: outcome.live,
    liveWrite,
    localOnlyCategory: outcome.status === "local-only" ? outcome.category : undefined,
    outcome,
    path: change.path,
    reason,
    scope: change.scope,
  };
}

function viaOutcomeFor(
  classification: ViaChangeClassification,
  reason: string,
  localOnlyCategory: LiveSyncLocalOnlyCategory,
): LiveSyncChangeOutcome {
  if (classification === "liveViaWritable") return { live: true, reason, status: "live" };
  if (classification === "firmwareRebuildRequired") {
    return { live: false, reason, status: "rebuild-required" };
  }
  if (classification === "invalid") return { live: false, reason, status: "invalid" };
  return { category: localOnlyCategory, live: false, reason, status: "local-only" };
}

function classifyBindingChange(
  base: DeviceProfile,
  draft: DeviceProfile,
  change: ChangeRecord,
): ClassifiedViaChange {
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
      localOnly ? "localOnly" : "firmwareRebuildRequired",
      localOnly
        ? "Binding notes are local profile metadata and are not written to the device."
        : "Binding hold/tap/macro metadata needs generated firmware source.",
      change.kind,
      undefined,
      localOnly ? "metadata" : "bindings",
    );
  }

  const code = draftBinding?.code;
  const incompleteLogic = code ? incompleteLogicBindingReason(draft, code) : undefined;
  if (incompleteLogic) {
    return withClassification(change, "invalid", incompleteLogic);
  }

  if (draft.protocol !== "via-v3") {
    return withClassification(
      change,
      draft.firmware === "qmk" ? "firmwareRebuildRequired" : "localOnly",
      draft.firmware === "qmk"
        ? "The active profile is not a generic VIA live-edit profile."
        : "This profile is not a generic VIA live-edit profile, so the edit stays local only.",
    );
  }

  const keycode = code ? qmkKeycodeValue(code) : undefined;
  if (keycode === undefined) {
    return withClassification(
      change,
      "localOnly",
      `${code ?? "The binding"} cannot be encoded as a VIA keycode, so it was applied locally only.`,
      change.kind,
      undefined,
      "bindings",
    );
  }

  if (layerIndex > 0xff || key.row > 0xff || key.col > 0xff || keycode > 0xffff) {
    return withClassification(change, "invalid", "VIA keymap coordinates exceed protocol limits.");
  }

  const liveWrite: ViaLiveWriteTarget = {
    binding: { ...draftBinding },
    code,
    col: key.col,
    keyId: target.keyId,
    keyLabel: key.label,
    keycode,
    laneKey: `${layerIndex}:${key.row}:${key.col}`,
    layerId: target.layerId,
    layerIndex,
    layerName: layer.name,
    row: key.row,
    signature: bindingSignature(draftBinding),
  };

  return withClassification(
    change,
    "liveViaWritable",
    "Per-key binding code is encodable as a VIA dynamic keymap write.",
    change.kind,
    liveWrite,
  );
}

export function classifyViaChange(
  base: DeviceProfile,
  draft: DeviceProfile,
  change: ChangeRecord,
): ClassifiedViaChange {
  if (change.kind === "binding") return classifyBindingChange(base, draft, change);

  if (change.id === "metadata:key-overrides") {
    return withClassification(
      change,
      "firmwareRebuildRequired",
      "Key override definitions are compiled firmware source.",
      "keyOverride",
    );
  }

  if (change.id === "metadata:layer-count") {
    return withClassification(
      change,
      "firmwareRebuildRequired",
      "Changing the layer count changes compiled firmware metadata.",
      "layerCount",
    );
  }

  if (change.id === "metadata:matrix") {
    return withClassification(
      change,
      "firmwareRebuildRequired",
      "Matrix dimensions are compiled firmware metadata.",
      "matrix",
    );
  }

  if (change.id === "metadata:layout") {
    return withClassification(
      change,
      "firmwareRebuildRequired",
      "Physical layout changes require regenerated firmware metadata.",
      "layout",
    );
  }

  if (change.kind === "combo") {
    return withClassification(
      change,
      "firmwareRebuildRequired",
      "Combo definitions are compiled firmware source.",
    );
  }

  if (change.kind === "tapDance") {
    return withClassification(
      change,
      "firmwareRebuildRequired",
      "Tap dance definitions are compiled firmware source.",
    );
  }

  if (change.kind === "macro") {
    return withClassification(
      change,
      "firmwareRebuildRequired",
      "Macro definitions are compiled firmware source until VIA dynamic macro serialization exists.",
    );
  }

  if (change.kind === "setting") {
    return withClassification(
      change,
      "firmwareRebuildRequired",
      "Firmware behavior settings require a firmware rebuild.",
    );
  }

  if (change.kind === "metadata") {
    return withClassification(
      change,
      "firmwareRebuildRequired",
      "Device metadata changes affect firmware identity, protocol, layout, or layer metadata.",
    );
  }

  if (change.kind === "lighting") {
    return withClassification(
      change,
      "localOnly",
      "VIA lighting is not writable over this transport.",
      change.kind,
      undefined,
      "lighting",
    );
  }

  return withClassification(
    change,
    "localOnly",
    "This change is local profile data and is not written to the device.",
  );
}

export function classifyViaProfileChanges(
  base: DeviceProfile,
  draft: DeviceProfile,
): ClassifiedViaChange[] {
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

  return [...changes, ...synthetic].map((change) => classifyViaChange(base, draft, change));
}

export function summarizeViaClassifications(changes: readonly ClassifiedViaChange[]) {
  return {
    firmwareRebuildRequired: changes.filter(
      (change) => change.classification === "firmwareRebuildRequired",
    ).length,
    invalid: changes.filter((change) => change.classification === "invalid").length,
    liveViaWritable: changes.filter((change) => change.classification === "liveViaWritable").length,
    localOnly: changes.filter((change) => change.classification === "localOnly").length,
    total: changes.length,
  };
}
