import { Effect } from "effect";

import { parseLayerActivation, type LayerActivationKind } from "$lib/keyboard/layer-activations";
import type { DeviceProfile } from "$lib/keyboard/schema";

import type { ModState } from "./contracts";

/** How a modifier is engaged on the board. */
export type ModActivationKind = "hold" | "one-shot" | "mod-tap" | "sticky";

export type ModName = "shift" | "ctrl" | "alt" | "gui";

/** Physical source that can apply a modifier. */
export interface ModSource {
  readonly kind: ModActivationKind;
  readonly mod: ModName;
  readonly keyIds: readonly string[];
  readonly layerId: string;
  readonly code: string;
  /** Lower is better when ranking companions. */
  readonly preference: number;
}

/** How to reach a non-active layer for a candidate. */
export interface LayerAccess {
  readonly kind: LayerActivationKind;
  readonly activatorKeyIds: readonly string[];
  readonly activatorCode: string;
  readonly sourceLayerId: string;
  readonly targetLayerId: string;
  readonly preference: number;
}

const HOLD_MODS: Readonly<Record<string, ModName>> = {
  KC_LSFT: "shift",
  KC_RSFT: "shift",
  KC_LCTL: "ctrl",
  KC_RCTL: "ctrl",
  KC_LALT: "alt",
  KC_RALT: "alt",
  KC_LGUI: "gui",
  KC_RGUI: "gui",
};

const OSM_MODS: Readonly<Record<string, ModName>> = {
  MOD_LSFT: "shift",
  MOD_RSFT: "shift",
  MOD_LCTL: "ctrl",
  MOD_RCTL: "ctrl",
  MOD_LALT: "alt",
  MOD_RALT: "alt",
  MOD_LGUI: "gui",
  MOD_RGUI: "gui",
  KC_LSFT: "shift",
  KC_RSFT: "shift",
  KC_LCTL: "ctrl",
  KC_RCTL: "ctrl",
  KC_LALT: "alt",
  KC_RALT: "alt",
  KC_LGUI: "gui",
  KC_RGUI: "gui",
};

const MOD_TAP =
  /^(LSFT_T|RSFT_T|LCTL_T|RCTL_T|LALT_T|RALT_T|LGUI_T|RGUI_T|MT)\((.+)\)$/i;

const OSM_RE = /^OSM\(([^)]+)\)$/i;
const ZMK_SK_RE = /^ZMK_SK\(([^)]+)\)$/i;

const LAYER_PREF: Readonly<Record<LayerActivationKind, number>> = {
  "one-shot": 0,
  "layer-tap": 1,
  momentary: 2,
  "tap-toggle": 3,
  toggle: 4,
  switch: 5,
  default: 6,
};

const MOD_KIND_PREF: Readonly<Record<ModActivationKind, number>> = {
  "one-shot": 0,
  sticky: 0.25,
  "mod-tap": 1,
  hold: 1.5,
};

const normalize = (code: string) => code.trim().replace(/\s+/g, "").toUpperCase();

const modTapKind = (alias: string): ModName | null => {
  const a = alias.toUpperCase();
  if (a.includes("SFT") || a.includes("LSFT") || a.includes("RSFT")) return "shift";
  if (a.includes("CTL") || a.includes("CTRL")) return "ctrl";
  if (a.includes("ALT")) return "alt";
  if (a.includes("GUI") || a.includes("WIN")) return "gui";
  return null;
};

const parseMtMods = (inner: string): ModName | null => {
  const parts = inner.split(",").map((p) => p.trim().toUpperCase());
  const mask = parts[0] ?? "";
  if (mask.startsWith("MOD_")) return OSM_MODS[mask] ?? null;
  if (mask.includes("LSFT") || mask.includes("RSFT") || mask === "MOD_LSFT") return "shift";
  if (mask.includes("LCTL") || mask.includes("RCTL")) return "ctrl";
  if (mask.includes("LALT") || mask.includes("RALT")) return "alt";
  if (mask.includes("LGUI") || mask.includes("RGUI")) return "gui";
  return null;
};

/** Parse a single binding/combo code into a mod source shape (without key placement). */
export const parseModActivation = Effect.fn("Practice.parseModActivation")(function* (code: string) {
  const c = normalize(code);

  const hold = HOLD_MODS[c];
  if (hold) {
    return { kind: "hold" as const, mod: hold, code: c };
  }

  const osm = OSM_RE.exec(c);
  if (osm) {
    const inner = osm[1]!.toUpperCase();
    const mod = OSM_MODS[inner];
    if (mod) return { kind: "one-shot" as const, mod, code: c };
  }

  const sticky = ZMK_SK_RE.exec(c);
  if (sticky) {
    const inner = sticky[1]!.toUpperCase();
    const mod = HOLD_MODS[inner] ?? OSM_MODS[inner];
    if (mod) return { kind: "sticky" as const, mod, code: c };
  }

  const mt = MOD_TAP.exec(c);
  if (mt) {
    const alias = mt[1]!.toUpperCase();
    const inner = mt[2]!;
    const mod =
      alias === "MT" ? parseMtMods(inner) : modTapKind(alias);
    if (mod) return { kind: "mod-tap" as const, mod, code: c };
  }

  return null as {
    readonly kind: ModActivationKind;
    readonly mod: ModName;
    readonly code: string;
  } | null;
});

/** Collect every shift/ctrl/alt/gui source on the profile (keys + combos). */
export const collectModSources = Effect.fn("Practice.collectModSources")(function* (
  profile: DeviceProfile,
) {
  const out: ModSource[] = [];

  for (const layer of profile.layers) {
    for (const [keyId, binding] of Object.entries(layer.bindings)) {
      const fromCode = yield* parseModActivation(binding.code);
      if (fromCode) {
        out.push({
          ...fromCode,
          keyIds: [keyId],
          layerId: layer.id,
          preference: MOD_KIND_PREF[fromCode.kind],
        });
      }
      if (binding.hold) {
        const fromHold = yield* parseModActivation(binding.hold);
        if (fromHold) {
          out.push({
            kind: fromHold.kind === "hold" ? "mod-tap" : fromHold.kind,
            mod: fromHold.mod,
            keyIds: [keyId],
            layerId: layer.id,
            code: `hold:${binding.hold}`,
            preference: MOD_KIND_PREF["mod-tap"],
          });
        }
      }
    }
  }

  for (const combo of profile.combos ?? []) {
    const parsed = yield* parseModActivation(combo.binding);
    if (!parsed) continue;
    const layerIds =
      combo.layerIds && combo.layerIds.length > 0
        ? combo.layerIds
        : profile.layers.map((l) => l.id);
    for (const layerId of layerIds) {
      out.push({
        ...parsed,
        keyIds: [...combo.keys],
        layerId,
        preference: MOD_KIND_PREF[parsed.kind] - 0.15, // combos slightly preferred for Charybdis-style boards
        code: `combo:${combo.binding}`,
      });
    }
  }

  return out;
});

/** One concrete way to engage required companion mods (specific physical keys). */
export interface ModCompanionPlan {
  readonly keyIds: readonly string[];
  readonly sources: readonly ModSource[];
  readonly activation: ModActivationKind | null;
  /** Layer that hosts the primary companion (base Shift vs L1 Shift). */
  readonly homeLayerId: string;
  /** Lower is better for cold ranking. */
  readonly preference: number;
}

const pickCompanionsForPrefer = (
  sources: readonly ModSource[],
  neededMods: readonly ModName[],
  prefer: string,
  _activeLayerId: string,
): { picked: ModSource[]; keyIds: string[]; activation: ModActivationKind | null } | null => {
  const picked: ModSource[] = [];
  for (const mod of neededMods) {
    const ranked = sources
      .filter((s) => s.mod === mod)
      .map((s) => ({
        source: s,
        // Prefer-layer match dominates — don't let one-shot mods on another
        // layer steal the plan when we asked for target-layer companions.
        rank:
          s.preference +
          (s.layerId === prefer ? 0 : 2.5) +
          (s.keyIds.length > 1 ? -0.1 : 0),
      }))
      .sort((a, b) => a.rank - b.rank || a.source.code.localeCompare(b.source.code));
    const best = ranked[0]?.source;
    if (!best) return null;
    picked.push(best);
  }
  return {
    picked,
    keyIds: [...new Set(picked.flatMap((s) => s.keyIds))],
    activation: picked[0]?.kind ?? null,
  };
};

/** Best companion keys to engage `needed` mods from the active (or any) layer. */
export const bestModCompanions = Effect.fn("Practice.bestModCompanions")(function* (input: {
  readonly profile: DeviceProfile;
  readonly needed: ModState;
  readonly activeLayerId: string;
  /** Soft-prefer this layer for mod keys (e.g. base while holding MO). */
  readonly preferLayerId?: string;
  readonly sources?: readonly ModSource[];
}) {
  const sources = input.sources ?? (yield* collectModSources(input.profile));
  const prefer = input.preferLayerId ?? input.activeLayerId;
  const neededMods = (["shift", "ctrl", "alt", "gui"] as const).filter((m) => input.needed[m]);
  if (neededMods.length === 0) {
    return {
      keyIds: [] as string[],
      sources: [] as ModSource[],
      activation: null as ModActivationKind | null,
      homeLayerId: prefer,
    };
  }

  const picked = pickCompanionsForPrefer(sources, neededMods, prefer, input.activeLayerId);
  if (!picked) {
    return {
      keyIds: [] as string[],
      sources: [] as ModSource[],
      activation: null as ModActivationKind | null,
      homeLayerId: prefer,
    };
  }
  return {
    keyIds: picked.keyIds,
    sources: picked.picked,
    activation: picked.activation,
    homeLayerId: picked.picked[0]?.layerId ?? prefer,
  };
});

/**
 * Distinct companion plans for the same binding — e.g. base Shift then MO+[
 * vs MO then layer Shift+[ — when those Shift keys live on different layers.
 */
export const enumerateModCompanionPlans = Effect.fn("Practice.enumerateModCompanionPlans")(
  function* (input: {
    readonly profile: DeviceProfile;
    readonly needed: ModState;
    readonly activeLayerId: string;
    /** Layer that hosts the target binding. */
    readonly targetLayerId: string;
    readonly sources?: readonly ModSource[];
    readonly limit?: number;
  }) {
    const sources = input.sources ?? (yield* collectModSources(input.profile));
    const neededMods = (["shift", "ctrl", "alt", "gui"] as const).filter((m) => input.needed[m]);
    if (neededMods.length === 0) {
      return [
        {
          keyIds: [] as string[],
          sources: [] as ModSource[],
          activation: null as ModActivationKind | null,
          homeLayerId: input.activeLayerId,
          preference: 0,
        } satisfies ModCompanionPlan,
      ];
    }

    const anchors: string[] = [input.activeLayerId];
    if (input.targetLayerId !== input.activeLayerId) anchors.push(input.targetLayerId);

    const plans: ModCompanionPlan[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < anchors.length; i++) {
      const prefer = anchors[i]!;
      const picked = pickCompanionsForPrefer(sources, neededMods, prefer, input.activeLayerId);
      if (!picked || picked.keyIds.length === 0) continue;
      const fingerprint = `${prefer}:${[...picked.keyIds].sort().join(",")}`;
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      const homeLayerId = picked.picked[0]?.layerId ?? prefer;
      plans.push({
        keyIds: picked.keyIds,
        sources: picked.picked,
        activation: picked.activation,
        homeLayerId,
        // Cold bias: active-layer companions first when hopping (hold Shift, then MO).
        preference: i * 0.15 + (homeLayerId === prefer ? 0 : 0.05),
      });
    }

    plans.sort((a, b) => a.preference - b.preference);
    return plans.slice(0, input.limit ?? 4);
  },
);

/** Find how to open `targetLayerId` from `activeLayerId` (OSL / MO / LT / …). */
export const bestLayerAccess = Effect.fn("Practice.bestLayerAccess")(function* (input: {
  readonly profile: DeviceProfile;
  readonly activeLayerId: string;
  readonly targetLayerId: string;
}) {
  if (input.activeLayerId === input.targetLayerId) return null as LayerAccess | null;

  const targetIndex = input.profile.layers.findIndex((l) => l.id === input.targetLayerId);
  if (targetIndex < 0) return null as LayerAccess | null;

  const candidates: LayerAccess[] = [];
  const active = input.profile.layers.find((l) => l.id === input.activeLayerId);
  const searchLayers = active
    ? [active, ...input.profile.layers.filter((l) => l.id !== active.id)]
    : input.profile.layers;

  for (const layer of searchLayers) {
    for (const [keyId, binding] of Object.entries(layer.bindings)) {
      const parsed = parseLayerActivation(binding.code);
      if (!parsed) continue;
      if (parsed.targetLayerIndex !== targetIndex) continue;
      candidates.push({
        kind: parsed.kind,
        activatorKeyIds: [keyId],
        activatorCode: parsed.keycode,
        sourceLayerId: layer.id,
        targetLayerId: input.targetLayerId,
        preference:
          LAYER_PREF[parsed.kind] + (layer.id === input.activeLayerId ? 0 : 3),
      });
    }
  }

  candidates.sort((a, b) => a.preference - b.preference || a.activatorCode.localeCompare(b.activatorCode));
  return candidates[0] ?? null;
});

export const emptyMods = (): ModState => ({
  shift: false,
  ctrl: false,
  alt: false,
  gui: false,
});
