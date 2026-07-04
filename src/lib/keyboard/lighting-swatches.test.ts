import { describe, expect, it } from "vite-plus/test";

import { keyLightingToCss } from "$lib/components/board/board-view-model";

import {
  keyLightingEquals,
  lightingSwatches,
  swatchIdForKeyLighting,
  swatchToKeyLighting,
} from "./lighting-swatches";

describe("lighting swatches", () => {
  it("round-trips every design swatch through the engine KeyLighting model", () => {
    for (const swatch of lightingSwatches) {
      const lighting = swatchToKeyLighting(swatch);

      expect(lighting).not.toBe(swatch.keyLighting);
      expect(keyLightingEquals(lighting, swatch.keyLighting)).toBe(true);
      expect(swatchIdForKeyLighting(lighting)).toBe(swatch.id);
    }
  });

  it("renders applied engine lighting back through the board OKLCH conversion", () => {
    expect(keyLightingToCss(swatchToKeyLighting("coral"))).toBe("oklch(0.722 0.170 32)");
    expect(keyLightingToCss(swatchToKeyLighting("teal"))).toBe("oklch(0.722 0.120 195)");
    expect(keyLightingToCss(swatchToKeyLighting("off"))).toBeNull();
  });
});
