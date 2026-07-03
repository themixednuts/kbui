import type { DeviceProfile, Layer } from "./schema";

export type LayerActivationKind =
  | "momentary"
  | "one-shot"
  | "toggle"
  | "switch"
  | "default"
  | "tap-toggle"
  | "layer-tap";

export interface ParsedLayerActivation {
  kind: LayerActivationKind;
  keycode: string;
  targetLayerIndex: number;
}

export interface LayerActivation extends ParsedLayerActivation {
  id: string;
  keyId: string;
  sourceLayerId: string;
  sourceLayerName: string;
  sourceLayerIndex: number;
  targetLayerId?: string;
  targetLayerName: string;
  chain?: LayerActivationChain;
}

export interface LayerActivationChain {
  via: LayerActivation;
  sameKey: boolean;
}

const selectorLabels: Record<LayerActivationKind, string> = {
  momentary: "MO",
  "one-shot": "OSL",
  toggle: "TG",
  switch: "TO",
  default: "DF",
  "tap-toggle": "TT",
  "layer-tap": "LT",
};

function normalizeCode(code: string) {
  return code.trim().replace(/\s+/g, "").toUpperCase();
}

function parseTargetLayer(code: string, pattern: RegExp): number | undefined {
  const match = normalizeCode(code).match(pattern);
  if (!match) return undefined;
  const layer = Number(match[1]);
  return Number.isInteger(layer) && layer >= 0 ? layer : undefined;
}

export function parseLayerActivation(code: string): ParsedLayerActivation | undefined {
  const normalized = normalizeCode(code);
  const specs: Array<[LayerActivationKind, RegExp]> = [
    ["momentary", /^MO\((\d+)\)$/],
    ["one-shot", /^OSL\((\d+)\)$/],
    ["toggle", /^TG\((\d+)\)$/],
    ["switch", /^TO\((\d+)\)$/],
    ["default", /^DF\((\d+)\)$/],
    ["tap-toggle", /^TT\((\d+)\)$/],
    ["layer-tap", /^LT\((\d+),.+\)$/],
  ];

  for (const [kind, pattern] of specs) {
    const targetLayerIndex = parseTargetLayer(normalized, pattern);
    if (targetLayerIndex === undefined) continue;
    return { kind, keycode: normalized, targetLayerIndex };
  }

  return undefined;
}

function targetLayerLabel(layers: Layer[], index: number) {
  return layers[index]?.name ?? `Layer ${index}`;
}

function activationFromBinding(
  layers: Layer[],
  sourceLayer: Layer,
  sourceLayerIndex: number,
  keyId: string,
  code: string,
): LayerActivation | undefined {
  const parsed = parseLayerActivation(code);
  if (!parsed) return undefined;

  return {
    ...parsed,
    id: `${sourceLayer.id}:${keyId}:${parsed.keycode}`,
    keyId,
    sourceLayerId: sourceLayer.id,
    sourceLayerName: sourceLayer.name,
    sourceLayerIndex,
    targetLayerId: layers[parsed.targetLayerIndex]?.id,
    targetLayerName: targetLayerLabel(layers, parsed.targetLayerIndex),
  };
}

export function layerActivations(profile: Pick<DeviceProfile, "layers">): LayerActivation[] {
  return profile.layers.flatMap((layer, sourceLayerIndex) =>
    Object.entries(layer.bindings)
      .map(([keyId, binding]) =>
        activationFromBinding(profile.layers, layer, sourceLayerIndex, keyId, binding.code),
      )
      .filter((activation): activation is LayerActivation => Boolean(activation)),
  );
}

export function layerActivationsForLayer(
  profile: Pick<DeviceProfile, "layers">,
  sourceLayerId: string,
): LayerActivation[] {
  const allActivations = layerActivations(profile);
  const layerIndex = profile.layers.findIndex((layer) => layer.id === sourceLayerId);
  const layer = profile.layers[layerIndex];
  if (!layer) return [];

  const inbound = allActivations.filter(
    (activation) => activation.targetLayerId === layer.id && activation.sourceLayerId !== layer.id,
  );

  return allActivations
    .filter((activation) => activation.sourceLayerId === layer.id)
    .map((activation) => ({
      ...activation,
      chain: inbound
        .filter((candidate) => candidate.keyId === activation.keyId)
        .map((candidate) => ({ via: candidate, sameKey: true }))[0],
    }));
}

export function layerActivationsByKey(
  activations: LayerActivation[],
): Map<string, LayerActivation[]> {
  const byKey = new Map<string, LayerActivation[]>();
  for (const activation of activations) {
    const current = byKey.get(activation.keyId);
    if (current) current.push(activation);
    else byKey.set(activation.keyId, [activation]);
  }
  return byKey;
}

export function layerActivationMarkerText(activations: LayerActivation[]) {
  if (activations.length === 0) return "";
  if (activations.length > 1) return "L+";
  return `L${activations[0].targetLayerIndex}`;
}

export function layerActivationSummary(activation: LayerActivation) {
  const label = selectorLabels[activation.kind];
  const base = `${activation.sourceLayerName}: ${label} -> ${activation.targetLayerName} (${activation.keycode})`;
  if (!activation.chain) return base;

  const viaLabel = selectorLabels[activation.chain.via.kind];
  return `${base}\nChain risk: ${activation.chain.via.sourceLayerName} ${viaLabel} -> ${activation.sourceLayerName}, then this key reaches ${activation.targetLayerName}.`;
}
