import {
  comboAppliesToLayer,
  comboChordLabels,
  comboMarkerText,
} from "$lib/keyboard/combo-visibility";
import { routeComboConnectors, type ComboConnectorRoute } from "$lib/keyboard/combo-routing";
import {
  layerActivationMarkerText,
  layerActivationSummary,
  layerActivationsByKey,
  layerActivationsForLayer,
} from "$lib/keyboard/layer-activations";
import {
  normalizeQmkKeycode,
  qmkKeycodeLabel,
  type Combo,
  type DeviceProfile,
  type KeyBinding,
  type KeyLighting,
  type KeyboardKey,
  type Layer,
} from "$lib/keyboard/schema";
import { isSplitKeyboard } from "$lib/keyboard/split-transport";

import { coordForKey, type DesignCoord } from "./coords";

export type BoardLens = "keys" | "lighting";
export type BoardLabelSize = "md" | "sm" | "xs";
export type BoardSelection = Iterable<string> | null | undefined;
export type BoardSplitPreference = boolean | "auto";

export interface BoardBounds {
  width: number;
  height: number;
}

export interface BoardMarker {
  text: string;
  title: string;
  chain?: boolean;
}

export interface BoardComboConnector extends ComboConnectorRoute {
  title: string;
}

export interface BoardKeyViewModel {
  id: string;
  coord: DesignCoord;
  legend: string;
  row: number;
  col: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  label: string;
  sublabel: string | null;
  display: string;
  rawCode: string;
  sourceLayerId: string;
  sourceLayerName: string;
  sourceColor: string;
  sourceLabel: string;
  labelSize: BoardLabelSize;
  selected: boolean;
  marked: boolean;
  fallThrough: boolean;
  empty: boolean;
  modifier: boolean;
  accent: boolean;
  homing: boolean;
  encoder: boolean;
  lightingColor: string | null;
  hasLightingOverride: boolean;
  comboMarker: BoardMarker | null;
  layerMarker: BoardMarker | null;
}

export interface BoardRowViewModel {
  row: number;
  y: number;
  keys: BoardKeyViewModel[];
}

export interface BoardSplitViewModel {
  enabled: boolean;
  seamX: number | null;
  label: string;
  leftKeyIds: string[];
  rightKeyIds: string[];
}

export interface BoardViewModel {
  profileId: string;
  activeLayerId: string;
  lens: BoardLens;
  bounds: BoardBounds;
  positioned: boolean;
  rows: BoardRowViewModel[];
  keys: BoardKeyViewModel[];
  comboConnectors: BoardComboConnector[];
  split: BoardSplitViewModel;
}

export interface CreateBoardViewModelInput {
  profile: DeviceProfile;
  activeLayer?: string;
  lens?: BoardLens;
  selection?: BoardSelection;
  marked?: BoardSelection;
  showFallthrough?: boolean;
  split?: BoardSplitPreference;
  includeComboConnectors?: boolean;
  targetOs?: "mac" | "windows" | "linux";
}

interface PlacedKey {
  key: KeyboardKey;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

interface BindingLabel {
  label: string;
  sublabel: string | null;
  display: string;
  empty: boolean;
}

const MOD_LABELS = new Set(["Alt", "Caps", "Ctrl", "Fn", "Gui", "Menu", "Shift", "Win"]);
const MOD_WORDS: Record<string, string> = {
  LCTL: "Ctrl",
  RCTL: "Ctrl",
  LSFT: "Shift",
  RSFT: "Shift",
  LALT: "Alt",
  RALT: "Alt",
  LGUI: "Gui",
  RGUI: "Gui",
  LCS: "Ctrl+Shift",
  LCA: "Ctrl+Alt",
  LSA: "Shift+Alt",
  MEH: "Meh",
  LCG: "Ctrl+Gui",
  LSG: "Shift+Gui",
  LCSG: "Ctrl+Shift+Gui",
  LAG: "Alt+Gui",
  LCAG: "Ctrl+Alt+Gui",
  LSAG: "Shift+Alt+Gui",
  HYPR: "Hyper",
};

const MOD_PATTERN = new RegExp(`^(${Object.keys(MOD_WORDS).join("|")})\\((.+)\\)$`);
const MOD_TAP_PATTERN = /^(LCTL|RCTL|LSFT|RSFT|LALT|RALT|LGUI|RGUI)_T\((.+)\)$/;
const LAYER_TAP_PATTERN = /^LT\((\d+),\s*(.+)\)$/;
const LAYER_PATTERN = /^(MO|TG|TO|DF|OSL|TT)\((\d+)\)$/;
const MACRO_PATTERN = /^QK_MACRO_(\d+)$/;
const TAP_DANCE_PATTERN = /^TD\((\d+)\)$/;

const CTRL_SHORTCUTS: Record<string, string> = {
  "LCTL(A)": "All",
  "LCTL(B)": "Bold",
  "LCTL(C)": "Copy",
  "LCTL(F)": "Find",
  "LCTL(I)": "Ital",
  "LCTL(N)": "New",
  "LCTL(O)": "Open",
  "LCTL(P)": "Print",
  "LCTL(S)": "Save",
  "LCTL(U)": "Undln",
  "LCTL(V)": "Paste",
  "LCTL(W)": "Close",
  "LCTL(X)": "Cut",
  "LCTL(Y)": "Redo",
  "LCTL(Z)": "Undo",
};

const CMD_SHORTCUTS: Record<string, string> = {
  "LGUI(A)": "All",
  "LGUI(B)": "Bold",
  "LGUI(C)": "Copy",
  "LGUI(F)": "Find",
  "LGUI(I)": "Ital",
  "LGUI(N)": "New",
  "LGUI(O)": "Open",
  "LGUI(P)": "Print",
  "LGUI(S)": "Save",
  "LGUI(V)": "Paste",
  "LGUI(W)": "Close",
  "LGUI(X)": "Cut",
  "LGUI(Z)": "Undo",
};

export function createBoardViewModel(input: CreateBoardViewModelInput): BoardViewModel {
  const lens = input.lens ?? "keys";
  const baseLayer = input.profile.layers[0];
  const activeLayer =
    input.profile.layers.find((layer) => layer.id === input.activeLayer) ?? baseLayer;
  const showFallthrough = input.showFallthrough ?? true;
  const selection = setFrom(input.selection);
  const marked = setFrom(input.marked);
  const placed = placeKeys(input.profile.keys);
  const activeLayerId = activeLayer?.id ?? "";
  const visibleCombos = input.profile.combos.filter((combo) =>
    comboAppliesToLayer(combo, activeLayerId),
  );
  const combosByKey = combosByKeyId(visibleCombos);
  const comboSummaries = comboSummariesByKeyId(input.profile, visibleCombos, activeLayerId);
  const activations = activeLayerId ? layerActivationsForLayer(input.profile, activeLayerId) : [];
  const activationsByKey = layerActivationsByKey(activations);
  const keys = placed.keys.map((placedKey) => {
    const rawBinding = bindingForLayer(activeLayer, placedKey.key.id, activeLayer === baseLayer);
    const transparent = Boolean(
      activeLayer && baseLayer && activeLayer.id !== baseLayer.id && rawBinding.code === "KC_TRNS",
    );
    const visibleBinding =
      transparent && showFallthrough
        ? bindingForLayer(baseLayer, placedKey.key.id, true)
        : rawBinding;
    const sourceLayer = transparent && showFallthrough ? baseLayer : activeLayer;
    const label = formatBindingLabel(visibleBinding.code, input.profile, input.targetOs);
    const keyCombos = combosByKey.get(placedKey.key.id) ?? [];
    const keyActivations = activationsByKey.get(placedKey.key.id) ?? [];
    const lighting = lightingForKey(input.profile, placedKey.key.id);

    return {
      id: placedKey.key.id,
      coord: coordForKey(placedKey.key),
      legend: placedKey.key.label,
      row: placedKey.key.row,
      col: placedKey.key.col,
      x: placedKey.x,
      y: placedKey.y,
      width: placedKey.width,
      height: placedKey.height,
      rotation: placedKey.rotation,
      label: label.label,
      sublabel: label.sublabel,
      display: label.display,
      rawCode: rawBinding.code,
      sourceLayerId: sourceLayer?.id ?? "",
      sourceLayerName: sourceLayer?.name ?? "",
      sourceColor: sourceLayer?.color ?? "var(--ink)",
      sourceLabel: sourceLayer && sourceLayer.id !== activeLayer?.id ? sourceLayer.name : "",
      labelSize: labelSize(label.label),
      selected: selection.has(placedKey.key.id),
      marked: marked.has(placedKey.key.id),
      fallThrough: transparent,
      empty: label.empty,
      modifier: isModifierKey(placedKey.key),
      accent: isAccentKey(placedKey.key),
      homing: Boolean(placedKey.key.homing),
      encoder: Boolean(placedKey.key.encoder),
      lightingColor: keyLightingToCss(lighting),
      hasLightingOverride: hasLightingOverride(input.profile, placedKey.key.id),
      comboMarker:
        keyCombos.length > 0
          ? {
              text: comboMarkerText(keyCombos.length),
              title: comboSummaries.get(placedKey.key.id) ?? "",
            }
          : null,
      layerMarker:
        keyActivations.length > 0
          ? {
              text: layerActivationMarkerText(keyActivations),
              title: keyActivations.map(layerActivationSummary).join("\n"),
              chain: keyActivations.some((activation) => activation.chain),
            }
          : null,
    } satisfies BoardKeyViewModel;
  });
  const rows = rowsFromKeys(keys);
  const connectorKeys = keys.map((key) => renderKeyToKeyboardKey(key));
  const shouldRouteConnectors = input.includeComboConnectors ?? lens === "keys";
  const comboConnectors = shouldRouteConnectors
    ? connectorRoutes(input.profile, visibleCombos, connectorKeys, activeLayerId)
    : [];
  const split = detectBoardSplit(input.profile, keys, placed.bounds, input.split ?? "auto");

  return {
    profileId: input.profile.id,
    activeLayerId,
    lens,
    bounds: placed.bounds,
    positioned: placed.positioned,
    rows,
    keys,
    comboConnectors,
    split,
  };
}

export function keyLightingToCss(lighting: KeyLighting): string | null {
  if (lighting.brightness <= 0) return null;

  const lightness = 0.52 + (clamp(lighting.brightness, 0, 100) / 100) * 0.28;
  const chroma = (clamp(lighting.saturation, 0, 100) / 100) * 0.2;
  const hue = normalizeHue(lighting.hue);
  return `oklch(${lightness.toFixed(3)} ${chroma.toFixed(3)} ${hue})`;
}

export function computeBoardUnit(
  model: Pick<BoardViewModel, "bounds" | "split">,
  containerWidth: number,
): number {
  const available = Math.max(0, containerWidth - 24);
  const min = model.split.enabled ? 30 : 28;
  const max = model.split.enabled ? 60 : 58;
  const units = Math.max(1, model.bounds.width);
  return clamp(available / units, min, max);
}

function setFrom(values: BoardSelection): Set<string> {
  return new Set(values ?? []);
}

function bindingForLayer(layer: Layer | undefined, keyId: string, base: boolean): KeyBinding {
  return layer?.bindings[keyId] ?? { code: base ? "KC_NO" : "KC_TRNS" };
}

function displayCode(code: string) {
  const normalized = normalizeQmkKeycode(code);
  if (normalized === "KC_TRNS") return "TRNS";
  if (normalized === "KC_NO") return "NO";
  return qmkKeycodeLabel(normalized);
}

function formatBindingLabel(
  code: string,
  profile: Pick<DeviceProfile, "macros" | "tapDances">,
  targetOs: CreateBoardViewModelInput["targetOs"] = "windows",
): BindingLabel {
  const normalized = normalizeQmkKeycode(code);
  const display = displayCode(normalized);
  if (!normalized || normalized === "KC_NO") {
    return { label: "", sublabel: null, display, empty: true };
  }
  if (normalized === "KC_TRNS") {
    return { label: "\u25bd", sublabel: null, display, empty: true };
  }

  const macro = MACRO_PATTERN.exec(normalized);
  if (macro) {
    const index = Number(macro[1]);
    return {
      label: profile.macros[index]?.name ?? `Macro ${index + 1}`,
      sublabel: "macro",
      display,
      empty: false,
    };
  }

  const tapDance = TAP_DANCE_PATTERN.exec(normalized);
  if (tapDance) {
    const index = Number(tapDance[1]);
    return {
      label: profile.tapDances[index]?.doubleTap ?? `TD ${index}`,
      sublabel: "dance",
      display,
      empty: false,
    };
  }

  const shortcuts = targetOs === "mac" ? CMD_SHORTCUTS : CTRL_SHORTCUTS;
  if (shortcuts[display]) {
    return { label: shortcuts[display], sublabel: null, display, empty: false };
  }

  const layerTap = LAYER_TAP_PATTERN.exec(display);
  if (layerTap) {
    return {
      label: innerLabel(layerTap[2]),
      sublabel: `L${layerTap[1]}`,
      display,
      empty: false,
    };
  }

  const layer = LAYER_PATTERN.exec(display);
  if (layer) {
    return {
      label: `L${layer[2]}`,
      sublabel: layer[1].toLowerCase(),
      display,
      empty: false,
    };
  }

  const modTap = MOD_TAP_PATTERN.exec(display);
  if (modTap) {
    return {
      label: innerLabel(modTap[2]),
      sublabel: MOD_WORDS[modTap[1]] ?? modTap[1],
      display,
      empty: false,
    };
  }

  const mod = MOD_PATTERN.exec(display);
  if (mod) {
    return {
      label: `${MOD_WORDS[mod[1]] ?? mod[1]}+${innerLabel(mod[2])}`,
      sublabel: null,
      display,
      empty: false,
    };
  }

  return { label: display, sublabel: null, display, empty: false };
}

function innerLabel(inner: string): string {
  const direct = displayCode(inner);
  if (direct !== inner) return direct;
  const prefixed = displayCode(`KC_${inner}`);
  return prefixed !== `KC_${inner}` ? prefixed : inner;
}

function labelSize(label: string): BoardLabelSize {
  if (label.length > 12) return "xs";
  if (label.length > 7 || (label.length > 5 && /[()/+]/.test(label))) return "sm";
  return "md";
}

function isModifierKey(key: KeyboardKey) {
  return MOD_LABELS.has(key.label) || /^(Left |Right )?(Ctrl|Shift|Alt|Gui|Win)$/i.test(key.label);
}

function isAccentKey(key: KeyboardKey) {
  return key.label === "Space" || key.label === "Enter";
}

function lightingForKey(profile: DeviceProfile, keyId: string): KeyLighting {
  return (
    profile.lighting.keys?.[keyId] ?? {
      hue: profile.lighting.hue,
      saturation: profile.lighting.saturation,
      brightness: profile.lighting.brightness,
    }
  );
}

function hasLightingOverride(profile: DeviceProfile, keyId: string): boolean {
  return Object.prototype.hasOwnProperty.call(profile.lighting.keys ?? {}, keyId);
}

function placeKeys(keys: readonly KeyboardKey[]): {
  bounds: BoardBounds;
  keys: PlacedKey[];
  positioned: boolean;
} {
  const positioned = keys.some((key) => typeof key.x === "number" || typeof key.y === "number");
  const placed = positioned ? placePositionedKeys(keys) : placeRowFlowKeys(keys);
  const minX = Math.min(0, ...placed.map((key) => key.x));
  const minY = Math.min(0, ...placed.map((key) => key.y));
  const normalized = placed.map((placedKey) => ({
    ...placedKey,
    x: roundUnit(placedKey.x - minX),
    y: roundUnit(placedKey.y - minY),
  }));
  const width = Math.max(1, ...normalized.map((key) => key.x + key.width));
  const height = Math.max(1, ...normalized.map((key) => key.y + key.height));

  return {
    positioned,
    keys: normalized,
    bounds: {
      width: roundUnit(width),
      height: roundUnit(height),
    },
  };
}

function placePositionedKeys(keys: readonly KeyboardKey[]): PlacedKey[] {
  return keys.map((key) => ({
    key,
    x: key.x ?? key.col,
    y: key.y ?? key.row,
    width: key.width ?? 1,
    height: key.height ?? 1,
    rotation: key.rotation ?? 0,
  }));
}

function placeRowFlowKeys(keys: readonly KeyboardKey[]): PlacedKey[] {
  const byRow = new Map<number, KeyboardKey[]>();
  for (const key of keys) byRow.set(key.row, [...(byRow.get(key.row) ?? []), key]);

  return Array.from(byRow.entries())
    .sort(([left], [right]) => left - right)
    .flatMap(([row, rowKeys]) => {
      let cursor = 0;
      return rowKeys
        .sort((left, right) => left.col - right.col)
        .map((key) => {
          const width = key.width ?? 1;
          const placed = {
            key,
            x: cursor,
            y: row,
            width,
            height: key.height ?? 1,
            rotation: key.rotation ?? 0,
          };
          cursor += width;
          return placed;
        });
    });
}

function rowsFromKeys(keys: readonly BoardKeyViewModel[]): BoardRowViewModel[] {
  const byRow = new Map<number, BoardKeyViewModel[]>();
  for (const key of keys) byRow.set(key.row, [...(byRow.get(key.row) ?? []), key]);

  return Array.from(byRow.entries())
    .sort(([left], [right]) => left - right)
    .map(([row, rowKeys]) => ({
      row,
      y: Math.min(...rowKeys.map((key) => key.y)),
      keys: rowKeys.sort((left, right) => left.x - right.x || left.col - right.col),
    }));
}

function combosByKeyId(combos: readonly Combo[]) {
  const byKey = new Map<string, Combo[]>();
  for (const combo of combos) {
    for (const keyId of combo.keys) byKey.set(keyId, [...(byKey.get(keyId) ?? []), combo]);
  }
  return byKey;
}

function comboSummariesByKeyId(
  profile: DeviceProfile,
  combos: readonly Combo[],
  activeLayerId: string,
) {
  const summaries = new Map<string, string>();
  for (const combo of combos) {
    const summary = `${combo.name}: ${comboChordLabels(profile, combo, displayCode, activeLayerId).join(" + ")} -> ${displayCode(combo.binding)}`;
    for (const keyId of combo.keys) {
      const current = summaries.get(keyId);
      summaries.set(keyId, current ? `${current}\n${summary}` : summary);
    }
  }
  return summaries;
}

function connectorRoutes(
  profile: DeviceProfile,
  combos: readonly Combo[],
  keys: KeyboardKey[],
  activeLayerId: string,
): BoardComboConnector[] {
  const comboById = new Map(combos.map((combo) => [combo.id, combo]));

  return routeComboConnectors({ combos: [...combos], keys }).map((route) => {
    const combo = comboById.get(route.id);
    return {
      ...route,
      title: combo
        ? `${combo.name}: ${comboChordLabels(profile, combo, displayCode, activeLayerId).join(" + ")} -> ${displayCode(combo.binding)}`
        : route.id,
    };
  });
}

function renderKeyToKeyboardKey(key: BoardKeyViewModel): KeyboardKey {
  return {
    id: key.id,
    label: key.legend,
    row: key.row,
    col: key.col,
    x: key.x,
    y: key.y,
    width: key.width,
    height: key.height,
    rotation: key.rotation || undefined,
    homing: key.homing || undefined,
    encoder: key.encoder || undefined,
  };
}

function detectBoardSplit(
  profile: DeviceProfile,
  keys: readonly BoardKeyViewModel[],
  bounds: BoardBounds,
  preference: BoardSplitPreference,
): BoardSplitViewModel {
  if (preference === false) return disabledSplit();

  const gap = largestRowGap(keys);
  const hint =
    preference === true ||
    profile.settings.splitTransport !== "none" ||
    isSplitKeyboard(profile) ||
    Boolean(gap && gap.size >= 1.8);

  if (!hint) return disabledSplit();

  const seamX = gap ? roundUnit(gap.center) : roundUnit(bounds.width / 2);
  const leftKeyIds: string[] = [];
  const rightKeyIds: string[] = [];
  for (const key of keys) {
    const center = key.x + key.width / 2;
    if (center < seamX) leftKeyIds.push(key.id);
    else rightKeyIds.push(key.id);
  }

  if (leftKeyIds.length === 0 || rightKeyIds.length === 0) return disabledSplit();

  const transport = profile.settings.splitTransport;
  const link = transport === "ble" ? "BLE" : transport === "none" ? "split" : "TRRS";
  return {
    enabled: true,
    seamX,
    label: `${link} - left/right`,
    leftKeyIds,
    rightKeyIds,
  };
}

function largestRowGap(keys: readonly BoardKeyViewModel[]) {
  let largest: { center: number; size: number } | undefined;
  for (const row of rowsFromKeys(keys)) {
    for (let index = 1; index < row.keys.length; index += 1) {
      const previous = row.keys[index - 1];
      const next = row.keys[index];
      const gap = next.x - (previous.x + previous.width);
      if (gap <= 0) continue;
      if (!largest || gap > largest.size) {
        largest = {
          center: previous.x + previous.width + gap / 2,
          size: gap,
        };
      }
    }
  }
  return largest;
}

function disabledSplit(): BoardSplitViewModel {
  return {
    enabled: false,
    seamX: null,
    label: "",
    leftKeyIds: [],
    rightKeyIds: [],
  };
}

function normalizeHue(value: number) {
  const hue = value % 360;
  return Number((hue < 0 ? hue + 360 : hue).toFixed(3));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundUnit(value: number) {
  return Math.round(value * 1000) / 1000;
}
