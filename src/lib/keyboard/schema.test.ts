import { describe, expect, it } from "vitest";

import {
  cloneDevice,
  decodeDeviceProfileFromStorage,
  encodeDeviceProfileForStorage,
  normalizeDeviceKeycodes,
  normalizeQmkKeycode,
  profileFromDetection,
  qmkKeycodeLabel,
  qmkKeycodeName,
  qmkKeycodeValue,
  sampleKeyboard,
} from "./schema";

describe("QMK keycode decoding", () => {
  it("clones Svelte-proxied profile data back into plain JSON", () => {
    const proxied = new Proxy(sampleKeyboard, {}) as typeof sampleKeyboard;

    expect(cloneDevice(proxied)).toMatchObject({
      id: sampleKeyboard.id,
      name: sampleKeyboard.name,
    });
  });

  it("decodes VIA-imported mod-tap keycodes instead of showing raw hex", () => {
    expect(qmkKeycodeName(0x2225)).toBe("LSFT_T(KC_8)");
    expect(qmkKeycodeValue("LSFT_T(KC_8)")).toBe(0x2225);
    expect(normalizeQmkKeycode("0x2225")).toBe("LSFT_T(KC_8)");
  });

  it("decodes VIA-imported modified keycodes instead of showing raw hex", () => {
    expect(qmkKeycodeName(0x0119)).toBe("LCTL(KC_V)");
    expect(qmkKeycodeValue("LCTL(KC_V)")).toBe(0x0119);
    expect(qmkKeycodeValue("C(KC_V)")).toBe(0x0119);
    expect(normalizeQmkKeycode("0x0119")).toBe("LCTL(KC_V)");
  });

  it("decodes common layer keycode ranges", () => {
    expect(qmkKeycodeName(0x412c)).toBe("LT(1,KC_SPC)");
    expect(qmkKeycodeValue("LT(1,KC_SPC)")).toBe(0x412c);
    expect(qmkKeycodeName(0x5225)).toBe("MO(5)");
    expect(qmkKeycodeValue("MO(5)")).toBe(0x5225);
  });

  it("decodes direct QMK keycodes from QMK metadata", () => {
    expect(qmkKeycodeName(0x7c79)).toBe("QK_REPEAT_KEY");
    expect(qmkKeycodeValue("QK_REPEAT_KEY")).toBe(0x7c79);
    expect(qmkKeycodeValue("QK_REP")).toBe(0x7c79);
    expect(qmkKeycodeLabel("0x7c79")).toBe("Repeat");
    expect(normalizeQmkKeycode("0x7c79")).toBe("QK_REPEAT_KEY");

    expect(qmkKeycodeName(0x7c7b)).toBe("QK_LAYER_LOCK");
    expect(qmkKeycodeValue("QK_LLCK")).toBe(0x7c7b);
    expect(qmkKeycodeLabel("QK_LLCK")).toBe("Layer Lock");
  });

  it("accepts official QMK aliases for basic keycodes", () => {
    expect(qmkKeycodeValue("KC_ENTER")).toBe(0x0028);
    expect(qmkKeycodeValue("KC_SPACE")).toBe(0x002c);
    expect(normalizeQmkKeycode("KC_ENTER")).toBe("KC_ENT");
    expect(normalizeQmkKeycode("KC_SPACE")).toBe("KC_SPC");
  });

  it("uses decoded QMK names when importing a current VIA keymap", () => {
    const profile = profileFromDetection(sampleKeyboard, {
      identity: {
        key: "keyboard:feed:6060:test",
        transport: "webhid",
        vendorId: 0xfeed,
        productId: 0x6060,
        productName: "Test keyboard",
      },
      protocolVersion: 12,
      layerCount: 1,
      keymap: [[[0x2225, 0x0119, 0x7c79]]],
      capabilities: ["keymap", "layers"],
      notes: [],
    });

    expect(profile.layers[0].bindings["k0-0"]?.code).toBe("LSFT_T(KC_8)");
    expect(profile.layers[0].bindings["k0-1"]?.code).toBe("LCTL(KC_V)");
    expect(profile.layers[0].bindings["k0-2"]?.code).toBe("QK_REPEAT_KEY");
  });

  it("normalizes persisted raw hex bindings when profiles are restored", () => {
    const profile = normalizeDeviceKeycodes({
      ...sampleKeyboard,
      layers: [
        {
          ...sampleKeyboard.layers[0],
          bindings: {
            ...sampleKeyboard.layers[0].bindings,
            "k0-0": { code: "0x2225", hold: "0x5225", tap: "0x412c" },
            "k0-1": { code: "0x0119" },
          },
        },
      ],
    });

    expect(profile.layers[0].bindings["k0-0"]).toMatchObject({
      code: "LSFT_T(KC_8)",
      hold: "MO(5)",
      tap: "LT(1,KC_SPC)",
    });
    expect(profile.layers[0].bindings["k0-1"]?.code).toBe("LCTL(KC_V)");
  });

  it("stores known QMK bindings as canonical numeric codes", () => {
    const stored = encodeDeviceProfileForStorage({
      ...sampleKeyboard,
      layers: [
        {
          ...sampleKeyboard.layers[0],
          bindings: {
            ...sampleKeyboard.layers[0].bindings,
            "k0-0": { code: "LSFT_T(KC_8)", hold: "MO(5)", tap: "LT(1,KC_SPC)" },
            "k0-1": { code: "LCTL(KC_V)" },
          },
        },
      ],
    });

    expect(stored.layers[0].bindings["k0-0"]).toMatchObject({
      code: 0x2225,
      hold: 0x5225,
      tap: 0x412c,
    });
    expect(stored.layers[0].bindings["k0-1"]?.code).toBe(0x0119);

    expect(decodeDeviceProfileFromStorage(stored).layers[0].bindings["k0-0"]).toMatchObject({
      code: "LSFT_T(KC_8)",
      hold: "MO(5)",
      tap: "LT(1,KC_SPC)",
    });
    expect(decodeDeviceProfileFromStorage(stored).layers[0].bindings["k0-1"]?.code).toBe(
      "LCTL(KC_V)",
    );
  });

  it("keeps custom keycode strings when there is no canonical QMK code", () => {
    const stored = encodeDeviceProfileForStorage({
      ...sampleKeyboard,
      layers: [
        {
          ...sampleKeyboard.layers[0],
          bindings: {
            ...sampleKeyboard.layers[0].bindings,
            "k0-0": { code: "UM(7)" },
          },
        },
      ],
    });

    expect(stored.layers[0].bindings["k0-0"]?.code).toBe("UM(7)");
    expect(decodeDeviceProfileFromStorage(stored).layers[0].bindings["k0-0"]?.code).toBe("UM(7)");
  });
});
