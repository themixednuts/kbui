import type { DeviceProfile } from "./schema";
import type { ConnectionState } from "./transport";

export type FlashValidationCode =
  | "firmware-flow-unavailable"
  | "dirty-draft"
  | "mock-target"
  | "not-connected"
  | "transport-unavailable"
  | "wrong-protocol"
  | "wrong-transport";

export interface FlashValidationIssue {
  code: FlashValidationCode;
  message: string;
  severity: "error" | "warning";
}

export interface FlashValidationInput {
  connection: ConnectionState;
  device: DeviceProfile;
  diffCount: number;
  firmwareFlowAvailable: boolean;
  mockOnline: boolean;
}

export interface FlashValidationResult {
  blocked: boolean;
  issues: FlashValidationIssue[];
  ready: boolean;
}

export function validateFlashReadiness({
  connection,
  device,
  diffCount,
  firmwareFlowAvailable,
  mockOnline,
}: FlashValidationInput): FlashValidationResult {
  const issues: FlashValidationIssue[] = [];

  if (!connection.webHidSupported) {
    issues.push({
      code: "transport-unavailable",
      message: "Browser WebHID support is required before flashing.",
      severity: "error",
    });
  }

  if (connection.status !== "connected") {
    issues.push({
      code: "not-connected",
      message: "Connect a live WebHID keyboard before flashing.",
      severity: "error",
    });
  }

  if (connection.status === "connected" && connection.transport !== "webhid") {
    issues.push({
      code: "wrong-transport",
      message: "Flashing requires the WebHID transport, not WebUSB.",
      severity: "error",
    });
  }

  if (!firmwareFlowAvailable) {
    issues.push({
      code: "firmware-flow-unavailable",
      message: "Firmware build/flash is not wired in this app yet.",
      severity: "error",
    });
  }

  // Mock transports are dev/test-only; this catches accidental flash attempts
  // from that harness if a mock connection reaches validation.
  if (mockOnline) {
    issues.push({
      code: "mock-target",
      message: "Mock VIA devices can validate writes, but they cannot be flashed.",
      severity: "error",
    });
  }

  if (device.protocol === "zmk-studio") {
    issues.push({
      code: "wrong-protocol",
      message: "This flash flow only supports QMK VIA/Vial targets.",
      severity: "error",
    });
  }

  if (diffCount > 0) {
    issues.push({
      code: "dirty-draft",
      message: "Commit the local draft before flashing for a traceable source build.",
      severity: "warning",
    });
  }

  const blocked = issues.some((issue) => issue.severity === "error");

  return {
    blocked,
    issues,
    ready: !blocked,
  };
}

export function flashReadinessSummary(result: FlashValidationResult) {
  if (result.blocked) return result.issues.find((issue) => issue.severity === "error")?.message;
  if (result.issues.length) return result.issues[0]?.message;
  return "Ready to flash";
}
