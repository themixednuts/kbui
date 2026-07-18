import { Effect, Schema } from "effect";

import { keyLightingFromSwatchId } from "./lighting-swatches";
import { qmkDirectKeycodes, qmkDirectKeycodeValues } from "./qmk-keycodes";

export type FirmwareFamily = "qmk" | "zmk";
export type DeviceProfileOrigin = "device" | "imported" | "draft" | "starter";
export type FirmwareEditIntent = "live" | "source";

export type Capability =
  | "keymap"
  | "layers"
  | "macros"
  | "combos"
  | "tapDance"
  | "keyOverrides"
  | "lighting"
  | "encoders"
  | "oled"
  | "settings"
  | "firmware";

export type EditorView = "keymap" | "logic" | "firmware";

export type ChangeKind =
  | "binding"
  | "macro"
  | "combo"
  | "tapDance"
  | "setting"
  | "lighting"
  | "metadata";

export interface KeyboardKey {
  id: string;
  label: string;
  row: number;
  col: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** KLE rotation angle in degrees. Used by renderers to tilt the keycap. */
  rotation?: number;
  homing?: boolean;
  encoder?: boolean;
}

export interface KeyBinding {
  code: string;
  tap?: string;
  hold?: string;
  macroId?: string;
  notes?: string;
}

export interface Layer {
  id: string;
  name: string;
  color: string;
  bindings: Record<string, KeyBinding>;
}

export interface Macro {
  id: string;
  name: string;
  sequence: string[];
  trigger: string;
}

export interface Combo {
  id: string;
  name: string;
  keys: string[];
  binding: string;
  layerIds?: string[];
}

export interface TapDance {
  id: string;
  keyId: string;
  tap: string;
  hold: string;
  doubleTap: string;
}

export interface KeyOverride {
  id: string;
  trigger: string;
  replacement: string;
  modifiers: string[];
}

export interface KeyLighting {
  hue: number;
  saturation: number;
  brightness: number;
}

export interface LightingProfile {
  mode: "solid" | "breathing" | "reactive" | "rainbow" | "matrix";
  hue: number;
  saturation: number;
  brightness: number;
  speed: number;
  /** Per-key RGB overrides keyed by `KeyboardKey.id`. */
  keys: Record<string, KeyLighting>;
}

export interface KeyboardSettings {
  tappingTerm: number;
  debounce: number;
  permissiveHold: boolean;
  retroTapping: boolean;
  nkro: boolean;
  splitTransport: "none" | "serial" | "i2c" | "ble";
}

export interface QmkFirmwareMetadata {
  /** Other indistinguishable build targets (for example controller variants sharing USB IDs). */
  alternatives?: Array<{ keyboard: string; layout: string }>;
  keyboard?: string;
  keymap?: string;
  keyOrder?: string[];
  layout?: string;
  /** Upstream QMK-compatible firmware repository used by Actions builds. */
  repository?: string;
  /** Git ref in `repository` used by Actions builds. */
  ref?: string;
  /** False until a user confirms one of several controller-equivalent targets. */
  targetConfirmed?: boolean;
  bootloader?: string;
  processor?: string;
  uf2FamilyId?: number;
  uf2VolumeLabels?: string[];
}

export interface ZmkFirmwareMetadata {
  alternatives?: Array<{ board: string; shields: string[] }>;
  board?: string;
  keymap?: string;
  keyOrder?: string[];
  shield?: string;
  shields?: string[];
  repository?: string;
  ref?: string;
  /** False until a user confirms one of several controller/shield targets. */
  targetConfirmed?: boolean;
  uf2FamilyId?: number;
  uf2VolumeLabels?: string[];
}

export interface FirmwareMetadata {
  qmk?: QmkFirmwareMetadata;
  zmk?: ZmkFirmwareMetadata;
}

export interface DeviceIdentity {
  key: string;
  transport: "webusb" | "webhid" | "webbluetooth" | "webserial";
  vendorId?: number;
  productId?: number;
  productName?: string;
  serialNumber?: string;
}

export interface KeyboardDetection {
  identity: DeviceIdentity;
  protocolVersion?: number;
  layerCount?: number;
  keymap?: number[][][];
  capabilities: Capability[];
  notes: string[];
}

export interface DeviceProfile {
  id: string;
  name: string;
  origin: DeviceProfileOrigin;
  vendor: string;
  firmware: FirmwareFamily;
  protocol: "via-v3" | "vial" | "zmk-studio";
  firmwareVersion: string;
  /** Whether edits should target the connected runtime or generated firmware source. */
  firmwareEditIntent?: FirmwareEditIntent;
  vendorId: number;
  productId: number;
  matrix: { rows: number; cols: number };
  keys: KeyboardKey[];
  capabilities: Capability[];
  layers: Layer[];
  macros: Macro[];
  combos: Combo[];
  tapDances: TapDance[];
  keyOverrides: KeyOverride[];
  lighting: LightingProfile;
  settings: KeyboardSettings;
  firmwareMetadata?: FirmwareMetadata;
  identity?: DeviceIdentity;
  detectionNotes?: string[];
  updatedAt: string;
}

export interface ChangeRecord {
  id: string;
  kind: ChangeKind;
  scope: string;
  path: string;
  before: string;
  after: string;
  staged: boolean;
}

export const ChangeRecordSchema = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literals([
    "binding",
    "macro",
    "combo",
    "tapDance",
    "setting",
    "lighting",
    "metadata",
  ]),
  scope: Schema.String,
  path: Schema.String,
  before: Schema.String,
  after: Schema.String,
  staged: Schema.Boolean,
});

const ChangeRecordJsonSchema = Schema.fromJsonString(ChangeRecordSchema);

export function encodeChangeRecordJsonEffect(change: ChangeRecord) {
  return Schema.encodeEffect(ChangeRecordJsonSchema)(change);
}

export function decodeChangeRecordJsonEffect(value: unknown) {
  return Schema.decodeUnknownEffect(ChangeRecordJsonSchema)(value);
}

export interface SavePointAuthorMeta {
  name: string;
  handle?: string;
  avatarUrl?: string;
  source?: string;
}

export interface SavePoint {
  id: string;
  variantId: string;
  message: string;
  createdAt: string;
  authorMeta: SavePointAuthorMeta;
  snapshot: DeviceProfile;
  diffFromParent?: ChangeRecord[];
  parentSavePointId?: string;
}

export interface CommunityWorkspaceSource {
  kind: "community";
  communityKeymapId: string;
  title: string;
  authorUserId: string;
  authorHandle?: string;
  adoptedAt: string;
  payloadHash: string;
}

export interface WorkspaceFork {
  id: string;
  name: string;
  baseProfileId: string;
  createdAt: string;
  device: DeviceProfile;
  parentSavePointId?: string;
  sourceVariantId?: string;
  source?: CommunityWorkspaceSource;
}

export interface FeatureDefinition {
  id: Capability;
  label: string;
  context: EditorView[];
  requiresSelection?: boolean;
  summary: string;
}

const rowLabels = [
  ["Esc", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "=", "Back"],
  ["Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\"],
  ["Caps", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "Enter"],
  ["Shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "Shift"],
  ["Ctrl", "Gui", "Alt", "Space", "Fn", "Alt", "Menu", "Ctrl"],
];

const defaultCodes = [
  [
    "KC_ESC",
    "KC_1",
    "KC_2",
    "KC_3",
    "KC_4",
    "KC_5",
    "KC_6",
    "KC_7",
    "KC_8",
    "KC_9",
    "KC_0",
    "KC_MINS",
    "KC_EQL",
    "KC_BSPC",
  ],
  [
    "KC_TAB",
    "KC_Q",
    "KC_W",
    "KC_E",
    "KC_R",
    "KC_T",
    "KC_Y",
    "KC_U",
    "KC_I",
    "KC_O",
    "KC_P",
    "KC_LBRC",
    "KC_RBRC",
    "KC_BSLS",
  ],
  [
    "KC_CAPS",
    "KC_A",
    "KC_S",
    "KC_D",
    "KC_F",
    "KC_G",
    "KC_H",
    "KC_J",
    "KC_K",
    "KC_L",
    "KC_SCLN",
    "KC_QUOT",
    "KC_ENT",
  ],
  [
    "KC_LSFT",
    "KC_Z",
    "KC_X",
    "KC_C",
    "KC_V",
    "KC_B",
    "KC_N",
    "KC_M",
    "KC_COMM",
    "KC_DOT",
    "KC_SLSH",
    "KC_RSFT",
  ],
  ["KC_LCTL", "KC_LGUI", "KC_LALT", "KC_SPC", "MO(1)", "KC_RALT", "KC_APP", "KC_RCTL"],
];

const fnCodes = [
  [
    "QK_BOOT",
    "KC_F1",
    "KC_F2",
    "KC_F3",
    "KC_F4",
    "KC_F5",
    "KC_F6",
    "KC_F7",
    "KC_F8",
    "KC_F9",
    "KC_F10",
    "KC_F11",
    "KC_F12",
    "KC_DEL",
  ],
  [
    "RGB_TOG",
    "RGB_MOD",
    "RGB_HUI",
    "RGB_SAI",
    "RGB_VAI",
    "RGB_SPI",
    "KC_HOME",
    "KC_PGDN",
    "KC_PGUP",
    "KC_END",
    "KC_PSCR",
    "KC_SCRL",
    "KC_PAUS",
    "EEP_RST",
  ],
  [
    "KC_TRNS",
    "AU_TOGG",
    "KC_MPRV",
    "KC_MPLY",
    "KC_MNXT",
    "KC_MUTE",
    "KC_LEFT",
    "KC_DOWN",
    "KC_UP",
    "KC_RGHT",
    "KC_INS",
    "KC_DEL",
    "KC_TRNS",
  ],
  [
    "KC_TRNS",
    "KC_UNDO",
    "KC_CUT",
    "KC_COPY",
    "KC_PSTE",
    "KC_CALC",
    "KC_VOLD",
    "KC_VOLU",
    "KC_BRID",
    "KC_BRIU",
    "KC_SLEP",
    "KC_TRNS",
  ],
  ["KC_TRNS", "KC_TRNS", "KC_TRNS", "KC_TRNS", "KC_TRNS", "KC_TRNS", "KC_TRNS", "KC_TRNS"],
];

const keyWidths: Record<string, number> = {
  "0:13": 2,
  "1:0": 2,
  "2:0": 2,
  "2:12": 2,
  "3:0": 3,
  "3:11": 3,
  "4:3": 6,
};

function createKeys(): KeyboardKey[] {
  return rowLabels.flatMap((row, rowIndex) =>
    row.map((label, colIndex) => ({
      id: `k${rowIndex}-${colIndex}`,
      label,
      row: rowIndex,
      col: colIndex,
      width: keyWidths[`${rowIndex}:${colIndex}`] ?? 1,
      homing: label === "F" || label === "J",
    })),
  );
}

function bindingsFrom(codes: string[][]): Record<string, KeyBinding> {
  const bindings: Record<string, KeyBinding> = {};

  codes.forEach((row, rowIndex) => {
    row.forEach((code, colIndex) => {
      bindings[`k${rowIndex}-${colIndex}`] = { code };
    });
  });

  return bindings;
}

export function emptyBindingsForKeys(
  keys: KeyboardKey[],
  code = "KC_NO",
): Record<string, KeyBinding> {
  return Object.fromEntries(keys.map((key) => [key.id, { code }]));
}

const layerColors = ["#2f7f79", "#d96f32", "#5d6fb8", "#b88a2f", "#a663b8", "#39945f"];

const qmkBasicKeycodes: Record<number, string> = {
  0x0000: "KC_NO",
  0x0001: "KC_TRNS",
  0x0004: "KC_A",
  0x0005: "KC_B",
  0x0006: "KC_C",
  0x0007: "KC_D",
  0x0008: "KC_E",
  0x0009: "KC_F",
  0x000a: "KC_G",
  0x000b: "KC_H",
  0x000c: "KC_I",
  0x000d: "KC_J",
  0x000e: "KC_K",
  0x000f: "KC_L",
  0x0010: "KC_M",
  0x0011: "KC_N",
  0x0012: "KC_O",
  0x0013: "KC_P",
  0x0014: "KC_Q",
  0x0015: "KC_R",
  0x0016: "KC_S",
  0x0017: "KC_T",
  0x0018: "KC_U",
  0x0019: "KC_V",
  0x001a: "KC_W",
  0x001b: "KC_X",
  0x001c: "KC_Y",
  0x001d: "KC_Z",
  0x001e: "KC_1",
  0x001f: "KC_2",
  0x0020: "KC_3",
  0x0021: "KC_4",
  0x0022: "KC_5",
  0x0023: "KC_6",
  0x0024: "KC_7",
  0x0025: "KC_8",
  0x0026: "KC_9",
  0x0027: "KC_0",
  0x0028: "KC_ENT",
  0x0029: "KC_ESC",
  0x002a: "KC_BSPC",
  0x002b: "KC_TAB",
  0x002c: "KC_SPC",
  0x002d: "KC_MINS",
  0x002e: "KC_EQL",
  0x002f: "KC_LBRC",
  0x0030: "KC_RBRC",
  0x0031: "KC_BSLS",
  0x0032: "KC_NUHS",
  0x0033: "KC_SCLN",
  0x0034: "KC_QUOT",
  0x0035: "KC_GRV",
  0x0036: "KC_COMM",
  0x0037: "KC_DOT",
  0x0038: "KC_SLSH",
  0x0039: "KC_CAPS",
  0x003a: "KC_F1",
  0x003b: "KC_F2",
  0x003c: "KC_F3",
  0x003d: "KC_F4",
  0x003e: "KC_F5",
  0x003f: "KC_F6",
  0x0040: "KC_F7",
  0x0041: "KC_F8",
  0x0042: "KC_F9",
  0x0043: "KC_F10",
  0x0044: "KC_F11",
  0x0045: "KC_F12",
  0x0046: "KC_PSCR",
  0x0047: "KC_SCRL",
  0x0048: "KC_PAUS",
  0x0049: "KC_INS",
  0x004a: "KC_HOME",
  0x004b: "KC_PGUP",
  0x004c: "KC_DEL",
  0x004d: "KC_END",
  0x004e: "KC_PGDN",
  0x004f: "KC_RGHT",
  0x0050: "KC_LEFT",
  0x0051: "KC_DOWN",
  0x0052: "KC_UP",
  0x007f: "KC_MUTE",
  0x0080: "KC_VOLU",
  0x0081: "KC_VOLD",
  0x00e0: "KC_LCTL",
  0x00e1: "KC_LSFT",
  0x00e2: "KC_LALT",
  0x00e3: "KC_LGUI",
  0x00e4: "KC_RCTL",
  0x00e5: "KC_RSFT",
  0x00e6: "KC_RALT",
  0x00e7: "KC_RGUI",
};

const qmkBasicKeycodeValues = Object.fromEntries(
  Object.entries(qmkBasicKeycodes).map(([value, name]) => [name, Number(value)]),
);

const qmkModifiedBase = 0x0100;
const qmkModifiedMask = 0x1eff;
const qmkModTapBase = 0x2000;
const qmkModTapMask = 0x1fff;
const qmkLayerTapBase = 0x4000;
const qmkLayerTapMask = 0x0fff;
const qmkToBase = 0x5200;
const qmkMomentaryBase = 0x5220;
const qmkDefaultLayerBase = 0x5240;
const qmkToggleLayerBase = 0x5260;
const qmkOneShotLayerBase = 0x5280;
const qmkLayerTapToggleBase = 0x52c0;
const qmkLayerSelectorMask = 0x001f;
const qmkTapDanceBase = 0x5700;
const qmkTapDanceMask = 0x00ff;
const qmkMacroBase = 0x7700;
const qmkMacroMask = 0x007f;

const modTapAliases: Record<number, string> = {
  0x01: "LCTL_T",
  0x02: "LSFT_T",
  0x03: "LCS_T",
  0x04: "LALT_T",
  0x05: "LCA_T",
  0x06: "LSA_T",
  0x07: "MEH_T",
  0x08: "LGUI_T",
  0x09: "LCG_T",
  0x0a: "LSG_T",
  0x0b: "LCSG_T",
  0x0c: "LAG_T",
  0x0d: "LCAG_T",
  0x0e: "LSAG_T",
  0x0f: "HYPR_T",
  0x11: "RCTL_T",
  0x12: "RSFT_T",
  0x14: "RALT_T",
  0x18: "RGUI_T",
};

const modTapAliasValues: Record<string, number> = Object.fromEntries(
  Object.entries(modTapAliases).map(([value, name]) => [name, Number(value)]),
);

const modifiedAliases: Record<number, string> = {
  0x01: "LCTL",
  0x02: "LSFT",
  0x03: "LCS",
  0x04: "LALT",
  0x05: "LCA",
  0x06: "LSA",
  0x07: "MEH",
  0x08: "LGUI",
  0x09: "LCG",
  0x0a: "LSG",
  0x0b: "LCSG",
  0x0c: "LAG",
  0x0d: "LCAG",
  0x0e: "LSAG",
  0x0f: "HYPR",
  0x11: "RCTL",
  0x12: "RSFT",
  0x14: "RALT",
  0x18: "RGUI",
};

const modifiedAliasValues: Record<string, number> = {
  C: 0x01,
  S: 0x02,
  A: 0x04,
  G: 0x08,
  ...Object.fromEntries(
    Object.entries(modifiedAliases).map(([value, name]) => [name, Number(value)]),
  ),
};

function keycodeHex(value: number) {
  return `0x${value.toString(16).padStart(4, "0").toUpperCase()}`;
}

function qmkLayerSelectorName(value: number, base: number, macroName: string): string | undefined {
  if (value < base || value > base + qmkLayerSelectorMask) return undefined;
  return `${macroName}(${value - base})`;
}

function qmkTapKeyName(value: number) {
  return qmkBasicKeycodes[value] ?? keycodeHex(value);
}

function qmkModifiedName(value: number) {
  if (value < qmkModifiedBase || value > qmkModifiedBase + qmkModifiedMask) return undefined;

  const modMask = (value >> 8) & 0x1f;
  const tapKey = value & 0xff;
  const alias = modifiedAliases[modMask];
  const tapKeyName = qmkTapKeyName(tapKey);

  if (alias) return `${alias}(${tapKeyName})`;
  return `MODS(${modMaskExpression(modMask)},${tapKeyName})`;
}

function qmkModTapName(value: number) {
  if (value < qmkModTapBase || value > qmkModTapBase + qmkModTapMask) return undefined;

  const modMask = (value >> 8) & 0x1f;
  const tapKey = value & 0xff;
  const alias = modTapAliases[modMask];
  const tapKeyName = qmkTapKeyName(tapKey);

  if (alias) return `${alias}(${tapKeyName})`;
  return `MT(${modMaskExpression(modMask)},${tapKeyName})`;
}

function qmkLayerTapName(value: number) {
  if (value < qmkLayerTapBase || value > qmkLayerTapBase + qmkLayerTapMask) return undefined;
  const layer = (value >> 8) & 0x0f;
  const tapKey = value & 0xff;
  return `LT(${layer},${qmkTapKeyName(tapKey)})`;
}

function qmkTapDanceName(value: number) {
  if (value < qmkTapDanceBase || value > qmkTapDanceBase + qmkTapDanceMask) return undefined;
  return `TD(${value - qmkTapDanceBase})`;
}

function qmkMacroName(value: number) {
  if (value < qmkMacroBase || value > qmkMacroBase + qmkMacroMask) return undefined;
  return `QK_MACRO_${value - qmkMacroBase}`;
}

function modMaskExpression(mask: number) {
  const side = mask & 0x10 ? "R" : "L";
  const mods = [
    [0x01, `MOD_${side}CTL`],
    [0x02, `MOD_${side}SFT`],
    [0x04, `MOD_${side}ALT`],
    [0x08, `MOD_${side}GUI`],
  ]
    .filter(([bit]) => mask & Number(bit))
    .map(([, name]) => name);

  return mods.length ? mods.join("|") : "MOD_NONE";
}

export function qmkKeycodeName(value: number): string {
  return (
    qmkBasicKeycodes[value] ??
    qmkModifiedName(value) ??
    qmkModTapName(value) ??
    qmkLayerTapName(value) ??
    qmkLayerSelectorName(value, qmkToBase, "TO") ??
    qmkLayerSelectorName(value, qmkMomentaryBase, "MO") ??
    qmkLayerSelectorName(value, qmkDefaultLayerBase, "DF") ??
    qmkLayerSelectorName(value, qmkToggleLayerBase, "TG") ??
    qmkLayerSelectorName(value, qmkOneShotLayerBase, "OSL") ??
    qmkLayerSelectorName(value, qmkLayerTapToggleBase, "TT") ??
    qmkTapDanceName(value) ??
    qmkMacroName(value) ??
    qmkDirectKeycodes[value]?.key ??
    keycodeHex(value)
  );
}

function parsedNumericKeycode(code: string) {
  if (!/^0X[0-9A-F]+$/i.test(code)) return undefined;
  const value = Number.parseInt(code, 16);
  return Number.isInteger(value) && value >= 0 && value <= 0xffff ? value : undefined;
}

function keycodeCall(code: string, name: string) {
  const match = code.match(new RegExp(`^${name}\\((.+)\\)$`, "i"));
  return match?.[1]?.trim();
}

function qmkModifiedValue(code: string): number | undefined {
  for (const [alias, modMask] of Object.entries(modifiedAliasValues)) {
    const tapKey = keycodeCall(code, alias);
    if (!tapKey) continue;

    const tapValue: number | undefined = qmkKeycodeValue(tapKey);
    if (tapValue === undefined || tapValue > 0xff) return undefined;
    return qmkModifiedBase | (modMask << 8) | tapValue;
  }

  return undefined;
}

function qmkModTapValue(code: string): number | undefined {
  for (const [alias, modMask] of Object.entries(modTapAliasValues)) {
    const tapKey = keycodeCall(code, alias);
    if (!tapKey) continue;

    const tapValue: number | undefined = qmkKeycodeValue(tapKey);
    if (tapValue === undefined || tapValue > 0xff) return undefined;
    return qmkModTapBase | (modMask << 8) | tapValue;
  }

  return undefined;
}

function qmkLayerTapValue(code: string): number | undefined {
  const match = code.match(/^LT\((\d+),(.+)\)$/i);
  if (!match) return undefined;

  const layer = Number(match[1]);
  const tapValue: number | undefined = qmkKeycodeValue(match[2]);
  if (!Number.isInteger(layer) || layer < 0 || layer > 0x0f) return undefined;
  if (tapValue === undefined || tapValue > 0xff) return undefined;
  return qmkLayerTapBase | (layer << 8) | tapValue;
}

function qmkLayerSelectorValue(code: string, base: number, name: string): number | undefined {
  const layer = keycodeCall(code, name);
  if (!layer || !/^\d+$/.test(layer)) return undefined;

  const value = Number(layer);
  if (!Number.isInteger(value) || value < 0 || value > qmkLayerSelectorMask) return undefined;
  return base | value;
}

export function qmkKeycodeValue(code: string): number | undefined {
  const normalized = code.trim().replace(/\s+/g, "").toUpperCase();

  return (
    qmkBasicKeycodeValues[normalized] ??
    qmkDirectKeycodeValues[normalized] ??
    parsedNumericKeycode(normalized) ??
    qmkModifiedValue(normalized) ??
    qmkModTapValue(normalized) ??
    qmkLayerTapValue(normalized) ??
    qmkLayerSelectorValue(normalized, qmkToBase, "TO") ??
    qmkLayerSelectorValue(normalized, qmkMomentaryBase, "MO") ??
    qmkLayerSelectorValue(normalized, qmkDefaultLayerBase, "DF") ??
    qmkLayerSelectorValue(normalized, qmkToggleLayerBase, "TG") ??
    qmkLayerSelectorValue(normalized, qmkOneShotLayerBase, "OSL") ??
    qmkLayerSelectorValue(normalized, qmkLayerTapToggleBase, "TT")
  );
}

export function normalizeQmkKeycode(code: string) {
  const normalized = code.trim().replace(/\s+/g, "").toUpperCase();
  const value = qmkKeycodeValue(normalized);
  if (value === undefined) return code;

  const decoded = qmkKeycodeName(value);
  return decoded.startsWith("0x") ? normalized : decoded;
}

export function qmkKeycodeLabel(code: string) {
  const normalized = normalizeQmkKeycode(code);
  const value = qmkKeycodeValue(normalized);
  const direct = value === undefined ? undefined : qmkDirectKeycodes[value];

  if (direct && (direct.key === normalized || direct.aliases.includes(normalized))) {
    return direct.label;
  }

  return normalized.replace(/\bKC_/g, "");
}

function layerName(index: number) {
  return index === 0 ? "Base" : index === 1 ? "Fn" : `Layer ${index}`;
}

function ensureLayerCount(device: DeviceProfile, layerCount: number) {
  const layers = device.layers.slice(0, layerCount);

  while (layers.length < layerCount) {
    const index = layers.length;
    layers.push({
      id: `layer-${index}`,
      name: layerName(index),
      color: layerColors[index % layerColors.length],
      bindings: bindingsFrom(defaultCodes.map((row) => row.map(() => "KC_TRNS"))),
    });
  }

  return layers;
}

export const keycodeGroups = [
  {
    name: "Base",
    codes: ["KC_ESC", "KC_TAB", "KC_CAPS", "KC_ENT", "KC_SPC", "KC_BSPC", "KC_DEL", "KC_TRNS"],
  },
  {
    name: "Modifiers",
    codes: ["KC_LCTL", "KC_LSFT", "KC_LALT", "KC_LGUI", "KC_RCTL", "KC_RSFT", "KC_RALT", "KC_MEH"],
  },
  {
    name: "Layers",
    codes: ["MO(1)", "TG(1)", "TO(0)", "LT(1,KC_SPC)", "DF(0)", "OSL(1)", "TT(1)"],
  },
  {
    name: "QMK",
    codes: ["QK_BOOT", "EEP_RST", "MAGIC_TOGGLE_NKRO", "AU_TOGG", "GU_TOGG", "CG_TOGG"],
  },
  {
    name: "Lighting",
    codes: [
      "RGB_TOG",
      "RGB_MOD",
      "RGB_RMOD",
      "RGB_HUI",
      "RGB_HUD",
      "RGB_SAI",
      "RGB_SAD",
      "RGB_VAI",
      "RGB_VAD",
    ],
  },
  {
    name: "Media",
    codes: ["KC_MUTE", "KC_VOLU", "KC_VOLD", "KC_MPLY", "KC_MPRV", "KC_MNXT", "KC_BRID", "KC_BRIU"],
  },
];

export const featureCatalog: FeatureDefinition[] = [
  {
    id: "keymap",
    label: "Keymap",
    context: ["keymap"],
    requiresSelection: true,
    summary: "Layered keycodes, transparent keys, and hold-tap bindings.",
  },
  {
    id: "macros",
    label: "Macros",
    context: ["firmware"],
    summary: "Named sequences that can be bound to a key or combo.",
  },
  {
    id: "combos",
    label: "Combos",
    context: ["firmware"],
    summary: "Chords that emit a keycode without changing the base layout.",
  },
  {
    id: "tapDance",
    label: "Tap Dance",
    context: ["firmware"],
    requiresSelection: true,
    summary: "Single, hold, and double-tap behavior for the selected key.",
  },
  {
    id: "keyOverrides",
    label: "Overrides",
    context: ["firmware"],
    summary: "Modifier-driven substitutions for one-off shortcuts.",
  },
  {
    id: "lighting",
    label: "RGB",
    context: ["keymap"],
    summary: "Board-wide RGB plus per-key overrides from the keymap inspector.",
  },
  {
    id: "encoders",
    label: "Encoders",
    context: ["keymap"],
    summary: "Rotary clockwise, counter-clockwise, and press actions.",
  },
  {
    id: "oled",
    label: "OLED",
    context: ["firmware"],
    summary: "Status screen slots and layer indicators.",
  },
  {
    id: "settings",
    label: "Behavior",
    context: ["firmware"],
    summary: "Tapping term, debounce, NKRO, and split transport settings.",
  },
  {
    id: "firmware",
    label: "Firmware",
    context: ["firmware"],
    summary: "Compile, flash, and generated QMK source output.",
  },
];

export const sampleKeyboard: DeviceProfile = {
  id: "local-keyboard-profile",
  name: "Local keyboard",
  origin: "starter",
  vendor: "Local profile",
  firmware: "qmk",
  protocol: "via-v3",
  firmwareVersion: "QMK/VIA local profile",
  vendorId: 0xfeed,
  productId: 0x6060,
  matrix: { rows: 5, cols: 15 },
  keys: createKeys(),
  capabilities: [
    "keymap",
    "layers",
    "macros",
    "combos",
    "tapDance",
    "keyOverrides",
    "lighting",
    "settings",
    "firmware",
  ],
  layers: [
    {
      id: "base",
      name: "Base",
      color: "#2f7f79",
      bindings: bindingsFrom(defaultCodes),
    },
    {
      id: "fn",
      name: "Fn",
      color: "#d96f32",
      bindings: bindingsFrom(fnCodes),
    },
    {
      id: "nav",
      name: "Nav",
      color: "#5d6fb8",
      bindings: bindingsFrom(defaultCodes.map((row) => row.map(() => "KC_TRNS"))),
    },
  ],
  macros: [
    {
      id: "macro-open-terminal",
      name: "Open Terminal",
      sequence: ["KC_LGUI", "KC_ENT"],
      trigger: "Fn + Enter",
    },
    {
      id: "macro-window-left",
      name: "Tile Left",
      sequence: ["KC_LGUI", "KC_LEFT"],
      trigger: "Fn + H",
    },
  ],
  combos: [
    {
      id: "combo-esc",
      name: "QW Escape",
      keys: ["k1-1", "k1-2"],
      binding: "KC_ESC",
    },
  ],
  tapDances: [
    {
      id: "td-caps",
      keyId: "k2-0",
      tap: "KC_ESC",
      hold: "KC_LCTL",
      doubleTap: "KC_CAPS",
    },
  ],
  keyOverrides: [
    {
      id: "override-shift-bspc",
      trigger: "KC_BSPC",
      replacement: "KC_DEL",
      modifiers: ["KC_LSFT", "KC_RSFT"],
    },
  ],
  lighting: {
    mode: "reactive",
    hue: 90,
    saturation: 15,
    brightness: 82,
    speed: 45,
    keys: {
      "k0-0": keyLightingFromSwatchId("coral"),
      "k1-1": keyLightingFromSwatchId("lilac"),
      "k1-2": keyLightingFromSwatchId("lilac"),
      "k1-3": keyLightingFromSwatchId("lilac"),
      "k2-4": keyLightingFromSwatchId("teal"),
      "k2-7": keyLightingFromSwatchId("teal"),
      "k3-0": keyLightingFromSwatchId("coral"),
      "k4-3": keyLightingFromSwatchId("mustard"),
    },
  },
  settings: {
    tappingTerm: 185,
    debounce: 5,
    permissiveHold: true,
    retroTapping: false,
    nkro: true,
    splitTransport: "none",
  },
  updatedAt: new Date().toISOString(),
};

function normalizeBinding(binding: KeyBinding): KeyBinding {
  return {
    ...binding,
    code: normalizeQmkKeycode(binding.code),
    hold: binding.hold ? normalizeQmkKeycode(binding.hold) : binding.hold,
    tap: binding.tap ? normalizeQmkKeycode(binding.tap) : binding.tap,
  };
}

export function cloneDeviceEffect(device: DeviceProfile) {
  return Effect.try({
    try: () => JSON.parse(JSON.stringify(device)) as DeviceProfile,
    catch: (error) =>
      new Error(error instanceof Error ? error.message : "Device profile could not be cloned"),
  });
}

export function cloneDevice(device: DeviceProfile): DeviceProfile {
  return Effect.runSync(cloneDeviceEffect(device));
}

export function withDeviceProfileOrigin(
  device: DeviceProfile,
  origin: DeviceProfileOrigin,
): DeviceProfile {
  return {
    ...cloneDevice(device),
    origin,
  };
}

export function profileDisplayName(profile: Pick<DeviceProfile, "name" | "origin">): string {
  return profile.name;
}

function isDeviceProfileOrigin(value: unknown): value is DeviceProfileOrigin {
  return value === "device" || value === "imported" || value === "draft" || value === "starter";
}

export function normalizeDeviceKeycodesEffect(device: DeviceProfile) {
  return Effect.map(cloneDeviceEffect(device), (profile) => {
    profile.layers = profile.layers.map((layer) => ({
      ...layer,
      bindings: Object.fromEntries(
        Object.entries(layer.bindings).map(([keyId, binding]) => [
          keyId,
          normalizeBinding(binding),
        ]),
      ),
    }));

    return profile;
  });
}

export function normalizeDeviceKeycodes(device: DeviceProfile): DeviceProfile {
  return Effect.runSync(normalizeDeviceKeycodesEffect(device));
}

function sanitizeDeviceIdentity(identity: DeviceIdentity): DeviceIdentity {
  return {
    key: String(identity.key),
    transport: identity.transport,
    vendorId: typeof identity.vendorId === "number" ? identity.vendorId : undefined,
    productId: typeof identity.productId === "number" ? identity.productId : undefined,
    productName: typeof identity.productName === "string" ? identity.productName : undefined,
    serialNumber: typeof identity.serialNumber === "string" ? identity.serialNumber : undefined,
  };
}

type StoredKeycode = string | number;
type StoredKeyBinding = Omit<KeyBinding, "code" | "hold" | "tap"> & {
  code: StoredKeycode;
  hold?: StoredKeycode;
  tap?: StoredKeycode;
};
type StoredLayer = Omit<Layer, "bindings"> & {
  bindings: Record<string, StoredKeyBinding>;
};

export type StoredDeviceProfile = Omit<DeviceProfile, "layers"> & {
  layers: StoredLayer[];
};
export type StoredSavePoint = Omit<SavePoint, "snapshot"> & {
  snapshot: StoredDeviceProfile;
};
export type StoredWorkspaceFork = Omit<WorkspaceFork, "device"> & {
  device: StoredDeviceProfile;
};

function encodeStoredKeycode(code?: string): StoredKeycode | undefined {
  if (code === undefined) return undefined;

  const normalized = normalizeQmkKeycode(code.trim());
  return qmkKeycodeValue(normalized) ?? normalized;
}

function decodeStoredKeycode(value: unknown, fallback = "KC_NO"): string {
  if (typeof value === "number" && Number.isFinite(value)) return qmkKeycodeName(value);
  if (typeof value === "string") return normalizeQmkKeycode(value);
  return fallback;
}

function encodeBindingForStorage(binding: KeyBinding): StoredKeyBinding {
  return {
    ...binding,
    code: encodeStoredKeycode(binding.code) ?? "KC_NO",
    hold: encodeStoredKeycode(binding.hold),
    tap: encodeStoredKeycode(binding.tap),
  };
}

function decodeBindingFromStorage(value: unknown): KeyBinding {
  const binding = value && typeof value === "object" ? (value as Record<string, unknown>) : {};

  return {
    ...binding,
    code: decodeStoredKeycode(binding.code),
    hold: binding.hold === undefined ? undefined : decodeStoredKeycode(binding.hold, ""),
    tap: binding.tap === undefined ? undefined : decodeStoredKeycode(binding.tap, ""),
  };
}

export function encodeDeviceProfileForStorage(device: DeviceProfile): StoredDeviceProfile {
  return Effect.runSync(encodeDeviceProfileForStorageEffect(device));
}

export function encodeDeviceProfileForStorageEffect(device: DeviceProfile) {
  return Effect.map(
    normalizeDeviceKeycodesEffect(device),
    (profile): StoredDeviceProfile => ({
      ...profile,
      layers: profile.layers.map((layer) => ({
        ...layer,
        bindings: Object.fromEntries(
          Object.entries(layer.bindings).map(([keyId, binding]) => [
            keyId,
            encodeBindingForStorage(binding),
          ]),
        ),
      })),
    }),
  );
}

export function decodeDeviceProfileFromStorage(value: unknown): DeviceProfile {
  return Effect.runSync(decodeDeviceProfileFromStorageEffect(value));
}

export function decodeDeviceProfileFromStorageEffect(value: unknown) {
  return Effect.flatMap(
    Effect.try({
      try: () => {
        const profile = value as DeviceProfile;
        return {
          ...profile,
          origin: isDeviceProfileOrigin(profile.origin) ? profile.origin : "imported",
          layers: profile.layers.map((layer) => ({
            ...layer,
            bindings: Object.fromEntries(
              Object.entries(layer.bindings).map(([keyId, binding]) => [
                keyId,
                decodeBindingFromStorage(binding),
              ]),
            ),
          })),
        };
      },
      catch: (error) =>
        new Error(error instanceof Error ? error.message : "Stored profile could not be decoded"),
    }),
    normalizeDeviceKeycodesEffect,
  );
}

export function encodeSavePointForStorage(savePoint: SavePoint): StoredSavePoint {
  return Effect.runSync(encodeSavePointForStorageEffect(savePoint));
}

export function encodeSavePointForStorageEffect(savePoint: SavePoint) {
  return Effect.map(encodeDeviceProfileForStorageEffect(savePoint.snapshot), (snapshot) => ({
    ...savePoint,
    snapshot,
  }));
}

export function decodeSavePointFromStorage(value: unknown): SavePoint {
  return Effect.runSync(decodeSavePointFromStorageEffect(value));
}

export function decodeSavePointFromStorageEffect(value: unknown) {
  return Effect.flatMap(
    Effect.try({
      try: () => value as SavePoint,
      catch: (error) =>
        new Error(
          error instanceof Error ? error.message : "Stored save point could not be decoded",
        ),
    }),
    (savePoint) =>
      Effect.map(decodeDeviceProfileFromStorageEffect(savePoint.snapshot), (snapshot) => ({
        ...savePoint,
        snapshot,
      })),
  );
}

export function encodeWorkspaceForkForStorage(fork: WorkspaceFork): StoredWorkspaceFork {
  return Effect.runSync(encodeWorkspaceForkForStorageEffect(fork));
}

export function encodeWorkspaceForkForStorageEffect(fork: WorkspaceFork) {
  return Effect.map(encodeDeviceProfileForStorageEffect(fork.device), (device) => ({
    ...fork,
    device,
  }));
}

export function decodeWorkspaceForkFromStorage(value: unknown): WorkspaceFork {
  return Effect.runSync(decodeWorkspaceForkFromStorageEffect(value));
}

export function decodeWorkspaceForkFromStorageEffect(value: unknown) {
  return Effect.flatMap(
    Effect.try({
      try: () => value as WorkspaceFork,
      catch: (error) =>
        new Error(error instanceof Error ? error.message : "Stored fork could not be decoded"),
    }),
    (fork) =>
      Effect.map(decodeDeviceProfileFromStorageEffect(fork.device), (device) => ({
        ...fork,
        device,
      })),
  );
}

export function profileFromDetectionEffect(base: DeviceProfile, detection: KeyboardDetection) {
  return Effect.map(cloneDeviceEffect(base), (profile) => {
    const layerCount = Math.max(detection.layerCount ?? profile.layers.length, 1);
    const identity = sanitizeDeviceIdentity(detection.identity);

    profile.id = identity.key;
    profile.origin = "device";
    profile.identity = identity;
    profile.name = identity.productName ?? profile.name;
    profile.vendor = "Detected keyboard";
    profile.vendorId = identity.vendorId ?? profile.vendorId;
    profile.productId = identity.productId ?? profile.productId;
    profile.protocol = detection.protocolVersion ? "via-v3" : profile.protocol;
    profile.firmwareVersion = detection.protocolVersion
      ? `VIA protocol ${detection.protocolVersion}`
      : profile.firmwareVersion;
    profile.capabilities = Array.from(
      new Set<Capability>(["keymap", "layers", "settings", "firmware", ...detection.capabilities]),
    );
    profile.layers = ensureLayerCount(profile, layerCount);
    profile.detectionNotes = Array.from(
      new Set([
        ...detection.notes,
        detection.keymap
          ? "Imported the current VIA keymap from the device."
          : "Using the current keyboard definition as the physical layout outline.",
      ]),
    );
    profile.updatedAt = new Date().toISOString();

    if (detection.keymap) {
      profile.layers = profile.layers.map((layer, layerIndex) => {
        const matrix = detection.keymap?.[layerIndex];
        if (!matrix) return layer;

        const bindings = { ...layer.bindings };
        for (const key of profile.keys) {
          const keycode = matrix[key.row]?.[key.col];
          if (typeof keycode === "number") {
            bindings[key.id] = { code: qmkKeycodeName(keycode) };
          }
        }

        return { ...layer, bindings };
      });
    }

    return profile;
  });
}

export function profileFromDetection(
  base: DeviceProfile,
  detection: KeyboardDetection,
): DeviceProfile {
  return Effect.runSync(profileFromDetectionEffect(base, detection));
}

export function bindingFor(device: DeviceProfile, layerId: string, keyId: string): KeyBinding {
  return device.layers.find((layer) => layer.id === layerId)?.bindings[keyId] ?? { code: "KC_NO" };
}

export function keyById(device: DeviceProfile, keyId: string): KeyboardKey | undefined {
  return device.keys.find((key) => key.id === keyId);
}
