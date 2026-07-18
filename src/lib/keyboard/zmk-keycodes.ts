import { normalizeQmkKeycode, qmkKeycodeName, qmkKeycodeValue } from "./schema";
import { qmkDirectKeycodes } from "./qmk-keycodes";

const layerTapPattern = /^LT\((\d+),(.+)\)$/i;
const layerPattern = /^(MO|TO|TG)\((\d+)\)$/i;
const modifiedPattern = /^(C|S|A|G|LCTL|LSFT|LALT|LGUI|RCTL|RSFT|RALT|RGUI)\((.+)\)$/i;
const modTapPattern = /^(LCTL|LSFT|LALT|LGUI|RCTL|RSFT|RALT|RGUI)_T\((.+)\)$/i;
const stickyKeyPattern = /^ZMK_SK\((.+)\)$/i;
const bluetoothProfilePattern = /^ZMK_BT_(SEL|DISC)\((\d+)\)$/i;

const zmkKeyNames: Record<string, string> = {
  KC_NO: "NO",
  KC_TRNS: "TRANS",
  KC_ESC: "ESC",
  KC_TAB: "TAB",
  KC_CAPS: "CAPS",
  KC_ENT: "ENTER",
  KC_SPC: "SPACE",
  KC_BSPC: "BSPC",
  KC_DEL: "DEL",
  KC_INS: "INS",
  KC_HOME: "HOME",
  KC_END: "END",
  KC_PGUP: "PG_UP",
  KC_PGDN: "PG_DN",
  KC_LEFT: "LEFT",
  KC_DOWN: "DOWN",
  KC_UP: "UP",
  KC_RGHT: "RIGHT",
  KC_MINS: "MINUS",
  KC_EQL: "EQUAL",
  KC_LBRC: "LBKT",
  KC_RBRC: "RBKT",
  KC_BSLS: "BSLH",
  KC_SCLN: "SEMI",
  KC_QUOT: "SQT",
  KC_GRV: "GRAVE",
  KC_COMM: "COMMA",
  KC_DOT: "DOT",
  KC_SLSH: "SLASH",
  KC_LCTL: "LCTRL",
  KC_LSFT: "LSHIFT",
  KC_LALT: "LALT",
  KC_LGUI: "LGUI",
  KC_RCTL: "RCTRL",
  KC_RSFT: "RSHIFT",
  KC_RALT: "RALT",
  KC_RGUI: "RGUI",
  KC_MUTE: "C_MUTE",
  KC_VOLU: "C_VOL_UP",
  KC_VOLD: "C_VOL_DN",
  KC_MPLY: "C_PP",
  KC_MPRV: "C_PREV",
  KC_MNXT: "C_NEXT",
  KC_BRID: "C_BRI_DN",
  KC_BRIU: "C_BRI_UP",
  KC_PSCR: "PSCRN",
  KC_PAUS: "PAUSE_BREAK",
};

for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") zmkKeyNames[`KC_${letter}`] = letter;
for (let index = 1; index <= 9; index += 1) zmkKeyNames[`KC_${index}`] = `N${index}`;
zmkKeyNames.KC_0 = "N0";
for (let index = 1; index <= 24; index += 1) zmkKeyNames[`KC_F${index}`] = `F${index}`;

const zmkModifierNames: Record<string, string> = {
  A: "LA",
  C: "LC",
  G: "LG",
  LALT: "LA",
  LCTL: "LC",
  LGUI: "LG",
  LSFT: "LS",
  RALT: "RA",
  RCTL: "RC",
  RGUI: "RG",
  RSFT: "RS",
  S: "LS",
};

const zmkModTapNames: Record<string, string> = {
  LALT: "LALT",
  LCTL: "LCTRL",
  LGUI: "LGUI",
  LSFT: "LSHIFT",
  RALT: "RALT",
  RCTL: "RCTRL",
  RGUI: "RGUI",
  RSFT: "RSHIFT",
};

const qmkModTapNames = Object.fromEntries(
  Object.entries(zmkModTapNames).map(([qmk, zmk]) => [zmk, qmk]),
);
const qmkModifierNames = Object.fromEntries(
  Object.entries(zmkModifierNames).map(([qmk, zmk]) => [zmk, qmk]),
);
const qmkCodesByZmkName = Object.fromEntries(
  Object.entries(zmkKeyNames).map(([qmk, zmk]) => [zmk, qmk]),
);

const zmkSpecialBindings: Record<string, string> = {
  ZMK_BT_CLR: "&bt BT_CLR",
  ZMK_BT_CLR_ALL: "&bt BT_CLR_ALL",
  ZMK_BT_NXT: "&bt BT_NXT",
  ZMK_BT_PRV: "&bt BT_PRV",
  ZMK_OUT_USB: "&out OUT_USB",
  ZMK_OUT_BLE: "&out OUT_BLE",
  ZMK_OUT_TOG: "&out OUT_TOG",
  ZMK_RESET: "&sys_reset",
  ZMK_BOOTLOADER: "&bootloader",
  ZMK_STUDIO_UNLOCK: "&studio_unlock",
  ZMK_CAPS_WORD: "&caps_word",
  ZMK_KEY_REPEAT: "&key_repeat",
  ZMK_SOFT_OFF: "&soft_off",
};

const canonicalSpecialBindings = Object.fromEntries(
  Object.entries(zmkSpecialBindings).map(([canonical, native]) => [
    native.toUpperCase(),
    canonical,
  ]),
);

export function zmkKeyNameForQmkCode(rawCode: string) {
  const normalized = normalizeQmkKeycode(rawCode).replace(/\s+/g, "").toUpperCase();
  const mapped = zmkKeyNames[normalized];
  if (mapped) return mapped;

  const value = qmkKeycodeValue(normalized);
  if (value === undefined) return undefined;

  const direct = qmkDirectKeycodes[value];
  if (
    !direct?.group ||
    !["basic", "internal", "media", "modifiers", "system"].includes(direct.group)
  ) {
    return undefined;
  }

  return zmkKeyNames[qmkKeycodeName(value)];
}

/** Returns the native devicetree binding for a canonical editor code. */
export function zmkBindingExpression(rawCode: string): string | undefined {
  const code = normalizeQmkKeycode(rawCode).replace(/\s+/g, "").toUpperCase();
  if (code === "KC_NO" || code === "XXXXXXX") return "&none";
  if (code === "KC_TRNS" || code === "KC_TRANSPARENT" || code === "_______") return "&trans";

  const special = zmkSpecialBindings[code];
  if (special) return special;

  const bluetoothProfile = bluetoothProfilePattern.exec(code);
  if (bluetoothProfile) return `&bt BT_${bluetoothProfile[1]} ${bluetoothProfile[2]}`;

  const stickyKey = stickyKeyPattern.exec(code);
  if (stickyKey) {
    const key = zmkKeyNameForQmkCode(stickyKey[1]);
    if (key) return `&sk ${key}`;
  }

  const layerTap = layerTapPattern.exec(code);
  if (layerTap) {
    const tap = zmkKeyNameForQmkCode(layerTap[2]);
    if (tap) return `&lt ${layerTap[1]} ${tap}`;
  }

  const layer = layerPattern.exec(code);
  if (layer) {
    const behavior =
      layer[1].toUpperCase() === "MO" ? "&mo" : layer[1].toUpperCase() === "TO" ? "&to" : "&tog";
    return `${behavior} ${layer[2]}`;
  }

  const modTap = modTapPattern.exec(code);
  if (modTap) {
    const modifier = zmkModTapNames[modTap[1].toUpperCase()];
    const tap = zmkKeyNameForQmkCode(modTap[2]);
    if (modifier && tap) return `&mt ${modifier} ${tap}`;
  }

  const modified = modifiedPattern.exec(code);
  if (modified) {
    const modifier = zmkModifierNames[modified[1].toUpperCase()];
    const tap = zmkKeyNameForQmkCode(modified[2]);
    if (modifier && tap) return `&kp ${modifier}(${tap})`;
  }

  const key = zmkKeyNameForQmkCode(code);
  return key ? `&kp ${key}` : undefined;
}

/** Converts native ZMK inspector input back to the editor's canonical binding code. */
export function canonicalCodeForZmkBinding(rawValue: string): string {
  const value = rawValue.trim();
  if (!value.startsWith("&")) return value;

  const normalized = value.replace(/\s+/g, " ").trim().toUpperCase();
  const special = canonicalSpecialBindings[normalized];
  if (special) return special;

  const parts = normalized.split(" ");
  if (parts[0] === "&NONE") return "KC_NO";
  if (parts[0] === "&TRANS") return "KC_TRNS";
  if (parts[0] === "&MO" && /^\d+$/.test(parts[1] ?? "")) return `MO(${parts[1]})`;
  if (parts[0] === "&TO" && /^\d+$/.test(parts[1] ?? "")) return `TO(${parts[1]})`;
  if ((parts[0] === "&TOG" || parts[0] === "&TG") && /^\d+$/.test(parts[1] ?? "")) {
    return `TG(${parts[1]})`;
  }
  if (parts[0] === "&LT" && /^\d+$/.test(parts[1] ?? "")) {
    const tap = qmkCodeForZmkKey(parts[2]);
    if (tap) return `LT(${parts[1]},${tap})`;
  }
  if (parts[0] === "&MT") {
    const modifier = qmkModTapNames[parts[1] ?? ""];
    const tap = qmkCodeForZmkKey(parts[2]);
    if (modifier && tap) return `${modifier}_T(${tap})`;
  }
  if (parts[0] === "&SK") {
    const key = qmkCodeForZmkKey(parts[1]);
    if (key) return `ZMK_SK(${key})`;
  }
  if (parts[0] === "&BT") {
    const command = parts[1];
    if (command === "BT_SEL" || command === "BT_DISC") {
      if (/^\d+$/.test(parts[2] ?? "")) return `ZMK_${command}(${parts[2]})`;
    } else if (["BT_CLR", "BT_CLR_ALL", "BT_NXT", "BT_PRV"].includes(command ?? "")) {
      return `ZMK_${command}`;
    }
  }
  if (parts[0] === "&OUT" && ["OUT_USB", "OUT_BLE", "OUT_TOG"].includes(parts[1] ?? "")) {
    return `ZMK_${parts[1]}`;
  }
  if (parts[0] === "&KP") {
    const modified = /^(L[CASG]|R[CASG])\((.+)\)$/.exec(parts[1] ?? "");
    if (modified) {
      const modifier = qmkModifierNames[modified[1]];
      const tap = qmkCodeForZmkKey(modified[2]);
      if (modifier && tap) return `${modifier}(${tap})`;
    }
    return qmkCodeForZmkKey(parts[1]) ?? value;
  }

  return value;
}

function qmkCodeForZmkKey(value: string | undefined) {
  if (!value) return undefined;
  return qmkCodesByZmkName[value.toUpperCase()];
}
