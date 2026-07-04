import { describe, expect, it } from "vite-plus/test";

import {
  cloneDevice,
  sampleKeyboard,
  type DeviceProfile,
  type KeyboardKey,
} from "$lib/keyboard/schema";

import {
  computeBoardUnit,
  createBoardViewModel,
  keyLightingToCss,
  type BoardKeyViewModel,
} from "./board-view-model";

function key(modelKeys: readonly BoardKeyViewModel[], id: string) {
  const found = modelKeys.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Missing render key ${id}`);
  return found;
}

describe("board view model", () => {
  it("computes non-positioned sample-keyboard geometry without overlapping wide keys", () => {
    const model = createBoardViewModel({
      profile: sampleKeyboard,
      activeLayer: "base",
      lens: "keys",
    });

    expect(model.positioned).toBe(false);
    expect(model.rows).toHaveLength(5);
    expect(model.bounds).toEqual({ width: 16, height: 5 });
    expect(key(model.keys, "k4-3")).toMatchObject({ x: 3, width: 6 });
    expect(key(model.keys, "k4-4")).toMatchObject({ x: 9, width: 1 });
  });

  it("resolves active-layer transparent keys to base bindings when fall-through is shown", () => {
    const model = createBoardViewModel({
      profile: sampleKeyboard,
      activeLayer: "fn",
      lens: "keys",
      showFallthrough: true,
    });
    const space = key(model.keys, "k4-3");

    expect(space.rawCode).toBe("KC_TRNS");
    expect(space.fallThrough).toBe(true);
    expect(space.empty).toBe(false);
    expect(space.sourceLayerId).toBe("base");
    expect(space.sourceLabel).toBe("Base");
  });

  it("keeps transparent keys visually empty when fall-through display is disabled", () => {
    const model = createBoardViewModel({
      profile: sampleKeyboard,
      activeLayer: "fn",
      lens: "keys",
      showFallthrough: false,
    });
    const space = key(model.keys, "k4-3");

    expect(space.rawCode).toBe("KC_TRNS");
    expect(space.label).toBe("\u25bd");
    expect(space.empty).toBe(true);
    expect(space.sourceLayerId).toBe("fn");
  });

  it("adds combo markers, connector routes, and layer activation markers for the sample board", () => {
    const model = createBoardViewModel({
      profile: sampleKeyboard,
      activeLayer: "base",
      lens: "keys",
      selection: ["k1-1"],
      marked: ["k1-2"],
    });

    expect(key(model.keys, "k1-1")).toMatchObject({
      selected: true,
      comboMarker: { text: "C" },
    });
    expect(key(model.keys, "k1-2")).toMatchObject({
      marked: true,
      comboMarker: { text: "C" },
    });
    expect(model.comboConnectors).toHaveLength(1);
    expect(model.comboConnectors[0].title).toContain("QW Escape");
    expect(key(model.keys, "k4-4").layerMarker).toMatchObject({ text: "L1" });
  });

  it("converts engine lighting to OKLCH display colors and treats zero brightness as off", () => {
    expect(keyLightingToCss({ hue: 174, saturation: 76, brightness: 82 })).toBe(
      "oklch(0.750 0.152 174)",
    );
    expect(keyLightingToCss({ hue: 174, saturation: 76, brightness: 0 })).toBeNull();

    const profile = cloneDevice(sampleKeyboard);
    profile.lighting.keys = {
      "k0-0": { hue: 32, saturation: 85, brightness: 72 },
      "k0-1": { hue: 195, saturation: 72, brightness: 0 },
    };
    const model = createBoardViewModel({ profile, activeLayer: "base", lens: "lighting" });

    expect(key(model.keys, "k0-0")).toMatchObject({
      hasLightingOverride: true,
      lightingColor: "oklch(0.722 0.170 32)",
    });
    expect(key(model.keys, "k0-1")).toMatchObject({
      hasLightingOverride: true,
      lightingColor: null,
    });
    expect(key(model.keys, "k0-2").lightingColor).toBe("oklch(0.750 0.030 90)");
  });

  it("detects split layouts from split transport and large positioned row gaps", () => {
    const profile = splitFixture();
    const model = createBoardViewModel({ profile, activeLayer: "base", lens: "keys" });

    expect(model.positioned).toBe(true);
    expect(model.split.enabled).toBe(true);
    expect(model.split.seamX).toBe(6);
    expect(model.split.leftKeyIds).toContain("s0-0");
    expect(model.split.rightKeyIds).toContain("s0-5");
  });

  it("computes a responsive unit range compatible with the handoff renderer", () => {
    const model = createBoardViewModel({ profile: sampleKeyboard, activeLayer: "base" });

    expect(computeBoardUnit(model, 360)).toBe(28);
    expect(computeBoardUnit(model, 1200)).toBe(58);
  });
});

function splitFixture(): DeviceProfile {
  const keys: KeyboardKey[] = Array.from({ length: 10 }, (_, col) => ({
    id: `s0-${col}`,
    label: col < 5 ? "L" : "R",
    row: 0,
    col,
    x: col < 5 ? col : col + 2,
    y: 0,
  }));
  const bindings = Object.fromEntries(keys.map((fixtureKey) => [fixtureKey.id, { code: "KC_A" }]));

  return {
    ...cloneDevice(sampleKeyboard),
    id: "split-fixture",
    name: "Split Fixture",
    keys,
    matrix: { rows: 1, cols: 10 },
    settings: { ...sampleKeyboard.settings, splitTransport: "serial" },
    layers: [
      {
        id: "base",
        name: "Base",
        color: "var(--ink)",
        bindings,
      },
    ],
  };
}
