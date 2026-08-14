import { Effect } from "effect";

import type { DeviceProfile } from "$lib/keyboard/schema";
import {
  layerIdsWithRole,
  loadLayerRolesEffect,
  type LayerRole,
  type LayerRoleMap,
} from "$lib/coach/layer-roles";

import { focusCharsFromScript, rankWeakTargets } from "./adaptive-lesson";
import type { BufferAtom, PracticeScript, PracticeSessionSummary } from "./contracts";
import { charToKeycode } from "./keycodes";
import { NAV_BOARD_PULSE } from "./nav-corpus";
import {
  hintForCandidate,
  pathHistoryFromSessions,
  predictKeyTargets,
  type PathHistory,
} from "./predict";

export interface BoardPulseTarget {
  readonly layerId: string | undefined;
  /** Target glyph key(s) only — use mod/activator fields for companions. */
  readonly keyIds: readonly string[];
  /** Display path hint (OSM+S(KC_EQL), OSL→KC_PLUS, …). */
  readonly keyHint: string;
  /** Raw binding code for history / personal stats. */
  readonly bindingCode: string;
  readonly roleHint: LayerRole | "unknown";
  readonly path?: "direct" | "modded" | "layer" | "layer-modded";
  readonly candidates?: number;
  readonly modKeyIds: readonly string[];
  readonly layerActivatorKeyIds: readonly string[];
  readonly modActivation?: "hold" | "one-shot" | "mod-tap" | "sticky";
  readonly layerAccessKind?:
    | "momentary"
    | "one-shot"
    | "toggle"
    | "switch"
    | "default"
    | "tap-toggle"
    | "layer-tap";
  readonly modsNeeded?: {
    readonly shift: boolean;
    readonly ctrl: boolean;
    readonly alt: boolean;
    readonly gui: boolean;
  };
  readonly modsEmbedded?: {
    readonly shift: boolean;
    readonly ctrl: boolean;
    readonly alt: boolean;
    readonly gui: boolean;
  };
  readonly modHomeLayerId?: string;
}

const emptyPulse = (partial: Partial<BoardPulseTarget> & Pick<BoardPulseTarget, "roleHint">): BoardPulseTarget => ({
  layerId: undefined,
  keyIds: [],
  keyHint: "",
  bindingCode: "",
  modKeyIds: [],
  layerActivatorKeyIds: [],
  ...partial,
});

const ROLE_HINTS: Record<string, LayerRole> = {
  base: "base",
  nav: "nav",
  numpad: "numpad",
  symbols: "symbols",
  adjust: "adjust",
};

export { charToKeycode } from "./keycodes";

/**
 * Resolve a nav pulse hint against the live profile using layer *roles*
 * (not layer index / hardcoded L1).
 */
export const resolveBoardPulse = Effect.fn("Practice.resolveBoardPulse")(function* (input: {
  readonly profile: DeviceProfile;
  readonly expected: string | undefined;
  readonly roles?: LayerRoleMap;
  readonly preferLayerId?: string;
}) {
  const hint = input.expected ? NAV_BOARD_PULSE[input.expected] : undefined;
  if (!hint) {
    return emptyPulse({ roleHint: "unknown" });
  }

  const roles = input.roles ?? (yield* loadLayerRolesEffect(input.profile));
  const roleHint = ROLE_HINTS[hint.layerHint] ?? "unknown";
  const roleLayerIds = yield* layerIdsWithRole(roles, roleHint);
  const layerId =
    (input.preferLayerId && roleLayerIds.includes(input.preferLayerId)
      ? input.preferLayerId
      : undefined) ??
    roleLayerIds[0] ??
    input.profile.layers[0]?.id;

  const keyIds: string[] = [];
  if (layerId) {
    const layer = input.profile.layers.find((l) => l.id === layerId);
    if (layer) {
      for (const [keyId, binding] of Object.entries(layer.bindings)) {
        if (binding.code === hint.keyHint) keyIds.push(keyId);
      }
    }
  }

  if (keyIds.length === 0) {
    for (const layer of input.profile.layers) {
      for (const [keyId, binding] of Object.entries(layer.bindings)) {
        if (binding.code === hint.keyHint) keyIds.push(keyId);
      }
    }
  }

  return emptyPulse({
    layerId,
    keyIds,
    keyHint: hint.keyHint,
    bindingCode: hint.keyHint,
    roleHint,
  });
});

/**
 * Pulse the physical key(s) that produce the expected buffer atom.
 * Uses predictive ranking: direct / shifted-base / layer copies.
 */
export const resolveTextPulse = Effect.fn("Practice.resolveTextPulse")(function* (input: {
  readonly profile: DeviceProfile;
  readonly atom: BufferAtom | undefined;
  readonly activeLayerId: string;
  readonly indentUsesTab?: boolean;
  readonly roles?: LayerRoleMap;
  readonly history?: readonly PathHistory[];
  readonly sessions?: readonly PracticeSessionSummary[];
  readonly hopPressure?: number;
}) {
  if (!input.atom) {
    return emptyPulse({ roleHint: "unknown" });
  }

  if (input.atom._tag === "Newline") {
    return yield* resolveByCodes({
      profile: input.profile,
      activeLayerId: input.activeLayerId,
      codes: ["KC_ENT"],
      roles: input.roles,
    });
  }

  if (input.atom._tag === "Indent") {
    return yield* resolveByCodes({
      profile: input.profile,
      activeLayerId: input.activeLayerId,
      codes: [input.indentUsesTab ? "KC_TAB" : "KC_SPC"],
      roles: input.roles,
    });
  }

  const history =
    input.history ??
    (input.sessions ? yield* pathHistoryFromSessions(input.sessions) : []);

  const prediction = yield* predictKeyTargets({
    profile: input.profile,
    char: input.atom.char,
    activeLayerId: input.activeLayerId,
    roles: input.roles,
    history,
    hopPressure: input.hopPressure,
  });

  if (!prediction.best) {
    return emptyPulse({
      keyHint: prediction.primaryCode === "KC_NO" ? "" : prediction.primaryCode,
      bindingCode: prediction.primaryCode === "KC_NO" ? "" : prediction.primaryCode,
      roleHint: "unknown",
      candidates: 0,
    });
  }

  // Target keys separate from mod companions / layer activators (UI roles differ).
  const top = prediction.best.score;
  const sameLayer = prediction.candidates.filter(
    (c) => c.layerId === prediction.best!.layerId && Math.abs(c.score - top) < 0.05,
  );
  const best = prediction.best;
  const keyIds = [...new Set(sameLayer.map((c) => c.keyId))];
  const modKeyIds = best.modKeyIds ?? [];
  const layerActivatorKeyIds = best.layerActivatorKeyIds ?? [];

  return {
    layerId: best.layerId,
    keyIds,
    keyHint: hintForCandidate(best),
    bindingCode: best.code,
    roleHint: best.role,
    path: best.path,
    candidates: prediction.candidates.length,
    modKeyIds,
    layerActivatorKeyIds,
    modsNeeded: best.modsNeeded,
    modsEmbedded: best.modsEmbedded,
    ...(best.modHomeLayerId ? { modHomeLayerId: best.modHomeLayerId } : {}),
    ...(best.modActivation ? { modActivation: best.modActivation } : {}),
    ...(best.layerAccessKind ? { layerAccessKind: best.layerAccessKind } : {}),
  } satisfies BoardPulseTarget;
});

const resolveByCodes = Effect.fnUntraced(function* (input: {
  profile: DeviceProfile;
  activeLayerId: string;
  codes: readonly string[];
  roles?: LayerRoleMap;
}) {
  const roles = input.roles;
  const active = input.profile.layers.find((l) => l.id === input.activeLayerId);
  const ordered = active
    ? [active, ...input.profile.layers.filter((l) => l.id !== active.id)]
    : input.profile.layers;
  for (const layer of ordered) {
    const keyIds: string[] = [];
    for (const [keyId, binding] of Object.entries(layer.bindings)) {
      if (input.codes.includes(binding.code)) keyIds.push(keyId);
    }
    if (keyIds.length > 0) {
      const role =
        roles?.assignments.find((a) => a.layerId === layer.id)?.role ?? "unknown";
      return emptyPulse({
        layerId: layer.id,
        keyIds,
        keyHint: input.codes[0] ?? "",
        bindingCode: input.codes[0] ?? "",
        roleHint: role,
        path: "direct",
        candidates: keyIds.length,
      });
    }
  }
  return emptyPulse({
    keyHint: input.codes[0] ?? "",
    bindingCode: input.codes[0] ?? "",
    roleHint: "unknown",
  });
});

const paintCode = Effect.fnUntraced(function* (
  heatByKeyId: Record<string, number>,
  profile: DeviceProfile,
  activeLayerId: string,
  code: string,
  intensity: number,
) {
  if (code === "KC_NO" || intensity <= 0) return;
  const active = profile.layers.find((l) => l.id === activeLayerId);
  const layers = active ? [active, ...profile.layers.filter((l) => l.id !== active.id)] : profile.layers;
  for (const layer of layers) {
    let hit = false;
    for (const [keyId, binding] of Object.entries(layer.bindings)) {
      if (binding.code === code) {
        heatByKeyId[keyId] = Math.max(heatByKeyId[keyId] ?? 0, intensity);
        hit = true;
      }
    }
    if (hit && layer.id === activeLayerId) return;
  }
});

/**
 * Heatmap: error-rate heat + current-lesson focus tint.
 * Searches active layer first, then falls back so symbols on other layers still glow.
 */
export const heatmapFromPractice = Effect.fn("Practice.heatmapFromPractice")(function* (input: {
  readonly profile: DeviceProfile;
  readonly sessions: readonly PracticeSessionSummary[];
  readonly activeLayerId: string;
  readonly script?: PracticeScript;
}) {
  const heatByKeyId: Record<string, number> = {};
  const weak = yield* rankWeakTargets(input.sessions, 16);

  for (const w of weak) {
    const prediction = yield* predictKeyTargets({
      profile: input.profile,
      char: w.char,
      activeLayerId: input.activeLayerId,
    });
    const intensity = Math.min(1, 0.2 + w.weight / 6 + (100 - w.accuracy) / 120);
    if (prediction.best) {
      for (const c of prediction.candidates.slice(0, 4)) {
        heatByKeyId[c.keyId] = Math.max(heatByKeyId[c.keyId] ?? 0, intensity * (c === prediction.best ? 1 : 0.55));
      }
    } else {
      const code = yield* charToKeycode(w.char);
      yield* paintCode(heatByKeyId, input.profile, input.activeLayerId, code, intensity);
    }
  }

  if (input.script) {
    const focus = yield* focusCharsFromScript(input.script);
    for (const ch of focus) {
      const prediction = yield* predictKeyTargets({
        profile: input.profile,
        char: ch,
        activeLayerId: input.activeLayerId,
      });
      if (prediction.best) {
        heatByKeyId[prediction.best.keyId] = Math.max(heatByKeyId[prediction.best.keyId] ?? 0, 0.28);
      } else {
        const code = yield* charToKeycode(ch);
        yield* paintCode(heatByKeyId, input.profile, input.activeLayerId, code, 0.28);
      }
    }
  }

  return heatByKeyId;
});
