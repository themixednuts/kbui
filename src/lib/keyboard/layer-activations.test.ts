import { describe, expect, it } from "vite-plus/test";

import {
  layerActivationMarkerText,
  layerActivationSummary,
  layerActivationsByKey,
  layerActivationsForLayer,
  parseLayerActivation,
} from "./layer-activations";
import type { DeviceProfile, Layer } from "./schema";

function layer(id: string, name: string, bindings: Layer["bindings"]): Layer {
  return {
    id,
    name,
    color: "#999999",
    bindings,
  };
}

describe("layer activations", () => {
  it("parses QMK layer selector keycodes", () => {
    expect(parseLayerActivation("OSL(3)")).toMatchObject({
      kind: "one-shot",
      targetLayerIndex: 3,
    });
    expect(parseLayerActivation("LT(2, KC_SPC)")).toMatchObject({
      kind: "layer-tap",
      targetLayerIndex: 2,
    });
    expect(parseLayerActivation("KC_A")).toBeUndefined();
  });

  it("marks same-key layer chains as a chain risk", () => {
    const profile = {
      layers: [
        layer("base", "Base", {
          "k3-0": { code: "OSL(1)" },
          "k7-0": { code: "OSL(2)" },
        }),
        layer("layer-1", "Numeral", {
          "k7-0": { code: "KC_0" },
        }),
        layer("layer-2", "Symbols", {
          "k7-0": { code: "OSL(3)" },
        }),
        layer("layer-3", "Navigation", {}),
      ],
    } satisfies Pick<DeviceProfile, "layers">;

    const activations = layerActivationsForLayer(profile, "layer-2");
    const byKey = layerActivationsByKey(activations);
    const rightThumb = byKey.get("k7-0") ?? [];

    expect(layerActivationMarkerText(rightThumb)).toBe("L3");
    expect(rightThumb[0]).toMatchObject({
      sourceLayerName: "Symbols",
      targetLayerName: "Navigation",
      chain: {
        sameKey: true,
        via: {
          sourceLayerName: "Base",
          targetLayerName: "Symbols",
        },
      },
    });
    expect(layerActivationSummary(rightThumb[0])).toContain("Chain risk: Base OSL -> Symbols");
  });
});
