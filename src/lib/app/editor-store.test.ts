import { describe, expect, it } from "vite-plus/test";

import { diffProfiles } from "$lib/keyboard/changes";
import { swatchToKeyLighting } from "$lib/keyboard/lighting-swatches";
import { cloneDevice, sampleKeyboard } from "$lib/keyboard/schema";

import {
  applyLightingToDevice,
  applyBindingToDevice,
  applyHoldTapToDevice,
  applyNotesToDevice,
  clearKeyLightingOnDevice,
  summarizeLightingSelection,
  clearBindingOnDevice,
  toggleSelection,
} from "./editor-store.svelte";

describe("editor store pure mutations", () => {
  it("applies a normalized keycode to every selected key and records binding changes", () => {
    const result = applyBindingToDevice(sampleKeyboard, "base", ["k2-4", "k2-6"], "kc_g");

    expect(result.changedKeyIds).toEqual(["k2-4", "k2-6"]);
    expect(result.profile.layers[0].bindings["k2-4"].code).toBe("KC_G");
    expect(result.profile.layers[0].bindings["k2-6"].code).toBe("KC_G");
    expect(sampleKeyboard.layers[0].bindings["k2-4"].code).toBe("KC_F");

    const changes = diffProfiles(sampleKeyboard, result.profile);
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "binding",
          path: "layers/Base/k2-4",
          before: "KC_F",
          after: "KC_G",
        }),
        expect.objectContaining({
          kind: "binding",
          path: "layers/Base/k2-6",
          before: "KC_H",
          after: "KC_G",
        }),
      ]),
    );
  });

  it("toggles selection immutably", () => {
    const selected = new Set(["k1-1", "k1-2"]);
    const withoutExisting = toggleSelection(selected, "k1-1");
    const withNew = toggleSelection(withoutExisting, "k1-3");

    expect([...selected]).toEqual(["k1-1", "k1-2"]);
    expect([...withoutExisting]).toEqual(["k1-2"]);
    expect([...withNew]).toEqual(["k1-2", "k1-3"]);
  });

  it("clears non-base bindings to transparent", () => {
    const draft = cloneDevice(sampleKeyboard);
    draft.layers.find((layer) => layer.id === "fn")!.bindings["k1-1"] = { code: "KC_A" };

    const result = clearBindingOnDevice(draft, "fn", ["k1-1"]);

    expect(result.changedKeyIds).toEqual(["k1-1"]);
    expect(result.profile.layers.find((layer) => layer.id === "fn")!.bindings["k1-1"].code).toBe(
      "KC_TRNS",
    );
  });

  it("records hold-tap and note edits through profile diffs", () => {
    const held = applyHoldTapToDevice(sampleKeyboard, "base", ["k2-4"], "hold", "kc_lctl");
    const noted = applyNotesToDevice(held.profile, "base", "k2-4", "home row mod candidate");
    const change = diffProfiles(sampleKeyboard, noted.profile).find(
      (item) => item.id === "binding:base.k2-4",
    );

    expect(noted.profile.layers[0].bindings["k2-4"]).toMatchObject({
      code: "KC_F",
      hold: "KC_LCTL",
      notes: "home row mod candidate",
    });
    expect(change).toMatchObject({
      before: "KC_F",
      after: "KC_F hold:KC_LCTL notes:home row mod candidate",
    });
  });

  it("applies lighting swatches to selected keys and records lighting changes", () => {
    const result = applyLightingToDevice(
      sampleKeyboard,
      ["k0-1", "k0-2"],
      swatchToKeyLighting("coral"),
    );

    expect(result.changedKeyIds).toEqual(["k0-1", "k0-2"]);
    expect(result.profile.lighting.keys["k0-1"]).toEqual(swatchToKeyLighting("coral"));
    expect(sampleKeyboard.lighting.keys["k0-1"]).toBeUndefined();

    const summary = summarizeLightingSelection(result.profile, ["k0-1", "k0-2"]);
    expect(summary).toMatchObject({
      count: 2,
      mixed: false,
      swatchId: "coral",
    });

    expect(diffProfiles(sampleKeyboard, result.profile)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "lighting",
          path: "lighting/keys/k0-1",
        }),
        expect.objectContaining({
          kind: "lighting",
          path: "lighting/keys/k0-2",
        }),
      ]),
    );
  });

  it("uses zero-brightness lighting for the off swatch", () => {
    const result = clearKeyLightingOnDevice(sampleKeyboard, ["k0-1"]);
    const summary = summarizeLightingSelection(result.profile, ["k0-1"]);

    expect(result.profile.lighting.keys["k0-1"]).toEqual({
      hue: 0,
      saturation: 0,
      brightness: 0,
    });
    expect(summary).toMatchObject({
      mixed: false,
      swatchId: "off",
    });
  });
});
