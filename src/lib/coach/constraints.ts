import { Effect } from "effect";

import type { CoachKeySlot } from "./contracts";
import type { LayerRole } from "./layer-roles";

const ALPHA = /^KC_[A-Z]$/;
const NUMPAD = /^KC_(P[0-9]|PDOT|PENT|PPLS|PMNS|PAST|PSLS|NLCK)/;
const TRACKBALL = /DPI|SNIP|DRAG|CUSTOM\(/i;
const SACRED_THUMB = /^(MO\(|LT\(|KC_SPC|KC_ENT|KC_BSPC|KC_LGUI|KC_LALT|KC_RGUI|KC_RALT)/;

/** Alphas are pinned only on layers with the base *role* — never by layer index. */
function isAlphaPinnedSync(code: string, layerRole: LayerRole): boolean {
  return layerRole === "base" && ALPHA.test(code);
}

function isNumpadFrozenSync(code: string): boolean {
  return NUMPAD.test(code);
}

function isTrackballIgnoredSync(code: string): boolean {
  return TRACKBALL.test(code);
}

function isSacredThumbSync(code: string, row: number): boolean {
  return (row === 4 || row === 9) && SACRED_THUMB.test(code);
}

function isMovableSync(slot: CoachKeySlot): boolean {
  if (slot.sacred || slot.numpad || slot.trackball) return false;
  if (isNumpadFrozenSync(slot.code)) return false;
  if (isTrackballIgnoredSync(slot.code)) return false;
  if (isSacredThumbSync(slot.code, slot.row)) return false;
  if (slot.code === "KC_NO" || slot.code === "KC_TRNS") return false;
  return true;
}

/** Trusted fixture/module construction. */
export function annotateSlotSync(
  keyId: string,
  layerId: string,
  code: string,
  row: number,
  col: number,
  layerRole: LayerRole = "unknown",
): CoachKeySlot {
  const sacred =
    isAlphaPinnedSync(code, layerRole) ||
    (layerRole === "base" && isSacredThumbSync(code, row));
  const numpad = isNumpadFrozenSync(code);
  const trackball = isTrackballIgnoredSync(code);
  return { keyId, layerId, code, row, col, sacred, numpad, trackball };
}

export const isAlphaPinned = Effect.fn("Coach.isAlphaPinned")(function* (
  code: string,
  layerRole: LayerRole,
) {
  return isAlphaPinnedSync(code, layerRole);
});

export const isNumpadFrozen = Effect.fn("Coach.isNumpadFrozen")(function* (code: string) {
  return isNumpadFrozenSync(code);
});

export const isTrackballIgnored = Effect.fn("Coach.isTrackballIgnored")(function* (code: string) {
  return isTrackballIgnoredSync(code);
});

export const isSacredThumb = Effect.fn("Coach.isSacredThumb")(function* (code: string, row: number) {
  return isSacredThumbSync(code, row);
});

export const isMovable = Effect.fn("Coach.isMovable")(function* (slot: CoachKeySlot) {
  return isMovableSync(slot);
});

export const annotateSlot = Effect.fn("Coach.annotateSlot")(function* (
  keyId: string,
  layerId: string,
  code: string,
  row: number,
  col: number,
  layerRole: LayerRole = "unknown",
) {
  return annotateSlotSync(keyId, layerId, code, row, col, layerRole);
});
