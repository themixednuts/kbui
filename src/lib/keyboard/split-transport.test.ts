import { describe, expect, it } from "vite-plus/test";
import {
  isSplitTransportAllowed,
  normalizeSplitTransport,
  splitTransportDisabledReason,
} from "./split-transport";

const qmkSingle = { firmware: "qmk" as const, protocol: "via-v3" as const, name: "Workbench 65" };
const qmkSplit = { firmware: "qmk" as const, protocol: "via-v3" as const, name: "Corne Split" };
const zmk = { firmware: "zmk" as const, protocol: "zmk-studio" as const, name: "Sofle Split" };

describe("split transport availability", () => {
  it("always allows single-board default", () => {
    expect(isSplitTransportAllowed("none", qmkSingle)).toBe(true);
    expect(isSplitTransportAllowed("none", zmk)).toBe(true);
  });

  it("allows wired split options on QMK split boards only", () => {
    expect(isSplitTransportAllowed("serial", qmkSplit)).toBe(true);
    expect(isSplitTransportAllowed("i2c", qmkSplit)).toBe(true);
    expect(isSplitTransportAllowed("serial", qmkSingle)).toBe(false);
    expect(isSplitTransportAllowed("ble", qmkSplit)).toBe(false);
  });

  it("allows BLE on ZMK only", () => {
    expect(isSplitTransportAllowed("ble", zmk)).toBe(true);
    expect(isSplitTransportAllowed("serial", zmk)).toBe(false);
  });

  it("falls back to none when unsupported", () => {
    expect(normalizeSplitTransport("ble", qmkSingle)).toBe("none");
    expect(normalizeSplitTransport("serial", qmkSplit)).toBe("serial");
  });

  it("explains disabled options", () => {
    expect(splitTransportDisabledReason("ble", qmkSingle)).toBe("ZMK boards only");
    expect(splitTransportDisabledReason("serial", qmkSingle)).toBe("Split keyboards only");
    expect(splitTransportDisabledReason("serial", zmk)).toBe("QMK boards only");
  });
});
