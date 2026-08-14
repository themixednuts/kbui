import { Effect } from "effect";

import type { DeviceProfile } from "$lib/keyboard/schema";

import { annotateSlot } from "./constraints";
import { CoachLayoutFixture } from "./contracts";
import { loadLayerRolesEffect, roleForLayer, type LayerRoleMap } from "./layer-roles";

/**
 * Build a coach layout from the live workbench profile + resolved layer roles.
 * Diffs use real layer ids / key ids — no fixture index remapping.
 */
export const layoutFixtureFromProfile = Effect.fn("Coach.layoutFixtureFromProfile")(function* (
  profile: DeviceProfile,
  roles?: LayerRoleMap,
) {
  const roleMap = roles ?? (yield* loadLayerRolesEffect(profile));
  const slots = [];

  for (const layer of profile.layers) {
    const role = yield* roleForLayer(roleMap, layer.id);
    for (const key of profile.keys) {
      const binding = layer.bindings[key.id];
      if (!binding?.code) continue;
      slots.push(
        yield* annotateSlot(key.id, layer.id, binding.code, key.row, key.col, role),
      );
    }
  }

  return CoachLayoutFixture.make({
    id: `live:${profile.id}`,
    name: profile.name,
    slots,
  });
});
