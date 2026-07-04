import { describe, expect, it } from "vite-plus/test";

import { diffProfiles } from "$lib/keyboard/changes";
import { cloneDevice, sampleKeyboard } from "$lib/keyboard/schema";

import {
  applyBindingToDevice,
  applyHoldTapToDevice,
  applyNotesToDevice,
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
});
