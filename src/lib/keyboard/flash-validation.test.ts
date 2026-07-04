import { describe, expect, it } from "vite-plus/test";

import { cloneDevice, sampleKeyboard } from "./schema";
import type { ConnectionState } from "./transport";
import { flashReadinessSummary, validateFlashReadiness } from "./flash-validation";

const idleConnection: ConnectionState = {
  message: "Ready",
  status: "idle",
  webBluetoothSupported: false,
  webHidSupported: true,
  webSerialSupported: false,
  webUsbSupported: true,
};

describe("flash readiness validation", () => {
  it("blocks flashing until a live WebHID keyboard is connected", () => {
    const result = validateFlashReadiness({
      connection: idleConnection,
      device: cloneDevice(sampleKeyboard),
      diffCount: 0,
      firmwareFlowAvailable: true,
      mockOnline: false,
    });

    expect(result.blocked).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toContain("not-connected");
    expect(flashReadinessSummary(result)).toBe("Connect a live WebHID keyboard before flashing.");
  });

  it("does not allow a mock target to be flashed", () => {
    const result = validateFlashReadiness({
      connection: {
        ...idleConnection,
        message: "Mock connected",
        status: "connected",
        transport: "webhid",
      },
      device: cloneDevice(sampleKeyboard),
      diffCount: 0,
      firmwareFlowAvailable: true,
      mockOnline: true,
    });

    expect(result.blocked).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toContain("mock-target");
  });

  it("allows live WebHID QMK targets and keeps dirty drafts as warnings", () => {
    const result = validateFlashReadiness({
      connection: {
        ...idleConnection,
        message: "Connected",
        status: "connected",
        transport: "webhid",
      },
      device: cloneDevice(sampleKeyboard),
      diffCount: 2,
      firmwareFlowAvailable: true,
      mockOnline: false,
    });

    expect(result.blocked).toBe(false);
    expect(result.ready).toBe(true);
    expect(result.issues).toEqual([
      {
        code: "dirty-draft",
        message: "Commit the local draft before flashing for a traceable source build.",
        severity: "warning",
      },
    ]);
  });

  it("blocks ZMK Studio targets from the QMK flash flow", () => {
    const device = cloneDevice(sampleKeyboard);
    device.protocol = "zmk-studio";

    const result = validateFlashReadiness({
      connection: {
        ...idleConnection,
        message: "Connected",
        status: "connected",
        transport: "webhid",
      },
      device,
      diffCount: 0,
      firmwareFlowAvailable: true,
      mockOnline: false,
    });

    expect(result.blocked).toBe(true);
    expect(result.issues.map((issue) => issue.code)).toContain("wrong-protocol");
  });

  it("blocks a connected target when the app has no firmware flasher wired", () => {
    const result = validateFlashReadiness({
      connection: {
        ...idleConnection,
        message: "Connected",
        status: "connected",
        transport: "webhid",
      },
      device: cloneDevice(sampleKeyboard),
      diffCount: 0,
      firmwareFlowAvailable: false,
      mockOnline: false,
    });

    expect(result.blocked).toBe(true);
    expect(result.issues).toEqual([
      {
        code: "firmware-flow-unavailable",
        message: "Firmware build/flash is not wired in this app yet.",
        severity: "error",
      },
    ]);
    expect(flashReadinessSummary(result)).toBe(
      "Firmware build/flash is not wired in this app yet.",
    );
  });
});
