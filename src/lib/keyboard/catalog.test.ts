import { describe, expect, it } from "vitest";

import {
  bestCatalogEntryForIdentity,
  catalogIdentityMatchScore,
  entryMatchesIdentity,
  profileFromCatalog,
  type KeyboardCatalogSummary,
} from "./catalog";
import {
  layerActivationMarkerText,
  layerActivationsByKey,
  layerActivationsForLayer,
} from "./layer-activations";
import { parseViaDefinition, summarizeCatalogEntry } from "./via-definition";
import { localKeyboardDefinitions } from "../server/keyboards/local-defs";

function summary(
  overrides: Partial<KeyboardCatalogSummary> &
    Pick<KeyboardCatalogSummary, "id" | "name" | "sourcePath">,
): KeyboardCatalogSummary {
  return {
    vendor: "Keychron",
    source: "via-v3",
    vendorId: 0x3434,
    productId: 0x0101,
    matrix: { rows: 5, cols: 16 },
    layout: { width: 15, height: 5, keyCount: 68 },
    capabilities: ["keymap", "layers", "settings", "firmware"],
    priority: 0,
    ...overrides,
  };
}

describe("keyboard catalog identity matching", () => {
  const keychronQ1 = summary({
    id: "keychron/q1/v2/ansi_encoder",
    name: "Keychron Q1 V2 ANSI Knob",
    sourcePath: "v3/keychron/q1/v2/ansi_encoder.json",
    priority: 100,
  });

  it("still matches exact USB identifiers when no product name is available", () => {
    expect(entryMatchesIdentity(keychronQ1, { vendorId: 0x3434, productId: 0x0101 })).toBe(true);
  });

  it("uses product names to match a VIA definition even when firmware reports generic USB ids", () => {
    const score = catalogIdentityMatchScore(keychronQ1, {
      vendorId: 0xfeed,
      productId: 0x6060,
      productName: "Keychron Q1V2 ANSI Knob",
    });

    expect(score).toBeGreaterThan(0);
  });

  it("can match a distinctive model-only HID product name", () => {
    const sofle = summary({
      id: "sofle/rev1",
      name: "Sofle RGB",
      sourcePath: "v3/sofle/rev1.json",
      vendor: "Sofle",
      vendorId: 0x1209,
      productId: 0x0001,
    });

    expect(
      entryMatchesIdentity(sofle, {
        vendorId: 0xfeed,
        productId: 0x6060,
        productName: "Sofle",
      }),
    ).toBe(true);
  });

  it("does not match a brand-only product name to one of that brand's models", () => {
    expect(
      entryMatchesIdentity(keychronQ1, {
        vendorId: 0xfeed,
        productId: 0x6060,
        productName: "Keychron",
      }),
    ).toBe(false);
  });

  it("uses the product name to choose between duplicate USB ids", () => {
    const keychronQ2 = summary({
      id: "keychron/q2/ansi_encoder",
      name: "Keychron Q2 ANSI Knob",
      sourcePath: "v3/keychron/q2/ansi_encoder.json",
      priority: 1000,
    });

    const best = bestCatalogEntryForIdentity([keychronQ2, keychronQ1], {
      vendorId: 0x3434,
      productId: 0x0101,
      productName: "Keychron Q1V2 ANSI Knob",
    });

    expect(best?.id).toBe(keychronQ1.id);
  });

  it("does not treat short model tokens as substring matches", () => {
    const keychronQ10 = summary({
      id: "keychron/q10/ansi_encoder",
      name: "Keychron Q10 ANSI Knob",
      sourcePath: "v3/keychron/q10/ansi_encoder.json",
      priority: 1000,
    });

    const best = bestCatalogEntryForIdentity([keychronQ10, keychronQ1], {
      vendorId: 0xfeed,
      productId: 0x6060,
      productName: "Keychron Q1V2 ANSI Knob",
    });

    expect(best?.id).toBe(keychronQ1.id);
  });

  it("does not match generic HID product names by name alone", () => {
    expect(
      entryMatchesIdentity(keychronQ1, {
        vendorId: 0xfeed,
        productId: 0x6060,
        productName: "QMK Keyboard",
      }),
    ).toBe(false);
  });
});

describe("keyboard catalog combo extensions", () => {
  it("preserves local combo metadata in full profiles but not summaries", () => {
    const entry = parseViaDefinition(
      "local/test_combo_board.json",
      {
        name: "Combo Board",
        vendorId: "0x1234",
        productId: "0xabcd",
        matrix: { rows: 1, cols: 2 },
        layouts: {
          keymap: [["0,0\nQ", "0,1\nW"]],
        },
        combos: [
          {
            id: "qw-esc",
            name: "QW Esc",
            keys: ["k0-0", "k0-1"],
            binding: "KC_ESC",
            layerIds: ["base"],
          },
          {
            id: "invalid",
            keys: ["missing"],
            binding: "KC_TAB",
          },
        ],
      },
      1,
    );

    expect(entry?.capabilities).toContain("combos");
    expect(entry?.combos).toEqual([
      {
        id: "qw-esc",
        name: "QW Esc",
        keys: ["k0-0", "k0-1"],
        binding: "KC_ESC",
        layerIds: ["base"],
      },
    ]);
    expect("combos" in summarizeCatalogEntry(entry!)).toBe(false);
    expect(profileFromCatalog(entry!).combos).toHaveLength(1);
  });

  it("preserves local default layer bindings in full profiles but not summaries", () => {
    const entry = parseViaDefinition(
      "local/test_layer_board.json",
      {
        name: "Layer Board",
        vendorId: "0x1234",
        productId: "0xabcd",
        matrix: { rows: 1, cols: 2 },
        layouts: {
          keymap: [["0,0\nQ", "0,1\nW"]],
        },
        layers: [
          {
            id: "base",
            name: "Base",
            bindings: {
              "k0-0": "KC_Q",
              "k0-1": "OSL(1)",
            },
          },
          {
            id: "layer-1",
            name: "Layer 1",
            bindings: {
              "k0-1": "TO(0)",
              missing: "KC_ESC",
            },
          },
        ],
      },
      1,
    );

    expect(entry?.defaultLayers).toHaveLength(2);
    expect(profileFromCatalog(entry!).layers).toHaveLength(4);
    expect(profileFromCatalog(entry!).layers[0].bindings["k0-1"]?.code).toBe("OSL(1)");
    expect(profileFromCatalog(entry!).layers[1].bindings["k0-1"]?.code).toBe("TO(0)");
    expect(profileFromCatalog(entry!).layers[1].bindings.missing).toBeUndefined();
    expect("defaultLayers" in summarizeCatalogEntry(entry!)).toBe(false);
  });
});

describe("local Dilemma compiled defaults", () => {
  it("includes the Symbols-to-Navigation one-shot layer activation", () => {
    const localDilemma = localKeyboardDefinitions.find((definition) =>
      definition.sourcePath.includes("dilemma/3x5_2"),
    );
    const entry = parseViaDefinition(localDilemma!.sourcePath, localDilemma!.json);
    const profile = profileFromCatalog(entry!);

    expect(profile.layers[2].name).toBe("Symbols");
    expect(profile.layers[2].bindings["k7-0"]?.code).toBe("OSL(3)");

    const byKey = layerActivationsByKey(layerActivationsForLayer(profile, "layer-2"));
    const rightThumb = byKey.get("k7-0") ?? [];

    expect(layerActivationMarkerText(rightThumb)).toBe("L3");
    expect(rightThumb[0]?.chain?.via).toMatchObject({
      sourceLayerName: "Base",
      targetLayerName: "Symbols",
    });
  });
});
