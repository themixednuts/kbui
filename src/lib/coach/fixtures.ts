import { annotateSlotSync } from "./constraints";
import type { CoachLayoutFixture, CodingNgram } from "./contracts";

/** Minimal Charybdis-shaped fixture: L0 alphas pinned, L2 nav movable. */
export const CHARYBDIS_COACH_FIXTURE: CoachLayoutFixture = {
  id: "charybdis-coach-v1",
  name: "Charybdis coach fixture",
  slots: [
    // Base alphas (pinned) — role base, not layer index
    annotateSlotSync("2,1", "0", "KC_A", 2, 1, "base"),
    annotateSlotSync("2,2", "0", "KC_S", 2, 2, "base"),
    annotateSlotSync("2,3", "0", "KC_D", 2, 3, "base"),
    annotateSlotSync("2,4", "0", "KC_F", 2, 4, "base"),
    // Sacred thumbs
    annotateSlotSync("4,1", "0", "MO(1)", 4, 1, "base"),
    annotateSlotSync("4,2", "0", "KC_BSPC", 4, 2, "base"),
    annotateSlotSync("4,3", "0", "KC_SPC", 4, 3, "base"),
    annotateSlotSync("9,1", "0", "KC_ENT", 9, 1, "base"),
    // Numpad frozen by keycode on a numpad-role layer
    annotateSlotSync("1,1", "1", "KC_P7", 1, 1, "numpad"),
    annotateSlotSync("1,2", "1", "KC_P8", 1, 2, "numpad"),
    annotateSlotSync("1,3", "1", "KC_P9", 1, 3, "numpad"),
    // Trackball ignored
    annotateSlotSync("9,5", "3", "CUSTOM(0)", 9, 5, "adjust"),
    // Movable nav
    annotateSlotSync("7,0", "2", "KC_LEFT", 7, 0, "nav"),
    annotateSlotSync("7,5", "2", "KC_RGHT", 7, 5, "nav"),
    annotateSlotSync("6,2", "2", "KC_UP", 6, 2, "nav"),
    annotateSlotSync("8,2", "2", "KC_DOWN", 8, 2, "nav"),
    annotateSlotSync("6,3", "2", "KC_HOME", 6, 3, "nav"),
    annotateSlotSync("8,3", "2", "KC_END", 8, 3, "nav"),
    annotateSlotSync("5,1", "2", "KC_PGUP", 5, 1, "nav"),
    annotateSlotSync("5,2", "2", "KC_PGDN", 5, 2, "nav"),
    // Movable symbols (same physical layer id as numpad in fixture — role is per-slot flags)
    annotateSlotSync("0,1", "1", "KC_EXLM", 0, 1, "symbols"),
    annotateSlotSync("0,2", "1", "KC_AT", 0, 2, "symbols"),
    annotateSlotSync("0,3", "1", "KC_HASH", 0, 3, "symbols"),
    annotateSlotSync("3,1", "1", "KC_LPRN", 3, 1, "symbols"),
    annotateSlotSync("3,2", "1", "KC_RPRN", 3, 2, "symbols"),
  ],
};

/** Coding n-grams for Oxeylyzer-style layer scoring (punctuation-heavy). */
export const CODING_NGRAMS_V1: CodingNgram[] = [
  { grams: "()", weight: 5 },
  { grams: "[]", weight: 3.5 },
  { grams: "{}", weight: 3.5 },
  { grams: "<>", weight: 2.5 },
  { grams: "->", weight: 4 },
  { grams: "=>", weight: 3.5 },
  { grams: "::", weight: 4 },
  { grams: "?.", weight: 2.5 },
  { grams: "??", weight: 2 },
  { grams: "&&", weight: 2 },
  { grams: "||", weight: 2 },
  { grams: "!=", weight: 2 },
  { grams: "==", weight: 2.5 },
  { grams: "+=", weight: 1.5 },
  { grams: "-=", weight: 1.5 },
  { grams: "*=", weight: 1.2 },
  { grams: "/=", weight: 1.2 },
  { grams: "<<", weight: 1.5 },
  { grams: ">>", weight: 1.5 },
  { grams: "();", weight: 3 },
  { grams: "|;", weight: 1.5 },
  { grams: "&mut", weight: 2 },
  { grams: "&str", weight: 2 },
  { grams: "Ok(", weight: 2.5 },
  { grams: "Err(", weight: 2 },
  { grams: "Some(", weight: 2 },
  { grams: "None", weight: 1.5 },
  { grams: "await", weight: 2 },
  { grams: "match", weight: 2 },
  { grams: "println", weight: 1.5 },
  { grams: "fn ", weight: 2 },
  { grams: "let ", weight: 2 },
  { grams: "impl", weight: 1.8 },
  { grams: "Self", weight: 1.5 },
  { grams: "self.", weight: 2 },
  { grams: ".iter", weight: 1.8 },
  { grams: ".map(", weight: 1.8 },
  { grams: ".collect", weight: 1.5 },
  { grams: "unwrap", weight: 1.5 },
  { grams: "Result", weight: 1.8 },
  { grams: "Option", weight: 1.8 },
  { grams: "Vec<", weight: 2 },
  { grams: "HashMap", weight: 1.5 },
  { grams: "#[derive", weight: 1.5 },
  { grams: "use ", weight: 1.8 },
  { grams: "pub ", weight: 1.5 },
  { grams: "mod ", weight: 1.2 },
  { grams: "asyn", weight: 1.5 },
  { grams: "\"{}\"", weight: 2 },
  { grams: "{:?}", weight: 2 },
  { grams: "()?", weight: 2.5 },
  { grams: ")?", weight: 2 },
  { grams: "];", weight: 1.5 },
  { grams: "};", weight: 2 },
  { grams: ");", weight: 2.5 },
  { grams: "ud", weight: 1.5 },
  { grams: "lr", weight: 1.5 },
];

/**
 * Fixture where a clear home-row swap beats pinky arrows:
 * UP/DOWN on outer pinkies vs HOME/END on index — annealer should prefer swapping
 * toward lower stretch when n-grams hit those codes via personal stats path.
 */
export const IMPROVABLE_NAV_FIXTURE: CoachLayoutFixture = {
  id: "improvable-nav-v1",
  name: "Improvable nav",
  slots: [
    annotateSlotSync("2,1", "0", "KC_A", 2, 1, "base"),
    annotateSlotSync("4,1", "0", "MO(1)", 4, 1, "base"),
    annotateSlotSync("1,1", "1", "KC_P4", 1, 1, "numpad"),
    // High-effort: brackets on pinkies
    annotateSlotSync("6,0", "2", "KC_LPRN", 6, 0, "nav"),
    annotateSlotSync("6,5", "2", "KC_RPRN", 6, 5, "nav"),
    // Lower-effort home index slots holding less common codes
    annotateSlotSync("7,3", "2", "KC_PGUP", 7, 3, "nav"),
    annotateSlotSync("7,4", "2", "KC_PGDN", 7, 4, "nav"),
  ],
};
