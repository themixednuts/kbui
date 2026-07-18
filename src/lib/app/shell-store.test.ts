import { describe, expect, it } from "vite-plus/test";

import { ShellStore } from "$lib/app/shell-store.svelte";
import type { ConnectionState } from "$lib/keyboard/transport";

describe("ShellStore", () => {
  it("keeps native device handles outside proxied shell state", () => {
    const shell = new ShellStore();
    const nativeDevice = new (class NativeDeviceHandle {})();
    const connection = {
      status: "connected",
      message: "Connected",
      webBluetoothSupported: false,
      webHidSupported: true,
      webSerialSupported: false,
      webUsbSupported: false,
      hidDevice: nativeDevice,
    } as unknown as ConnectionState;

    shell.setConnected({
      board: "Charybdis",
      connection,
      protocol: "VIA v3",
      transport: "WebHID",
    });

    expect(shell.connection).toBe(connection);
    expect(shell.connection?.hidDevice).toBe(nativeDevice);
    expect(shell.connectionRevision).toBe(1);
  });

  it("uses the GitHub OAuth login for account links", () => {
    const shell = new ShellStore();

    shell.setSessionUser({
      id: "user-1",
      name: "The Mixed Nuts",
      email: "jonfonts@gmail.com",
      githubLogin: "themixednuts",
    });

    expect(shell.account.login).toBe("themixednuts");
    expect(shell.account.githubProfileUrl).toBe("https://github.com/themixednuts");
  });

  it("does not replace the connected device for equivalent board sync updates", () => {
    const shell = new ShellStore();
    shell.setConnected({
      board: "Workbench 65",
      message: "Connected Workbench 65",
      protocol: "VIA v3",
      transport: "Mock VIA",
    });
    const device = shell.device;

    shell.updateConnectedBoard({
      board: "Workbench 65",
      protocol: "VIA v3",
    });

    expect(shell.device).toBe(device);
  });

  it("replaces the connected device when board sync data changes", () => {
    const shell = new ShellStore();
    shell.setConnected({
      board: "Workbench 65",
      protocol: "VIA v3",
      transport: "Mock VIA",
    });
    const device = shell.device;

    shell.updateConnectedBoard({
      board: "Workbench 65 ZMK",
      protocol: "ZMK Studio",
    });

    expect(shell.device).not.toBe(device);
    expect(shell.device).toMatchObject({
      board: "Workbench 65 ZMK",
      name: "Workbench 65 ZMK",
      protocol: "ZMK Studio",
    });
  });

  it("does not replace the current variant for equivalent variant sync updates", () => {
    const shell = new ShellStore();
    shell.setCurrentVariant({
      id: "main",
      name: "main",
      color: "var(--coral)",
    });
    const variant = shell.currentVariant;

    shell.setCurrentVariant({
      id: "main",
      name: "main",
      color: "var(--coral)",
    });

    expect(shell.currentVariant).toBe(variant);
  });
});
