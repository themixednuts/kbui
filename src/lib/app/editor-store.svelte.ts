import { browser } from "$app/environment";
import { Effect } from "effect";

import * as TargetOS from "$lib/app/services/target-os";
import { diffProfiles, qmkSnippet, summarizeDiff } from "$lib/keyboard/changes";
import {
  defaultLightingSwatchId,
  keyLightingEquals,
  swatchIdForKeyLighting,
  swatchToKeyLighting,
  type LightingSwatchId,
} from "$lib/keyboard/lighting-swatches";
import { logicBindingOptions, type LogicBindingOption } from "$lib/keyboard/logic-bindings";
import { clearLocalDraft, loadLocalDraft, saveLocalDraft } from "$lib/keyboard/local-store";
import {
  bindingFor,
  cloneDevice,
  emptyBindingsForKeys,
  normalizeQmkKeycode,
  qmkKeycodeLabel,
  sampleKeyboard,
  type DeviceProfile,
  type KeyBinding,
  type KeyLighting,
  type Layer,
  type LightingProfile,
} from "$lib/keyboard/schema";

export type EditorLens = "keys" | "lighting";
export type EditorInspectorTab = "bind" | "hold" | "notes";
export type EditorTargetOs = TargetOS.TargetOS;
export type BoardTargetOs = "mac" | "windows" | "linux";
export type EditorLightingEffect = Extract<
  LightingProfile["mode"],
  "solid" | "reactive" | "rainbow"
>;
export type EditorLightingDragMode = "select" | "add" | "toggle" | "clear";

export interface EditorRenderedBinding extends KeyBinding {
  display: string;
  keycap: string;
  rawCode: string;
  sourceColor: string;
  sourceLayerId: string;
  sourceLayerName: string;
  transparent: boolean;
}

export interface EditorMutationResult {
  profile: DeviceProfile;
  changedKeyIds: string[];
}

export interface EditorLightingSelectionSummary {
  count: number;
  keyLighting: KeyLighting | null;
  mixed: boolean;
  swatchId: LightingSwatchId | null;
}

export interface EditorStoreOptions {
  baseProfile?: DeviceProfile;
  profile?: DeviceProfile;
  persist?: boolean;
}

export const EDITOR_QUICK_PICK_GROUPS = [
  {
    name: "Letters",
    codes: [
      "KC_A",
      "KC_B",
      "KC_C",
      "KC_D",
      "KC_E",
      "KC_F",
      "KC_G",
      "KC_H",
      "KC_I",
      "KC_J",
      "KC_K",
      "KC_L",
      "KC_M",
    ],
  },
  {
    name: "Mods",
    codes: ["KC_LCTL", "KC_LSFT", "KC_LALT", "KC_LGUI", "KC_RCTL", "KC_RSFT", "KC_RALT", "KC_MEH"],
  },
  {
    name: "Layers",
    codes: ["MO(1)", "MO(2)", "MO(3)", "MO(4)", "TG(1)", "LT(1,KC_SPC)", "KC_TRNS"],
  },
  {
    name: "Nav",
    codes: ["KC_LEFT", "KC_DOWN", "KC_UP", "KC_RGHT", "KC_HOME", "KC_END", "KC_PGUP", "KC_PGDN"],
  },
  {
    name: "Media",
    codes: ["KC_MUTE", "KC_VOLU", "KC_VOLD", "KC_MPLY", "KC_MPRV", "KC_MNXT", "KC_BRID", "KC_BRIU"],
  },
] as const;

const LAYER_COLORS = [
  "var(--teal)",
  "var(--coral)",
  "var(--mustard)",
  "var(--lilac)",
  "var(--mint)",
  "#5d6fb8",
];

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
  "RCTL(A)": "All",
  "RCTL(C)": "Copy",
  "RCTL(F)": "Find",
  "RCTL(S)": "Save",
  "RCTL(V)": "Paste",
  "RCTL(X)": "Cut",
  "RCTL(Y)": "Redo",
  "RCTL(Z)": "Undo",
  "LCS(Z)": "Redo",
  "LCS(T)": "Reopen",
  "LCS(V)": "PastePl",
  "LCS(I)": "DevTl",
  "LCS(P)": "CmdP",
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
  "RGUI(A)": "All",
  "RGUI(C)": "Copy",
  "RGUI(F)": "Find",
  "RGUI(S)": "Save",
  "RGUI(V)": "Paste",
  "RGUI(X)": "Cut",
  "RGUI(Z)": "Undo",
  "LSG(Z)": "Redo",
  "LSG(T)": "Reopen",
  "LSG(P)": "CmdP",
};

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

export class EditorStore {
  baseProfile = $state<DeviceProfile>(cloneDevice(sampleKeyboard));
  profile = $state<DeviceProfile>(cloneDevice(sampleKeyboard));
  activeLayer = $state(sampleKeyboard.layers[0]?.id ?? "base");
  lens = $state<EditorLens>("keys");
  selection = $state<Set<string>>(new Set([defaultSelectedKeyId(sampleKeyboard)]));
  currentSwatch = $state<LightingSwatchId>(defaultLightingSwatchId);
  tintByLayer = $state(false);
  targetOs = $state<EditorTargetOs>("win");
  showFallthrough = $state(true);
  inspectorTab = $state<EditorInspectorTab>("bind");
  hydrated = $state(false);
  persistenceError = $state<string | null>(null);

  readonly selectionIds = $derived.by(() => [...this.selection]);
  readonly primarySelectedKeyId = $derived.by(() => this.selectionIds[0] ?? null);
  readonly activeLayerRecord = $derived(
    this.profile.layers.find((layer) => layer.id === this.activeLayer) ?? this.profile.layers[0],
  );
  readonly activeStack = $derived(activeLayerStackFor(this.profile, this.activeLayer));
  readonly primarySelectedKey = $derived.by(() =>
    this.primarySelectedKeyId
      ? this.profile.keys.find((key) => key.id === this.primarySelectedKeyId)
      : undefined,
  );
  readonly selectedBinding = $derived.by(() =>
    this.primarySelectedKeyId
      ? bindingFor(this.profile, this.activeLayer, this.primarySelectedKeyId)
      : ({ code: "KC_NO" } satisfies KeyBinding),
  );
  readonly selectedRenderedBinding = $derived.by(() =>
    this.primarySelectedKeyId
      ? resolveRenderedBinding(
          this.profile,
          this.activeLayer,
          this.primarySelectedKeyId,
          this.showFallthrough,
          this.targetOs,
        )
      : undefined,
  );
  readonly selectedSnippet = $derived.by(() =>
    this.primarySelectedKeyId
      ? qmkSnippet(this.profile, this.activeLayer, this.primarySelectedKeyId)
      : "",
  );
  readonly selectedCodeSummary = $derived.by(() =>
    summarizeSelectedCodes(this.profile, this.activeLayer, this.selectionIds),
  );
  readonly logicBindings = $derived(logicBindingOptions(this.profile));
  readonly changes = $derived(diffProfiles(this.baseProfile, this.profile));
  readonly diffStats = $derived(summarizeDiff(this.changes));
  readonly dirty = $derived(this.changes.length);
  readonly boardTargetOs = $derived(targetOsForBoard(this.targetOs));
  readonly lightingSelection = $derived.by(() =>
    summarizeLightingSelection(this.profile, this.selectionIds),
  );
  readonly lightingEffect = $derived(toEditorLightingEffect(this.profile.lighting.mode));
  readonly lightingBrightness = $derived(this.profile.lighting.brightness);
  readonly lightingSpeed = $derived(this.profile.lighting.speed);

  private readonly persistEnabled: boolean;
  private persistTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(options: EditorStoreOptions = {}) {
    this.persistEnabled = options.persist ?? true;
    this.baseProfile = cloneDevice(options.baseProfile ?? sampleKeyboard);
    this.profile = cloneDevice(options.profile ?? this.baseProfile);
    this.activeLayer = this.profile.layers[0]?.id ?? "base";
    this.selection = new Set([defaultSelectedKeyId(this.profile)]);

    if (browser) {
      void this.hydrate();
      void this.loadTargetOs();
    } else {
      this.hydrated = true;
    }
  }

  selectKey(keyId: string) {
    if (!this.profile.keys.some((key) => key.id === keyId)) return;
    this.selection = selectOnly(keyId);
  }

  toggleKey(keyId: string) {
    if (!this.profile.keys.some((key) => key.id === keyId)) return;
    this.selection = toggleSelection(this.selection, keyId);
  }

  addKeyToSelection(keyId: string) {
    if (!this.profile.keys.some((key) => key.id === keyId)) return;
    this.selection = addToSelection(this.selection, keyId);
  }

  clearSelection() {
    this.selection = new Set();
  }

  selectAllKeys() {
    this.selection = new Set(this.profile.keys.map((key) => key.id));
  }

  setLayer(layerId: string) {
    if (!this.profile.layers.some((layer) => layer.id === layerId)) return;
    this.activeLayer = layerId;
  }

  addLayer(name?: string) {
    const result = addLayerToDevice(this.profile, name);
    this.profile = withUpdatedAt(result.profile);
    this.activeLayer = result.layer.id;
    this.queuePersistence();
  }

  setLens(lens: EditorLens) {
    this.lens = lens;
  }

  setTargetOs(targetOs: EditorTargetOs) {
    this.targetOs = targetOs;
    if (browser) void Effect.runPromise(TargetOS.save(targetOs));
  }

  cycleTargetOs() {
    this.setTargetOs(TargetOS.next(this.targetOs));
  }

  setInspectorTab(tab: EditorInspectorTab) {
    this.inspectorTab = tab;
  }

  setShowFallthrough(value: boolean) {
    this.showFallthrough = value;
  }

  toggleFallthrough() {
    this.showFallthrough = !this.showFallthrough;
  }

  applyBindingToSelection(code: string, macroId?: string) {
    const result = applyBindingToDevice(
      this.profile,
      this.activeLayer,
      this.selection,
      code,
      macroId,
    );
    this.applyMutation(result);
  }

  applyKeycode(code: string) {
    this.applyBindingToSelection(code);
  }

  clearBindingOnSelection() {
    const result = clearBindingOnDevice(this.profile, this.activeLayer, this.selection);
    this.applyMutation(result);
  }

  resetSelectionToBase() {
    const result = resetBindingToBase(this.profile, this.activeLayer, this.selection);
    this.applyMutation(result);
  }

  applyHoldTapToSelection(kind: "tap" | "hold", value: string) {
    const result = applyHoldTapToDevice(
      this.profile,
      this.activeLayer,
      this.selection,
      kind,
      value,
    );
    this.applyMutation(result);
  }

  setNotesForPrimaryKey(notes: string) {
    if (!this.primarySelectedKeyId) return;
    const result = applyNotesToDevice(
      this.profile,
      this.activeLayer,
      this.primarySelectedKeyId,
      notes,
    );
    this.applyMutation(result);
  }

  setTappingTerm(value: number) {
    const next = Math.round(value);
    if (this.profile.settings.tappingTerm === next) return;
    this.profile = withUpdatedAt({
      ...this.profile,
      settings: {
        ...this.profile.settings,
        tappingTerm: next,
      },
    });
    this.queuePersistence();
  }

  applySwatchToSelection(swatch: LightingSwatchId = this.currentSwatch) {
    this.currentSwatch = swatch;
    this.paintKeys(this.selection, swatch);
  }

  setKeyLighting(keyId: string, lighting: KeyLighting) {
    const result = setKeyLightingOnDevice(this.profile, keyId, lighting);
    this.applyMutation(result);
  }

  clearKeyLighting(keyId: string) {
    this.setKeyLighting(keyId, swatchToKeyLighting("off"));
  }

  paintKeys(keyIds: Iterable<string>, swatch: LightingSwatchId = this.currentSwatch) {
    this.currentSwatch = swatch;
    const result = applyLightingToDevice(this.profile, keyIds, swatchToKeyLighting(swatch));
    this.applyMutation(result);
  }

  applyLightingDrag(keyIds: readonly string[], mode: EditorLightingDragMode) {
    if (mode === "clear") {
      this.clearSelection();
      return;
    }

    for (const keyId of keyIds) {
      if (mode === "select") this.selectKey(keyId);
      else if (mode === "toggle") this.toggleKey(keyId);
      else this.addKeyToSelection(keyId);
    }
  }

  setBrightness(value: number) {
    const brightness = clampPercent(value);
    if (this.profile.lighting.brightness === brightness) return;
    this.profile = withUpdatedAt({
      ...this.profile,
      lighting: {
        ...this.profile.lighting,
        brightness,
      },
    });
    this.queuePersistence();
  }

  setSpeed(value: number) {
    const speed = clampPercent(value);
    if (this.profile.lighting.speed === speed) return;
    this.profile = withUpdatedAt({
      ...this.profile,
      lighting: {
        ...this.profile.lighting,
        speed,
      },
    });
    this.queuePersistence();
  }

  setEffect(effect: EditorLightingEffect) {
    if (this.profile.lighting.mode === effect) return;
    this.profile = withUpdatedAt({
      ...this.profile,
      lighting: {
        ...this.profile.lighting,
        mode: effect,
      },
    });
    this.queuePersistence();
  }

  toggleTintByLayer(value = !this.tintByLayer) {
    this.tintByLayer = value;
  }

  bindLogicOption(item: LogicBindingOption) {
    if (!item.code) return;
    this.applyBindingToSelection(item.code, item.kind === "macro" ? item.macroId : undefined);
  }

  async flushPersistence() {
    if (!this.persistEnabled || !browser) return;
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = undefined;
    }
    await this.persistDraft();
  }

  private applyMutation(result: EditorMutationResult) {
    if (result.changedKeyIds.length === 0) return;
    this.profile = withUpdatedAt(result.profile);
    this.queuePersistence();
  }

  private async hydrate() {
    if (!this.persistEnabled) {
      this.hydrated = true;
      return;
    }

    try {
      const draft = await loadLocalDraft();
      if (draft) {
        this.profile = cloneDevice(draft);
        this.activeLayer = this.profile.layers.some((layer) => layer.id === this.activeLayer)
          ? this.activeLayer
          : (this.profile.layers[0]?.id ?? "base");
        this.selection = sanitizeSelection(this.profile, this.selection);
      }
    } catch (error) {
      this.persistenceError = error instanceof Error ? error.message : "Could not load local draft";
    } finally {
      this.hydrated = true;
    }
  }

  private async loadTargetOs() {
    try {
      this.targetOs = await Effect.runPromise(TargetOS.load);
    } catch {
      this.targetOs = "win";
    }
  }

  private queuePersistence() {
    if (!this.persistEnabled || !browser) return;
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = undefined;
      void this.persistDraft();
    }, 350);
  }

  private async persistDraft() {
    try {
      if (this.dirty > 0) await saveLocalDraft(this.profile);
      else await clearLocalDraft(this.profile.id);
      this.persistenceError = null;
    } catch (error) {
      this.persistenceError = error instanceof Error ? error.message : "Could not save local draft";
    }
  }
}

export function normalizeEditorKeycode(value: string, fallback = "KC_NO"): string {
  const trimmed = value.trim();
  return trimmed ? normalizeQmkKeycode(trimmed.replace(/\s+/g, "").toUpperCase()) : fallback;
}

export function normalizeOptionalEditorKeycode(value: string): string | undefined {
  return normalizeEditorKeycode(value, "") || undefined;
}

export function selectOnly(keyId: string): Set<string> {
  return new Set([keyId]);
}

export function toggleSelection(selection: Iterable<string>, keyId: string): Set<string> {
  const next = new Set(selection);
  if (next.has(keyId)) next.delete(keyId);
  else next.add(keyId);
  return next;
}

export function addToSelection(selection: Iterable<string>, keyId: string): Set<string> {
  return new Set([...selection, keyId]);
}

export function activeLayerStackFor(profile: DeviceProfile, activeLayerId: string): Layer[] {
  const baseLayer = profile.layers[0];
  const activeLayer = profile.layers.find((layer) => layer.id === activeLayerId) ?? baseLayer;
  if (!baseLayer || !activeLayer) return [];
  return activeLayer.id === baseLayer.id ? [baseLayer] : [activeLayer, baseLayer];
}

export function applyBindingToDevice(
  profile: DeviceProfile,
  layerId: string,
  selection: Iterable<string>,
  code: string,
  macroId?: string,
): EditorMutationResult {
  const normalizedCode = normalizeEditorKeycode(code);
  return updateBindings(profile, layerId, selection, (previous) => {
    const next: KeyBinding = { ...previous, code: normalizedCode };
    if (macroId) next.macroId = macroId;
    else delete next.macroId;
    return next;
  });
}

export function clearBindingOnDevice(
  profile: DeviceProfile,
  layerId: string,
  selection: Iterable<string>,
): EditorMutationResult {
  const clearCode = layerId === profile.layers[0]?.id ? "KC_NO" : "KC_TRNS";
  return applyBindingToDevice(profile, layerId, selection, clearCode);
}

export function resetBindingToBase(
  profile: DeviceProfile,
  layerId: string,
  selection: Iterable<string>,
): EditorMutationResult {
  const baseLayer = profile.layers[0];
  if (!baseLayer || layerId === baseLayer.id) {
    return clearBindingOnDevice(profile, layerId, selection);
  }

  return updateBindings(profile, layerId, selection, (_previous, keyId) => {
    const baseBinding = baseLayer.bindings[keyId] ?? { code: "KC_NO" };
    return { ...baseBinding };
  });
}

export function applyHoldTapToDevice(
  profile: DeviceProfile,
  layerId: string,
  selection: Iterable<string>,
  kind: "tap" | "hold",
  value: string,
): EditorMutationResult {
  const normalizedValue = normalizeOptionalEditorKeycode(value);
  return updateBindings(profile, layerId, selection, (previous) => {
    const next: KeyBinding = { ...previous };
    if (normalizedValue) next[kind] = normalizedValue;
    else delete next[kind];
    return next;
  });
}

export function applyNotesToDevice(
  profile: DeviceProfile,
  layerId: string,
  keyId: string,
  notes: string,
): EditorMutationResult {
  const trimmed = notes.trim();
  return updateBindings(profile, layerId, [keyId], (previous) => {
    const next: KeyBinding = { ...previous };
    if (trimmed) next.notes = trimmed;
    else delete next.notes;
    return next;
  });
}

export function setKeyLightingOnDevice(
  profile: DeviceProfile,
  keyId: string,
  lighting: KeyLighting,
): EditorMutationResult {
  return applyLightingToDevice(profile, [keyId], lighting);
}

export function clearKeyLightingOnDevice(
  profile: DeviceProfile,
  selection: Iterable<string>,
): EditorMutationResult {
  return applyLightingToDevice(profile, selection, swatchToKeyLighting("off"));
}

export function applyLightingToDevice(
  profile: DeviceProfile,
  selection: Iterable<string>,
  lighting: KeyLighting,
): EditorMutationResult {
  const keyIds = validSelection(profile, selection);
  if (keyIds.length === 0) return { profile, changedKeyIds: [] };

  const next = cloneDevice(profile);
  const changedKeyIds: string[] = [];

  for (const keyId of keyIds) {
    const previous = next.lighting.keys[keyId];
    if (keyLightingEquals(previous, lighting)) continue;
    next.lighting.keys[keyId] = { ...lighting };
    changedKeyIds.push(keyId);
  }

  return changedKeyIds.length > 0 ? { profile: next, changedKeyIds } : { profile, changedKeyIds };
}

export function lightingForKey(profile: DeviceProfile, keyId: string): KeyLighting {
  return (
    profile.lighting.keys[keyId] ?? {
      hue: profile.lighting.hue,
      saturation: profile.lighting.saturation,
      brightness: profile.lighting.brightness,
    }
  );
}

export function summarizeLightingSelection(
  profile: DeviceProfile,
  selection: readonly string[],
): EditorLightingSelectionSummary {
  const keyIds = validSelection(profile, selection);
  if (keyIds.length === 0) {
    return {
      count: 0,
      keyLighting: null,
      mixed: false,
      swatchId: null,
    };
  }

  const first = lightingForKey(profile, keyIds[0]);
  const mixed = keyIds.some((keyId) => !keyLightingEquals(first, lightingForKey(profile, keyId)));

  return {
    count: keyIds.length,
    keyLighting: mixed ? null : first,
    mixed,
    swatchId: mixed ? null : swatchIdForKeyLighting(first),
  };
}

export function addLayerToDevice(
  profile: DeviceProfile,
  name = `Layer ${profile.layers.length}`,
): { profile: DeviceProfile; layer: Layer } {
  const next = cloneDevice(profile);
  const id = uniqueLayerId(next, name);
  const layer: Layer = {
    id,
    name,
    color: LAYER_COLORS[next.layers.length % LAYER_COLORS.length],
    bindings: emptyBindingsForKeys(next.keys, "KC_TRNS"),
  };
  next.layers = [...next.layers, layer];
  return { profile: next, layer };
}

export function resolveRenderedBinding(
  profile: DeviceProfile,
  layerId: string,
  keyId: string,
  showFallthrough: boolean,
  targetOs: EditorTargetOs = "win",
): EditorRenderedBinding {
  const fallbackLayer = profile.layers[0];
  const layer = profile.layers.find((candidate) => candidate.id === layerId) ?? fallbackLayer;
  const rawBinding = bindingForLayer(layer, keyId, layer === fallbackLayer);
  const transparent =
    Boolean(layer && fallbackLayer && layer.id !== fallbackLayer.id) &&
    normalizeEditorKeycode(rawBinding.code) === "KC_TRNS";
  const visibleBinding =
    transparent && showFallthrough ? bindingForLayer(fallbackLayer, keyId, true) : rawBinding;
  const sourceLayer = transparent && showFallthrough ? fallbackLayer : layer;

  return {
    ...visibleBinding,
    display: displayCode(visibleBinding.code),
    keycap: compactKeycapCode(visibleBinding.code, targetOs),
    rawCode: rawBinding.code,
    sourceColor: sourceLayer?.color ?? "var(--ink)",
    sourceLayerId: sourceLayer?.id ?? "",
    sourceLayerName: sourceLayer?.name ?? "",
    transparent,
  };
}

export function displayCode(code: string): string {
  const normalized = normalizeQmkKeycode(code);
  return qmkKeycodeLabel(normalized);
}

export function compactKeycapCode(code: string, targetOs: EditorTargetOs = "win"): string {
  const display = displayCode(code);
  if (display === "TRNS") return "TRNS";

  const named = (targetOs === "mac" ? CMD_SHORTCUTS : CTRL_SHORTCUTS)[display];
  if (named) return named;

  const mod = MOD_PATTERN.exec(display);
  if (mod) return `${MOD_WORDS[mod[1]]}+${innerLabel(mod[2])}`;

  const modTap = MOD_TAP_PATTERN.exec(display);
  if (modTap) return `${innerLabel(modTap[2])}/${MOD_WORDS[modTap[1]] ?? modTap[1]}`;

  const layerTap = LAYER_TAP_PATTERN.exec(display);
  if (layerTap) return `${innerLabel(layerTap[2])}/L${layerTap[1]}`;

  return display;
}

export function capLegend(binding: EditorRenderedBinding | undefined): string {
  return (binding?.keycap ?? "").slice(0, 5);
}

export function targetOsForBoard(targetOs: EditorTargetOs): BoardTargetOs {
  return targetOs === "win" ? "windows" : targetOs;
}

export function defaultSelectedKeyId(profile: Pick<DeviceProfile, "keys">): string {
  return profile.keys.find((key) => key.id === "k2-4")?.id ?? profile.keys[0]?.id ?? "";
}

export function summarizeSelectedCodes(
  profile: DeviceProfile,
  layerId: string,
  selection: readonly string[],
): { code: string; mixed: boolean; count: number } {
  const codes = selection
    .filter((keyId) => profile.keys.some((key) => key.id === keyId))
    .map((keyId) => bindingFor(profile, layerId, keyId).code);
  const unique = new Set(codes);
  return {
    code: unique.size === 1 ? (codes[0] ?? "") : "Mixed",
    mixed: unique.size > 1,
    count: codes.length,
  };
}

function updateBindings(
  profile: DeviceProfile,
  layerId: string,
  selection: Iterable<string>,
  nextBindingFor: (previous: KeyBinding, keyId: string) => KeyBinding,
): EditorMutationResult {
  const layerIndex = profile.layers.findIndex((layer) => layer.id === layerId);
  if (layerIndex < 0) return { profile, changedKeyIds: [] };

  const keyIds = validSelection(profile, selection);
  if (keyIds.length === 0) return { profile, changedKeyIds: [] };

  const next = cloneDevice(profile);
  const layer = next.layers[layerIndex];
  const changedKeyIds: string[] = [];

  for (const keyId of keyIds) {
    const previous = layer.bindings[keyId] ?? { code: layerIndex === 0 ? "KC_NO" : "KC_TRNS" };
    const binding = nextBindingFor(previous, keyId);
    if (bindingEquals(previous, binding)) continue;
    layer.bindings[keyId] = binding;
    changedKeyIds.push(keyId);
  }

  return changedKeyIds.length > 0 ? { profile: next, changedKeyIds } : { profile, changedKeyIds };
}

function bindingEquals(left: KeyBinding, right: KeyBinding): boolean {
  return (
    left.code === right.code &&
    left.tap === right.tap &&
    left.hold === right.hold &&
    left.macroId === right.macroId &&
    left.notes === right.notes
  );
}

function validSelection(profile: DeviceProfile, selection: Iterable<string>): string[] {
  const validKeys = new Set(profile.keys.map((key) => key.id));
  return [...new Set(selection)].filter((keyId) => validKeys.has(keyId));
}

function sanitizeSelection(profile: DeviceProfile, selection: Iterable<string>): Set<string> {
  const valid = validSelection(profile, selection);
  return new Set(valid.length > 0 ? valid : [defaultSelectedKeyId(profile)]);
}

function toEditorLightingEffect(mode: LightingProfile["mode"]): EditorLightingEffect {
  return mode === "solid" || mode === "rainbow" ? mode : "reactive";
}

function bindingForLayer(layer: Layer | undefined, keyId: string, base: boolean): KeyBinding {
  return layer?.bindings[keyId] ?? { code: base ? "KC_NO" : "KC_TRNS" };
}

function innerLabel(inner: string): string {
  const direct = displayCode(inner);
  if (direct !== inner) return direct;
  const prefixed = displayCode(`KC_${inner}`);
  return prefixed !== `KC_${inner}` ? prefixed : inner;
}

function uniqueLayerId(profile: DeviceProfile, name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  const base = slug || `layer-${profile.layers.length}`;
  const existing = new Set(profile.layers.map((layer) => layer.id));
  let id = base;
  let suffix = 1;

  while (existing.has(id)) {
    suffix += 1;
    id = `${base}-${suffix}`;
  }

  return id;
}

function withUpdatedAt(profile: DeviceProfile): DeviceProfile {
  return {
    ...profile,
    updatedAt: new Date().toISOString(),
  };
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}
