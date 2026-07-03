import { describe, expect, it } from "vitest";

import { cloneDevice, sampleKeyboard } from "./schema";
import {
  captureMockKeyboardPacket,
  countMockKeyboardWrites,
  createMockKeyboardCapture,
  mockKeyboardEventSummary,
} from "./mock-device";

describe("mock keyboard capture", () => {
  it("captures accepted keymap writes with before and after keyboard state", () => {
    const before = cloneDevice(sampleKeyboard);
    const after = cloneDevice(sampleKeyboard);
    after.layers[0].bindings["k2-3"] = { code: "KC_A" };

    const capture = captureMockKeyboardPacket(
      createMockKeyboardCapture(before, true),
      before,
      after,
      {
        operation: "keymap.write",
        payload: { code: "KC_A" },
      },
      { keyId: "k2-3", layerId: "base" },
    );
    const [event] = capture.events;

    expect(event?.accepted).toBe(true);
    expect(event?.operation).toBe("keymap.write");
    expect(event?.target?.keyLabel).toBe("D");
    expect(event?.before.binding.code).toBe("KC_D");
    expect(event?.after.binding.code).toBe("KC_A");
    expect(event?.via?.ok).toBe(true);
    expect(event?.via?.commandName).toBe("dynamicKeymapSetKeycode");
    expect(countMockKeyboardWrites(capture)).toBe(1);
    expect(mockKeyboardEventSummary(event)).toBe("Keymap write Base/D: KC_A");
  });

  it("rejects malformed packets so tests can assert payload validation", () => {
    const profile = cloneDevice(sampleKeyboard);
    const capture = captureMockKeyboardPacket(
      createMockKeyboardCapture(profile, true),
      profile,
      profile,
      {
        operation: "keymap.write",
        payload: { code: "" },
      },
      { keyId: "k2-3", layerId: "base" },
    );
    const [event] = capture.events;

    expect(event?.accepted).toBe(false);
    expect(event?.errors).toContain("Keycode is empty");
    expect(capture.rejected).toBe(1);
    expect(countMockKeyboardWrites(capture)).toBe(0);
  });

  it("rejects behavior writes pointed at keys outside the profile", () => {
    const profile = cloneDevice(sampleKeyboard);
    const capture = captureMockKeyboardPacket(
      createMockKeyboardCapture(profile, true),
      profile,
      profile,
      {
        operation: "behavior.write",
        payload: { code: "LT(1,KC_SPC)" },
        target: { keyId: "missing", layerId: "base" },
      },
      { keyId: "k2-3", layerId: "base" },
    );
    const [event] = capture.events;

    expect(event?.accepted).toBe(false);
    expect(event?.errors).toContain("Target key is not in the current keyboard profile");
  });

  it("accepts batch per-key lighting writes", () => {
    const before = cloneDevice(sampleKeyboard);
    const after = cloneDevice(sampleKeyboard);
    after.lighting.keys = {
      "k2-3": { hue: 120, saturation: 80, brightness: 90 },
      "k2-4": { hue: 120, saturation: 80, brightness: 90 },
    };

    const capture = captureMockKeyboardPacket(
      createMockKeyboardCapture(before, true),
      before,
      after,
      {
        operation: "lighting.key.write",
        payload: {
          keyIds: ["k2-3", "k2-4"],
          hue: 120,
          saturation: 80,
          brightness: 90,
        },
        target: { path: "lighting.keys.batch" },
      },
      { keyId: "k2-3", layerId: "base" },
    );
    const [event] = capture.events;

    expect(event?.accepted).toBe(true);
    expect(mockKeyboardEventSummary(event)).toBe("lighting.key.write 2 keys");
  });

  it("captures non-key writes against explicit state paths", () => {
    const before = cloneDevice(sampleKeyboard);
    const after = cloneDevice(sampleKeyboard);
    after.settings.tappingTerm = 250;

    const capture = captureMockKeyboardPacket(
      createMockKeyboardCapture(before, true),
      before,
      after,
      {
        operation: "setting.write",
        payload: { key: "tappingTerm", value: 250 },
        target: { path: "settings.tappingTerm" },
      },
      { keyId: "k2-3", layerId: "base" },
    );
    const [event] = capture.events;

    expect(event?.accepted).toBe(true);
    expect(event?.target?.path).toBe("settings.tappingTerm");
    expect(event?.before.settings.tappingTerm).not.toBe(event?.after.settings.tappingTerm);
    expect(countMockKeyboardWrites(capture)).toBe(1);
  });
});
