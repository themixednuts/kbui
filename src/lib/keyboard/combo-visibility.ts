import type { Combo, DeviceProfile, KeyboardKey } from "./schema";

type ComboProfile = Pick<DeviceProfile, "combos" | "keys" | "layers">;
type ComboEnumerationProfile = Pick<DeviceProfile, "combos" | "firmware" | "protocol">;

function labelForKey(keys: KeyboardKey[], keyId: string) {
  return keys.find((key) => key.id === keyId)?.label ?? keyId;
}

function keyLocationLabel(key: KeyboardKey | undefined, keyId: string) {
  if (!key) return keyId;
  if (/^R\d+C\d+$/i.test(key.label)) return `row ${key.row + 1} col ${key.col + 1}`;
  return key.label;
}

export function combosForKey(profile: Pick<DeviceProfile, "combos">, keyId: string): Combo[] {
  return combosForKeyOnLayer(profile, keyId);
}

export function comboAppliesToLayer(combo: Combo, layerId?: string) {
  return !layerId || !combo.layerIds?.length || combo.layerIds.includes(layerId);
}

export function combosForKeyOnLayer(
  profile: Pick<DeviceProfile, "combos">,
  keyId: string,
  layerId?: string,
): Combo[] {
  return profile.combos.filter(
    (combo) => combo.keys.includes(keyId) && comboAppliesToLayer(combo, layerId),
  );
}

export function comboMarkerText(count: number) {
  if (count <= 0) return "";
  return count === 1 ? "C" : `C${count}`;
}

function comboLayerId(combo: Combo, preferredLayerId?: string) {
  if (preferredLayerId && comboAppliesToLayer(combo, preferredLayerId) && combo.layerIds?.length) {
    return preferredLayerId;
  }
  return combo.layerIds?.[0];
}

export function comboLayerScopeLabel(
  profile: Pick<DeviceProfile, "layers">,
  combo: Pick<Combo, "layerIds">,
) {
  if (!combo.layerIds?.length) return "All layers";

  return combo.layerIds
    .map((layerId) => profile.layers.find((layer) => layer.id === layerId)?.name ?? layerId)
    .join(", ");
}

export function comboDisplayLayerId(
  profile: Pick<DeviceProfile, "layers">,
  combo: Pick<Combo, "layerIds">,
  preferredLayerId?: string,
) {
  if (preferredLayerId && combo.layerIds?.includes(preferredLayerId)) return preferredLayerId;
  return combo.layerIds?.[0] ?? profile.layers[0]?.id;
}

export function comboKeyOptionLabel(
  profile: Pick<DeviceProfile, "keys" | "layers">,
  combo: Pick<Combo, "layerIds">,
  keyId: string,
  displayCode: (code: string) => string = (code) => code,
  preferredLayerId?: string,
) {
  const layerId = comboDisplayLayerId(profile, combo, preferredLayerId);
  const layer = profile.layers.find((candidate) => candidate.id === layerId);
  const key = profile.keys.find((candidate) => candidate.id === keyId);
  const code = layer?.bindings[keyId]?.code;
  const primary = code ? displayCode(code) : (key?.label ?? keyId);
  const location = keyLocationLabel(key, keyId);

  return {
    primary,
    detail: layer ? `${layer.name} · ${location}` : location,
    layerId,
    layerName: layer?.name,
  };
}

export function comboChordLabels(
  profile: Pick<DeviceProfile, "keys" | "layers">,
  combo: Combo,
  displayCode: (code: string) => string = (code) => code,
  preferredLayerId?: string,
) {
  const layer = profile.layers.find(
    (candidate) => candidate.id === comboLayerId(combo, preferredLayerId),
  );

  return combo.keys.map((keyId) => {
    const code = layer?.bindings[keyId]?.code;
    return code ? displayCode(code) : labelForKey(profile.keys, keyId);
  });
}

export function comboSummaryForKey(
  profile: ComboProfile,
  keyId: string,
  displayCode: (code: string) => string = (code) => code,
  layerId?: string,
) {
  return combosForKeyOnLayer(profile, keyId, layerId)
    .map((combo) => {
      const chord = comboChordLabels(profile, combo, displayCode, layerId).join(" + ");
      return `${combo.name}: ${chord} -> ${displayCode(combo.binding)}`;
    })
    .join("\n");
}

export function viaComboDefinitionsUnavailable(
  profile: ComboEnumerationProfile,
  connected: boolean,
) {
  return (
    connected &&
    profile.firmware === "qmk" &&
    profile.protocol === "via-v3" &&
    profile.combos.length === 0
  );
}
