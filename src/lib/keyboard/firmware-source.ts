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
import { zmkBindingExpression } from "./zmk-keycodes";

export type FirmwareDiagnosticSeverity = "info" | "warning" | "error";
export type FirmwareArtifactRole =
  | "qmk-keymap-json"
  | "qmk-keymap-c"
  | "qmk-config-h"
  | "qmk-rules-mk"
  | "qmk-userspace-manifest"
  | "github-workflow"
  | "kbui-manifest"
  | "zmk-keymap"
  | "zmk-conf"
  | "zmk-build-yaml"
  | "zmk-west-manifest";

export interface FirmwareDiagnostic {
  code: string;
  file?: string;
  message: string;
  path?: string;
  severity: FirmwareDiagnosticSeverity;
}

export function firmwareDiagnosticKey(item: FirmwareDiagnostic) {
  return [item.code, item.severity, item.file ?? "", item.path ?? "", item.message].join("\0");
}

export function firmwareDiagnosticDisplayKey(item: FirmwareDiagnostic) {
  return [item.code, item.severity, item.path ?? item.file ?? ""].join("\0");
}

export function compactFirmwareDiagnostics(diagnostics: readonly FirmwareDiagnostic[]) {
  const seen = new Set<string>();
  return diagnostics.filter((item) => {
    const key = firmwareDiagnosticDisplayKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  buildReady: boolean;
  buildCommand: string;
  diagnostics: FirmwareDiagnostic[];
  sourceHash: string;
  summary: {
    buildReady: boolean;
    errors: number;
    files: number;
    target: DeviceProfile["firmware"];
    warnings: number;
  };
  target: DeviceProfile["firmware"];
}

interface QmkMetadata {
  alternatives?: Array<{ keyboard: string; layout: string }>;
  keyOrder?: string[];
  keyboard?: string;
  keymap: string;
  layout?: string;
  productName?: string;
  targetConfirmed?: boolean;
}

interface ZmkMetadata {
  board?: string;
  keyOrder?: string[];
  keymapName: string;
  shield?: string;
  shields: string[];
  targetConfirmed?: boolean;
}

type UnknownRecord = Record<string, unknown>;
type Indexed<T> = { index: number; item: T };

const qmkMacroPattern = /^QK_MACRO_(\d+)$/i;
const qmkTapDancePattern = /^TD\((\d+)\)$/i;
const qmkModifiedSourceMin = 0x0100;
const qmkModifiedSourceMax = 0x1fff;
const qmkModTapSourceMin = 0x2000;
const qmkModTapSourceMax = 0x3fff;
const requiredQmkKeyboardPath = "<REQUIRED: qmk keyboard path>";
const requiredQmkLayoutMacroJson = "<REQUIRED: qmk layout macro>";
const requiredQmkLayoutMacroIdentifier = "KBUI_REQUIRED_QMK_LAYOUT_MACRO";
const requiredZmkBoard = "<REQUIRED: zmk board>";
const requiredZmkShield = "<REQUIRED: zmk shield>";

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
    keymap:
      firstString(records, ["keymap", "keymapName", "qmkKeymap"]) ??
      slugFor(profile.name || profile.id, "kbui_keymap").replace(/-/g, "_"),
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
    alternatives: profile.firmwareMetadata?.qmk?.alternatives,
    productName: profile.identity?.productName,
    targetConfirmed: profile.firmwareMetadata?.qmk?.targetConfirmed,
  };
}

/**
 * Message for the "several controller targets share this identity" gate. When
 * the connected device's product name carries a token that appears in NONE of
 * the candidate keyboard paths (e.g. a "splinky" controller against mainline
 * QMK's blackpill/elitec-only Charybdis targets), the physical controller is
 * probably a variant that no candidate builds — so we warn that the MCU itself
 * must be verified, not merely picked from the list.
 */
function qmkTargetUnconfirmedMessage(metadata: QmkMetadata): string {
  const base =
    "Several QMK controller targets share this device identity. Confirm the physical controller before compiling.";

  const productName = metadata.productName?.trim();
  if (!productName) return base;

  const candidatePaths = [
    metadata.keyboard,
    ...(metadata.alternatives ?? []).map((alternative) => alternative.keyboard),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());
  if (candidatePaths.length === 0) return base;

  const unmatched = productName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3)
    .filter((token) => !candidatePaths.some((path) => path.includes(token)));
  if (unmatched.length === 0) return base;

  return `The connected controller "${productName}" reports ${unmatched.join(", ")}, which matches none of the known QMK targets for this device (${candidatePaths.join(", ")}). The physical controller may be a variant none of these targets build; verify the MCU and pick or supply the correct build target before compiling.`;
}

function zmkMetadata(profile: DeviceProfile): ZmkMetadata {
  const records = metadataRecords(profile, "zmk");
  const shield = firstString(records, ["shield", "zmkShield"]);
  const shields = firstStringArray(records, ["shields", "zmkShields"]);
  return {
    board: firstString(records, ["board", "zmkBoard"]),
    keymapName:
      firstString(records, ["keymap", "keymapName", "zmkKeymap"]) ??
      slugFor(profile.name || profile.id, "kbui").replace(/-/g, "_"),
    shield: shields?.[0] ?? shield,
    shields: shields ?? (shield ? [shield] : []),
    keyOrder: firstStringArray(records, [
      "keyOrder",
      "physicalKeyOrder",
      "zmkKeyOrder",
      "keyPositionOrder",
    ]),
    targetConfirmed: profile.firmwareMetadata?.zmk?.targetConfirmed,
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
          "error",
          `Configured key order includes unknown key ids: ${unknown.join(", ")}.`,
        ),
      );
    }
    if (missing.length > 0) {
      diagnostics.push(
        diagnostic(
          `${target}.key_order.incomplete`,
          "error",
          `Configured key order omitted ${missing.length} physical keys; firmware generation is blocked until the physical order is complete.`,
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
      "error",
      target === "qmk"
        ? "QMK layout macro key order is missing; firmware generation is blocked until it is resolved."
        : "ZMK physical position order is missing; firmware generation is blocked until it is resolved.",
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

function qmkSourceModifierNames(mask: number) {
  const side = mask & 0x10 ? "R" : "L";
  return [
    [0x01, `${side}CTL`],
    [0x02, `${side}SFT`],
    [0x04, `${side}ALT`],
    [0x08, `${side}GUI`],
  ]
    .filter(([bit]) => mask & Number(bit))
    .map(([, name]) => String(name));
}

function qmkSourceModifierMask(mask: number) {
  const side = mask & 0x10 ? "R" : "L";
  const modifiers = [
    [0x01, `MOD_${side}CTL`],
    [0x02, `MOD_${side}SFT`],
    [0x04, `MOD_${side}ALT`],
    [0x08, `MOD_${side}GUI`],
  ]
    .filter(([bit]) => mask & Number(bit))
    .map(([, name]) => String(name));

  return modifiers.length > 0 ? modifiers.join(" | ") : "MOD_NONE";
}

function portableQmkSourceCode(value: number) {
  if (value >= qmkModifiedSourceMin && value <= qmkModifiedSourceMax) {
    const modifiers = qmkSourceModifierNames((value >> 8) & 0x1f);
    let code = qmkKeycodeName(value & 0xff);
    for (let index = modifiers.length - 1; index >= 0; index -= 1) {
      code = `${modifiers[index]}(${code})`;
    }
    return code;
  }

  if (value >= qmkModTapSourceMin && value <= qmkModTapSourceMax) {
    const modifierMask = qmkSourceModifierMask((value >> 8) & 0x1f);
    return `MT(${modifierMask}, ${qmkKeycodeName(value & 0xff)})`;
  }

  return qmkKeycodeName(value);
}

function qmkCodeForBinding(
  binding: KeyBinding,
  diagnostics: FirmwareDiagnostic[],
  context: string,
  _fallback = "KC_NO",
  style: "source" | "canonical" = "source",
) {
  if (binding.tap || binding.hold || binding.macroId || binding.notes) {
    diagnostics.push(
      diagnostic(
        "qmk.binding.metadata",
        binding.notes && !binding.tap && !binding.hold && !binding.macroId ? "info" : "error",
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
        `Unsupported QMK keycode ${binding.code} at ${context}; firmware generation is blocked.`,
        { path: context },
      ),
    );
    return `KBUI_UNSUPPORTED_KEYCODE /* ${binding.code} */`;
  }

  return style === "source" ? portableQmkSourceCode(value) : qmkKeycodeName(value);
}

function qmkCodeForProfileBinding(
  profile: DeviceProfile,
  binding: KeyBinding,
  diagnostics: FirmwareDiagnostic[],
  context: string,
  _layerIndex: number,
  style: "source" | "canonical" = "source",
) {
  const incomplete = incompleteLogicBindingReason(profile, binding.code);
  if (incomplete) {
    diagnostics.push(
      diagnostic(
        "qmk.logic.incomplete_binding",
        "error",
        `${incomplete} Firmware generation is blocked for this keymap cell.`,
        { path: context },
      ),
    );
    return `KBUI_INCOMPLETE_BINDING /* ${binding.code} */`;
  }

  return qmkCodeForBinding(binding, diagnostics, context, "KC_NO", style);
}

function qmkCodeForJson(
  profile: DeviceProfile,
  binding: KeyBinding,
  diagnostics: FirmwareDiagnostic[],
  context: string,
  layerIndex: number,
) {
  return qmkCodeForProfileBinding(
    profile,
    binding,
    diagnostics,
    context,
    layerIndex,
    "canonical",
  ).replace(/\s*\/\*.*\*\/\s*$/g, "");
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

  if (metadata.targetConfirmed === false) {
    diagnostics.push(
      diagnostic(
        "qmk.metadata.target_unconfirmed",
        "error",
        qmkTargetUnconfirmedMessage(metadata),
        { file: "qmk/keymap.json", path: "metadata.qmk.targetConfirmed" },
      ),
    );
  }

  if (!metadata.keyboard) {
    diagnostics.push(
      diagnostic(
        "qmk.metadata.keyboard_missing",
        "error",
        "QMK keyboard path is missing; set metadata.qmk.keyboard before compiling.",
        { file: "qmk/keymap.json", path: "metadata.qmk.keyboard" },
      ),
    );
  }
  if (!metadata.layout) {
    diagnostics.push(
      diagnostic(
        "qmk.metadata.layout_missing",
        "error",
        "QMK layout macro name is missing; set metadata.qmk.layout before compiling.",
        { file: "qmk/keymap.json", path: "metadata.qmk.layout" },
      ),
    );
  }

  const keymap: QmkKeymapJson = {
    keyboard: metadata.keyboard ?? requiredQmkKeyboardPath,
    keymap: metadata.keymap,
    layout: metadata.layout ?? requiredQmkLayoutMacroJson,
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
  const keymapName = metadata.keymap;
  const sourceRoot = `qmk/keymaps/${keymapName}`;
  const { diagnostics: orderDiagnostics, keyOrder } = keyPositionOrder(
    profile,
    metadata.keyOrder,
    "qmk",
  );
  diagnostics.push(...orderDiagnostics);

  if (metadata.targetConfirmed === false) {
    diagnostics.push(
      diagnostic(
        "qmk.metadata.target_unconfirmed",
        "error",
        qmkTargetUnconfirmedMessage(metadata),
        { file: "COMMANDS.txt", path: "metadata.qmk.targetConfirmed" },
      ),
    );
  }

  if (!metadata.keyboard) {
    diagnostics.push(
      diagnostic(
        "qmk.metadata.keyboard_missing",
        "error",
        "QMK keyboard path is missing; set metadata.qmk.keyboard before running the build command.",
        { file: "COMMANDS.txt", path: "metadata.qmk.keyboard" },
      ),
    );
  }
  if (!metadata.layout) {
    diagnostics.push(
      diagnostic(
        "qmk.metadata.layout_missing",
        "error",
        "QMK layout macro name is missing; replace KBUI_REQUIRED_QMK_LAYOUT_MACRO with the target board layout macro before compiling.",
        { file: `${sourceRoot}/keymap.c`, path: "metadata.qmk.layout" },
      ),
    );
  }

  const files: FirmwareGeneratedFile[] = [
    {
      content: generateQmkKeymapC(
        profile,
        metadata.layout ?? requiredQmkLayoutMacroIdentifier,
        keyOrder,
        diagnostics,
      ),
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

  const buildCommand = `qmk compile -kb ${metadata.keyboard ?? requiredQmkKeyboardPath} -km ${keymapName}`;
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
    "// Generated by kbui source export.",
    "// Review diagnostics before compiling; required board metadata is left as explicit REQUIRED markers.",
    ...(layoutMacro === requiredQmkLayoutMacroIdentifier
      ? [
          "// REQUIRED: replace KBUI_REQUIRED_QMK_LAYOUT_MACRO with the target board's real QMK layout macro.",
        ]
      : []),
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
      "Macro sequence export uses tap_code16 calls; kbui does not yet model press/release timing.",
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
    const comboLabel = combo.name || combo.id || `combo ${index}`;
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
          `// TODO: ${comboLabel} is scoped to layer ids ${combo.layerIds.join(", ")}.`,
          "// QMK layer-scoped combos need combo_should_trigger or equivalent policy code.",
        ]
      : [];
    if (combo.layerIds?.length) {
      diagnostics.push(
        diagnostic(
          "qmk.combos.layer_scope",
          "warning",
          `Combo ${comboLabel} is scoped to layer ids ${combo.layerIds.join(", ")}; QMK combo_should_trigger policy code was not generated.`,
          { file: "keymap.c", path: `combos.${combo.id || index}.layerIds` },
        ),
      );
    }

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
      "error",
      "Tap dance hold behavior needs custom finished/reset handlers; firmware generation is blocked.",
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
    "// Generated by kbui source export.",
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
        `QMK split transport ${profile.settings.splitTransport} is board-specific; config.h contains a TODO comment.`,
        { file: "config.h", path: "settings.splitTransport" },
      ),
    );
  }
  if (Object.keys(profile.lighting.keys).length > 0 || profile.capabilities.includes("lighting")) {
    lines.push("// TODO: map kbui lighting profile to this board's RGBLIGHT or RGB_MATRIX config.");
    diagnostics.push(
      diagnostic(
        "qmk.lighting.unsupported",
        "warning",
        `QMK lighting mode ${profile.lighting.mode} has ${Object.keys(profile.lighting.keys).length} per-key overrides; board RGBLIGHT/RGB_MATRIX config was not generated.`,
        { file: "config.h", path: "lighting" },
      ),
    );
  }

  return `${lines.join("\n")}\n`;
}

function generateQmkRulesMk(profile: DeviceProfile, diagnostics: FirmwareDiagnostic[]) {
  const rules = ["# Generated by kbui source export."];
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
        { file: "rules.mk", path: "capabilities.lighting" },
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

  if (metadata.targetConfirmed === false) {
    diagnostics.push(
      diagnostic(
        "zmk.metadata.target_unconfirmed",
        "error",
        "Several ZMK controller or shield targets match. Confirm the physical hardware before compiling.",
        { file: "zmk/build.yaml", path: "metadata.zmk.targetConfirmed" },
      ),
    );
  }

  if (!metadata.board) {
    diagnostics.push(
      diagnostic(
        "zmk.metadata.board_missing",
        "error",
        "ZMK board identity is missing; set metadata.zmk.board before compiling.",
        { file: "zmk/build.yaml", path: "metadata.zmk.board" },
      ),
    );
  }
  if (metadata.shields.length === 0) {
    diagnostics.push(
      diagnostic(
        "zmk.metadata.shield_missing",
        "error",
        "ZMK shield targets are missing; set the firmware target before compiling.",
        { file: "zmk/build.yaml", path: "metadata.zmk.shields" },
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

  const buildCommand = `west build -b ${metadata.board ?? requiredZmkBoard}${
    metadata.shield ? ` -- -DSHIELD=${metadata.shield}` : ` -- -DSHIELD=${requiredZmkShield}`
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
    "/* Generated by kbui source export. Review diagnostics before compiling. */",
    "#include <behaviors.dtsi>",
    "#include <dt-bindings/zmk/keys.h>",
    "#include <dt-bindings/zmk/bt.h>",
    "#include <dt-bindings/zmk/outputs.h>",
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
      "ZMK macro export treats macro sequence entries as ordered taps; kbui does not model timing yet.",
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
        '      label = "kbui macro";',
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
      "error",
      "Tap dance hold fields need a ZMK hold-tap or custom behavior; firmware generation is blocked.",
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
        '      label = "kbui tap dance";',
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
  _layerIndex: number,
) {
  const incomplete = incompleteLogicBindingReason(profile, binding.code);
  if (incomplete) {
    diagnostics.push(
      diagnostic(
        "zmk.logic.incomplete_binding",
        "error",
        `${incomplete} Firmware generation is blocked for this keymap cell.`,
        { path: context },
      ),
    );
    return `&kbui_incomplete_binding /* ${binding.code} */`;
  }

  if (binding.tap || binding.hold || binding.macroId || binding.notes) {
    diagnostics.push(
      diagnostic(
        "zmk.binding.metadata",
        binding.notes && !binding.tap && !binding.hold && !binding.macroId ? "info" : "error",
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
  const binding = zmkBindingExpression(rawCode);
  if (binding) return { text: binding, unsupported: false };

  diagnostics.push(
    diagnostic(
      "zmk.keycode.unsupported",
      "error",
      `Unsupported ZMK keycode ${rawCode} at ${context}; firmware generation is blocked.`,
      { path: context },
    ),
  );
  return { text: `&kbui_unsupported_keycode /* ${rawCode} */`, unsupported: true };
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
    "# Generated by kbui source export.",
    `CONFIG_ZMK_KEYBOARD_NAME="${escapeDtsString(profile.name)}"`,
  ];
  if (profile.protocol === "zmk-studio") lines.push("CONFIG_ZMK_STUDIO=y");
  if (profile.settings.splitTransport === "ble") lines.push("CONFIG_BT=y");
  if (profile.settings.splitTransport === "serial") {
    lines.push("# TODO: configure ZMK serial split transport for this board.");
    diagnostics.push(
      diagnostic(
        "zmk.settings.serial_split_transport",
        "warning",
        "ZMK serial split transport is board-specific; .conf contains a TODO comment.",
        { file: ".conf", path: "settings.splitTransport" },
      ),
    );
  }
  if (profile.settings.nkro) lines.push("CONFIG_ZMK_HID_REPORT_TYPE_NKRO=y");
  if (profile.settings.tappingTerm) {
    lines.push(
      `# TODO: map tapping term ${profile.settings.tappingTerm}ms to specific hold-tap behaviors.`,
    );
    diagnostics.push(
      diagnostic(
        "zmk.settings.tapping_term_scope",
        "warning",
        `ZMK tapping term ${profile.settings.tappingTerm}ms is behavior-specific; .conf contains a TODO comment.`,
        { file: ".conf", path: "settings.tappingTerm" },
      ),
    );
  }
  return `${lines.join("\n")}\n`;
}

function generateZmkBuildYaml(metadata: ZmkMetadata) {
  const shields = metadata.shields.length > 0 ? metadata.shields : [requiredZmkShield];
  return [
    "# Generated by kbui source export.",
    ...(metadata.board
      ? []
      : ["# REQUIRED: set metadata.zmk.board to a real ZMK board target before building."]),
    ...(metadata.shields.length > 0
      ? []
      : ["# REQUIRED: set metadata.zmk.shields to real ZMK shield targets before building."]),
    "include:",
    ...shields.flatMap((shield) => [
      `  - board: ${zmkBuildYamlValue(metadata.board ?? requiredZmkBoard)}`,
      `    shield: ${zmkBuildYamlValue(shield)}`,
      `    artifact-name: ${zmkBuildYamlValue(shield)}`,
    ]),
    "",
  ].join("\n");
}

function zmkBuildYamlValue(value: string) {
  if (/^[A-Za-z0-9_.-]+$/.test(value)) return value;
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
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
  const errors = unique.filter((item) => item.severity === "error").length;
  const warnings = unique.filter((item) => item.severity === "warning").length;
  const buildReady = errors === 0;
  return {
    artifacts,
    buildReady,
    buildCommand,
    diagnostics: unique,
    sourceHash: firmwareSourceHash(artifacts),
    summary: {
      buildReady,
      errors,
      files: artifacts.length,
      target,
      warnings,
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
    const key = firmwareDiagnosticKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}
