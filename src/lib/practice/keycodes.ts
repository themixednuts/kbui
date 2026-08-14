import { Effect } from "effect";

/** Map a typed character to a QMK-style keycode (dedicated code when it exists). */
export const charToKeycode = Effect.fn("Practice.charToKeycode")(function* (ch: string) {
  if (ch === "↵" || ch === "\n") return "KC_ENT";
  if (ch === " ") return "KC_SPC";
  if (ch === "⇥" || ch === "\t") return "KC_TAB";
  if (/^[a-z]$/i.test(ch)) return `KC_${ch.toUpperCase()}`;
  if (/^[0-9]$/.test(ch)) return `KC_${ch}`;
  const map: Record<string, string> = {
    ";": "KC_SCLN",
    ",": "KC_COMM",
    ".": "KC_DOT",
    "/": "KC_SLSH",
    "-": "KC_MINS",
    "=": "KC_EQL",
    "[": "KC_LBRC",
    "]": "KC_RBRC",
    "\\": "KC_BSLS",
    "'": "KC_QUOT",
    "(": "KC_LPRN",
    ")": "KC_RPRN",
    "<": "KC_LT",
    ">": "KC_GT",
    ":": "KC_COLN",
    "!": "KC_EXLM",
    "@": "KC_AT",
    "#": "KC_HASH",
    "*": "KC_ASTR",
    "+": "KC_PLUS",
    "&": "KC_AMPR",
    "?": "KC_QUES",
    "_": "KC_UNDS",
    "{": "KC_LCBR",
    "}": "KC_RCBR",
    "|": "KC_PIPE",
    "`": "KC_GRV",
    "~": "KC_TILD",
    "^": "KC_CIRC",
    "%": "KC_PERC",
    $: "KC_DLR",
    '"': "KC_DQUO",
  };
  return map[ch] ?? "KC_NO";
});
