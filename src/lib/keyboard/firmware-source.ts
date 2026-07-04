import { qmkDirectKeycodes } from "./qmk-keycodes";
import {
  incompleteLogicBindingReason,
  isCompleteCombo,
  isCompleteMacro,
  isCompleteTapDance,
} from "./logic-bindings";
import {
  normalizeQmkKeycode,
  qmkKeycodeName,
  qmkKeycodeValue,
  type DeviceProfile,
  type KeyBinding,
  type KeyOverride,
  type KeyboardKey,
  type Combo,
  type Macro,
  type TapDance,
} from "./schema";

export type FirmwareDiagnosticSeverity = "info" | "warning" | "error";
export type FirmwareArtifactRole =
  | "qmk-keymap-json"
  | "qmk-keymap-c"
  | "qmk-config-h"
  | "qmk-rules-mk"
  | "zmk-keymap"
  | "zmk-conf"
  | "zmk-build-yaml";

export interface FirmwareDiagnostic {
  code: string;
  file?: string;
  message: string;
  path?: string;
  severity: FirmwareDiagnosticSeverity;
}

export interface FirmwareGeneratedFile {
  content: string;
  mimeType: string;
  path: string;
  role: FirmwareArtifactRole;
}

export interface QmkKeymapJson {
  keyboard: string;
  keymap: string;
  layout: string;
  layers: string[][];
}

export interface GeneratedQmkKeymapJson {
  diagnostics: FirmwareDiagnostic[];
  file: FirmwareGeneratedFile;
  keymap: QmkKeymapJson;
  keyOrder: string[];
}

export interface FirmwareSourceBundle {
  buildCommand: string;
  diagnostics: FirmwareDiagnostic[];
  files: FirmwareGeneratedFile[];
  sourceHash: string;
}

export interface FirmwareArtifacts {
  artifacts: FirmwareGeneratedFile[];
  buildCommand: string;
  diagnostics: FirmwareDiagnostic[];
  sourceHash: string;
  summary: {
    errors: number;
    files: number;
    target: DeviceProfile["firmware"];
    warnings: number;
  };
  target: DeviceProfile["firmware"];
}

interface QmkMetadata {
  keyOrder?: string[];
  keyboard?: string;
  keymap: string;
  layout?: string;
}

interface ZmkMetadata {
  board?: string;
  keyOrder?: string[];
  keymapName: string;
  shield?: string;
}

type UnknownRecord = Record<string, unknown>;
type Indexed<T> = { index: number; item: T };

const qmkMacroPattern = /^QK_MACRO_(\d+)$/i;
const qmkTapDancePattern = /^TD\((\d+)\)$/i;
const qmkLayerTapPattern = /^LT\((\d+),(.+)\)$/i;
const qmkLayerPattern = /^(MO|TO|TG)\((\d+)\)$/i;
const qmkModifiedPattern = /^(C|S|A|G|LCTL|LSFT|LALT|LGUI|RCTL|RSFT|RALT|RGUI)\((.+)\)$/i;
const qmkModTapPattern = /^(LCTL|LSFT|LALT|LGUI|RCTL|RSFT|RALT|RGUI)_T\((.+)\)$/i;

const zmkKeyNames: Record<string, string> = {
  KC_NO: "NO",
  KC_TRNS: "TRANS",
  KC_ESC: "ESC",
  KC_TAB: "TAB",
  KC_CAPS: "CAPS",
  KC_ENT: "ENTER",
  KC_SPC: "SPACE",
  KC_BSPC: "BSPC",
  KC_DEL: "DEL",
  KC_INS: "INS",
  KC_HOME: "HOME",
  KC_END: "END",
  KC_PGUP: "PG_UP",
  KC_PGDN: "PG_DN",
  KC_LEFT: "LEFT",
  KC_DOWN: "DOWN",
  KC_UP: "UP",
  KC_RGHT: "RIGHT",
  KC_MINS: "MINUS",
  KC_EQL: "EQUAL",
  KC_LBRC: "LBKT",
  KC_RBRC: "RBKT",
  KC_BSLS: "BSLH",
  KC_SCLN: "SEMI",
  KC_QUOT: "SQT",
  KC_GRV: "GRAVE",
  KC_COMM: "COMMA",
  KC_DOT: "DOT",
  KC_SLSH: "SLASH",
  KC_LCTL: "LCTRL",
  KC_LSFT: "LSHFT",
  KC_LALT: "LALT",
  KC_LGUI: "LGUI",
  KC_RCTL: "RCTRL",
  KC_RSFT: "RSHFT",
  KC_RALT: "RALT",
  KC_RGUI: "RGUI",
  KC_MUTE: "C_MUTE",
  KC_VOLU: "C_VOL_UP",
  KC_VOLD: "C_VOL_DN",
  KC_MPLY: "C_PP",
  KC_MPRV: "C_PREV",
  KC_MNXT: "C_NEXT",
  KC_PSCR: "PSCRN",
  KC_PAUS: "PAUSE_BREAK",
};

for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") zmkKeyNames[`KC_${letter}`] = letter;
for (let index = 1; index <= 9; index += 1) zmkKeyNames[`KC_${index}`] = `N${index}`;
zmkKeyNames.KC_0 = "N0";
for (let index = 1; index <= 24; index += 1) zmkKeyNames[`KC_F${index}`] = `F${index}`;

const zmkModifierNames: Record<string, string> = {
  A: "LA",
  C: "LC",
  G: "LG",
  LALT: "LA",
  LCTL: "LC",
  LGUI: "LG",
  LSFT: "LS",
  RALT: "RA",
  RCTL: "RC",
  RGUI: "RG",
  RSFT: "RS",
  S: "LS",
};

const zmkModTapNames: Record<string, string> = {
  LALT: "LALT",
  LCTL: "LCTRL",
  LGUI: "LGUI",
  LSFT: "LSHFT",
  RALT: "RALT",
  RCTL: "RCTRL",
  RGUI: "RGUI",
  RSFT: "RSHFT",
};

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nestedRecord(record: UnknownRecord, key: string): UnknownRecord | undefined {
  const value = record[key];
  return isRecord(value) ? value : undefined;
}

function metadataRecords(profile: DeviceProfile, family: DeviceProfile["firmware"]) {
  const root = profile as unknown as UnknownRecord;
  const records: UnknownRecord[] = [root];

  for (const key of ["firmwareSource", "firmwareMetadata", "source", "catalog", "boardMetadata"]) {
    const record = nestedRecord(root, key);
    if (!record) continue;
    records.push(record);
    const familyRecord = nestedRecord(record, family);
    if (familyRecord) records.push(familyRecord);
  }

  const familyRecord = nestedRecord(root, family);
  if (familyRecord) records.push(familyRecord);

  return records;
}

function firstString(records: readonly UnknownRecord[], keys: readonly string[]) {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return undefined;
}

function firstStringArray(records: readonly UnknownRecord[], keys: readonly string[]) {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
        const strings = value.map((item) => item.trim()).filter(Boolean);
        if (strings.length > 0) return strings;
      }
    }
  }
  return undefined;
}

function diagnostic(
  code: string,
  severity: FirmwareDiagnosticSeverity,
  message: string,
  options: Pick<FirmwareDiagnostic, "file" | "path"> = {},
): FirmwareDiagnostic {
  return { code, message, severity, ...options };
}

function qmkMetadata(profile: DeviceProfile): QmkMetadata {
  const records = metadataRecords(profile, "qmk");
  return {
    keyboard: firstString(records, [
      "keyboard",
      "keyboardPath",
      "qmkKeyboard",
      "qmkKeyboardPath",
      "keyboard_path",
    ]),
    keymap: slugFor(profile.name || profile.id, "kbgui_keymap").replace(/-/g, "_"),
    layout: firstString(records, [
      "layout",
      "layoutMacro",
      "layoutMacroName",
      "qmkLayout",
      "qmkLayoutMacro",
    ]),
    keyOrder: firstStringArray(records, [
      "keyOrder",
      "layoutKeyOrder",
      "physicalKeyOrder",
      "qmkKeyOrder",
    ]),
  };
}

function zmkMetadata(profile: DeviceProfile): ZmkMetadata {
  const records = metadataRecords(profile, "zmk");
  return {
    board: firstString(records, ["board", "zmkBoard"]),
    keymapName: slugFor(profile.name || profile.id, "kbgui").replace(/-/g, "_"),
    shield: firstString(records, ["shield", "zmkShield"]),
    keyOrder: firstStringArray(records, [
      "keyOrder",
      "physicalKeyOrder",
      "zmkKeyOrder",
      "keyPositionOrder",
    ]),
  };
}

function slugFor(value: string, fallback: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return slug || fallback;
}

function cIdentifier(value: string, fallback: string) {
  const id = value
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const safe = id || fallback;
  return /^[0-9]/.test(safe) ? `_${safe}` : safe;
}

function cEnumName(value: string, fallback: string) {
  return cIdentifier(value, fallback).toUpperCase();
}

function keyPositionOrder(
  profile: DeviceProfile,
  configuredOrder: readonly string[] | undefined,
  target: "qmk" | "zmk",
): { diagnostics: FirmwareDiagnostic[]; keyOrder: string[] } {
  const keyIds = new Set(profile.keys.map((key) => key.id));
  const diagnostics: FirmwareDiagnostic[] = [];

  if (configuredOrder?.length) {
    const unknown = configuredOrder.filter((keyId) => !keyIds.has(keyId));
    const missing = profile.keys.filter((key) => !configuredOrder.includes(key.id));
    if (unknown.length > 0) {
      diagnostics.push(
        diagnostic(
          `${target}.key_order.unknown_keys`,
          "warning",
          `Configured key order includes unknown key ids: ${unknown.join(", ")}.`,
        ),
      );
    }
    if (missing.length > 0) {
      diagnostics.push(
        diagnostic(
          `${target}.key_order.incomplete`,
          "warning",
          `Configured key order omitted ${missing.length} physical keys; row/column fallback appended them.`,
        ),
      );
    }

    return {
      diagnostics,
      keyOrder: [
        ...configuredOrder.filter((keyId) => keyIds.has(keyId)),
        ...sortKeysByMatrix(missing).map((key) => key.id),
      ],
    };
  }

  diagnostics.push(
    diagnostic(
      `${target}.metadata.key_order_missing`,
      "warning",
      target === "qmk"
        ? "QMK layout macro key order is missing; row/column order is emitted as an inspectable fallback."
        : "ZMK physical position order is missing; row/column order is emitted as an inspectable fallback.",
    ),
  );
  return { diagnostics, keyOrder: sortKeysByMatrix(profile.keys).map((key) => key.id) };
}

function sortKeysByMatrix(keys: readonly KeyboardKey[]) {
  return [...keys].sort(
    (left, right) =>
      left.row - right.row || left.col - right.col || left.id.localeCompare(right.id),
  );
}

function specialQmkCode(code: string) {
  const normalized = code.trim().replace(/\s+/g, "").toUpperCase();
  if (qmkMacroPattern.test(normalized) || qmkTapDancePattern.test(normalized)) return normalized;
  return undefined;
}

function qmkCodeForBinding(
  binding: KeyBinding,
  diagnostics: FirmwareDiagnostic[],
  context: string,
  fallback = "KC_NO",
) {
  if (binding.tap || binding.hold || binding.macroId || binding.notes) {
    diagnostics.push(
      diagnostic(
        "qmk.binding.metadata",
        binding.notes && !binding.tap && !binding.hold && !binding.macroId ? "info" : "warning",
        `Binding metadata on ${context} is not represented by a plain keymap cell.`,
        { path: context },
      ),
    );
  }

  const special = specialQmkCode(binding.code);
  if (special) return special;

  const value = qmkKeycodeValue(binding.code);
  if (value === undefined) {
    diagnostics.push(
      diagnostic(
        "qmk.keycode.unsupported",
        "error",
        `${binding.code} cannot be converted to a known QMK keycode; ${fallback} was emitted.`,
        { path: context },
      ),
    );
    return `${fallback} /* UNSUPPORTED: ${binding.code} */`;
  }

  return qmkKeycodeName(value);
}

function clearCodeForLayerIndex(layerIndex: number): string {
  return layerIndex === 0 ? "KC_NO" : "KC_TRNS";
}

function qmkCodeForProfileBinding(
  profile: DeviceProfile,
  binding: KeyBinding,
  diagnostics: FirmwareDiagnostic[],
  context: string,
  layerIndex: number,
) {
  const incomplete = incompleteLogicBindingReason(profile, binding.code);
  if (incomplete) {
    const clearCode = clearCodeForLayerIndex(layerIndex);
    diagnostics.push(
      diagnostic(
        "qmk.logic.incomplete_binding",
        "warning",
        `${incomplete} ${clearCode} was emitted for this keymap cell.`,
        { path: context },
      ),
    );
    return clearCode;
  }

  return qmkCodeForBinding(binding, diagnostics, context);
}

function qmkCodeForJson(
  profile: DeviceProfile,
  binding: KeyBinding,
  diagnostics: FirmwareDiagnostic[],
  context: string,
  layerIndex: number,
) {
  return qmkCodeForProfileBinding(profile, binding, diagnostics, context, layerIndex).replace(
    /\s*\/\*.*\*\/\s*$/g,
    "",
  );
}

export function generateQmkKeymapJson(profile: DeviceProfile): GeneratedQmkKeymapJson {
  const metadata = qmkMetadata(profile);
  const diagnostics: FirmwareDiagnostic[] = [];
  const { diagnostics: orderDiagnostics, keyOrder } = keyPositionOrder(
    profile,
    metadata.keyOrder,
    "qmk",
  );
  diagnostics.push(...orderDiagnostics);

  if (!metadata.keyboard) {
    diagnostics.push(
      diagnostic(
        "qmk.metadata.keyboard_missing",
        "error",
        "QMK keyboard path is missing; set metadata such as qmk.keyboard before compiling.",
        { file: "qmk/keymap.json" },
      ),
    );
  }
  if (!metadata.layout) {
    diagnostics.push(
      diagnostic(
        "qmk.metadata.layout_missing",
        "error",
        "QMK layout macro name is missing; set metadata such as qmk.layout before compiling.",
        { file: "qmk/keymap.json" },
      ),
    );
  }

  const keymap: QmkKeymapJson = {
    keyboard: metadata.keyboard ?? "",
    keymap: metadata.keymap,
    layout: metadata.layout ?? "",
    layers: profile.layers.map((layer, layerIndex) =>
      keyOrder.map((keyId) =>
        qmkCodeForJson(
          profile,
          layer.bindings[keyId] ?? { code: layerIndex === 0 ? "KC_NO" : "KC_TRNS" },
          diagnostics,
          `layers/${layer.name}/${keyId}`,
          layerIndex,
        ),
      ),
    ),
  };

  return {
    diagnostics: uniqueDiagnostics(diagnostics),
    file: {
      content: `${JSON.stringify(keymap, null, 2)}\n`,
      mimeType: "application/json",
      path: "qmk/keymap.json",
      role: "qmk-keymap-json",
    },
    keymap,
    keyOrder,
  };
}

export function generateQmkSourceBundle(profile: DeviceProfile): FirmwareSourceBundle {
  const metadata = qmkMetadata(profile);
  const diagnostics: FirmwareDiagnostic[] = [];
  const { diagnostics: orderDiagnostics, keyOrder } = keyPositionOrder(
    profile,
    metadata.keyOrder,
    "qmk",
  );
  diagnostics.push(...orderDiagnostics);

  if (!metadata.keyboard) {
    diagnostics.push(
      diagnostic(
        "qmk.metadata.keyboard_missing",
        "error",
        "QMK keyboard path is missing; keymap source was generated with a placeholder build command.",
      ),
    );
  }
  if (!metadata.layout) {
    diagnostics.push(
      diagnostic(
        "qmk.metadata.layout_missing",
        "error",
        "QMK layout macro name is missing; keymap.c uses LAYOUT as a placeholder.",
        { file: "qmk/keymaps/keymap.c" },
      ),
    );
  }

  const keymapName = metadata.keymap;
  const sourceRoot = `qmk/keymaps/${keymapName}`;
  const files: FirmwareGeneratedFile[] = [
    {
      content: generateQmkKeymapC(profile, metadata.layout ?? "LAYOUT", keyOrder, diagnostics),
      mimeType: "text/x-csrc",
      path: `${sourceRoot}/keymap.c`,
      role: "qmk-keymap-c",
    },
    {
      content: generateQmkConfigH(profile, diagnostics),
      mimeType: "text/x-chdr",
      path: `${sourceRoot}/config.h`,
      role: "qmk-config-h",
    },
    {
      content: generateQmkRulesMk(profile, diagnostics),
      mimeType: "text/plain",
      path: `${sourceRoot}/rules.mk`,
      role: "qmk-rules-mk",
    },
  ];

  const buildCommand = `qmk compile -kb ${metadata.keyboard ?? "<qmk-keyboard>"} -km ${keymapName}`;
  return {
    buildCommand,
    diagnostics: uniqueDiagnostics(diagnostics),
    files,
    sourceHash: firmwareSourceHash(files),
  };
}

function generateQmkKeymapC(
  profile: DeviceProfile,
  layoutMacro: string,
  keyOrder: readonly string[],
  diagnostics: FirmwareDiagnostic[],
) {
  const layers = profile.layers.map((layer, index) => ({
    enumName: cEnumName(layer.name || layer.id, `LAYER_${index}`),
    index,
    name: layer.name || layer.id,
  }));

  const lines = [
    "#include QMK_KEYBOARD_H",
    "",
    "// Generated by kbgui source export.",
    "// Review diagnostics before compiling; missing board metadata is left as TODO/UNSUPPORTED.",
    "",
    "enum layers {",
    ...layers.map((layer) => `  _${layer.enumName},`),
    "};",
    "",
    "const uint16_t PROGMEM keymaps[][MATRIX_ROWS][MATRIX_COLS] = {",
    ...profile.layers.flatMap((layer, layerIndex) => {
      const enumName = layers[layerIndex]?.enumName ?? `LAYER_${layerIndex}`;
      const keyLines = keyOrder.map((keyId, index) => {
        const suffix = index === keyOrder.length - 1 ? "" : ",";
        return `    ${qmkCodeForProfileBinding(
          profile,
          layer.bindings[keyId] ?? { code: layerIndex === 0 ? "KC_NO" : "KC_TRNS" },
          diagnostics,
          `layers/${layer.name}/${keyId}`,
          layerIndex,
        )}${suffix}`;
      });
      return [`  [_${enumName}] = ${layoutMacro}(`, ...keyLines, "  ),"];
    }),
    "};",
    "",
    ...qmkMacroSource(completeMacroEntries(profile.macros), diagnostics),
    ...qmkComboSource(profile, diagnostics),
    ...qmkTapDanceSource(completeTapDanceEntries(profile.tapDances), diagnostics),
    ...qmkKeyOverrideSource(profile.keyOverrides, diagnostics),
  ];

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

function qmkMacroSource(macros: readonly Indexed<Macro>[], diagnostics: FirmwareDiagnostic[]) {
  if (macros.length === 0) return [];

  diagnostics.push(
    diagnostic(
      "qmk.macros.sequence_semantics",
      "warning",
      "Macro sequence export uses tap_code16 calls; kbgui does not yet model press/release timing.",
      { file: "keymap.c" },
    ),
  );

  return [
    "// Macro definitions.",
    "// UNSUPPORTED: sequence timing and modifier hold semantics must be reviewed manually.",
    "bool process_record_user(uint16_t keycode, keyrecord_t *record) {",
    "  switch (keycode) {",
    ...macros.flatMap(({ index, item: macro }) => [
      `    case QK_MACRO_${index}: // ${macro.name || macro.id}`,
      "      if (record->event.pressed) {",
      ...macro.sequence.map(
        (code) =>
          `        tap_code16(${qmkStandaloneCode(code, diagnostics, `macros/${macro.name}`)});`,
      ),
      "      }",
      "      return false;",
    ]),
    "  }",
    "  return true;",
    "}",
    "",
  ];
}

function qmkStandaloneCode(
  code: string,
  diagnostics: FirmwareDiagnostic[],
  context: string,
  fallback = "KC_NO",
) {
  return qmkCodeForBinding({ code }, diagnostics, context, fallback).replace(
    /\s*\/\*.*\*\/\s*$/g,
    "",
  );
}

function qmkComboSource(profile: DeviceProfile, diagnostics: FirmwareDiagnostic[]) {
  const combos = completeCombos(profile.combos);
  if (combos.length === 0) return [];

  const baseLayer = profile.layers[0];
  if (!baseLayer) return [];

  const enumNames = combos.map((combo, index) =>
    cEnumName(combo.name || combo.id, `COMBO_${index}`),
  );

  const definitions = combos.flatMap((combo, index) => {
    const id = cIdentifier(combo.id || combo.name, `combo_${index}`);
    const comboCodes = combo.keys.map((keyId) =>
      qmkCodeForProfileBinding(
        profile,
        baseLayer.bindings[keyId] ?? { code: "KC_NO" },
        diagnostics,
        `combos/${combo.name}/${keyId}`,
        0,
      ).replace(/\s*\/\*.*\*\/\s*$/g, ""),
    );
    const binding = qmkStandaloneCode(combo.binding, diagnostics, `combos/${combo.name}/binding`);
    const layerComment = combo.layerIds?.length
      ? [
          `// TODO: ${combo.name} is scoped to layer ids ${combo.layerIds.join(", ")}.`,
          "// QMK layer-scoped combos need combo_should_trigger or equivalent policy code.",
        ]
      : [];

    return [
      ...layerComment,
      `const uint16_t PROGMEM ${id}_keys[] = { ${comboCodes.join(", ")}, COMBO_END };`,
      `// ${combo.name}: ${combo.keys.join(" + ")} -> ${combo.binding}`,
      `// key_combos[${enumNames[index]}] emits ${binding}.`,
    ];
  });

  return [
    "// Combo definitions.",
    "enum combo_events {",
    ...enumNames.map((name) => `  ${name},`),
    "  COMBO_LENGTH,",
    "};",
    "uint16_t COMBO_LEN = COMBO_LENGTH;",
    ...definitions,
    "combo_t key_combos[] = {",
    ...combos.map((combo, index) => {
      const id = cIdentifier(combo.id || combo.name, `combo_${index}`);
      const binding = qmkStandaloneCode(combo.binding, diagnostics, `combos/${combo.name}/binding`);
      return `  [${enumNames[index]}] = COMBO(${id}_keys, ${binding}),`;
    }),
    "};",
    "",
  ];
}

function qmkTapDanceSource(
  tapDances: readonly Indexed<TapDance>[],
  diagnostics: FirmwareDiagnostic[],
) {
  if (tapDances.length === 0) return [];

  diagnostics.push(
    diagnostic(
      "qmk.tap_dance.hold_unsupported",
      "warning",
      "Tap dance hold behavior needs custom finished/reset handlers; double-tap skeleton was emitted.",
      { file: "keymap.c" },
    ),
  );

  const enumNames = tapDances.map(({ index, item: dance }) => cEnumName(dance.id, `TD_${index}`));
  return [
    "// Tap dance definitions.",
    "enum tap_dance_events {",
    ...tapDances.map(({ index }, entryIndex) => `  ${enumNames[entryIndex]} = ${index},`),
    "};",
    "tap_dance_action_t tap_dance_actions[] = {",
    ...tapDances.map(({ item: dance }, index) => {
      const tap = qmkStandaloneCode(dance.tap, diagnostics, `tap-dances/${dance.id}/tap`);
      const doubleTap = qmkStandaloneCode(
        dance.doubleTap,
        diagnostics,
        `tap-dances/${dance.id}/doubleTap`,
      );
      return `  [${enumNames[index]}] = ACTION_TAP_DANCE_DOUBLE(${tap}, ${doubleTap}), // UNSUPPORTED: hold ${dance.hold}`;
    }),
    "};",
    "",
  ];
}

function qmkKeyOverrideSource(
  keyOverrides: readonly KeyOverride[],
  diagnostics: FirmwareDiagnostic[],
) {
  if (keyOverrides.length === 0) return [];

  const declarations = keyOverrides.map((override, index) => {
    const id = cIdentifier(override.id || override.trigger, `key_override_${index}`);
    const modifiers = qmkModifierMask(
      override.modifiers,
      diagnostics,
      `key-overrides/${override.id}`,
    );
    const trigger = qmkStandaloneCode(
      override.trigger,
      diagnostics,
      `key-overrides/${override.id}/trigger`,
    );
    const replacement = qmkStandaloneCode(
      override.replacement,
      diagnostics,
      `key-overrides/${override.id}/replacement`,
    );
    return `const key_override_t ${id} = ko_make_basic(${modifiers}, ${trigger}, ${replacement});`;
  });

  const pointers = keyOverrides.map((override, index) => {
    const id = cIdentifier(override.id || override.trigger, `key_override_${index}`);
    return `  &${id},`;
  });

  return [
    "// Key override definitions.",
    ...declarations,
    "const key_override_t **key_overrides = (const key_override_t *[]){",
    ...pointers,
    "  NULL,",
    "};",
    "",
  ];
}

function qmkModifierMask(
  modifiers: readonly string[],
  diagnostics: FirmwareDiagnostic[],
  context: string,
) {
  const normalized = new Set(modifiers.map((modifier) => normalizeQmkKeycode(modifier)));
  if (normalized.size === 0) return "MOD_MASK_NONE";
  const masks: string[] = [];
  if (normalized.has("KC_LCTL") || normalized.has("KC_RCTL")) masks.push("MOD_MASK_CTRL");
  if (normalized.has("KC_LSFT") || normalized.has("KC_RSFT")) masks.push("MOD_MASK_SHIFT");
  if (normalized.has("KC_LALT") || normalized.has("KC_RALT")) masks.push("MOD_MASK_ALT");
  if (normalized.has("KC_LGUI") || normalized.has("KC_RGUI")) masks.push("MOD_MASK_GUI");

  const represented = new Set<string>();
  if (masks.includes("MOD_MASK_CTRL")) {
    represented.add("KC_LCTL");
    represented.add("KC_RCTL");
  }
  if (masks.includes("MOD_MASK_SHIFT")) {
    represented.add("KC_LSFT");
    represented.add("KC_RSFT");
  }
  if (masks.includes("MOD_MASK_ALT")) {
    represented.add("KC_LALT");
    represented.add("KC_RALT");
  }
  if (masks.includes("MOD_MASK_GUI")) {
    represented.add("KC_LGUI");
    represented.add("KC_RGUI");
  }

  const unsupported = [...normalized].filter((modifier) => !represented.has(modifier));
  if (unsupported.length > 0) {
    diagnostics.push(
      diagnostic(
        "qmk.key_override.modifier_unsupported",
        "warning",
        `Unsupported override modifiers on ${context}: ${unsupported.join(", ")}.`,
        { path: context },
      ),
    );
  }

  return masks.length ? masks.join(" | ") : "MOD_MASK_NONE";
}

function generateQmkConfigH(profile: DeviceProfile, diagnostics: FirmwareDiagnostic[]) {
  const lines = [
    "#pragma once",
    "",
    "// Generated by kbgui source export.",
    `#define TAPPING_TERM ${Math.max(1, Math.round(profile.settings.tappingTerm))}`,
    `#define DEBOUNCE ${Math.max(0, Math.round(profile.settings.debounce))}`,
  ];

  if (profile.protocol === "via-v3") {
    lines.push(`#define DYNAMIC_KEYMAP_LAYER_COUNT ${Math.max(1, profile.layers.length)}`);
  }
  if (profile.settings.permissiveHold) lines.push("#define PERMISSIVE_HOLD");
  if (profile.settings.retroTapping) lines.push("#define RETRO_TAPPING");
  if (profile.settings.splitTransport !== "none") {
    lines.push(`// TODO: configure QMK split transport: ${profile.settings.splitTransport}.`);
    diagnostics.push(
      diagnostic(
        "qmk.settings.split_transport",
        "warning",
        "QMK split transport settings are board-specific; config.h contains a TODO comment.",
        { file: "config.h" },
      ),
    );
  }
  if (Object.keys(profile.lighting.keys).length > 0 || profile.capabilities.includes("lighting")) {
    lines.push(
      "// TODO: map kbgui lighting profile to this board's RGBLIGHT or RGB_MATRIX config.",
    );
    diagnostics.push(
      diagnostic(
        "qmk.lighting.unsupported",
        "warning",
        "Lighting source generation is board-specific and is emitted as a TODO.",
        { file: "config.h" },
      ),
    );
  }

  return `${lines.join("\n")}\n`;
}

function generateQmkRulesMk(profile: DeviceProfile, diagnostics: FirmwareDiagnostic[]) {
  const rules = ["# Generated by kbgui source export."];
  if (profile.protocol === "via-v3") rules.push("VIA_ENABLE = yes");
  if (completeCombos(profile.combos).length > 0) rules.push("COMBO_ENABLE = yes");
  if (completeTapDances(profile.tapDances).length > 0) rules.push("TAP_DANCE_ENABLE = yes");
  if (profile.keyOverrides.length > 0) rules.push("KEY_OVERRIDE_ENABLE = yes");
  if (profile.settings.nkro) rules.push("NKRO_ENABLE = yes");
  if (completeMacros(profile.macros).length > 0) {
    rules.push("# Macros are emitted through process_record_user in keymap.c.");
  }
  if (profile.capabilities.includes("lighting")) {
    rules.push("# TODO: enable RGBLIGHT_ENABLE or RGB_MATRIX_ENABLE for the target board.");
    diagnostics.push(
      diagnostic(
        "qmk.rules.lighting_feature_unknown",
        "warning",
        "Lighting capability does not identify whether QMK uses RGBLIGHT or RGB_MATRIX.",
        { file: "rules.mk" },
      ),
    );
  }
  return `${rules.join("\n")}\n`;
}

export function generateZmkSource(profile: DeviceProfile): FirmwareSourceBundle {
  const metadata = zmkMetadata(profile);
  const diagnostics: FirmwareDiagnostic[] = [];
  const { diagnostics: orderDiagnostics, keyOrder } = keyPositionOrder(
    profile,
    metadata.keyOrder,
    "zmk",
  );
  diagnostics.push(...orderDiagnostics);

  if (!metadata.board) {
    diagnostics.push(
      diagnostic(
        "zmk.metadata.board_missing",
        "error",
        "ZMK board identity is missing; build.yaml uses a placeholder board.",
        { file: "zmk/build.yaml" },
      ),
    );
  }
  if (!metadata.shield) {
    diagnostics.push(
      diagnostic(
        "zmk.metadata.shield_missing",
        "warning",
        "ZMK shield identity is missing; build.yaml uses a placeholder shield.",
        { file: "zmk/build.yaml" },
      ),
    );
  }

  const keymapPath = `zmk/config/${metadata.keymapName}.keymap`;
  const files: FirmwareGeneratedFile[] = [
    {
      content: generateZmkKeymap(profile, keyOrder, diagnostics),
      mimeType: "text/plain",
      path: keymapPath,
      role: "zmk-keymap",
    },
    {
      content: generateZmkConf(profile, diagnostics),
      mimeType: "text/plain",
      path: `zmk/config/${metadata.keymapName}.conf`,
      role: "zmk-conf",
    },
    {
      content: generateZmkBuildYaml(metadata),
      mimeType: "text/yaml",
      path: "zmk/build.yaml",
      role: "zmk-build-yaml",
    },
  ];

  const buildCommand = `west build -b ${metadata.board ?? "<zmk-board>"}${
    metadata.shield ? ` -- -DSHIELD=${metadata.shield}` : " -- -DSHIELD=<zmk-shield>"
  }`;

  return {
    buildCommand,
    diagnostics: uniqueDiagnostics(diagnostics),
    files,
    sourceHash: firmwareSourceHash(files),
  };
}

function generateZmkKeymap(
  profile: DeviceProfile,
  keyOrder: readonly string[],
  diagnostics: FirmwareDiagnostic[],
) {
  const layerBlocks = profile.layers.flatMap((layer, layerIndex) => {
    const nodeName = cIdentifier(
      slugFor(layer.name || layer.id, `layer_${layerIndex}`),
      `layer_${layerIndex}`,
    ).toLowerCase();
    const bindings = keyOrder.map((keyId) =>
      zmkBehaviorForBinding(
        profile,
        layer.bindings[keyId] ?? { code: layerIndex === 0 ? "KC_NO" : "KC_TRNS" },
        diagnostics,
        `layers/${layer.name}/${keyId}`,
        layerIndex,
      ),
    );

    return [
      `    ${nodeName}_layer {`,
      `      display-name = "${escapeDtsString(layer.name)}";`,
      "      bindings = <",
      ...wrapBindings(bindings).map((line) => `        ${line}`),
      "      >;",
      "    };",
      "",
    ];
  });

  const sections = [
    "/* Generated by kbgui source export. Review diagnostics before compiling. */",
    "#include <behaviors.dtsi>",
    "#include <dt-bindings/zmk/keys.h>",
    "#include <dt-bindings/zmk/bt.h>",
    "",
    "/ {",
    ...zmkMacroSection(completeMacros(profile.macros), diagnostics),
    ...zmkTapDanceSection(completeTapDances(profile.tapDances), diagnostics),
    ...zmkComboSection(profile, keyOrder, diagnostics),
    "  keymap {",
    '    compatible = "zmk,keymap";',
    "",
    ...layerBlocks,
    "  };",
    "};",
  ];

  return `${sections.join("\n").replace(/\n{3,}/g, "\n\n")}\n`;
}

function zmkMacroSection(macros: readonly Macro[], diagnostics: FirmwareDiagnostic[]) {
  if (macros.length === 0) return [];

  diagnostics.push(
    diagnostic(
      "zmk.macros.sequence_semantics",
      "warning",
      "ZMK macro export treats macro sequence entries as ordered taps; kbgui does not model timing yet.",
      { file: ".keymap" },
    ),
  );

  return [
    "  macros {",
    ...macros.flatMap((macro, index) => {
      const node = cIdentifier(macro.id || macro.name, `macro_${index}`).toLowerCase();
      const bindings = macro.sequence.map(
        (code) => zmkBehaviorForCode(code, diagnostics, `macros/${macro.name}`).text,
      );
      return [
        `    ${node}: ${node} {`,
        '      compatible = "zmk,behavior-macro";',
        '      label = "KBgui macro";',
        "      #binding-cells = <0>;",
        `      bindings = ${bindings.map((binding) => `<${binding}>`).join(", ")};`,
        "    };",
      ];
    }),
    "  };",
    "",
  ];
}

function zmkTapDanceSection(tapDances: readonly TapDance[], diagnostics: FirmwareDiagnostic[]) {
  if (tapDances.length === 0) return [];

  diagnostics.push(
    diagnostic(
      "zmk.tap_dance.hold_unsupported",
      "warning",
      "Tap dance hold fields need a ZMK hold-tap or custom behavior; tap/double-tap skeleton was emitted.",
      { file: ".keymap" },
    ),
  );

  return [
    "  behaviors {",
    ...tapDances.flatMap((dance, index) => {
      const node = cIdentifier(dance.id, `td_${index}`).toLowerCase();
      const tap = zmkBehaviorForCode(dance.tap, diagnostics, `tap-dances/${dance.id}/tap`).text;
      const doubleTap = zmkBehaviorForCode(
        dance.doubleTap,
        diagnostics,
        `tap-dances/${dance.id}/doubleTap`,
      ).text;
      return [
        `    ${node}: ${node} {`,
        '      compatible = "zmk,behavior-tap-dance";',
        '      label = "KBgui tap dance";',
        "      #binding-cells = <0>;",
        "      tapping-term-ms = <200>;",
        `      bindings = <${tap}>, <${doubleTap}>; /* UNSUPPORTED: hold ${dance.hold} */`,
        "    };",
      ];
    }),
    "  };",
    "",
  ];
}

function zmkComboSection(
  profile: DeviceProfile,
  keyOrder: readonly string[],
  diagnostics: FirmwareDiagnostic[],
) {
  const combos = completeCombos(profile.combos);
  if (combos.length === 0) return [];
  const positionByKeyId = new Map(keyOrder.map((keyId, index) => [keyId, index]));

  return [
    "  combos {",
    '    compatible = "zmk,combos";',
    ...combos.flatMap((combo, index) => {
      const node = cIdentifier(combo.id || combo.name, `combo_${index}`).toLowerCase();
      const positions = combo.keys
        .map((keyId) => positionByKeyId.get(keyId))
        .filter((position): position is number => position !== undefined);
      if (positions.length !== combo.keys.length) {
        diagnostics.push(
          diagnostic(
            "zmk.combo.position_missing",
            "error",
            `Combo ${combo.name} references keys that are missing from the ZMK position order.`,
            { path: `combos/${combo.name}` },
          ),
        );
      }
      const binding = zmkBehaviorForCode(
        combo.binding,
        diagnostics,
        `combos/${combo.name}/binding`,
      ).text;
      const layers = combo.layerIds?.length
        ? [
            `      layers = <${combo.layerIds
              .map((id) => profile.layers.findIndex((layer) => layer.id === id))
              .filter((index) => index >= 0)
              .join(" ")}>;`,
          ]
        : [];

      return [
        `    ${node} {`,
        "      timeout-ms = <30>;",
        `      key-positions = <${positions.join(" ")}>;`,
        ...layers,
        `      bindings = <${binding}>;`,
        "    };",
      ];
    }),
    "  };",
    "",
  ];
}

function zmkBehaviorForBinding(
  profile: DeviceProfile,
  binding: KeyBinding,
  diagnostics: FirmwareDiagnostic[],
  context: string,
  layerIndex: number,
) {
  const incomplete = incompleteLogicBindingReason(profile, binding.code);
  if (incomplete) {
    const text = layerIndex === 0 ? "&none" : "&trans";
    diagnostics.push(
      diagnostic(
        "zmk.logic.incomplete_binding",
        "warning",
        `${incomplete} ${text} was emitted for this keymap cell.`,
        { path: context },
      ),
    );
    return `${text} /* INCOMPLETE: ${binding.code} */`;
  }

  if (binding.tap || binding.hold || binding.macroId || binding.notes) {
    diagnostics.push(
      diagnostic(
        "zmk.binding.metadata",
        binding.notes && !binding.tap && !binding.hold && !binding.macroId ? "info" : "warning",
        `Binding metadata on ${context} needs a ZMK behavior node or manual review.`,
        { path: context },
      ),
    );
  }
  return zmkBehaviorForCode(binding.code, diagnostics, context).text;
}

function zmkBehaviorForCode(
  rawCode: string,
  diagnostics: FirmwareDiagnostic[],
  context: string,
): { text: string; unsupported: boolean } {
  const code = normalizeQmkKeycode(rawCode).replace(/\s+/g, "").toUpperCase();
  if (code === "KC_NO" || code === "XXXXXXX") return { text: "&none", unsupported: false };
  if (code === "KC_TRNS" || code === "KC_TRANSPARENT" || code === "_______") {
    return { text: "&trans", unsupported: false };
  }

  const layerTap = qmkLayerTapPattern.exec(code);
  if (layerTap) {
    const tap = zmkKeyForQmkCode(layerTap[2]);
    if (tap) return { text: `&lt ${layerTap[1]} ${tap}`, unsupported: false };
  }

  const layer = qmkLayerPattern.exec(code);
  if (layer) {
    const behavior =
      layer[1].toUpperCase() === "MO" ? "&mo" : layer[1].toUpperCase() === "TO" ? "&to" : "&tog";
    return { text: `${behavior} ${layer[2]}`, unsupported: false };
  }

  const modTap = qmkModTapPattern.exec(code);
  if (modTap) {
    const modifier = zmkModTapNames[modTap[1].toUpperCase()];
    const tap = zmkKeyForQmkCode(modTap[2]);
    if (modifier && tap) return { text: `&mt ${modifier} ${tap}`, unsupported: false };
  }

  const modified = qmkModifiedPattern.exec(code);
  if (modified) {
    const modifier = zmkModifierNames[modified[1].toUpperCase()];
    const tap = zmkKeyForQmkCode(modified[2]);
    if (modifier && tap) return { text: `&kp ${modifier}(${tap})`, unsupported: false };
  }

  const key = zmkKeyForQmkCode(code);
  if (key) return { text: `&kp ${key}`, unsupported: false };

  diagnostics.push(
    diagnostic(
      "zmk.keycode.unsupported",
      "warning",
      `${rawCode} does not have a known ZMK behavior mapping; &none placeholder was emitted.`,
      { path: context },
    ),
  );
  return { text: `&none /* UNSUPPORTED: ${rawCode} */`, unsupported: true };
}

function zmkKeyForQmkCode(rawCode: string) {
  const special = specialQmkCode(rawCode);
  if (special) return undefined;

  const normalized = normalizeQmkKeycode(rawCode).replace(/\s+/g, "").toUpperCase();
  const mapped = zmkKeyNames[normalized];
  if (mapped) return mapped;

  const value = qmkKeycodeValue(normalized);
  if (value === undefined) return undefined;

  const direct = qmkDirectKeycodes[value];
  if (
    !direct?.group ||
    !["basic", "internal", "media", "modifiers", "system"].includes(direct.group)
  ) {
    return undefined;
  }

  return zmkKeyNames[qmkKeycodeName(value)];
}

function wrapBindings(bindings: readonly string[], perLine = 8) {
  const lines: string[] = [];
  for (let index = 0; index < bindings.length; index += perLine) {
    lines.push(bindings.slice(index, index + perLine).join(" "));
  }
  return lines;
}

function generateZmkConf(profile: DeviceProfile, diagnostics: FirmwareDiagnostic[]) {
  const lines = [
    "# Generated by kbgui source export.",
    `CONFIG_ZMK_KEYBOARD_NAME="${escapeDtsString(profile.name)}"`,
  ];
  if (profile.protocol === "zmk-studio") lines.push("CONFIG_ZMK_STUDIO=y");
  if (profile.settings.splitTransport === "ble") lines.push("CONFIG_BT=y");
  if (profile.settings.splitTransport === "serial") {
    lines.push("# TODO: configure ZMK serial split transport for this board.");
  }
  if (profile.settings.nkro) lines.push("CONFIG_ZMK_HID_REPORT_TYPE_NKRO=y");
  if (profile.settings.tappingTerm) {
    lines.push(
      `# TODO: map tapping term ${profile.settings.tappingTerm}ms to specific hold-tap behaviors.`,
    );
    diagnostics.push(
      diagnostic(
        "zmk.settings.tapping_term_scope",
        "info",
        "ZMK tapping term is behavior-specific; .conf contains a TODO comment.",
        { file: ".conf" },
      ),
    );
  }
  return `${lines.join("\n")}\n`;
}

function generateZmkBuildYaml(metadata: ZmkMetadata) {
  return [
    "# Generated by kbgui source export.",
    "include:",
    `  - board: ${metadata.board ?? "<zmk-board>"}`,
    `    shield: ${metadata.shield ?? "<zmk-shield>"}`,
    "",
  ].join("\n");
}

function escapeDtsString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function hasAdvancedQmkSource(profile: DeviceProfile) {
  return (
    completeMacroEntries(profile.macros).length > 0 ||
    completeCombos(profile.combos).length > 0 ||
    completeTapDanceEntries(profile.tapDances).length > 0 ||
    profile.keyOverrides.length > 0
  );
}

function completeMacroEntries(macros: readonly Macro[]): Indexed<Macro>[] {
  return macros.map((item, index) => ({ index, item })).filter(({ item }) => isCompleteMacro(item));
}

function completeMacros(macros: readonly Macro[]): Macro[] {
  return completeMacroEntries(macros).map(({ item }) => item);
}

function completeCombos(combos: readonly Combo[]): Combo[] {
  return combos.filter(isCompleteCombo);
}

function completeTapDanceEntries(tapDances: readonly TapDance[]): Indexed<TapDance>[] {
  return tapDances
    .map((item, index) => ({ index, item }))
    .filter(({ item }) => isCompleteTapDance(item));
}

function completeTapDances(tapDances: readonly TapDance[]): TapDance[] {
  return completeTapDanceEntries(tapDances).map(({ item }) => item);
}

export function generateFirmwareArtifacts(profile: DeviceProfile): FirmwareArtifacts {
  if (profile.firmware === "zmk") {
    const zmk = generateZmkSource(profile);
    return artifactResult(profile.firmware, zmk.files, zmk.diagnostics, zmk.buildCommand);
  }

  const qmkJson = generateQmkKeymapJson(profile);
  const qmkSource = generateQmkSourceBundle(profile);
  const artifacts = [qmkJson.file, ...qmkSource.files];
  const diagnostics = uniqueDiagnostics([...qmkJson.diagnostics, ...qmkSource.diagnostics]);
  const buildCommand =
    hasAdvancedQmkSource(profile) || qmkJson.diagnostics.some((item) => item.severity === "error")
      ? qmkSource.buildCommand
      : `qmk compile ${qmkJson.file.path}`;

  return artifactResult(profile.firmware, artifacts, diagnostics, buildCommand);
}

function artifactResult(
  target: DeviceProfile["firmware"],
  artifacts: FirmwareGeneratedFile[],
  diagnostics: FirmwareDiagnostic[],
  buildCommand: string,
): FirmwareArtifacts {
  const unique = uniqueDiagnostics(diagnostics);
  return {
    artifacts,
    buildCommand,
    diagnostics: unique,
    sourceHash: firmwareSourceHash(artifacts),
    summary: {
      errors: unique.filter((item) => item.severity === "error").length,
      files: artifacts.length,
      target,
      warnings: unique.filter((item) => item.severity === "warning").length,
    },
    target,
  };
}

export function firmwareSourceHash(files: readonly FirmwareGeneratedFile[]) {
  const input = [...files]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((file) => `${file.path}\0${file.content}`)
    .join("\0");

  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return `src-${hash.toString(16).padStart(8, "0")}`;
}

function uniqueDiagnostics(diagnostics: readonly FirmwareDiagnostic[]) {
  const seen = new Set<string>();
  const unique: FirmwareDiagnostic[] = [];
  for (const item of diagnostics) {
    const key = [item.code, item.severity, item.file ?? "", item.path ?? "", item.message].join(
      "\0",
    );
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}
