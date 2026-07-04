import { describe, expect, it } from "vite-plus/test";

import { createMockZmkBehaviorCatalog } from "./transport-mock-zmk";
import { decodeZmkBinding, encodeZmkBinding } from "./zmk-binding";
import type { Layer } from "./schema";

const layers: Layer[] = [
  { id: "zmk-layer-100", name: "Base", color: "#000", bindings: {} },
  { id: "zmk-layer-101", name: "Fn", color: "#111", bindings: {} },
  { id: "zmk-layer-102", name: "Nav", color: "#222", bindings: {} },
];

describe("ZMK binding codec", () => {
  it("round-trips the first supported key and layer behavior subset", () => {
    const catalog = createMockZmkBehaviorCatalog([100, 101, 102]);

    for (const code of ["KC_NO", "KC_TRNS", "KC_A", "KC_B", "MO(1)", "TO(2)", "TG(1)"]) {
      const encoded = encodeZmkBinding({ code }, catalog, layers);
      expect(encoded, code).toBeDefined();
      expect(decodeZmkBinding(encoded!, catalog).code).toBe(code);
    }
  });

  it("preserves unknown device behavior bindings as ZMK_BEHAVIOR text", () => {
    const catalog = createMockZmkBehaviorCatalog([100, 101, 102]);
    const deviceBinding = { behaviorId: 77, param1: -4, param2: 2048 };

    const decoded = decodeZmkBinding(deviceBinding, catalog);
    const encoded = encodeZmkBinding(decoded, catalog, layers);

    expect(decoded.code).toBe("ZMK_BEHAVIOR(77,-4,2048)");
    expect(encoded).toEqual(deviceBinding);
  });

  it("refuses unsupported source-only QMK behavior codes", () => {
    const catalog = createMockZmkBehaviorCatalog([100, 101, 102]);

    expect(encodeZmkBinding({ code: "QK_BOOT" }, catalog, layers)).toBeUndefined();
    expect(encodeZmkBinding({ code: "RGB_TOG" }, catalog, layers)).toBeUndefined();
  });
});
