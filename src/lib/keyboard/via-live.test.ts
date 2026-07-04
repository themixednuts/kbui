import { describe, expect, it } from "vite-plus/test";

import { cloneDevice, sampleKeyboard } from "./schema";
import { classifyViaProfileChanges } from "./via-live";

describe("VIA live change classification", () => {
  it("classifies encodable per-key binding code edits as live VIA writes", () => {
    const draft = cloneDevice(sampleKeyboard);
    draft.layers[0].bindings["k2-4"] = { code: "KC_G" };

    const changes = classifyViaProfileChanges(sampleKeyboard, draft);
    const binding = changes.find((change) => change.id === "binding:base.k2-4");

    expect(binding).toMatchObject({
      classification: "liveViaWritable",
      liveWrite: {
        code: "KC_G",
        col: 4,
        keyId: "k2-4",
        keycode: 0x000a,
        layerIndex: 0,
        row: 2,
      },
    });
  });

  it("keeps unencodable key bindings source-only instead of claiming VIA support", () => {
    const draft = cloneDevice(sampleKeyboard);
    draft.layers[0].bindings["k2-4"] = { code: "CUSTOM_SAFE_RANGE" };

    const binding = classifyViaProfileChanges(sampleKeyboard, draft).find(
      (change) => change.id === "binding:base.k2-4",
    );

    expect(binding).toMatchObject({
      classification: "sourceOnlyUnsupported",
    });
    expect(binding?.liveWrite).toBeUndefined();
  });

  it("flags combo, macro, tap-dance, key-override, settings, and layer-count edits for rebuild", () => {
    const draft = cloneDevice(sampleKeyboard);
    draft.combos = [
      ...draft.combos,
      {
        id: "combo-test",
        name: "Test Combo",
        keys: ["k1-1", "k1-2"],
        binding: "KC_ESC",
      },
    ];
    draft.macros = [
      ...draft.macros,
      {
        id: "macro-test",
        name: "Test Macro",
        sequence: ["KC_A"],
        trigger: "Unassigned",
      },
    ];
    draft.tapDances = [
      ...draft.tapDances,
      {
        id: "td-test",
        keyId: "k2-4",
        tap: "KC_A",
        hold: "KC_LCTL",
        doubleTap: "KC_ESC",
      },
    ];
    draft.keyOverrides = [
      ...draft.keyOverrides,
      {
        id: "override-test",
        modifiers: ["KC_LSFT"],
        replacement: "KC_DEL",
        trigger: "KC_BSPC",
      },
    ];
    draft.settings.tappingTerm = 210;
    draft.layers.push({
      color: "#39945f",
      id: "extra",
      name: "Extra",
      bindings: Object.fromEntries(draft.keys.map((key) => [key.id, { code: "KC_TRNS" }])),
    });

    const changes = classifyViaProfileChanges(sampleKeyboard, draft);

    expect(changes.filter((change) => change.classification === "firmwareRebuildRequired")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "combo" }),
        expect.objectContaining({ kind: "macro" }),
        expect.objectContaining({ kind: "tapDance" }),
        expect.objectContaining({ kind: "keyOverride" }),
        expect.objectContaining({ kind: "setting" }),
        expect.objectContaining({ kind: "metadata", path: "layers/Extra" }),
      ]),
    );
  });

  it("treats binding notes as local profile metadata", () => {
    const draft = cloneDevice(sampleKeyboard);
    draft.layers[0].bindings["k2-4"] = {
      ...draft.layers[0].bindings["k2-4"],
      notes: "home-row candidate",
    };

    const binding = classifyViaProfileChanges(sampleKeyboard, draft).find(
      (change) => change.id === "binding:base.k2-4",
    );

    expect(binding).toMatchObject({
      classification: "sourceOnlyUnsupported",
    });
  });
});
