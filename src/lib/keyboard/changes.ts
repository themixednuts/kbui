import type { ChangeRecord, Combo, DeviceProfile, KeyBinding, Macro, TapDance } from "./schema";

function stableValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === undefined || value === null) return "";

  return JSON.stringify(value);
}

function bindingLabel(binding?: KeyBinding): string {
  if (!binding) return "KC_NO";

  const parts = [binding.code];
  if (binding.tap) parts.push(`tap:${binding.tap}`);
  if (binding.hold) parts.push(`hold:${binding.hold}`);
  if (binding.macroId) parts.push(`macro:${binding.macroId}`);
  if (binding.notes) parts.push(`notes:${binding.notes}`);
  return parts.join(" ");
}

function comboLabel(combo: Combo): string {
  const layerScope = combo.layerIds?.length ? ` [${combo.layerIds.join(", ")}]` : " [all layers]";
  return `${combo.name}: ${combo.keys.join("+")} -> ${combo.binding}${layerScope}`;
}

function macroLabel(macro: Macro): string {
  return `${macro.name}: ${macro.sequence.join(" + ")} (${macro.trigger})`;
}

function tapDanceLabel(dance: TapDance): string {
  return `${dance.keyId}: tap ${dance.tap} hold ${dance.hold} double ${dance.doubleTap}`;
}

function changeId(kind: string, path: string): string {
  return `${kind}:${path}`;
}

export function diffProfiles(base: DeviceProfile, draft: DeviceProfile): ChangeRecord[] {
  const changes: ChangeRecord[] = [];

  for (const layer of draft.layers) {
    const baseLayer = base.layers.find((candidate) => candidate.id === layer.id);

    if (!baseLayer) {
      changes.push({
        id: changeId("metadata", `layers.${layer.id}`),
        kind: "metadata",
        scope: layer.name,
        path: `layers/${layer.name}`,
        before: "",
        after: "added layer",
        staged: true,
      });
      continue;
    }

    for (const [keyId, binding] of Object.entries(layer.bindings)) {
      const before = bindingLabel(baseLayer.bindings[keyId]);
      const after = bindingLabel(binding);

      if (before !== after) {
        changes.push({
          id: changeId("binding", `${layer.id}.${keyId}`),
          kind: "binding",
          scope: layer.name,
          path: `layers/${layer.name}/${keyId}`,
          before,
          after,
          staged: true,
        });
      }
    }
  }

  for (const macro of draft.macros) {
    const before = base.macros.find((candidate) => candidate.id === macro.id);

    if (!before) {
      changes.push({
        id: changeId("macro", macro.id),
        kind: "macro",
        scope: "Macros",
        path: `macros/${macro.name}`,
        before: "",
        after: macro.sequence.join(" + "),
        staged: true,
      });
      continue;
    }

    if (macroLabel(before) !== macroLabel(macro)) {
      changes.push({
        id: changeId("macro", macro.id),
        kind: "macro",
        scope: "Macros",
        path: `macros/${macro.name}`,
        before: macroLabel(before),
        after: macroLabel(macro),
        staged: true,
      });
    }
  }

  for (const macro of base.macros) {
    if (draft.macros.some((candidate) => candidate.id === macro.id)) continue;
    changes.push({
      id: changeId("macro", macro.id),
      kind: "macro",
      scope: "Macros",
      path: `macros/${macro.name}`,
      before: macroLabel(macro),
      after: "removed",
      staged: true,
    });
  }

  for (const combo of draft.combos) {
    const before = base.combos.find((candidate) => candidate.id === combo.id);

    if (!before || comboLabel(before) !== comboLabel(combo)) {
      changes.push({
        id: changeId("combo", combo.id),
        kind: "combo",
        scope: "Combos",
        path: `combos/${combo.name}`,
        before: before ? comboLabel(before) : "",
        after: comboLabel(combo),
        staged: true,
      });
    }
  }

  for (const combo of base.combos) {
    if (draft.combos.some((candidate) => candidate.id === combo.id)) continue;
    changes.push({
      id: changeId("combo", combo.id),
      kind: "combo",
      scope: "Combos",
      path: `combos/${combo.name}`,
      before: comboLabel(combo),
      after: "removed",
      staged: true,
    });
  }

  for (const dance of draft.tapDances) {
    const before = base.tapDances.find((candidate) => candidate.id === dance.id);

    if (!before || tapDanceLabel(before) !== tapDanceLabel(dance)) {
      changes.push({
        id: changeId("tapDance", dance.id),
        kind: "tapDance",
        scope: "Tap Dances",
        path: `tap-dances/${dance.keyId}`,
        before: before ? tapDanceLabel(before) : "",
        after: tapDanceLabel(dance),
        staged: true,
      });
    }
  }

  for (const dance of base.tapDances) {
    if (draft.tapDances.some((candidate) => candidate.id === dance.id)) continue;
    changes.push({
      id: changeId("tapDance", dance.id),
      kind: "tapDance",
      scope: "Tap Dances",
      path: `tap-dances/${dance.keyId}`,
      before: tapDanceLabel(dance),
      after: "removed",
      staged: true,
    });
  }

  for (const [key, value] of Object.entries(draft.settings)) {
    const before = stableValue(base.settings[key as keyof typeof base.settings]);
    const after = stableValue(value);

    if (before !== after) {
      changes.push({
        id: changeId("setting", key),
        kind: "setting",
        scope: "Behavior",
        path: `settings/${key}`,
        before,
        after,
        staged: true,
      });
    }
  }

  for (const key of ["mode", "hue", "saturation", "brightness", "speed"] as const) {
    const before = stableValue(base.lighting[key]);
    const after = stableValue(draft.lighting[key]);

    if (before !== after) {
      changes.push({
        id: changeId("lighting", key),
        kind: "lighting",
        scope: "RGB",
        path: `lighting/${key}`,
        before,
        after,
        staged: true,
      });
    }
  }

  const keyIds = new Set([
    ...Object.keys(base.lighting.keys ?? {}),
    ...Object.keys(draft.lighting.keys ?? {}),
  ]);
  for (const keyId of keyIds) {
    const before = stableValue(base.lighting.keys?.[keyId]);
    const after = stableValue(draft.lighting.keys?.[keyId]);
    if (before === after) continue;
    changes.push({
      id: changeId("lighting-key", keyId),
      kind: "lighting",
      scope: "RGB",
      path: `lighting/keys/${keyId}`,
      before,
      after,
      staged: true,
    });
  }

  if (
    base.name !== draft.name ||
    base.firmware !== draft.firmware ||
    base.protocol !== draft.protocol
  ) {
    changes.push({
      id: changeId("metadata", "device"),
      kind: "metadata",
      scope: "Device",
      path: "device/profile",
      before: `${base.name} ${base.firmware} ${base.protocol}`,
      after: `${draft.name} ${draft.firmware} ${draft.protocol}`,
      staged: true,
    });
  }

  return changes;
}

export function summarizeDiff(changes: ChangeRecord[]) {
  return {
    total: changes.length,
    bindings: changes.filter((change) => change.kind === "binding").length,
    logic: changes.filter(
      (change) => change.kind === "macro" || change.kind === "combo" || change.kind === "tapDance",
    ).length,
    firmware: changes.filter((change) => change.kind === "setting" || change.kind === "metadata")
      .length,
  };
}

export function qmkSnippet(device: DeviceProfile, layerId: string, keyId: string): string {
  const layerIndex = device.layers.findIndex((layer) => layer.id === layerId);
  const layer = device.layers[layerIndex] ?? device.layers[0];
  const binding = layer.bindings[keyId];
  const key = device.keys.find((candidate) => candidate.id === keyId);

  if (!key || !binding) return "";

  return [
    `// ${device.name} / ${layer.name}`,
    `// matrix[${key.row}][${key.col}] ${key.label}`,
    `[_${layer.name.toUpperCase()}] = LAYOUT(`,
    `  ${binding.code}${binding.tap ? `, // tap ${binding.tap}` : ""}${binding.hold ? `, hold ${binding.hold}` : ""}`,
    `);`,
  ].join("\n");
}
