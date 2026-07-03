export const viaProtocolVersion = 0x000c;
export const viaReportSize = 32;

export const viaCommand = {
  bootloaderJump: 0x0b,
  customGetValue: 0x08,
  customSave: 0x09,
  customSetValue: 0x07,
  dynamicKeymapGetBuffer: 0x12,
  dynamicKeymapGetEncoder: 0x14,
  dynamicKeymapGetKeycode: 0x04,
  dynamicKeymapGetLayerCount: 0x11,
  dynamicKeymapMacroGetBuffer: 0x0e,
  dynamicKeymapMacroGetBufferSize: 0x0d,
  dynamicKeymapMacroGetCount: 0x0c,
  dynamicKeymapMacroReset: 0x10,
  dynamicKeymapMacroSetBuffer: 0x0f,
  dynamicKeymapReset: 0x06,
  dynamicKeymapSetBuffer: 0x13,
  dynamicKeymapSetEncoder: 0x15,
  dynamicKeymapSetKeycode: 0x05,
  eepromReset: 0x0a,
  getKeyboardValue: 0x02,
  getProtocolVersion: 0x01,
  setKeyboardValue: 0x03,
  unhandled: 0xff,
} as const;

export type ViaCommandName = keyof typeof viaCommand;

export interface ViaValidationContext {
  cols?: number;
  layers?: number;
  macroCount?: number;
  rows?: number;
}

export interface ViaDecodedReport {
  col?: number;
  command: number;
  commandName?: ViaCommandName;
  clockwise?: boolean;
  encoderIndex?: number;
  keycode?: number;
  keycodeHex?: string;
  layer?: number;
  offset?: number;
  row?: number;
  size?: number;
}

export interface ViaValidationResult {
  command?: number;
  commandName?: ViaCommandName;
  decoded?: ViaDecodedReport;
  errors: string[];
  ok: boolean;
}

const viaCommandById = new Map<number, ViaCommandName>(
  Object.entries(viaCommand).map(([name, command]) => [command, name as ViaCommandName]),
);

function hexByte(value: number) {
  return `0x${value.toString(16).padStart(2, "0")}`;
}

export function viaKeycodeHex(value: number) {
  return `0x${value.toString(16).padStart(4, "0")}`;
}

export function viaCommandName(command: number) {
  return viaCommandById.get(command);
}

function requireByte(report: Uint8Array, index: number, label: string, errors: string[]) {
  if (index >= report.length) {
    errors.push(`${label} is missing`);
    return 0;
  }

  return report[index];
}

function validateIndex(
  label: string,
  value: number | undefined,
  limit: number | undefined,
  errors: string[],
) {
  if (value === undefined || limit === undefined) return;
  if (value >= limit) errors.push(`${label} ${value} is outside 0..${Math.max(limit - 1, 0)}`);
}

function decodeMatrixAddress(report: Uint8Array, errors: string[], context: ViaValidationContext) {
  const layer = requireByte(report, 1, "Layer", errors);
  const row = requireByte(report, 2, "Row", errors);
  const col = requireByte(report, 3, "Column", errors);

  validateIndex("Layer", layer, context.layers, errors);
  validateIndex("Row", row, context.rows, errors);
  validateIndex("Column", col, context.cols, errors);

  return { col, layer, row };
}

function decodeEncoderAddress(report: Uint8Array, errors: string[], context: ViaValidationContext) {
  const layer = requireByte(report, 1, "Layer", errors);
  const encoderIndex = requireByte(report, 2, "Encoder index", errors);
  const clockwise = requireByte(report, 3, "Encoder direction", errors) !== 0;

  validateIndex("Layer", layer, context.layers, errors);

  return { clockwise, encoderIndex, layer };
}

function decodeBufferWindow(report: Uint8Array, errors: string[]) {
  const offsetHigh = requireByte(report, 1, "Offset high byte", errors);
  const offsetLow = requireByte(report, 2, "Offset low byte", errors);
  const size = requireByte(report, 3, "Buffer size", errors);
  const offset = (offsetHigh << 8) | offsetLow;

  if (size > viaReportSize - 4) {
    errors.push(`Buffer size ${size} exceeds ${viaReportSize - 4} byte VIA payload`);
  }

  return { offset, size };
}

export function validateViaReport(
  report: Uint8Array,
  context: ViaValidationContext = {},
): ViaValidationResult {
  const errors: string[] = [];

  if (report.length !== viaReportSize) {
    errors.push(`VIA report must be ${viaReportSize} bytes, received ${report.length}`);
  }

  const command = report[0] ?? 0;
  const commandName = viaCommandName(command);
  const decoded: ViaDecodedReport = { command, commandName };

  if (!commandName) {
    errors.push(`Unknown VIA command ${hexByte(command)}`);
  }

  if (commandName === "dynamicKeymapGetKeycode" || commandName === "dynamicKeymapSetKeycode") {
    Object.assign(decoded, decodeMatrixAddress(report, errors, context));
  }

  if (commandName === "dynamicKeymapGetEncoder" || commandName === "dynamicKeymapSetEncoder") {
    Object.assign(decoded, decodeEncoderAddress(report, errors, context));
  }

  if (commandName === "dynamicKeymapSetKeycode" || commandName === "dynamicKeymapSetEncoder") {
    const keycode =
      (requireByte(report, 4, "Keycode high byte", errors) << 8) |
      requireByte(report, 5, "Keycode low byte", errors);
    decoded.keycode = keycode;
    decoded.keycodeHex = viaKeycodeHex(keycode);
  }

  if (
    commandName === "dynamicKeymapGetBuffer" ||
    commandName === "dynamicKeymapSetBuffer" ||
    commandName === "dynamicKeymapMacroGetBuffer" ||
    commandName === "dynamicKeymapMacroSetBuffer"
  ) {
    Object.assign(decoded, decodeBufferWindow(report, errors));
  }

  return {
    command,
    commandName,
    decoded,
    errors,
    ok: errors.length === 0,
  };
}

export function encodeViaCommandReport(command: ViaCommandName | number, payload: number[] = []) {
  const report = new Uint8Array(viaReportSize);
  report[0] = typeof command === "number" ? command : viaCommand[command];
  report.set(payload.slice(0, viaReportSize - 1), 1);
  return report;
}

function assertViaByte(label: string, value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError(`${label} must be an integer byte`);
  }
}

export function encodeViaSetKeycodeReport(input: {
  col: number;
  keycode: number;
  layer: number;
  row: number;
}) {
  assertViaByte("Layer", input.layer);
  assertViaByte("Row", input.row);
  assertViaByte("Column", input.col);

  if (!Number.isInteger(input.keycode) || input.keycode < 0 || input.keycode > 0xffff) {
    throw new RangeError("Keycode must be a 16-bit integer");
  }

  return encodeViaCommandReport("dynamicKeymapSetKeycode", [
    input.layer,
    input.row,
    input.col,
    (input.keycode >> 8) & 0xff,
    input.keycode & 0xff,
  ]);
}
