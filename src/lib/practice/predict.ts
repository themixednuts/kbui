import { Effect, Schema } from "effect";

import type { DeviceProfile } from "$lib/keyboard/schema";
import {
  layerIdsWithRole,
  type LayerRole,
  type LayerRoleMap,
} from "$lib/coach/layer-roles";

import {
  bestLayerAccess,
  collectModSources,
  emptyMods,
  enumerateModCompanionPlans,
  type LayerAccess,
  type ModActivationKind,
  type ModCompanionPlan,
} from "./activations";
import type { ModState } from "./contracts";
import { charToKeycode } from "./keycodes";
import {
  anyMods,
  derivePathKind,
  effectiveMods,
  formatModsHint,
  hostShiftBaseChar,
  normalizePathKind,
  parseModBinding,
  PathKind,
  scoreProductionAxes,
  unwrapShiftedBinding,
  type PathKind as PathKindT,
} from "./production";

const requiredText = (minimum: number, maximum: number) =>
  Schema.Trim.check(Schema.isMinLength(minimum), Schema.isMaxLength(maximum));

/** @deprecated Prefer PathKind from production.ts */
export const ProductionPath = PathKind;
export type ProductionPath = PathKindT;

export const ModActivationKindSchema = Schema.Literals([
  "hold",
  "one-shot",
  "mod-tap",
  "sticky",
]);

export const LayerAccessKindSchema = Schema.Literals([
  "momentary",
  "one-shot",
  "toggle",
  "switch",
  "default",
  "tap-toggle",
  "layer-tap",
]);

export const KeyCandidate = Schema.Struct({
  layerId: requiredText(1, 80),
  keyId: requiredText(1, 40),
  code: requiredText(1, 80),
  baseCode: requiredText(1, 80),
  /** Derived summary of layer-hop × mods axes. */
  path: PathKind,
  score: Schema.Finite,
  role: Schema.Literals(["base", "nav", "numpad", "symbols", "adjust", "mixed", "unknown"]),
  /** Mods the user must engage via companions. */
  modsNeeded: Schema.Struct({
    shift: Schema.Boolean,
    ctrl: Schema.Boolean,
    alt: Schema.Boolean,
    gui: Schema.Boolean,
  }),
  /** Mods already applied by the binding wrapper. */
  modsEmbedded: Schema.Struct({
    shift: Schema.Boolean,
    ctrl: Schema.Boolean,
    alt: Schema.Boolean,
    gui: Schema.Boolean,
  }),
  modKeyIds: Schema.Array(requiredText(1, 40)).check(Schema.isMaxLength(8)),
  /** Layer that hosts the companion mods for this plan (base Shift vs L1 Shift). */
  modHomeLayerId: Schema.optionalKey(requiredText(1, 80)),
  modActivation: Schema.optionalKey(ModActivationKindSchema),
  layerActivatorKeyIds: Schema.Array(requiredText(1, 40)).check(Schema.isMaxLength(4)),
  layerAccessKind: Schema.optionalKey(LayerAccessKindSchema),
  layerActivatorCode: Schema.optionalKey(requiredText(1, 80)),
});
export interface KeyCandidate extends Schema.Schema.Type<typeof KeyCandidate> {}

export const KeyPrediction = Schema.Struct({
  char: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1)),
  primaryCode: requiredText(1, 80),
  candidates: Schema.Array(KeyCandidate).check(Schema.isMaxLength(64)),
  best: Schema.optionalKey(KeyCandidate),
});
export interface KeyPrediction extends Schema.Schema.Type<typeof KeyPrediction> {}

export {
  hostShiftBaseChar,
  parseModBinding,
  unwrapShiftedBinding,
  derivePathKind,
  normalizePathKind,
  PathKind,
};
export { shiftBaseChar } from "./production";

const normalizeCode = Effect.fnUntraced(function* (code: string) {
  const c = code.trim().toUpperCase();
  if (c === "KC_LEFT_BRACKET") return "KC_LBRC";
  if (c === "KC_RIGHT_BRACKET") return "KC_RBRC";
  if (c === "KC_LEFT_CURLY_BRACE") return "KC_LCBR";
  if (c === "KC_RIGHT_CURLY_BRACE") return "KC_RCBR";
  return c;
});

const roleFor = Effect.fnUntraced(function* (
  roles: LayerRoleMap | undefined,
  layerId: string,
): Generator<Effect.Effect<unknown>, LayerRole | "unknown", never> {
  if (!roles) return "unknown";
  const hit = roles.assignments.find((a) => a.layerId === layerId);
  return hit?.role ?? "unknown";
});

/** @deprecated Prefer scoreProductionAxes — thin adapter for older tests. */
export const scoreCandidate = Effect.fn("Practice.scoreCandidate")(function* (input: {
  readonly path: PathKindT;
  readonly layerId: string;
  readonly activeLayerId: string;
  readonly role: LayerRole | "unknown";
  readonly preferSymbols: boolean;
  readonly historyBoost?: number;
  readonly pathFamilyBoost?: number;
  readonly modActivation?: ModActivationKind | null;
  readonly hasModCompanion?: boolean;
  readonly layerAccessKind?: import("$lib/keyboard/layer-activations").LayerActivationKind | null;
  readonly hopPressure?: number;
  readonly modsCompanion?: ModState;
  readonly modsEmbedded?: ModState;
}) {
  return yield* scoreProductionAxes({
    activeLayerId: input.activeLayerId,
    layerId: input.layerId,
    path: input.path,
    modsCompanion: input.modsCompanion ?? emptyMods(),
    modsEmbedded: input.modsEmbedded ?? emptyMods(),
    role: input.role,
    preferSymbols: input.preferSymbols,
    historyBoost: input.historyBoost,
    pathFamilyBoost: input.pathFamilyBoost,
    hasModCompanion: input.hasModCompanion,
    modActivation: input.modActivation,
    layerAccessKind: input.layerAccessKind,
    hopPressure: input.hopPressure,
  });
});

export interface PathHistory {
  readonly code: string;
  readonly layerId: string;
  readonly path: PathKindT;
  /** Fingerprint of companion keys so base-Shift vs L1-Shift stay distinct. */
  readonly modKeyFingerprint?: string;
  readonly successes: number;
  readonly attempts: number;
}

export const hintForCandidate = (c: {
  path: PathKindT;
  code: string;
  baseCode?: string;
  modsNeeded?: ModState;
  modsEmbedded?: ModState;
  modActivation?: ModActivationKind;
  modHomeLayerId?: string;
  layerActivatorCode?: string;
}): string => {
  const companion = c.modsNeeded ?? emptyMods();
  const embedded = c.modsEmbedded ?? emptyMods();
  let mods = formatModsHint(companion, c.modActivation);
  if (!mods && anyMods(embedded)) mods = formatModsHint(embedded, null);
  if (mods && c.modHomeLayerId) {
    mods = mods.replace(/(Shift|Ctrl|Alt|Gui)\+$/, `$1@${c.modHomeLayerId}+`);
  }
  const layer = c.layerActivatorCode ? `${c.layerActivatorCode}+` : "";
  const showBase =
    anyMods(companion) || anyMods(embedded) ? (c.baseCode ?? c.code) : c.code;
  return `${layer}${mods}${showBase}`;
};

/**
 * Predict physical productions for `char` as binding × mods × layer-access axes.
 * PathKind is derived; ranking adapts from session history.
 */
export const predictKeyTargets = Effect.fn("Practice.predictKeyTargets")(function* (input: {
  readonly profile: DeviceProfile;
  readonly char: string;
  readonly activeLayerId: string;
  readonly roles?: LayerRoleMap;
  readonly history?: readonly PathHistory[];
  readonly hopPressure?: number;
}) {
  const primaryCode = yield* charToKeycode(input.char);
  const roles =
    input.roles ??
    ({
      profileId: input.profile.id,
      assignments: [],
    } satisfies LayerRoleMap);
  const baseChar = yield* hostShiftBaseChar(input.char);
  const hostShiftBaseCode = baseChar ? yield* charToKeycode(baseChar) : null;
  const preferSymbols = Boolean(baseChar) || /[^a-zA-Z0-9\s]/.test(input.char);

  const symbolLayerIds = new Set(yield* layerIdsWithRole(roles, "symbols"));
  const history = input.history ?? [];
  const modSources = yield* collectModSources(input.profile);

  const historyBoostFor = (
    code: string,
    layerId: string,
    path: PathKindT,
    modKeyFingerprint: string,
  ) => {
    const row = history.find(
      (h) =>
        h.code === code &&
        h.layerId === layerId &&
        h.path === path &&
        (h.modKeyFingerprint ?? "") === modKeyFingerprint,
    );
    if (!row || row.attempts === 0) return 0;
    return row.successes / row.attempts;
  };

  const pathFamilyBoostFor = (path: PathKindT) => {
    let successes = 0;
    let attempts = 0;
    for (const row of history) {
      if (row.path !== path) continue;
      if (
        row.code !== primaryCode &&
        row.code !== hostShiftBaseCode &&
        !(hostShiftBaseCode && row.code.includes(hostShiftBaseCode)) &&
        !row.code.includes(primaryCode)
      ) {
        continue;
      }
      successes += row.successes;
      attempts += row.attempts;
    }
    if (attempts === 0) return 0;
    return successes / attempts;
  };

  const candidates: KeyCandidate[] = [];
  const seen = new Set<string>();

  const pushPlan = Effect.fnUntraced(function* (args: {
    layerId: string;
    keyId: string;
    code: string;
    baseCode: string;
    modsCompanion: ModState;
    modsEmbedded: ModState;
    plan: ModCompanionPlan;
    layerAccess: LayerAccess | null;
  }) {
    const mods = effectiveMods(args);
    const path = yield* derivePathKind({
      activeLayerId: input.activeLayerId,
      layerId: args.layerId,
      mods,
    });
    const modFp =
      args.plan.keyIds.length === 0
        ? ""
        : `${args.plan.homeLayerId}:${[...args.plan.keyIds].sort().join(",")}`;
    const key = `${args.layerId}:${args.keyId}:${path}:${args.code}:${modFp}`;
    if (seen.has(key)) return;
    seen.add(key);

    const needsCompanion = anyMods(args.modsCompanion);
    const role = yield* roleFor(roles, args.layerId);
    let score = yield* scoreProductionAxes({
      activeLayerId: input.activeLayerId,
      layerId: args.layerId,
      path,
      modsCompanion: args.modsCompanion,
      modsEmbedded: args.modsEmbedded,
      role,
      preferSymbols,
      historyBoost: historyBoostFor(args.code, args.layerId, path, modFp),
      pathFamilyBoost: pathFamilyBoostFor(path),
      modActivation: args.plan.activation,
      hasModCompanion: args.plan.keyIds.length > 0 || !needsCompanion,
      layerAccessKind: args.layerAccess?.kind ?? null,
      hopPressure: input.hopPressure,
    });
    score += args.plan.preference;

    const adjusted =
      preferSymbols &&
      symbolLayerIds.has(args.layerId) &&
      (path === "layer" || path === "direct")
        ? score - 0.75
        : score;

    candidates.push(
      KeyCandidate.make({
        layerId: args.layerId,
        keyId: args.keyId,
        code: args.code,
        baseCode: args.baseCode,
        path,
        score: adjusted,
        role,
        modsNeeded: args.modsCompanion,
        modsEmbedded: args.modsEmbedded,
        modKeyIds: [...args.plan.keyIds],
        layerActivatorKeyIds: args.layerAccess?.activatorKeyIds ?? [],
        ...(args.plan.keyIds.length > 0 ? { modHomeLayerId: args.plan.homeLayerId } : {}),
        ...(args.plan.activation ? { modActivation: args.plan.activation } : {}),
        ...(args.layerAccess
          ? {
              layerAccessKind: args.layerAccess.kind,
              layerActivatorCode: args.layerAccess.activatorCode,
            }
          : {}),
      }),
    );
  });

  const push = Effect.fnUntraced(function* (args: {
    layerId: string;
    keyId: string;
    code: string;
    baseCode: string;
    modsCompanion: ModState;
    modsEmbedded: ModState;
  }) {
    const layerAccess =
      args.layerId === input.activeLayerId
        ? null
        : yield* bestLayerAccess({
            profile: input.profile,
            activeLayerId: input.activeLayerId,
            targetLayerId: args.layerId,
          });

    const plans = anyMods(args.modsCompanion)
      ? yield* enumerateModCompanionPlans({
          profile: input.profile,
          needed: args.modsCompanion,
          activeLayerId: input.activeLayerId,
          targetLayerId: args.layerId,
          sources: modSources,
        })
      : [
          {
            keyIds: [] as string[],
            sources: [],
            activation: null,
            homeLayerId: input.activeLayerId,
            preference: 0,
          } satisfies ModCompanionPlan,
        ];

    for (const plan of plans) {
      yield* pushPlan({ ...args, plan, layerAccess });
    }
  });

  for (const layer of input.profile.layers) {
    for (const [keyId, binding] of Object.entries(layer.bindings)) {
      const raw = binding.code;
      const code = yield* normalizeCode(raw);

      // Dedicated binding for the character (KC_LCBR, KC_PLUS, …).
      if (primaryCode !== "KC_NO" && code === primaryCode) {
        yield* push({
          layerId: layer.id,
          keyId,
          code: primaryCode,
          baseCode: primaryCode,
          modsCompanion: emptyMods(),
          modsEmbedded: emptyMods(),
        });
      }

      // Wrapper bindings: LSFT(KC_x) / S(KC_x) produce shifted host glyphs.
      // Ctrl/Alt/Gui wrappers are chords, not printable character productions.
      const parsed = yield* parseModBinding(raw);
      if (parsed) {
        const base = yield* normalizeCode(parsed.baseCode);
        const pureShift =
          parsed.mods.shift && !parsed.mods.ctrl && !parsed.mods.alt && !parsed.mods.gui;
        if (
          pureShift &&
          hostShiftBaseCode !== null &&
          base === hostShiftBaseCode
        ) {
          yield* push({
            layerId: layer.id,
            keyId,
            code: raw,
            baseCode: base,
            modsCompanion: emptyMods(),
            modsEmbedded: parsed.mods,
          });
        }
      }

      // Host Shift map: bare base key + companion Shift → desired char.
      if (
        hostShiftBaseCode &&
        code === hostShiftBaseCode &&
        primaryCode !== hostShiftBaseCode
      ) {
        yield* push({
          layerId: layer.id,
          keyId,
          code: hostShiftBaseCode,
          baseCode: hostShiftBaseCode,
          modsCompanion: { ...emptyMods(), shift: true },
          modsEmbedded: emptyMods(),
        });
      }
    }
  }

  candidates.sort((a, b) => a.score - b.score || a.keyId.localeCompare(b.keyId));
  const best = candidates[0];

  return KeyPrediction.make({
    char: input.char,
    primaryCode,
    candidates: candidates.slice(0, 32),
    ...(best ? { best } : {}),
  });
});

/** Aggregate successful path history from practice CharTyped contexts. */
export const pathHistoryFromSessions = Effect.fn("Practice.pathHistoryFromSessions")(function* (
  sessions: readonly {
    readonly events: readonly {
      readonly _tag: string;
      readonly correct?: boolean;
      readonly expected?: string;
      readonly context?: {
        readonly predictedCode?: string | null;
        readonly predictedLayerId?: string | null;
        readonly predictedPath?: string | null;
        readonly modKeyIds?: readonly string[];
        readonly modHomeLayerId?: string | null;
      };
    }[];
  }[],
) {
  const map = new Map<string, { successes: number; attempts: number }>();
  for (const session of sessions) {
    for (const event of session.events) {
      if (event._tag !== "CharTyped") continue;
      const ctx = event.context;
      if (!ctx?.predictedCode || !ctx.predictedLayerId || !ctx.predictedPath) continue;
      const path = yield* normalizePathKind(ctx.predictedPath);
      const modHome = ctx.modHomeLayerId ?? "";
      const modKeys = [...(ctx.modKeyIds ?? [])].sort().join(",");
      const modFp = modKeys.length === 0 ? "" : `${modHome}:${modKeys}`;
      const key = `${ctx.predictedCode}\0${ctx.predictedLayerId}\0${path}\0${modFp}`;
      const prev = map.get(key) ?? { successes: 0, attempts: 0 };
      prev.attempts += 1;
      if (event.correct) prev.successes += 1;
      map.set(key, prev);
    }
  }
  const out: PathHistory[] = [];
  for (const [key, s] of map) {
    const [code, layerId, path, modFp] = key.split("\0");
    out.push({
      code: code!,
      layerId: layerId!,
      path: path as PathKindT,
      ...(modFp ? { modKeyFingerprint: modFp } : {}),
      successes: s.successes,
      attempts: s.attempts,
    });
  }
  return out;
});
