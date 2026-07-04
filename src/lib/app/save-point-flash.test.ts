import { describe, expect, it } from "vite-plus/test";

import { starterBoardProfile } from "$lib/keyboard/sample-boards";
import { cloneDevice } from "$lib/keyboard/schema";
import type { ConnectionState } from "$lib/keyboard/transport";

import { planSavePointFlash } from "./save-point-flash";

function connectedVia(): ConnectionState {
  return {
    message: "Connected VIA keyboard",
    protocol: "via-v3",
    status: "connected",
    transport: "webhid",
    webBluetoothSupported: false,
    webHidSupported: true,
    webSerialSupported: false,
    webUsbSupported: false,
  };
}

describe("save point flash planning", () => {
  it("opens the real firmware overlay path when no live device is connected", () => {
    const base = starterBoardProfile();
    const profile = cloneDevice(base);
    profile.layers[0].bindings["k2-4"] = { code: "KC_G" };

    const plan = planSavePointFlash({
      baseProfile: base,
      connection: null,
      profile,
      savePointLabel: "Home row tweak",
    });

    expect(plan.kind).toBe("firmware-overlay");
    expect(plan.profile.layers[0].bindings["k2-4"].code).toBe("KC_G");
    expect(plan.changes).toEqual([
      expect.objectContaining({
        path: "layers/Base/k2-4",
        reason: expect.stringContaining("VIA dynamic keymap write"),
      }),
    ]);
  });

  it("uses live apply for a connected VIA board when every save-point change is writable", () => {
    const base = starterBoardProfile();
    const profile = cloneDevice(base);
    profile.layers[0].bindings["k2-4"] = { code: "KC_G" };

    const plan = planSavePointFlash({
      baseProfile: base,
      connection: connectedVia(),
      profile,
      savePointLabel: "Home row tweak",
    });

    if (plan.kind !== "live-apply") throw new Error(`Expected live apply, got ${plan.kind}`);

    expect(plan.message).toContain("live sync will write 1 key change");
    expect(plan.changes).toEqual([
      expect.objectContaining({
        path: "layers/Base/k2-4",
        reason: expect.stringContaining("VIA dynamic keymap write"),
      }),
    ]);
  });

  it("falls back to firmware overlay for connected VIA changes that require generated source", () => {
    const base = starterBoardProfile();
    const profile = cloneDevice(base);
    profile.combos = [
      ...profile.combos,
      {
        binding: "KC_ESC",
        id: "combo-flash",
        keys: ["k2-4", "k2-5"],
        name: "Flash combo",
      },
    ];

    const plan = planSavePointFlash({
      baseProfile: base,
      connection: connectedVia(),
      profile,
      savePointLabel: "Combo firmware",
    });

    expect(plan.kind).toBe("firmware-overlay");
    expect(plan.changes).toEqual([
      expect.objectContaining({
        path: "combos/Flash combo",
        reason: "Combo definitions are compiled firmware source.",
      }),
    ]);
  });
});
