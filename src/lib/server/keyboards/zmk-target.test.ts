import { describe, expect, it } from "vite-plus/test";

import { parseZmkHardwareMetadata } from "./zmk-target";

describe("ZMK hardware target resolution", () => {
  it("reads official shield metadata including split siblings", () => {
    expect(
      parseZmkHardwareMetadata(
        "app/boards/shields/corne/corne.zmk.yml",
        `file_format: "1"
id: corne
name: Corne
type: shield
requires: [pro_micro]
siblings:
  - corne_left
  - corne_right
`,
      ),
    ).toEqual({
      exposes: [],
      id: "corne",
      name: "Corne",
      path: "app/boards/shields/corne/corne.zmk.yml",
      requires: ["pro_micro"],
      siblings: ["corne_left", "corne_right"],
      type: "shield",
    });
  });

  it("reads the official interconnects exposed by controller boards", () => {
    expect(
      parseZmkHardwareMetadata(
        "app/boards/nicekeyboards/nice_nano/nice_nano.zmk.yml",
        `file_format: "1"
id: nice_nano//zmk
name: nice!nano
type: board
exposes: [pro_micro]
`,
      ),
    ).toMatchObject({
      exposes: ["pro_micro"],
      id: "nice_nano//zmk",
      type: "board",
    });
  });
});
