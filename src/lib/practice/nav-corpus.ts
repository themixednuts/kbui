import { Effect } from "effect";

import { IndentPolicy, PracticeScript, SESSION_GOAL_UNTIL_COMPLETE } from "./contracts";

/** Nav/editing drill — motion + chord actions; caret jumps across buffer ghost. */
export const NAV_DRILL_V1: PracticeScript = PracticeScript.make({
  id: "nav-v1",
  mode: "nav",
  title: "Nav · motions & chords",
  goal: SESSION_GOAL_UNTIL_COMPLETE,
  lines: [
    "fn main() {",
    "    let path = Path::new(\"./src\");",
    "    println!(\"{:?}\", path);",
    "}",
  ],
  indentUnitWidth: 4,
  indentPolicy: IndentPolicy.cases.Detect.make({ candidateWidth: 4 }),
  actions: [
    {
      id: "n1",
      kind: "motion",
      glyph: "↓",
      label: "move down",
      expected: "motion:down",
      cursor: { row: 1, col: 0 },
    },
    {
      id: "n2",
      kind: "motion",
      glyph: "w",
      label: "next word",
      expected: "motion:word",
      cursor: { row: 1, col: 4 },
    },
    {
      id: "n3",
      kind: "chord",
      glyph: "^D",
      label: "page half (Ctrl+D)",
      expected: "chord:half-page",
      cursor: { row: 2, col: 0 },
    },
    {
      id: "n4",
      kind: "motion",
      glyph: "↑",
      label: "move up",
      expected: "motion:up",
      cursor: { row: 1, col: 0 },
    },
    {
      id: "n5",
      kind: "chord",
      glyph: "gd",
      label: "goto definition",
      expected: "action:goto-def",
      cursor: { row: 1, col: 8 },
    },
  ],
});

export const defaultNavScript = Effect.fn("Practice.defaultNavScript")(function* () {
  return NAV_DRILL_V1;
});

/** Physical key pulse hints for next action (layer motion targets). */
export const NAV_BOARD_PULSE: Record<string, { layerHint: string; keyHint: string }> = {
  "motion:down": { layerHint: "nav", keyHint: "KC_DOWN" },
  "motion:up": { layerHint: "nav", keyHint: "KC_UP" },
  "motion:word": { layerHint: "base", keyHint: "KC_W" },
  "chord:half-page": { layerHint: "base", keyHint: "KC_D" },
  "action:goto-def": { layerHint: "base", keyHint: "KC_G" },
};
