import { Effect, Schema } from "effect";

import * as Preferences from "$lib/app/services/preferences";
import type { DeviceProfile, Layer } from "$lib/keyboard/schema";

/**
 * Semantic job of a layer — never inferred from array index.
 * Users can override; otherwise we score binding content + layer name.
 */
export const LayerRole = Schema.Literals([
  "base",
  "numpad",
  "nav",
  "symbols",
  "adjust",
  "mixed",
  "unknown",
]);
export type LayerRole = typeof LayerRole.Type;

export const LAYER_ROLE_OPTIONS: readonly LayerRole[] = [
  "base",
  "numpad",
  "nav",
  "symbols",
  "adjust",
  "mixed",
  "unknown",
];

export const LayerRoleAssignment = Schema.Struct({
  layerId: Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
  role: LayerRole,
  /** true when user locked the role (do not overwrite on re-infer). */
  locked: Schema.Boolean,
});
export interface LayerRoleAssignment extends Schema.Schema.Type<typeof LayerRoleAssignment> {}

export const LayerRoleMap = Schema.Struct({
  profileId: Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(160)),
  assignments: Schema.Array(LayerRoleAssignment).check(Schema.isMaxLength(64)),
});
export interface LayerRoleMap extends Schema.Schema.Type<typeof LayerRoleMap> {}

export class LayerRolesError extends Schema.TaggedErrorClass<LayerRolesError>()(
  "Coach.LayerRolesError",
  { message: Schema.String },
) {}

const NUMPAD = /^KC_(P[0-9]|PDOT|PENT|PPLS|PMNS|PAST|PSLS|NLCK)/;
const NAV =
  /^KC_(LEFT|RGHT|UP|DOWN|HOME|END|PGUP|PGDN|TAB|ESC|INS|DEL|F[0-9]{1,2}|MUTE|VOL[UD]|MNXT|MPRV|MPLY)/;
const ADJUST = /RESET|EEPROM|BOOT|DPI|SNIP|DRAG|CUSTOM\(|MS_|BTN[0-9]|ACL/i;
const ALPHA = /^KC_[A-Z]$/;
const SYMBOL =
  /^KC_(EXLM|AT|HASH|DLR|PERC|CIRC|AMPR|ASTR|LPRN|RPRN|LBRC|RBRC|LCBR|RCBR|PIPE|BSLS|SCLN|COLN|QUOT|DQUO|COMM|DOT|SLSH|QUES|MINS|UNDS|EQL|PLUS|TILD|GRV|LT|GT)/;

function bindingCodes(layer: Layer): string[] {
  return Object.values(layer.bindings)
    .map((b) => b.code)
    .filter((c) => c && c !== "KC_TRNS" && c !== "KC_NO");
}

function scoreLayer(layer: Layer): Record<LayerRole, number> {
  const codes = bindingCodes(layer);
  const total = Math.max(1, codes.length);
  let numpad = 0;
  let nav = 0;
  let adjust = 0;
  let alpha = 0;
  let symbols = 0;
  for (const code of codes) {
    if (NUMPAD.test(code)) numpad += 1;
    else if (ADJUST.test(code)) adjust += 1;
    else if (NAV.test(code)) nav += 1;
    else if (ALPHA.test(code)) alpha += 1;
    else if (SYMBOL.test(code)) symbols += 1;
  }

  const name = layer.name.toLowerCase();
  const nameBoost = (re: RegExp) => (re.test(name) ? 0.35 : 0);

  return {
    base: alpha / total + nameBoost(/\b(base|qwerty|alpha|default|main)\b/),
    numpad: numpad / total + nameBoost(/\b(num|numpad|keypad|pad)\b/),
    nav: nav / total + nameBoost(/\b(nav|navigation|media|fn)\b/),
    symbols: symbols / total + nameBoost(/\b(sym|symbol|punct|ops)\b/),
    adjust: adjust / total + nameBoost(/\b(adjust|pointer|mouse|config|sys)\b/),
    mixed: 0,
    unknown: 0,
  };
}

function pickRole(scores: Record<LayerRole, number>): LayerRole {
  const ranked = (Object.entries(scores) as [LayerRole, number][])
    .filter(([role]) => role !== "mixed" && role !== "unknown")
    .sort((a, b) => b[1] - a[1]);
  const [best, bestScore] = ranked[0] ?? ["unknown", 0];
  const second = ranked[1]?.[1] ?? 0;
  if (bestScore < 0.18) return "unknown";
  if (bestScore - second < 0.08 && bestScore < 0.45) return "mixed";
  return best;
}

export const roleForLayer = Effect.fn("Coach.roleForLayer")(function* (
  map: LayerRoleMap,
  layerId: string,
) {
  return map.assignments.find((a) => a.layerId === layerId)?.role ?? ("unknown" as LayerRole);
});

export const layerIdsWithRole = Effect.fn("Coach.layerIdsWithRole")(function* (
  map: LayerRoleMap,
  role: LayerRole,
) {
  return map.assignments.filter((a) => a.role === role).map((a) => a.layerId);
});

/** Infer roles from binding content + names — never from layer array index. */
export const inferLayerRoles = Effect.fn("Coach.inferLayerRoles")(function* (
  profile: DeviceProfile,
) {
  let assignments: LayerRoleAssignment[] = [];
  let baseClaimed = false;

  for (const layer of profile.layers) {
    const scores = scoreLayer(layer);
    let role = pickRole(scores);

    if (role === "base") {
      if (baseClaimed) role = scores.symbols >= scores.nav ? "symbols" : "mixed";
      else baseClaimed = true;
    }

    assignments.push(
      LayerRoleAssignment.make({
        layerId: layer.id,
        role,
        locked: false,
      }),
    );
  }

  if (!assignments.some((a) => a.role === "base") && profile.layers.length > 0) {
    let bestId = profile.layers[0]!.id;
    let bestAlpha = -1;
    for (const layer of profile.layers) {
      const codes = bindingCodes(layer);
      const alpha = codes.filter((c) => ALPHA.test(c)).length;
      if (alpha > bestAlpha) {
        bestAlpha = alpha;
        bestId = layer.id;
      }
    }
    assignments = assignments.map((a) =>
      a.layerId === bestId ? LayerRoleAssignment.make({ ...a, role: "base" }) : a,
    );
  }

  return LayerRoleMap.make({
    profileId: profile.id,
    assignments,
  });
});

/**
 * Merge inferred roles with locked user overrides (locked wins).
 */
export const mergeLayerRoles = Effect.fn("Coach.mergeLayerRoles")(function* (
  inferred: LayerRoleMap,
  stored: LayerRoleMap | undefined,
) {
  if (!stored || stored.profileId !== inferred.profileId) return inferred;
  const locked = new Map(
    stored.assignments.filter((a) => a.locked).map((a) => [a.layerId, a] as const),
  );
  return LayerRoleMap.make({
    profileId: inferred.profileId,
    assignments: inferred.assignments.map((a) => locked.get(a.layerId) ?? a),
  });
});

export const layerRolesStorageKey = Effect.fn("Coach.layerRolesStorageKey")(function* (
  profileId: string,
) {
  return `kbgui.layer-roles.v1:${profileId}`;
});

export const loadLayerRolesEffect = Effect.fn("Coach.loadLayerRoles")(function* (
  profile: DeviceProfile,
) {
  const inferred = yield* inferLayerRoles(profile);
  const key = yield* layerRolesStorageKey(profile.id);
  const stored = yield* Preferences.getJson(key, LayerRoleMap).pipe(
    Effect.mapError(
      (error) => new LayerRolesError({ message: `Load layer roles failed: ${String(error)}` }),
    ),
  );
  return yield* mergeLayerRoles(inferred, stored);
});

export const setLayerRoleEffect = Effect.fn("Coach.setLayerRole")(function* (
  profile: DeviceProfile,
  layerId: string,
  role: LayerRole,
) {
  const current = yield* loadLayerRolesEffect(profile);
  const locked = LayerRoleAssignment.make({ layerId, role, locked: true });
  const found = current.assignments.some((a) => a.layerId === layerId);
  const next = LayerRoleMap.make({
    profileId: profile.id,
    assignments: found
      ? current.assignments.map((a) => (a.layerId === layerId ? locked : a))
      : [...current.assignments, locked],
  });
  const key = yield* layerRolesStorageKey(profile.id);
  yield* Preferences.setJson(key, LayerRoleMap, next).pipe(
    Effect.mapError(
      (error) => new LayerRolesError({ message: `Save layer roles failed: ${String(error)}` }),
    ),
  );
  return next;
});
