import { describe, expect, it } from "vite-plus/test";
import { sampleKeyboard } from "./schema";
import {
  comboMarkerText,
  comboAppliesToLayer,
  comboChordLabels,
  comboKeyOptionLabel,
  comboLayerScopeLabel,
  comboSummaryForKey,
  combosForKey,
  combosForKeyOnLayer,
  viaComboDefinitionsUnavailable,
} from "./combo-visibility";
import { logicBindingOptions, macroBindingCode, tapDanceBindingCode } from "./logic-bindings";

describe("logicBindingOptions", () => {
  it("maps workspace macros and tap dances to bindable keycodes", () => {
    const options = logicBindingOptions(sampleKeyboard);

    expect(options.some((item) => item.kind === "macro" && item.label === "Open Terminal")).toBe(
      true,
    );
    expect(
      options.find((item) => item.kind === "macro" && item.label === "Open Terminal")?.code,
    ).toBe(macroBindingCode(0));
    expect(options.find((item) => item.kind === "tapDance")?.code).toBe(tapDanceBindingCode(0));
    expect(options.some((item) => item.kind === "combo" && item.code === null)).toBe(true);
  });
});

describe("combo visibility", () => {
  it("finds known workspace combos for keymap markers", () => {
    expect(combosForKey(sampleKeyboard, "k1-1").map((combo) => combo.name)).toEqual(["QW Escape"]);
    expect(combosForKey(sampleKeyboard, "k1-3")).toEqual([]);
    expect(comboMarkerText(0)).toBe("");
    expect(comboMarkerText(1)).toBe("C");
    expect(comboMarkerText(2)).toBe("C2");
  });

  it("filters layer-specific combos for keymap markers", () => {
    const profile = {
      combos: [
        {
          id: "base-only",
          name: "Base only",
          keys: ["k0-0"],
          binding: "KC_ESC",
          layerIds: ["base"],
        },
        { id: "any-layer", name: "Any layer", keys: ["k0-0"], binding: "KC_TAB" },
      ],
    };

    expect(comboAppliesToLayer(profile.combos[0], "base")).toBe(true);
    expect(comboAppliesToLayer(profile.combos[0], "layer-1")).toBe(false);
    expect(combosForKeyOnLayer(profile, "k0-0", "layer-1").map((combo) => combo.id)).toEqual([
      "any-layer",
    ]);
  });

  it("summarizes a known combo using key labels and display names", () => {
    expect(
      comboSummaryForKey(sampleKeyboard, "k1-1", (code) => (code === "KC_ESC" ? "Esc" : code)),
    ).toBe("QW Escape: Q + W -> Esc");
  });

  it("summarizes layer-specific combos using that layer's keycodes", () => {
    const combo = {
      id: "num-reset",
      name: "Num reset",
      keys: ["k0-0", "k0-1"],
      binding: "KC_ESC",
      layerIds: ["fn"],
    };

    expect(
      comboChordLabels(sampleKeyboard, combo, (code) => code.replace(/^KC_/, ""), "fn"),
    ).toEqual(["QK_BOOT", "F1"]);
  });

  it("labels combo editor keys from the combo layer instead of physical key ids", () => {
    const baseCombo = {
      id: "base-reset",
      name: "Base reset",
      keys: ["k1-1", "k1-2"],
      binding: "KC_ESC",
      layerIds: ["base"],
    };
    const fnCombo = {
      id: "fn-reset",
      name: "Fn reset",
      keys: ["k0-0", "k0-1"],
      binding: "KC_ESC",
      layerIds: ["fn"],
    };

    expect(comboLayerScopeLabel(sampleKeyboard, baseCombo)).toBe("Base");
    expect(
      comboKeyOptionLabel(sampleKeyboard, baseCombo, "k1-1", (code) => code.replace(/^KC_/, "")),
    ).toMatchObject({
      primary: "Q",
      detail: "Base · Q",
    });
    expect(comboLayerScopeLabel(sampleKeyboard, fnCombo)).toBe("Fn");
    expect(
      comboKeyOptionLabel(sampleKeyboard, fnCombo, "k0-1", (code) => code.replace(/^KC_/, "")),
    ).toMatchObject({
      primary: "F1",
      detail: "Fn · 1",
    });
  });

  it("flags live VIA profiles whose compiled combo definitions are not loaded", () => {
    expect(viaComboDefinitionsUnavailable({ ...sampleKeyboard, combos: [] }, true)).toBe(true);
    expect(viaComboDefinitionsUnavailable({ ...sampleKeyboard, combos: [] }, false)).toBe(false);
    expect(viaComboDefinitionsUnavailable(sampleKeyboard, true)).toBe(false);
    expect(
      viaComboDefinitionsUnavailable(
        { ...sampleKeyboard, firmware: "zmk", protocol: "zmk-studio", combos: [] },
        true,
      ),
    ).toBe(false);
  });
});
