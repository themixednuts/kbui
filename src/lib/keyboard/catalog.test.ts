import { describe, expect, it } from "vite-plus/test";

import {
  bestCatalogEntryForIdentity,
  catalogIdentityMatchScore,
  entryMatchesIdentity,
  profileFromCatalog,
  type KeyboardCatalogEntry,
  type KeyboardCatalogSummary,
} from "./catalog";
import {
  layerActivationMarkerText,
  layerActivationsByKey,
  layerActivationsForLayer,
} from "./layer-activations";
import { parseViaDefinition, summarizeCatalogEntry } from "./via-definition";
import { localKeyboardDefinitions } from "../server/keyboards/local-defs";
import { withResolvedQmkTarget } from "../app/via-catalog-resolver";

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

describe("connected VIA build-target enrichment", () => {
  it("keeps the VIA matrix while applying the exact QMK target resolved from USB identity", () => {
    const localCharybdis = localKeyboardDefinitions.find((definition) =>
      definition.sourcePath.includes("charybdis/4x6"),
    );
    const definition = parseViaDefinition(
      localCharybdis!.sourcePath,
      localCharybdis!.json,
      localCharybdis!.priority,
    )!;
    definition.firmwareMetadata = {
      qmk: { keyOrder: definition.keys.map((key) => key.id) },
    };

    const enriched = withResolvedQmkTarget(definition, {
      ...definition,
      source: "qmk-api",
      sourcePath: "bastardkb/charybdis/4x6/splinky_3",
      firmwareMetadata: {
        qmk: {
          alternatives: [{ keyboard: "bastardkb/charybdis/4x6/elitec", layout: "LAYOUT" }],
          keyboard: "bastardkb/charybdis/4x6/splinky_3",
          layout: "LAYOUT",
          ref: "0123456789abcdef",
          repository: "qmk/qmk_firmware",
          targetConfirmed: true,
        },
      },
    });

    expect(enriched.keys).toEqual(definition.keys);
    expect(enriched.firmwareMetadata?.qmk).toMatchObject({
      keyboard: "bastardkb/charybdis/4x6/splinky_3",
      layout: "LAYOUT",
      repository: "qmk/qmk_firmware",
      targetConfirmed: true,
    });
    expect(enriched.firmwareMetadata?.qmk?.keyOrder).toEqual(definition.keys.map((key) => key.id));
  });

  function charybdisDefinitionWithKeyOrder() {
    const localCharybdis = localKeyboardDefinitions.find((definition) =>
      definition.sourcePath.includes("charybdis/4x6"),
    );
    const definition = parseViaDefinition(
      localCharybdis!.sourcePath,
      localCharybdis!.json,
      localCharybdis!.priority,
    )!;
    definition.firmwareMetadata = { qmk: { keyOrder: definition.keys.map((key) => key.id) } };
    return definition;
  }

  // Mainline QMK's USB catalog only knows the blackpill (STM32) and elitec (AVR)
  // Charybdis 4x6 controllers, both sharing PID 0x1833, so the resolver can
  // never confirm one for a Splinky (RP2040) device.
  const unconfirmedMainlineIdentity = (definition: KeyboardCatalogEntry) => ({
    ...definition,
    source: "qmk-api" as const,
    sourcePath: "bastardkb/charybdis/4x6/blackpill",
    firmwareMetadata: {
      qmk: {
        alternatives: [{ keyboard: "bastardkb/charybdis/4x6/elitec", layout: "LAYOUT" }],
        keyboard: "bastardkb/charybdis/4x6/blackpill",
        layout: "LAYOUT",
        processor: "STM32F411",
        ref: "mainlinesha",
        repository: "qmk/qmk_firmware",
        targetConfirmed: false,
      },
    },
  });

  it("seeds the curated BastardKB Splinky fork target when QMK cannot confirm the controller", () => {
    const definition = charybdisDefinitionWithKeyOrder();

    const enriched = withResolvedQmkTarget(
      definition,
      unconfirmedMainlineIdentity(definition),
      "Charybdis (4x6) Splinky",
    );

    expect(enriched.firmwareMetadata?.qmk).toMatchObject({
      keyboard: "bastardkb/charybdis/4x6",
      layout: "LAYOUT",
      repository: "bastardkb/bastardkb-qmk",
      ref: "8f3b92fff27e6356120913a4ec6b21a017d0fef6",
      processor: "RP2040",
      bootloader: "rp2040",
      targetConfirmed: true,
    });
    // The corrected VIA key order is still what drives the live matrix.
    expect(enriched.firmwareMetadata?.qmk?.keyOrder).toEqual(definition.keys.map((key) => key.id));
  });

  it("does not apply the curated Splinky target to a same-PID non-Splinky controller", () => {
    const definition = charybdisDefinitionWithKeyOrder();

    const enriched = withResolvedQmkTarget(
      definition,
      unconfirmedMainlineIdentity(definition),
      "Charybdis (4x6)",
    );

    // No "splinky" token: keep the (still unconfirmed) mainline resolution so
    // the user picks a controller in Settings instead of being forced to RP2040.
    expect(enriched.firmwareMetadata?.qmk).toMatchObject({
      keyboard: "bastardkb/charybdis/4x6/blackpill",
      targetConfirmed: false,
    });
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

describe("local Charybdis hardware identity", () => {
  it("matches the published 4x6 USB identity without a name fallback", () => {
    const localCharybdis = localKeyboardDefinitions.find((definition) =>
      definition.sourcePath.includes("charybdis/4x6"),
    );
    const entry = parseViaDefinition(localCharybdis!.sourcePath, localCharybdis!.json);

    expect(entry).toMatchObject({
      name: "Charybdis 4x6",
      productId: 0x1833,
      vendorId: 0xa8f8,
      matrix: { rows: 10, cols: 6 },
    });
    expect(entry?.keys).toHaveLength(56);
    expect(
      bestCatalogEntryForIdentity([summarizeCatalogEntry(entry!)], {
        vendorId: 0xa8f8,
        productId: 0x1833,
      })?.id,
    ).toBe(entry?.id);
  });

  it("maps the thumb clusters to the canonical QMK matrix rows (regression: rows 4/9 were transposed)", () => {
    // Ground truth from
    // https://keyboards.qmk.fm/v1/keyboards/bastardkb/charybdis/4x6/blackpill/info.json
    // LAYOUT macro: matrix row 4 (left thumbs) = cols 1..5 (5 keys), matrix
    // row 9 (right thumbs) = cols 1,3,5 (3 keys). A prior revision transposed
    // them (row 4 = {1,3,5}, row 9 = {1,2,3,4,5}), which desynced the parsed
    // VIA key set from the QMK-resolved layout key order and produced
    // qmk.key_order.unknown_keys (k4-4, k4-2) / qmk.key_order.incomplete.
    const localCharybdis = localKeyboardDefinitions.find((definition) =>
      definition.sourcePath.includes("charybdis/4x6"),
    );
    const entry = parseViaDefinition(localCharybdis!.sourcePath, localCharybdis!.json)!;

    const idsForRow = (row: number) =>
      new Set(entry.keys.filter((key) => key.row === row).map((key) => key.id));

    expect(idsForRow(4)).toEqual(new Set(["k4-1", "k4-2", "k4-3", "k4-4", "k4-5"]));
    expect(idsForRow(9)).toEqual(new Set(["k9-1", "k9-3", "k9-5"]));
    expect(entry.keys).toHaveLength(56);
  });
});

describe("local VIA definitions", () => {
  it("every local def parses to a positive, duplicate-free key set", () => {
    for (const definition of localKeyboardDefinitions) {
      const entry = parseViaDefinition(definition.sourcePath, definition.json, definition.priority);
      expect(entry, `local def ${definition.sourcePath} should parse`).toBeDefined();

      const ids = entry!.keys.map((key) => key.id);
      expect(ids.length, `local def ${definition.sourcePath} should yield keys`).toBeGreaterThan(0);
      expect(
        new Set(ids).size,
        `local def ${definition.sourcePath} should have no duplicate key ids`,
      ).toBe(ids.length);
      // Every id is the canonical k<row>-<col> shape the firmware key order relies on.
      for (const key of entry!.keys) {
        expect(key.id).toBe(`k${key.row}-${key.col}`);
      }
    }
  });
});
