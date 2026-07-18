import { describe, expect, it } from "vite-plus/test";

import type { WorkbenchStore } from "$lib/app/workbench-store.svelte";

import { createViaCatalogResolver } from "./via-catalog-resolver";

class BrowserDeviceIdentity {
  productId = 0x1833;
  productName = "Charybdis (4x6) Splinky";
  serialNumber = "NATIVE-HANDLE";
  vendorId = 0xa8f8;
}

describe("VIA catalog resolver", () => {
  it("reduces browser device identities to remote-safe plain data", async () => {
    let remoteIdentity: object | undefined;
    const resolver = createViaCatalogResolver({
      getViaKeyboardDetail: async () => {
        throw new Error("No VIA detail should be requested without a catalog match");
      },
      getViaKeyboardIndex: async () => ({ items: [] }),
      resolveKeyboardIdentity: async (identity) => {
        remoteIdentity = identity;
        return undefined;
      },
      workbench: { profile: {} } as WorkbenchStore,
    });

    await resolver.matrixHintFor(new BrowserDeviceIdentity());

    expect(Object.getPrototypeOf(remoteIdentity)).toBe(Object.prototype);
    expect(remoteIdentity).toEqual({
      productId: 0x1833,
      productName: "Charybdis (4x6) Splinky",
      vendorId: 0xa8f8,
    });
  });

  it("invokes getViaKeyboardIndex with zero arguments (regression: Effect must not leak an AbortSignal into the SvelteKit remote call)", async () => {
    let indexCalls: unknown[][] = [];
    const resolver = createViaCatalogResolver({
      getViaKeyboardDetail: async () => {
        throw new Error("No VIA detail should be requested without a catalog match");
      },
      getViaKeyboardIndex: async (...args: unknown[]) => {
        indexCalls.push(args);
        return { items: [] };
      },
      resolveKeyboardIdentity: async () => undefined,
      workbench: { profile: {} } as WorkbenchStore,
    });

    await resolver.matrixHintFor(new BrowserDeviceIdentity());

    expect(indexCalls.length).toBe(1);
    expect(indexCalls[0].length).toBe(0);
  });
});
