import type { BrowserContext } from "@playwright/test";

export interface MockHidOptions {
  /** Make the device appear in `navigator.hid.getDevices()`, so the page
   *  auto-attaches on load (the same way a real browser auto-grants a
   *  previously-paired device). Default: false (user must click Connect). */
  preGranted?: boolean;
  /** USB vendor id. Default: 0xfeed (QMK). */
  vendorId?: number;
  /** USB product id. Default: 0x6060 (Klakson Workbench 65). */
  productId?: number;
  /** Product name surfaced through HID. */
  productName?: string;
  /** Serial number. */
  serialNumber?: string;
  /** Layers reported by VIA `getKeyboardValue(0x01)`. Default: 4. */
  layerCount?: number;
  /** VIA protocol version reported by `getProtocolVersion`. Default: 12. */
  protocolVersion?: number;
}

/**
 * Installs a fake `navigator.hid` implementation in the browser context.
 *
 * The fixture is small and deliberate — it satisfies just enough of the VIA
 * protocol for the workbench to connect, detect protocol version + layer
 * count, and exercise write packets. Tests that need richer behavior should
 * extend this rather than mocking transport at the app layer.
 */
export async function installMockHidDevice(
  context: BrowserContext,
  options: MockHidOptions = {},
): Promise<void> {
  const init = {
    preGranted: options.preGranted ?? false,
    vendorId: options.vendorId ?? 0xfeed,
    productId: options.productId ?? 0x6060,
    productName: options.productName ?? "Klakson Workbench 65",
    serialNumber: options.serialNumber ?? "TESTKBD-0001",
    layerCount: options.layerCount ?? 4,
    protocolVersion: options.protocolVersion ?? 12,
  };

  await context.addInitScript((cfg) => {
    type Listener = (event: { data: DataView; device: unknown; reportId: number }) => void;
    const listeners = new Set<Listener>();

    const device = {
      productName: cfg.productName,
      vendorId: cfg.vendorId,
      productId: cfg.productId,
      serialNumber: cfg.serialNumber,
      collections: [{ usagePage: 0xff60, usage: 0x61 }],
      opened: false,
      open: async () => {
        device.opened = true;
      },
      sendReport: async (_reportId: number, data: BufferSource) => {
        const request =
          data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
        const response = new Uint8Array(32);
        const cmd = request[0] ?? 0;
        response[0] = cmd;

        if (cmd === 0x01) {
          // getProtocolVersion → big-endian protocol number
          response[1] = (cfg.protocolVersion >> 8) & 0xff;
          response[2] = cfg.protocolVersion & 0xff;
        }
        if (cmd === 0x02) {
          // getKeyboardValue subcommand
          const sub = request[1] ?? 0;
          response[1] = sub;
          if (sub === 0x01) response[2] = cfg.layerCount;
        }
        if (cmd === 0x04) {
          // dynamicKeymapGetKeycode → echo the requested layer/row/col,
          // return KC_NO so the editor seeds the catalog defaults.
          response[1] = request[1] ?? 0;
          response[2] = request[2] ?? 0;
          response[3] = request[3] ?? 0;
          response[4] = 0;
          response[5] = 0;
        }
        if (cmd === 0x05) {
          // dynamicKeymapSetKeycode → mirror the request, success.
          response[1] = request[1] ?? 0;
          response[2] = request[2] ?? 0;
          response[3] = request[3] ?? 0;
          response[4] = request[4] ?? 0;
          response[5] = request[5] ?? 0;
        }
        if (cmd === 0x11) {
          // dynamicKeymapGetLayerCount
          response[1] = cfg.layerCount;
        }

        queueMicrotask(() => {
          const event = { data: new DataView(response.buffer), device, reportId: 0 };
          for (const listener of listeners) listener(event);
        });
      },
      addEventListener: (_type: "inputreport", listener: Listener) => {
        listeners.add(listener);
      },
      removeEventListener: (_type: "inputreport", listener: Listener) => {
        listeners.delete(listener);
      },
    };

    Object.defineProperty(navigator, "hid", {
      configurable: true,
      value: {
        getDevices: async () => (cfg.preGranted ? [device] : []),
        requestDevice: async () => [device],
      },
    });
  }, init);
}
