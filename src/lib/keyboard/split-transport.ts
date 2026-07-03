import type { DeviceProfile } from "./schema";

export type SplitTransport = DeviceProfile["settings"]["splitTransport"];

export type SplitTransportOption = {
  id: SplitTransport;
  name: string;
  detail: string;
};

export const SPLIT_TRANSPORT_OPTIONS: SplitTransportOption[] = [
  { id: "none", name: "Single", detail: "One-piece board" },
  { id: "serial", name: "Serial", detail: "TRRS · UART" },
  { id: "i2c", name: "I2C", detail: "TRRS · clock/data" },
  { id: "ble", name: "BLE", detail: "Wireless halves" },
];

type SplitDevice = Pick<DeviceProfile, "firmware" | "protocol" | "name">;

export function isZmkDevice(device: SplitDevice): boolean {
  return device.firmware === "zmk" || device.protocol === "zmk-studio";
}

export function isSplitKeyboard(device: Pick<DeviceProfile, "name">): boolean {
  return device.name.toLowerCase().includes("split");
}

export function isSplitTransportAllowed(mode: SplitTransport, device: SplitDevice): boolean {
  if (mode === "none") return true;
  if (isZmkDevice(device)) return mode === "ble";
  if (mode === "ble") return false;
  if (!isSplitKeyboard(device)) return false;
  return mode === "serial" || mode === "i2c";
}

export function splitTransportDisabledReason(mode: SplitTransport, device: SplitDevice): string | null {
  if (isSplitTransportAllowed(mode, device)) return null;
  if (mode === "ble") return "ZMK boards only";
  if (isZmkDevice(device)) return "QMK boards only";
  return "Split keyboards only";
}

export function normalizeSplitTransport(
  transport: SplitTransport,
  device: SplitDevice,
): SplitTransport {
  return isSplitTransportAllowed(transport, device) ? transport : "none";
}
