import type { KeyLighting } from "./schema";

export type LightingSwatchId = "white" | "coral" | "teal" | "mint" | "lilac" | "mustard" | "off";

export interface LightingSwatch {
  id: LightingSwatchId;
  label: string;
  displayColor: string;
  keyLighting: KeyLighting;
  off?: boolean;
}

export const lightingSwatches: readonly LightingSwatch[] = [
  {
    id: "white",
    label: "White",
    displayColor: "oklch(0.90 0.03 90)",
    keyLighting: { hue: 90, saturation: 15, brightness: 100 },
  },
  {
    id: "coral",
    label: "Coral",
    displayColor: "oklch(0.72 0.17 32)",
    keyLighting: { hue: 32, saturation: 85, brightness: 72 },
  },
  {
    id: "teal",
    label: "Teal",
    displayColor: "oklch(0.72 0.12 195)",
    keyLighting: { hue: 195, saturation: 60, brightness: 72 },
  },
  {
    id: "mint",
    label: "Mint",
    displayColor: "oklch(0.80 0.12 155)",
    keyLighting: { hue: 155, saturation: 60, brightness: 100 },
  },
  {
    id: "lilac",
    label: "Lilac",
    displayColor: "oklch(0.76 0.11 305)",
    keyLighting: { hue: 305, saturation: 55, brightness: 86 },
  },
  {
    id: "mustard",
    label: "Mustard",
    displayColor: "oklch(0.82 0.12 90)",
    keyLighting: { hue: 90, saturation: 60, brightness: 100 },
  },
  {
    id: "off",
    label: "Off",
    displayColor: "#1b1917",
    keyLighting: { hue: 0, saturation: 0, brightness: 0 },
    off: true,
  },
];

export const defaultLightingSwatchId: LightingSwatchId = "teal";

export function lightingSwatchById(id: LightingSwatchId): LightingSwatch {
  return lightingSwatches.find((swatch) => swatch.id === id) ?? lightingSwatches[0];
}

export function swatchToKeyLighting(swatch: LightingSwatch | LightingSwatchId): KeyLighting {
  const resolved = typeof swatch === "string" ? lightingSwatchById(swatch) : swatch;
  return { ...resolved.keyLighting };
}

export function keyLightingFromSwatchId(id: LightingSwatchId): KeyLighting {
  return swatchToKeyLighting(id);
}

export function keyLightingEquals(left: KeyLighting | undefined, right: KeyLighting | undefined) {
  if (!left || !right) return left === right;
  return (
    left.hue === right.hue &&
    left.saturation === right.saturation &&
    left.brightness === right.brightness
  );
}

export function swatchIdForKeyLighting(lighting: KeyLighting | undefined): LightingSwatchId | null {
  if (!lighting) return null;
  if (lighting.brightness <= 0) return "off";

  return (
    lightingSwatches.find((swatch) => keyLightingEquals(swatch.keyLighting, lighting))?.id ?? null
  );
}
