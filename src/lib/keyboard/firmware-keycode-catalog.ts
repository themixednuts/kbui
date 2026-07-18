import { qmkDirectKeycodes } from "./qmk-keycodes";
import { normalizeQmkKeycode, qmkKeycodeLabel, type FirmwareFamily } from "./schema";
import { canonicalCodeForZmkBinding, zmkBindingExpression } from "./zmk-keycodes";

export interface FirmwareKeycodeCatalogItem {
  aliases: string[];
  code: string;
  group: string;
  label: string;
  nativeCode: string;
}

export interface FirmwareQuickPickGroup {
  codes: readonly string[];
  name: string;
}

const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => `KC_${letter}`);
const numbers = ["KC_1", "KC_2", "KC_3", "KC_4", "KC_5", "KC_6", "KC_7", "KC_8", "KC_9", "KC_0"];
const modifiers = [
  "KC_LCTL",
  "KC_LSFT",
  "KC_LALT",
  "KC_LGUI",
  "KC_RCTL",
  "KC_RSFT",
  "KC_RALT",
  "KC_RGUI",
];
const nav = ["KC_LEFT", "KC_DOWN", "KC_UP", "KC_RGHT", "KC_HOME", "KC_END", "KC_PGUP", "KC_PGDN"];
const media = [
  "KC_MUTE",
  "KC_VOLU",
  "KC_VOLD",
  "KC_MPLY",
  "KC_MPRV",
  "KC_MNXT",
  "KC_BRID",
  "KC_BRIU",
];
const punctuation = [
  "KC_MINS",
  "KC_EQL",
  "KC_LBRC",
  "KC_RBRC",
  "KC_BSLS",
  "KC_SCLN",
  "KC_QUOT",
  "KC_GRV",
  "KC_COMM",
  "KC_DOT",
  "KC_SLSH",
];

const qmkQuickPicks: FirmwareQuickPickGroup[] = [
  { name: "Letters", codes: letters },
  { name: "Numbers", codes: numbers },
  {
    name: "Modifiers",
    codes: [...modifiers, "OSM(MOD_LCTL)", "OSM(MOD_LSFT)", "OSM(MOD_LALT)", "OSM(MOD_LGUI)"],
  },
  {
    name: "Layers",
    codes: [
      "MO(1)",
      "MO(2)",
      "MO(3)",
      "MO(4)",
      "TG(1)",
      "TO(0)",
      "DF(0)",
      "OSL(1)",
      "LT(1,KC_SPC)",
      "LT(2,KC_ENT)",
      "KC_TRNS",
    ],
  },
  { name: "Nav", codes: nav },
  { name: "Media", codes: media },
  { name: "Punctuation", codes: punctuation },
  {
    name: "System",
    codes: ["QK_BOOT", "EE_CLR", "DB_TOGG", "NK_TOGG", "AG_NORM", "AG_SWAP", "RGB_TOG", "RGB_MOD"],
  },
];

const zmkBehaviorItems: FirmwareKeycodeCatalogItem[] = [
  zmkItem("ZMK_SK(KC_LSFT)", "Sticky left Shift", "sticky"),
  zmkItem("ZMK_SK(KC_LCTL)", "Sticky left Control", "sticky"),
  zmkItem("ZMK_SK(KC_LALT)", "Sticky left Alt", "sticky"),
  zmkItem("ZMK_SK(KC_LGUI)", "Sticky left GUI", "sticky"),
  zmkItem("LCTL_T(KC_A)", "Mod-tap: Control / A", "hold-tap"),
  zmkItem("LSFT_T(KC_A)", "Mod-tap: Shift / A", "hold-tap"),
  zmkItem("LALT_T(KC_A)", "Mod-tap: Alt / A", "hold-tap"),
  zmkItem("LGUI_T(KC_A)", "Mod-tap: GUI / A", "hold-tap"),
  zmkItem("ZMK_BT_CLR", "Clear selected Bluetooth profile", "bluetooth"),
  zmkItem("ZMK_BT_CLR_ALL", "Clear all Bluetooth profiles", "bluetooth"),
  zmkItem("ZMK_BT_NXT", "Next Bluetooth profile", "bluetooth"),
  zmkItem("ZMK_BT_PRV", "Previous Bluetooth profile", "bluetooth"),
  ...Array.from({ length: 5 }, (_, profile) =>
    zmkItem(`ZMK_BT_SEL(${profile})`, `Select Bluetooth profile ${profile + 1}`, "bluetooth"),
  ),
  ...Array.from({ length: 5 }, (_, profile) =>
    zmkItem(`ZMK_BT_DISC(${profile})`, `Disconnect Bluetooth profile ${profile + 1}`, "bluetooth"),
  ),
  zmkItem("ZMK_OUT_USB", "Send output over USB", "output"),
  zmkItem("ZMK_OUT_BLE", "Send output over Bluetooth", "output"),
  zmkItem("ZMK_OUT_TOG", "Toggle USB / Bluetooth output", "output"),
  zmkItem("ZMK_CAPS_WORD", "Caps Word", "system"),
  zmkItem("ZMK_KEY_REPEAT", "Repeat last key", "system"),
  zmkItem("ZMK_STUDIO_UNLOCK", "Unlock ZMK Studio", "system"),
  zmkItem("ZMK_SOFT_OFF", "Soft off", "system"),
  zmkItem("ZMK_RESET", "Reset keyboard", "system"),
  zmkItem("ZMK_BOOTLOADER", "Enter bootloader", "system"),
];

export function firmwareKeycodeCatalog(
  firmware: FirmwareFamily,
  layerCount = 1,
): FirmwareKeycodeCatalogItem[] {
  if (firmware === "qmk") {
    return Object.entries(qmkDirectKeycodes)
      .map(([, item]) => ({
        aliases: [...item.aliases],
        code: item.key,
        group: item.group ?? "other",
        label: item.label,
        nativeCode: item.key,
      }))
      .sort(sortCatalogItems);
  }

  const hidItems = Object.entries(qmkDirectKeycodes)
    .map(([, item]) => {
      const nativeCode = zmkBindingExpression(item.key);
      return nativeCode
        ? {
            aliases: [...item.aliases],
            code: item.key,
            group: zmkGroup(item.group),
            label: item.label,
            nativeCode,
          }
        : undefined;
    })
    .filter((item): item is FirmwareKeycodeCatalogItem => Boolean(item));
  const layerItems = zmkLayerItems(layerCount);

  return dedupeCatalog([...hidItems, ...layerItems, ...zmkBehaviorItems]).sort(sortCatalogItems);
}

export function firmwareQuickPickGroups(
  firmware: FirmwareFamily,
  layerCount = 1,
): FirmwareQuickPickGroup[] {
  if (firmware === "qmk") return qmkQuickPicks;

  const availableLayers = Array.from(
    { length: Math.max(0, layerCount - 1) },
    (_, offset) => offset + 1,
  );

  return [
    { name: "Letters", codes: letters },
    { name: "Numbers", codes: numbers },
    {
      name: "Modifiers",
      codes: [
        ...modifiers,
        "ZMK_SK(KC_LSFT)",
        "ZMK_SK(KC_LCTL)",
        "ZMK_SK(KC_LALT)",
        "ZMK_SK(KC_LGUI)",
      ],
    },
    {
      name: "Layers",
      codes: [
        ...availableLayers.map((layer) => `MO(${layer})`),
        ...availableLayers.map((layer) => `TG(${layer})`),
        ...availableLayers.map((layer) => `LT(${layer},KC_SPC)`),
        "TO(0)",
        "KC_TRNS",
      ],
    },
    { name: "Nav", codes: nav },
    { name: "Media", codes: media },
    { name: "Punctuation", codes: punctuation },
    {
      name: "Bluetooth",
      codes: [
        "ZMK_BT_NXT",
        "ZMK_BT_PRV",
        "ZMK_BT_SEL(0)",
        "ZMK_BT_SEL(1)",
        "ZMK_BT_SEL(2)",
        "ZMK_BT_CLR",
      ],
    },
    { name: "Output", codes: ["ZMK_OUT_TOG", "ZMK_OUT_USB", "ZMK_OUT_BLE"] },
    {
      name: "System",
      codes: [
        "ZMK_CAPS_WORD",
        "ZMK_KEY_REPEAT",
        "ZMK_STUDIO_UNLOCK",
        "ZMK_RESET",
        "ZMK_BOOTLOADER",
      ],
    },
  ];
}

export function firmwareBindingDisplay(code: string, firmware: FirmwareFamily) {
  return firmware === "zmk" ? (zmkBindingExpression(code) ?? code) : qmkKeycodeLabel(code);
}

export function canonicalCodeForFirmwareInput(value: string, firmware: FirmwareFamily) {
  return firmware === "zmk" ? canonicalCodeForZmkBinding(value) : normalizeQmkKeycode(value);
}

function zmkLayerItems(layerCount: number) {
  const items: FirmwareKeycodeCatalogItem[] = [];
  for (let layer = 0; layer < Math.max(1, layerCount); layer += 1) {
    items.push(zmkItem(`TO(${layer})`, `Move to layer ${layer}`, "layers"));
    if (layer === 0) continue;
    items.push(zmkItem(`MO(${layer})`, `Momentary layer ${layer}`, "layers"));
    items.push(zmkItem(`TG(${layer})`, `Toggle layer ${layer}`, "layers"));
    items.push(zmkItem(`LT(${layer},KC_SPC)`, `Layer ${layer} / Space`, "hold-tap"));
    items.push(zmkItem(`LT(${layer},KC_ENT)`, `Layer ${layer} / Enter`, "hold-tap"));
  }
  return items;
}

function zmkItem(code: string, label: string, group: string): FirmwareKeycodeCatalogItem {
  return { aliases: [], code, group, label, nativeCode: zmkBindingExpression(code) ?? code };
}

function zmkGroup(group: string | undefined) {
  if (group === "modifiers") return "modifiers";
  if (group === "media") return "media";
  if (group === "system") return "system";
  if (group === "internal") return "basic";
  return group ?? "basic";
}

function dedupeCatalog(items: FirmwareKeycodeCatalogItem[]) {
  return [...new Map(items.map((item) => [item.code, item])).values()];
}

function sortCatalogItems(left: FirmwareKeycodeCatalogItem, right: FirmwareKeycodeCatalogItem) {
  return left.group.localeCompare(right.group) || left.label.localeCompare(right.label);
}
