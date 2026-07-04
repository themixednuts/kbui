import { describe, expect, it } from "vite-plus/test";

import { diffProfiles } from "./changes";
import { cloneDevice, sampleKeyboard } from "./schema";

describe("diffProfiles", () => {
  it("tracks combo name, chord, output, and layer scope edits", () => {
    const draft = cloneDevice(sampleKeyboard);
    draft.combos[0] = {
      ...draft.combos[0],
      name: "QW Escape edited",
      keys: ["k1-1", "k1-2", "k1-3"],
      binding: "KC_TAB",
      layerIds: ["base"],
    };

    const change = diffProfiles(sampleKeyboard, draft).find((item) => item.kind === "combo");

    expect(change).toMatchObject({
      scope: "Combos",
      path: "combos/QW Escape edited",
      before: "QW Escape: k1-1+k1-2 -> KC_ESC [all layers]",
      after: "QW Escape edited: k1-1+k1-2+k1-3 -> KC_TAB [base]",
    });
  });

  it("tracks tap dance edits and logic removals", () => {
    const draft = cloneDevice(sampleKeyboard);
    draft.tapDances[0] = {
      ...draft.tapDances[0],
      doubleTap: "KC_TAB",
    };
    draft.macros = draft.macros.slice(1);

    expect(diffProfiles(sampleKeyboard, draft)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "tapDance",
          before: "k2-0: tap KC_ESC hold KC_LCTL double KC_CAPS",
          after: "k2-0: tap KC_ESC hold KC_LCTL double KC_TAB",
        }),
        expect.objectContaining({
          kind: "macro",
          path: "macros/Open Terminal",
          after: "removed",
        }),
      ]),
    );
  });
});
