import { describe, expect, it } from "vite-plus/test";

import {
  canonicalCodeForFirmwareInput,
  firmwareBindingDisplay,
  firmwareKeycodeCatalog,
  firmwareQuickPickGroups,
} from "./firmware-keycode-catalog";
import { qmkKeycodeValue } from "./schema";

describe("firmware-aware inspector keycode catalog", () => {
  it("keeps the complete QMK catalog on QMK and VIA profiles", () => {
    const catalog = firmwareKeycodeCatalog("qmk", 4);

    expect(catalog).toHaveLength(736);
    expect(
      catalog.some((item) => item.code === "QK_BOOT" || item.aliases.includes("QK_BOOT")),
    ).toBe(true);
    expect(catalog.some((item) => item.group === "underglow")).toBe(true);
    expect(catalog.every((item) => qmkKeycodeValue(item.code) !== undefined)).toBe(true);
    expect(canonicalCodeForFirmwareInput("KC_ENTER", "qmk")).toBe("KC_ENT");
    expect(firmwareBindingDisplay("KC_A", "qmk")).toBe("A");
  });

  it("exposes native ZMK key, layer, hold-tap, Bluetooth, and output bindings", () => {
    const catalog = firmwareKeycodeCatalog("zmk", 3);
    const nativeCodes = new Set(catalog.map((item) => item.nativeCode));

    expect(nativeCodes.has("&kp A")).toBe(true);
    expect(nativeCodes.has("&mo 1")).toBe(true);
    expect(nativeCodes.has("&lt 1 SPACE")).toBe(true);
    expect(nativeCodes.has("&mt LCTRL A")).toBe(true);
    expect(nativeCodes.has("&bt BT_SEL 0")).toBe(true);
    expect(nativeCodes.has("&out OUT_BLE")).toBe(true);
    expect(catalog.some((item) => item.code === "QK_BOOT")).toBe(false);

    const groups = firmwareQuickPickGroups("zmk", 3).map((group) => group.name);
    expect(groups).toEqual(expect.arrayContaining(["Modifiers", "Layers", "Bluetooth", "Output"]));
  });

  it("accepts native ZMK syntax and converts it to canonical editor bindings", () => {
    expect(canonicalCodeForFirmwareInput("&kp A", "zmk")).toBe("KC_A");
    expect(canonicalCodeForFirmwareInput("&mo 2", "zmk")).toBe("MO(2)");
    expect(canonicalCodeForFirmwareInput("&lt 1 SPACE", "zmk")).toBe("LT(1,KC_SPC)");
    expect(canonicalCodeForFirmwareInput("&mt LCTRL A", "zmk")).toBe("LCTL_T(KC_A)");
    expect(canonicalCodeForFirmwareInput("&bt BT_SEL 3", "zmk")).toBe("ZMK_BT_SEL(3)");
    expect(canonicalCodeForFirmwareInput("&out OUT_BLE", "zmk")).toBe("ZMK_OUT_BLE");
  });
});
