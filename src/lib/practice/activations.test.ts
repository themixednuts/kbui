import { Effect } from "effect";
import { describe, expect, it } from "@effect/vitest";

import type { DeviceProfile } from "$lib/keyboard/schema";

import {
  bestLayerAccess,
  collectModSources,
  parseModActivation,
} from "./activations";

describe("mod / layer activations", () => {
  it.effect("parses hold, one-shot, and mod-tap codes", () =>
    Effect.gen(function* () {
      expect(yield* parseModActivation("KC_LSFT")).toMatchObject({
        kind: "hold",
        mod: "shift",
      });
      expect(yield* parseModActivation("OSM(MOD_LSFT)")).toMatchObject({
        kind: "one-shot",
        mod: "shift",
      });
      expect(yield* parseModActivation("LSFT_T(KC_A)")).toMatchObject({
        kind: "mod-tap",
        mod: "shift",
      });
      expect(yield* parseModActivation("ZMK_SK(KC_LSFT)")).toMatchObject({
        kind: "sticky",
        mod: "shift",
      });
      expect(yield* parseModActivation("KC_A")).toBeNull();
    }),
  );

  it.effect("collects combo OSM sources", () =>
    Effect.gen(function* () {
      const profile = {
        id: "p",
        layers: [{ id: "base", name: "Base", bindings: { a: { code: "KC_A" } } }],
        combos: [
          {
            id: "as",
            name: "AS",
            keys: ["a", "s"],
            binding: "OSM(MOD_LSFT)",
            layerIds: ["base"],
          },
        ],
      } as unknown as DeviceProfile;
      const sources = yield* collectModSources(profile);
      expect(sources.some((s) => s.kind === "one-shot" && s.keyIds.includes("a"))).toBe(true);
    }),
  );

  it.effect("prefers OSL when reaching another layer", () =>
    Effect.gen(function* () {
      const profile = {
        id: "p",
        layers: [
          {
            id: "base",
            name: "Base",
            bindings: {
              o: { code: "OSL(1)" },
              m: { code: "MO(1)" },
            },
          },
          { id: "sym", name: "Sym", bindings: {} },
        ],
      } as unknown as DeviceProfile;
      const access = yield* bestLayerAccess({
        profile,
        activeLayerId: "base",
        targetLayerId: "sym",
      });
      expect(access?.kind).toBe("one-shot");
      expect(access?.activatorCode).toBe("OSL(1)");
    }),
  );
});
