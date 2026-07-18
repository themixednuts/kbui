import { describe, expect, it } from "vite-plus/test";

import type { WorkbenchStore } from "$lib/app/workbench-store.svelte";
import type { KeyboardCatalogEntry, KeyboardCatalogIndexEntry } from "$lib/keyboard/catalog";
import type { ConnectionState } from "$lib/keyboard/transport";

import { createViaCatalogResolver } from "./via-catalog-resolver";

class BrowserDeviceIdentity {
  productId = 0x1833;
  productName = "Charybdis (4x6) Splinky";
  serialNumber = "NATIVE-HANDLE";
  vendorId = 0xa8f8;
}

const CHARYBDIS_VENDOR_ID = 0xa8f8;
const CHARYBDIS_PRODUCT_ID = 0x1833;

function charybdisSummary(): KeyboardCatalogIndexEntry {
  return {
    id: "bastardkb/charybdis/4x6",
    name: "Charybdis (4x6) Splinky",
    vendor: "Bastard Keyboards",
    source: "via-v3",
    sourcePath: "bastardkb/charybdis/4x6.json",
    vendorId: CHARYBDIS_VENDOR_ID,
    productId: CHARYBDIS_PRODUCT_ID,
    matrix: { rows: 8, cols: 6 },
    layout: { width: 6, height: 8, keyCount: 1 },
    capabilities: ["keymap", "layers"],
    priority: 100,
  };
}

function charybdisDetail(): KeyboardCatalogEntry {
  return {
    ...charybdisSummary(),
    keys: [{ id: "k0-0", label: "R0C0", row: 0, col: 0, x: 0, y: 0, width: 1, height: 1 }],
    combos: [],
    defaultLayers: [],
  };
}

function connectedCharybdis(): ConnectionState {
  return {
    status: "connected",
    transport: "webhid",
    message: "Connected",
    detection: {
      identity: {
        key: "keyboard:a8f8:1833:charybdis",
        transport: "webhid",
        vendorId: CHARYBDIS_VENDOR_ID,
        productId: CHARYBDIS_PRODUCT_ID,
        productName: "Charybdis (4x6) Splinky",
      },
      layerCount: 4,
      capabilities: ["keymap", "layers"],
      notes: [],
    },
    webBluetoothSupported: false,
    webSerialSupported: false,
    webUsbSupported: false,
    webHidSupported: true,
  };
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

  it("still produces a VIA-detail profile when QMK identity resolution fails (free-plan 503)", async () => {
    let detailRequested = false;
    const resolver = createViaCatalogResolver({
      getViaKeyboardDetail: async (id) => {
        detailRequested = true;
        expect(id).toBe("bastardkb/charybdis/4x6");
        return charybdisDetail();
      },
      getViaKeyboardIndex: async () => ({ items: [charybdisSummary()] }),
      resolveKeyboardIdentity: async () => {
        throw new Error("Worker exceeded CPU time limit");
      },
      workbench: { profile: {} } as WorkbenchStore,
    });

    const profile = await resolver.baseProfileForConnection(connectedCharybdis());

    expect(detailRequested).toBe(true);
    expect(profile).toBeDefined();
    expect(profile?.name).toBe("Charybdis (4x6) Splinky");
    // The USB-identity QMK resolution failed, but this device ships a curated
    // Splinky target keyed on its exact USB id + "splinky" product name, so the
    // keyboard still activates with the correct RP2040 fork build out of the box.
    expect(profile?.firmwareMetadata?.qmk).toMatchObject({
      keyboard: "bastardkb/charybdis/4x6",
      repository: "bastardkb/bastardkb-qmk",
      processor: "RP2040",
      targetConfirmed: true,
    });
  });

  it("degrades matrixHintFor to undefined when there is no VIA summary and QMK resolution fails", async () => {
    const resolver = createViaCatalogResolver({
      getViaKeyboardDetail: async () => {
        throw new Error("No VIA detail should be requested without a catalog match");
      },
      // Empty index: no VIA summary short-circuits, so the QMK fallback runs.
      getViaKeyboardIndex: async () => ({ items: [] }),
      resolveKeyboardIdentity: async () => {
        throw new Error("Worker exceeded CPU time limit");
      },
      workbench: { profile: {} } as WorkbenchStore,
    });

    // The failing QMK fallback must resolve (not reject) so callers degrade gracefully.
    const matrix = await resolver.matrixHintFor(new BrowserDeviceIdentity());

    expect(matrix).toBeUndefined();
  });
});
