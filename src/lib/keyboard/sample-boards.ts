import { keyLightingFromSwatchId } from "./lighting-swatches";
import {
  cloneDevice,
  sampleKeyboard,
  withDeviceProfileOrigin,
  type DeviceProfile,
  type KeyBinding,
  type KeyboardKey,
} from "./schema";

export type SampleBoardId = "default" | "split";

export const defaultSampleKeyboard = sampleKeyboard;
export const splitDemoKeyboard = createSplitDemoKeyboard();

export const sampleBoards: Record<SampleBoardId, DeviceProfile> = {
  default: defaultSampleKeyboard,
  split: splitDemoKeyboard,
};

export function starterBoardProfile(boardId: SampleBoardId = "default"): DeviceProfile {
  return withDeviceProfileOrigin(sampleBoards[boardId], "starter");
}

export function sampleBoardIdFromParam(value: string | null): SampleBoardId {
  return value === "split" ? "split" : "default";
}

function createSplitDemoKeyboard(): DeviceProfile {
  const keys: KeyboardKey[] = [
    ...splitRow(0, ["Q", "W", "E", "R", "T"], ["Y", "U", "I", "O", "P"]),
    ...splitRow(1, ["A", "S", "D", "F", "G"], ["H", "J", "K", "L", ";"], {
      homing: new Set(["F", "J"]),
    }),
    ...splitRow(2, ["Z", "X", "C", "V", "B"], ["N", "M", ",", ".", "/"]),
    splitKey("s3-3", "Esc", 3, 3, 3),
    splitKey("s3-4", "Spc", 3, 4, 4),
    splitKey("s3-5", "Ent", 3, 5, 7),
    splitKey("s3-6", "Bsp", 3, 6, 8),
  ];
  const baseBindings = Object.fromEntries(
    keys.map((key) => [key.id, { code: keycodeForLegend(key.label) } satisfies KeyBinding]),
  );
  const navBindings = Object.fromEntries(keys.map((key) => [key.id, { code: "KC_TRNS" }]));
  navBindings["s1-5"] = { code: "KC_LEFT" };
  navBindings["s1-6"] = { code: "KC_DOWN" };
  navBindings["s1-7"] = { code: "KC_UP" };
  navBindings["s1-8"] = { code: "KC_RGHT" };

  return {
    ...cloneDevice(sampleKeyboard),
    id: "corney-split-34-demo",
    name: "Corney Split 34",
    origin: "starter",
    vendor: "Klakson Labs",
    firmware: "zmk",
    protocol: "zmk-studio",
    firmwareVersion: "ZMK Studio demo",
    matrix: { rows: 4, cols: 10 },
    keys,
    layers: [
      {
        id: "base",
        name: "Base",
        color: "var(--ink)",
        bindings: baseBindings,
      },
      {
        id: "nav",
        name: "Nav",
        color: "var(--teal)",
        bindings: navBindings,
      },
    ],
    combos: [
      {
        id: "split-home-combo",
        name: "Home Row Escape",
        keys: ["s1-3", "s1-6"],
        binding: "KC_ESC",
      },
    ],
    lighting: {
      mode: "solid",
      hue: 174,
      saturation: 72,
      brightness: 78,
      speed: 40,
      keys: {
        "s1-3": keyLightingFromSwatchId("teal"),
        "s1-6": keyLightingFromSwatchId("teal"),
        "s3-4": keyLightingFromSwatchId("mustard"),
        "s3-5": keyLightingFromSwatchId("mustard"),
      },
    },
    settings: {
      ...sampleKeyboard.settings,
      splitTransport: "ble",
    },
    updatedAt: new Date().toISOString(),
  };
}

function splitRow(
  row: number,
  left: string[],
  right: string[],
  options: { homing?: Set<string> } = {},
): KeyboardKey[] {
  return [
    ...left.map((label, col) =>
      splitKey(`s${row}-${col}`, label, row, col, col, {
        homing: options.homing?.has(label) ?? false,
      }),
    ),
    ...right.map((label, offset) =>
      splitKey(`s${row}-${offset + 5}`, label, row, offset + 5, offset + 7, {
        homing: options.homing?.has(label) ?? false,
      }),
    ),
  ];
}

function splitKey(
  id: string,
  label: string,
  row: number,
  col: number,
  x: number,
  options: { width?: number; homing?: boolean } = {},
): KeyboardKey {
  return {
    id,
    label,
    row,
    col,
    x,
    y: row,
    width: options.width ?? 1,
    homing: options.homing || undefined,
  };
}

function keycodeForLegend(label: string) {
  const aliases: Record<string, string> = {
    ";": "KC_SCLN",
    ",": "KC_COMM",
    ".": "KC_DOT",
    "/": "KC_SLSH",
    Esc: "LT(1,KC_ESC)",
    Spc: "LT(1,KC_SPC)",
    Ent: "LT(1,KC_ENT)",
    Bsp: "KC_BSPC",
  };
  return aliases[label] ?? `KC_${label}`;
}
