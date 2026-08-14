import { Effect } from "effect";
import { describe, expect, it } from "@effect/vitest";

import type { DeviceProfile } from "$lib/keyboard/schema";

import {
  hintForCandidate,
  parseModBinding,
  predictKeyTargets,
  unwrapShiftedBinding,
} from "./predict";
import { derivePathKind, normalizePathKind } from "./production";
import { emptyMods } from "./activations";

const profile = {
  id: "test",
  name: "Test",
  updatedAt: "t",
  layers: [
    {
      id: "base",
      name: "Base",
      bindings: {
        "2,1": { code: "KC_LBRC" },
        "2,2": { code: "KC_RBRC" },
        "2,3": { code: "KC_EQL" },
        "4,1": { code: "LSFT(KC_LBRC)" },
        "4,2": { code: "C(KC_C)" },
        "0,0": { code: "MO(1)" },
        "1,0": { code: "KC_A" },
        "1,1": { code: "KC_S" },
        "3,0": { code: "KC_LSFT" },
        "3,1": { code: "KC_LCTL" },
      },
    },
    {
      id: "symbols",
      name: "Symbols",
      bindings: {
        "1,1": { code: "KC_LCBR" },
        "1,2": { code: "KC_RCBR" },
        "1,3": { code: "KC_PLUS" },
        "2,1": { code: "KC_LBRC" },
        // Different physical Shift than base — MO then L1-Shift+[ vs base-Shift then MO+[
        "5,0": { code: "KC_LSFT" },
      },
    },
  ],
  combos: [
    {
      id: "as-shift",
      name: "AS Shift",
      keys: ["1,0", "1,1"],
      binding: "OSM(MOD_LSFT)",
      layerIds: ["base"],
    },
  ],
} as unknown as DeviceProfile;

describe("production axes", () => {
  it.effect("derives path kind from layer-hop × mods", () =>
    Effect.gen(function* () {
      expect(
        yield* derivePathKind({
          activeLayerId: "base",
          layerId: "base",
          mods: emptyMods(),
        }),
      ).toBe("direct");
      expect(
        yield* derivePathKind({
          activeLayerId: "base",
          layerId: "base",
          mods: { ...emptyMods(), shift: true },
        }),
      ).toBe("modded");
      expect(
        yield* derivePathKind({
          activeLayerId: "base",
          layerId: "symbols",
          mods: emptyMods(),
        }),
      ).toBe("layer");
      expect(
        yield* derivePathKind({
          activeLayerId: "base",
          layerId: "symbols",
          mods: { ...emptyMods(), shift: true, ctrl: true },
        }),
      ).toBe("layer-modded");
    }),
  );

  it.effect("normalizes legacy path tags", () =>
    Effect.gen(function* () {
      expect(yield* normalizePathKind("shifted")).toBe("modded");
      expect(yield* normalizePathKind("layer-shifted")).toBe("layer-modded");
      expect(yield* normalizePathKind("layer")).toBe("layer");
    }),
  );

  it.effect("parses arbitrary mod wrappers, not just shift", () =>
    Effect.gen(function* () {
      expect(yield* parseModBinding("LSFT(KC_LBRC)")).toMatchObject({
        baseCode: "KC_LBRC",
        mods: { shift: true, ctrl: false, alt: false, gui: false },
      });
      expect(yield* parseModBinding("C(KC_C)")).toMatchObject({
        baseCode: "KC_C",
        mods: { shift: false, ctrl: true, alt: false, gui: false },
      });
      expect(yield* parseModBinding("HYPR(KC_A)")).toMatchObject({
        baseCode: "KC_A",
        mods: { shift: true, ctrl: true, alt: true, gui: true },
      });
      expect(yield* parseModBinding("KC_LCBR")).toBeNull();
    }),
  );
});

describe("predictKeyTargets", () => {
  it.effect("unwraps shifted wrappers", () =>
    Effect.gen(function* () {
      expect(yield* unwrapShiftedBinding("LSFT(KC_LBRC)")).toBe("KC_LBRC");
      expect(yield* unwrapShiftedBinding("S(KC_RBRC)")).toBe("KC_RBRC");
      expect(yield* unwrapShiftedBinding("C(KC_C)")).toBeNull();
      expect(yield* unwrapShiftedBinding("KC_LCBR")).toBeNull();
    }),
  );

  it.effect("enumerates modded / layer / layer-modded productions for {", () =>
    Effect.gen(function* () {
      const prediction = yield* predictKeyTargets({
        profile,
        char: "{",
        activeLayerId: "base",
      });
      const paths = new Set(prediction.candidates.map((c) => c.path));
      expect(paths.has("modded")).toBe(true);
      expect(paths.has("layer")).toBe(true);
      expect(paths.has("layer-modded")).toBe(true);

      const baseShift = prediction.candidates.find(
        (c) => c.path === "modded" && c.baseCode === "KC_LBRC" && c.layerId === "base",
      );
      expect(baseShift?.modsNeeded.shift).toBe(true);
      expect(baseShift?.layerActivatorKeyIds.length).toBe(0);

      const layerCurly = prediction.candidates.find(
        (c) => c.path === "layer" && c.code === "KC_LCBR",
      );
      expect(layerCurly?.layerActivatorCode).toBe("MO(1)");
      expect(layerCurly?.modsNeeded.shift).toBe(false);

      const layerShift = prediction.candidates.find(
        (c) => c.path === "layer-modded" && c.baseCode === "KC_LBRC" && c.layerId === "symbols",
      );
      expect(layerShift?.layerActivatorCode).toBe("MO(1)");
      expect(layerShift?.modsNeeded.shift).toBe(true);
      expect(layerShift?.modKeyIds.length).toBeGreaterThan(0);
      expect(hintForCandidate(layerShift!)).toContain("MO(1)");
    }),
  );

  it.effect("emits both base-Shift→MO+[ and MO→L1-Shift+[ as distinct plans", () =>
    Effect.gen(function* () {
      const prediction = yield* predictKeyTargets({
        profile,
        char: "{",
        activeLayerId: "base",
      });
      const layerModded = prediction.candidates.filter(
        (c) => c.path === "layer-modded" && c.baseCode === "KC_LBRC" && c.layerId === "symbols",
      );
      expect(layerModded.length).toBeGreaterThanOrEqual(2);

      const viaBaseShift = layerModded.find((c) => c.modHomeLayerId === "base");
      const viaLayerShift = layerModded.find((c) => c.modHomeLayerId === "symbols");
      expect(viaBaseShift?.modHomeLayerId).toBe("base");
      expect(viaLayerShift?.modKeyIds).toContain("5,0");
      expect(viaBaseShift?.modKeyIds).not.toEqual(viaLayerShift?.modKeyIds);

      expect(hintForCandidate(viaBaseShift!)).toMatch(/Shift@base/);
      expect(hintForCandidate(viaLayerShift!)).toContain("Shift@symbols");
    }),
  );

  it.effect("adapts between base-Shift and layer-Shift companion plans", () =>
    Effect.gen(function* () {
      const adapted = yield* predictKeyTargets({
        profile,
        char: "{",
        activeLayerId: "base",
        history: [
          {
            code: "KC_LBRC",
            layerId: "symbols",
            path: "layer-modded",
            modKeyFingerprint: "symbols:5,0",
            successes: 10,
            attempts: 10,
          },
          {
            code: "KC_LBRC",
            layerId: "symbols",
            path: "layer-modded",
            modKeyFingerprint: "base:3,0",
            successes: 0,
            attempts: 8,
          },
        ],
      });
      const layerModded = adapted.candidates
        .filter(
          (c) => c.path === "layer-modded" && c.baseCode === "KC_LBRC" && c.layerId === "symbols",
        )
        .sort((a, b) => a.score - b.score);
      expect(layerModded[0]?.modHomeLayerId).toBe("symbols");
      expect(layerModded[0]?.modKeyIds).toContain("5,0");
    }),
  );

  it.effect("adapts best path when history favors base Shift+[", () =>
    Effect.gen(function* () {
      const adapted = yield* predictKeyTargets({
        profile,
        char: "{",
        activeLayerId: "base",
        history: [
          {
            code: "KC_LBRC",
            layerId: "base",
            path: "modded",
            successes: 12,
            attempts: 12,
          },
          {
            code: "KC_LCBR",
            layerId: "symbols",
            path: "layer",
            successes: 1,
            attempts: 8,
          },
        ],
      });
      expect(adapted.best?.path).toBe("modded");
      expect(adapted.best?.layerId).toBe("base");
    }),
  );

  it.effect("adapts toward MO+dedicated when that path succeeds", () =>
    Effect.gen(function* () {
      const adapted = yield* predictKeyTargets({
        profile,
        char: "{",
        activeLayerId: "base",
        history: [
          {
            code: "KC_LCBR",
            layerId: "symbols",
            path: "layer",
            successes: 10,
            attempts: 10,
          },
          {
            code: "KC_LBRC",
            layerId: "base",
            path: "modded",
            successes: 0,
            attempts: 6,
          },
        ],
      });
      const layer = adapted.candidates.find((c) => c.code === "KC_LCBR");
      const baseModded = adapted.candidates.find(
        (c) => c.path === "modded" && c.layerId === "base" && c.baseCode === "KC_LBRC",
      );
      expect(layer).toBeDefined();
      expect(baseModded).toBeDefined();
      expect(layer!.score).toBeLessThan(baseModded!.score);
    }),
  );

  it.effect("prefers symbols-layer direct KC_LCBR when already on symbols", () =>
    Effect.gen(function* () {
      const prediction = yield* predictKeyTargets({
        profile,
        char: "{",
        activeLayerId: "symbols",
      });
      expect(prediction.best?.code).toBe("KC_LCBR");
      expect(prediction.best?.layerId).toBe("symbols");
      expect(prediction.best?.path).toBe("direct");
    }),
  );

  it.effect("for + attaches shift companions on bare KC_EQL path", () =>
    Effect.gen(function* () {
      const prediction = yield* predictKeyTargets({
        profile,
        char: "+",
        activeLayerId: "base",
      });
      const modded = prediction.candidates.find(
        (c) => c.path === "modded" && c.code === "KC_EQL",
      );
      expect(modded).toBeDefined();
      expect(modded!.modsNeeded.shift).toBe(true);
      expect(modded!.modKeyIds.length).toBeGreaterThan(0);
    }),
  );

  it.effect("layer path includes MO activator keys", () =>
    Effect.gen(function* () {
      const prediction = yield* predictKeyTargets({
        profile,
        char: "+",
        activeLayerId: "base",
      });
      const layerPlus = prediction.candidates.find(
        (c) => c.code === "KC_PLUS" && c.layerId === "symbols",
      );
      expect(layerPlus).toBeDefined();
      expect(layerPlus!.layerActivatorKeyIds).toContain("0,0");
      expect(layerPlus!.layerAccessKind).toBe("momentary");
    }),
  );

  it.effect("parses Ctrl/Hyper wrappers without treating them as typed glyphs", () =>
    Effect.gen(function* () {
      expect(yield* parseModBinding("C(KC_C)")).toMatchObject({
        baseCode: "KC_C",
        mods: { shift: false, ctrl: true, alt: false, gui: false },
      });
      expect(yield* parseModBinding("HYPR(KC_A)")).toMatchObject({
        baseCode: "KC_A",
        mods: { shift: true, ctrl: true, alt: true, gui: true },
      });
      // Typing the character "c" should not pulse C(KC_C) — that's a chord, not a glyph.
      const prediction = yield* predictKeyTargets({
        profile,
        char: "c",
        activeLayerId: "base",
      });
      expect(prediction.candidates.some((c) => c.code === "C(KC_C)")).toBe(false);
    }),
  );
});
