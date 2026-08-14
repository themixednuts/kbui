import { Effect, Schema } from "effect";

import type { LayerActivationKind } from "$lib/keyboard/layer-activations";

import type { ModState } from "./contracts";
import { emptyMods } from "./activations";

const requiredText = (minimum: number, maximum: number) =>
  Schema.Trim.check(Schema.isMinLength(minimum), Schema.isMaxLength(maximum));

/**
 * Coarse path family derived from production axes (not a special-case enum of combos).
 * - direct: key alone on the active layer
 * - modded: active layer + one or more mods (Shift/Ctrl/Alt/Gui)
 * - layer: other layer, no mods
 * - layer-modded: other layer + mods (e.g. MO + Shift + [)
 */
export const PathKind = Schema.Literals(["direct", "modded", "layer", "layer-modded"]);
export type PathKind = typeof PathKind.Type;

/** @deprecated Alias — prefer PathKind. Old session values normalize via normalizePathKind. */
export const ProductionPath = PathKind;
export type ProductionPath = PathKind;

export const ModStateSchema = Schema.Struct({
  shift: Schema.Boolean,
  ctrl: Schema.Boolean,
  alt: Schema.Boolean,
  gui: Schema.Boolean,
});

/**
 * How a binding produces a character: physical key + mods to apply + optional layer hop.
 * This is the production primitive; PathKind is a derived summary for ranking/history UI.
 */
export const ProductionAxes = Schema.Struct({
  layerId: requiredText(1, 80),
  keyId: requiredText(1, 40),
  /** Binding code as stored (may be LSFT(KC_LBRC) or bare KC_LBRC). */
  code: requiredText(1, 80),
  /** Base keycode after unwrapping mod aliases (KC_LBRC). */
  baseCode: requiredText(1, 80),
  /**
   * Mods the user must engage (hold / OSM / mod-tap companions).
   * Empty when mods are embedded in the keycode itself.
   */
  modsCompanion: ModStateSchema,
  /** Mods already applied by the binding wrapper (LSFT/C/HYPR/…). */
  modsEmbedded: ModStateSchema,
});
export interface ProductionAxes extends Schema.Schema.Type<typeof ProductionAxes> {}

export const anyMods = (m: ModState): boolean => m.shift || m.ctrl || m.alt || m.gui;

export const countMods = (m: ModState): number =>
  (m.shift ? 1 : 0) + (m.ctrl ? 1 : 0) + (m.alt ? 1 : 0) + (m.gui ? 1 : 0);

export const orMods = (a: ModState, b: ModState): ModState => ({
  shift: a.shift || b.shift,
  ctrl: a.ctrl || b.ctrl,
  alt: a.alt || b.alt,
  gui: a.gui || b.gui,
});

export const effectiveMods = (axes: Pick<ProductionAxes, "modsCompanion" | "modsEmbedded">): ModState =>
  orMods(axes.modsCompanion, axes.modsEmbedded);

export const modsFingerprint = (m: ModState): string =>
  `${m.shift ? "S" : ""}${m.ctrl ? "C" : ""}${m.alt ? "A" : ""}${m.gui ? "G" : ""}` || "_";

/** Derive coarse path family from whether we hop layers and whether any mods apply. */
export const derivePathKind = Effect.fn("Practice.derivePathKind")(function* (input: {
  readonly activeLayerId: string;
  readonly layerId: string;
  readonly mods: ModState;
}) {
  const offLayer = input.layerId !== input.activeLayerId;
  const modded = anyMods(input.mods);
  if (!offLayer && !modded) return "direct" as const satisfies PathKind;
  if (!offLayer && modded) return "modded" as const satisfies PathKind;
  if (offLayer && !modded) return "layer" as const satisfies PathKind;
  return "layer-modded" as const satisfies PathKind;
});

/** Normalize legacy path tags from persisted practice sessions. */
export const normalizePathKind = Effect.fn("Practice.normalizePathKind")(function* (raw: string) {
  if (raw === "shifted") return "modded" as const satisfies PathKind;
  if (raw === "layer-shifted") return "layer-modded" as const satisfies PathKind;
  if (raw === "direct" || raw === "modded" || raw === "layer" || raw === "layer-modded") {
    return raw;
  }
  return "direct" as const satisfies PathKind;
});

/**
 * US-QWERTY host map: shifted punctuation → unshifted base glyph.
 * Locale table for "char can also be Shift+base", not a per-glyph special case.
 */
export const US_QWERTY_SHIFT_BASE: Readonly<Record<string, string>> = {
  "!": "1",
  "@": "2",
  "#": "3",
  $: "4",
  "%": "5",
  "^": "6",
  "&": "7",
  "*": "8",
  "(": "9",
  ")": "0",
  _: "-",
  "+": "=",
  "{": "[",
  "}": "]",
  "|": "\\",
  ":": ";",
  '"': "'",
  "<": ",",
  ">": ".",
  "?": "/",
  "~": "`",
};

export const hostShiftBaseChar = Effect.fn("Practice.hostShiftBaseChar")(function* (ch: string) {
  return US_QWERTY_SHIFT_BASE[ch] ?? null;
});

/** @deprecated Use hostShiftBaseChar — kept for call-site compatibility. */
export const shiftBaseChar = hostShiftBaseChar;

const SINGLE_MOD_WRAPPERS: ReadonlyArray<{ readonly re: RegExp; readonly mods: ModState }> = [
  { re: /^(?:LSFT|RSFT|S)\((.+)\)$/i, mods: { shift: true, ctrl: false, alt: false, gui: false } },
  { re: /^(?:LCTL|RCTL|C)\((.+)\)$/i, mods: { shift: false, ctrl: true, alt: false, gui: false } },
  {
    re: /^(?:LALT|RALT|A|ALGR)\((.+)\)$/i,
    mods: { shift: false, ctrl: false, alt: true, gui: false },
  },
  {
    re: /^(?:LGUI|RGUI|G|LCMD|RCMD|LWIN|RWIN)\((.+)\)$/i,
    mods: { shift: false, ctrl: false, alt: false, gui: true },
  },
  { re: /^(?:LCA)\((.+)\)$/i, mods: { shift: false, ctrl: true, alt: true, gui: false } },
  { re: /^(?:LSA|SAGR)\((.+)\)$/i, mods: { shift: true, ctrl: false, alt: true, gui: false } },
  { re: /^(?:SGUI|LSG|RSG)\((.+)\)$/i, mods: { shift: true, ctrl: false, alt: false, gui: true } },
  { re: /^(?:LAG)\((.+)\)$/i, mods: { shift: false, ctrl: false, alt: true, gui: true } },
  { re: /^(?:RCS)\((.+)\)$/i, mods: { shift: false, ctrl: true, alt: false, gui: false } },
  { re: /^(?:MEH)\((.+)\)$/i, mods: { shift: true, ctrl: true, alt: true, gui: false } },
  { re: /^(?:HYPR)\((.+)\)$/i, mods: { shift: true, ctrl: true, alt: true, gui: true } },
];

const normalizeInnerKey = (inner: string) =>
  inner
    .trim()
    .toUpperCase()
    .replace(/^KC_LEFT_BRACKET$/, "KC_LBRC")
    .replace(/^KC_RIGHT_BRACKET$/, "KC_RBRC")
    .replace(/^KC_LEFT_CURLY_BRACE$/, "KC_LCBR")
    .replace(/^KC_RIGHT_CURLY_BRACE$/, "KC_RCBR");

export interface ParsedModBinding {
  readonly baseCode: string;
  readonly mods: ModState;
  readonly raw: string;
}

/**
 * Unwrap QMK mod-keycode aliases into base key + embedded mod axes.
 * Returns null for bare keycodes / layer ops / unknown shapes.
 */
export const parseModBinding = Effect.fn("Practice.parseModBinding")(function* (code: string) {
  const raw = code.trim();
  for (const { re, mods } of SINGLE_MOD_WRAPPERS) {
    const match = re.exec(raw.replace(/\s+/g, ""));
    if (!match) continue;
    const baseCode = normalizeInnerKey(match[1]!);
    if (!baseCode.startsWith("KC_") && !/^[A-Z0-9_]+$/.test(baseCode)) continue;
    const normalized = baseCode.startsWith("KC_") ? baseCode : `KC_${baseCode}`;
    return { baseCode: normalized, mods, raw } satisfies ParsedModBinding;
  }
  return null as ParsedModBinding | null;
});

/** @deprecated Prefer parseModBinding — shift-only unwrap kept for older call sites. */
export const unwrapShiftedBinding = Effect.fn("Practice.unwrapShiftedBinding")(function* (
  code: string,
) {
  const parsed = yield* parseModBinding(code);
  if (!parsed) return null as string | null;
  const pureShift =
    parsed.mods.shift && !parsed.mods.ctrl && !parsed.mods.alt && !parsed.mods.gui;
  return pureShift ? parsed.baseCode : null;
});

export const formatModsHint = (m: ModState, activation?: string | null): string => {
  const parts: string[] = [];
  const prefix =
    activation === "one-shot" || activation === "sticky"
      ? "OSM+"
      : activation === "mod-tap"
        ? "MT+"
        : "";
  if (m.shift) parts.push(`${prefix}Shift`);
  if (m.ctrl) parts.push(`${prefix}Ctrl`);
  if (m.alt) parts.push(`${prefix}Alt`);
  if (m.gui) parts.push(`${prefix}Gui`);
  return parts.length ? `${parts.join("+")}+` : "";
};

export const hintFromAxes = (input: {
  readonly code: string;
  readonly baseCode: string;
  readonly modsCompanion: ModState;
  readonly modsEmbedded: ModState;
  readonly layerActivatorCode?: string;
  readonly modActivation?: string | null;
}): string => {
  const companion = formatModsHint(input.modsCompanion, input.modActivation);
  const embedded = anyMods(input.modsEmbedded)
    ? // Embedded wrappers already imply the mod; show base for clarity when companions empty.
      anyMods(input.modsCompanion)
      ? ""
      : formatModsHint(input.modsEmbedded, null)
    : "";
  const mods = companion || embedded;
  const layer = input.layerActivatorCode ? `${input.layerActivatorCode}+` : "";
  const showBase =
    anyMods(input.modsCompanion) || anyMods(input.modsEmbedded)
      ? input.baseCode
      : input.code;
  return `${layer}${mods}${showBase}`;
};

/** Score cost from production axes (lower is better). */
export const scoreProductionAxes = Effect.fn("Practice.scoreProductionAxes")(function* (input: {
  readonly activeLayerId: string;
  readonly layerId: string;
  readonly path: PathKind;
  readonly modsCompanion: ModState;
  readonly modsEmbedded: ModState;
  readonly role: string;
  readonly preferSymbols: boolean;
  readonly historyBoost?: number;
  readonly pathFamilyBoost?: number;
  readonly hasModCompanion?: boolean;
  readonly modActivation?: string | null;
  readonly layerAccessKind?: LayerActivationKind | null;
  readonly hopPressure?: number;
}) {
  let score = 10;
  if (input.layerId === input.activeLayerId) score -= 4;

  switch (input.path) {
    case "direct":
      score -= 2;
      break;
    case "modded":
      score -= 0.5;
      break;
    case "layer":
      score -= 1;
      break;
    case "layer-modded":
      score += 0.35;
      break;
    default: {
      const _exhaustive: never = input.path;
      return _exhaustive;
    }
  }

  const companionCount = countMods(input.modsCompanion);
  const embeddedCount = countMods(input.modsEmbedded);
  score += companionCount * 0.35;
  score += embeddedCount * 0.1;

  if (input.preferSymbols && input.role === "symbols") score -= 3;
  if (input.role === "base" && input.path === "modded" && input.modsCompanion.shift) score -= 1.5;
  if (input.role === "numpad" || input.role === "adjust") score += 2;

  if (companionCount > 0) {
    if (!input.hasModCompanion) score += 3;
    else if (input.modActivation === "one-shot" || input.modActivation === "sticky") score -= 1.25;
    else if (input.modActivation === "mod-tap") score -= 0.4;
    else if (input.modActivation === "hold") score -= 0.15;
  }

  if (input.layerId !== input.activeLayerId) {
    if (input.layerAccessKind === "one-shot") score -= 1.1;
    else if (input.layerAccessKind === "layer-tap") score -= 0.5;
    else if (input.layerAccessKind === "momentary") score -= 0.25;
    else if (!input.layerAccessKind) score += 1.5;
  }

  const hops = input.hopPressure ?? 0;
  if (hops > 0) {
    if (input.layerId !== input.activeLayerId) score += Math.min(2.5, hops * 0.55);
    if (
      companionCount > 0 &&
      (input.modActivation === "one-shot" || input.modActivation === "sticky")
    ) {
      score -= Math.min(1, hops * 0.35);
    }
    if (input.path === "layer-modded") score += Math.min(1.5, hops * 0.4);
  }

  score -= Math.min(2.5, (input.historyBoost ?? 0) * 2.5);
  score -= Math.min(2, (input.pathFamilyBoost ?? 0) * 2);
  return score;
});

export { emptyMods };
