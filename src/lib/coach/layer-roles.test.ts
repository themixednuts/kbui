import { Effect } from "effect";
import { describe, expect, it } from "@effect/vitest";

import { sampleKeyboard } from "$lib/keyboard/schema";

import { inferLayerRoles, layerIdsWithRole, roleForLayer } from "./layer-roles";

describe("layer roles", () => {
  it.effect("infers roles from bindings/names, not array index", () =>
    Effect.gen(function* () {
      const map = yield* inferLayerRoles(sampleKeyboard);
      expect(map.assignments.length).toBe(sampleKeyboard.layers.length);

      const baseIds = yield* layerIdsWithRole(map, "base");
      expect(baseIds.length).toBeGreaterThanOrEqual(1);

      // Reordering layers must not change which layer is base.
      const reversed = {
        ...sampleKeyboard,
        layers: [...sampleKeyboard.layers].reverse(),
      };
      const reversedMap = yield* inferLayerRoles(reversed);
      const reversedBase = yield* layerIdsWithRole(reversedMap, "base");
      expect(reversedBase).toEqual(baseIds);
    }),
  );

  it.effect("roleForLayer returns unknown for missing ids", () =>
    Effect.gen(function* () {
      const map = yield* inferLayerRoles(sampleKeyboard);
      expect(yield* roleForLayer(map, "does-not-exist")).toBe("unknown");
    }),
  );
});
