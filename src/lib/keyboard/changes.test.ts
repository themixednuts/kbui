import { describe, expect, it } from "vitest";

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
});
