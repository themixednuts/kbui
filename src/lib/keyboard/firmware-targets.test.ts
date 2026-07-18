import { describe, expect, it } from "vitest";

import { qmkFirmwareTargets, zmkFirmwareTargets } from "./firmware-targets";

describe("firmware target candidates", () => {
  it("puts the detected QMK target first and removes duplicate alternatives", () => {
    expect(
      qmkFirmwareTargets({
        keyboard: "splitkb/aurora/corne/rev1",
        layout: "LAYOUT_split_3x6_3",
        alternatives: [
          { keyboard: "splitkb/aurora/corne/rev1", layout: "LAYOUT_split_3x6_3" },
          { keyboard: "splitkb/aurora/corne/rev1_proton_c", layout: "LAYOUT_split_3x6_3" },
        ],
      }),
    ).toEqual([
      { keyboard: "splitkb/aurora/corne/rev1", layout: "LAYOUT_split_3x6_3" },
      { keyboard: "splitkb/aurora/corne/rev1_proton_c", layout: "LAYOUT_split_3x6_3" },
    ]);
  });

  it("normalizes the legacy ZMK shield field and removes duplicate shields", () => {
    expect(
      zmkFirmwareTargets({
        board: "nice_nano_v2",
        shield: "corne_left",
        alternatives: [
          { board: "nice_nano_v2", shields: ["corne_left"] },
          { board: "seeeduino_xiao_ble", shields: ["corne_left", "corne_left"] },
        ],
      }),
    ).toEqual([
      { board: "nice_nano_v2", shields: ["corne_left"] },
      { board: "seeeduino_xiao_ble", shields: ["corne_left"] },
    ]);
  });
});
