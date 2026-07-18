import { browser } from "$app/environment";
import { Effect, Fiber } from "effect";

import { forkApp, runApp } from "$lib/app/runtime";
import * as EditorLayout from "$lib/app/services/editor-layout";
import * as TargetOS from "$lib/app/services/target-os";
import { diffProfiles, firmwareSnippet, summarizeDiff } from "$lib/keyboard/changes";
import {
  defaultLightingSwatchId,
  keyLightingEquals,
  swatchIdForKeyLighting,
  swatchToKeyLighting,
  type LightingSwatchId,
} from "$lib/keyboard/lighting-swatches";
import {
  isCompleteMacro,
  isCompleteTapDance,
  logicBindingOptions,
  macroBindingCode,
  tapDanceBindingCode,
  type LogicBindingOption,
} from "$lib/keyboard/logic-bindings";
import {
  clearLocalDraftEffect,
  loadLocalDraftEffect,
  saveLocalDeviceEffect,
  saveLocalDraftEffect,
} from "$lib/keyboard/local-store";
import { starterBoardProfile } from "$lib/keyboard/sample-boards";
import {
  bindingFor,
  cloneDevice,
  emptyBindingsForKeys,
  normalizeQmkKeycode,
  withDeviceProfileOrigin,
  qmkKeycodeLabel,
  type Combo,
  type DeviceProfileOrigin,
  type DeviceProfile,
  type FirmwareEditIntent,
  type FirmwareMetadata,
  type KeyBinding,
  type KeyLighting,
  type KeyboardSettings,
  type Layer,
  type LightingProfile,
  type Macro,
  type TapDance,
} from "$lib/keyboard/schema";
import { newId } from "$lib/util/id";

export type EditorLens = "keys" | "lighting";
export type EditorInspectorTab = "bind" | "hold" | "notes";
export type EditorTargetOs = TargetOS.TargetOS;
export type EditorLayoutId = EditorLayout.EditorLayoutId;
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

export type EditorLogicPlacementIntent =
  | {
      kind: "macro";
      id: string;
    }
  | {
      kind: "tapDance";
      id: string;
    };

export interface EditorLightingSelectionSummary {
  count: number;
  keyLighting: KeyLighting | null;
  mixed: boolean;
  swatchId: LightingSwatchId | null;
}

export interface EditorStoreOptions {
  autoHydrate?: boolean;
  baseProfile?: DeviceProfile;
  profile?: DeviceProfile;
  persist?: boolean;
}

export interface ReplaceProfileOptions {
  flushPersistence?: boolean;
  hydrateDraft?: boolean;
  origin?: DeviceProfileOrigin;
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
      "KC_N",
      "KC_O",
      "KC_P",
      "KC_Q",
      "KC_R",
      "KC_S",
      "KC_T",
      "KC_U",
      "KC_V",
      "KC_W",
      "KC_X",
      "KC_Y",
      "KC_Z",
    ],
  },
  {
    name: "Numbers",
    codes: ["KC_1", "KC_2", "KC_3", "KC_4", "KC_5", "KC_6", "KC_7", "KC_8", "KC_9", "KC_0"],
  },
  {
    name: "Modifiers",
    codes: [
      "KC_LCTL",
      "KC_LSFT",
      "KC_LALT",
      "KC_LGUI",
      "KC_RCTL",
      "KC_RSFT",
      "KC_RALT",
      "KC_RGUI",
      "OSM(MOD_LCTL)",
      "OSM(MOD_LSFT)",
      "OSM(MOD_LALT)",
      "OSM(MOD_LGUI)",
    ],
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
  {
    name: "Nav",
    codes: ["KC_LEFT", "KC_DOWN", "KC_UP", "KC_RGHT", "KC_HOME", "KC_END", "KC_PGUP", "KC_PGDN"],
  },
  {
    name: "Media",
    codes: ["KC_MUTE", "KC_VOLU", "KC_VOLD", "KC_MPLY", "KC_MPRV", "KC_MNXT", "KC_BRID", "KC_BRIU"],
  },
  {
    name: "Punctuation",
    codes: [
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
    ],
  },
  {
    name: "System",
    codes: ["QK_BOOT", "EE_CLR", "DB_TOGG", "NK_TOGG", "AG_NORM", "AG_SWAP", "RGB_TOG", "RGB_MOD"],
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
  baseProfile = $state<DeviceProfile>(starterBoardProfile());
  profile = $state<DeviceProfile>(starterBoardProfile());
  activeLayer = $state(starterBoardProfile().layers[0]?.id ?? "base");
  lens = $state<EditorLens>("keys");
  selection = $state<Set<string>>(new Set());
  currentSwatch = $state<LightingSwatchId>(defaultLightingSwatchId);
  tintByLayer = $state(false);
  targetOs = $state<EditorTargetOs>("win");
  editorLayout = $state<EditorLayoutId>(EditorLayout.DEFAULT_EDITOR_LAYOUT);
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
      ? firmwareSnippet(this.profile, this.activeLayer, this.primarySelectedKeyId)
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
  private draftProfileId = starterBoardProfile().id;
  private persistFiber: Fiber.Fiber<void, unknown> | undefined;

  constructor(options: EditorStoreOptions = {}) {
    this.persistEnabled = options.persist ?? true;
    const autoHydrate = options.autoHydrate ?? true;
    this.baseProfile = cloneDevice(options.baseProfile ?? starterBoardProfile());
    this.profile = cloneDevice(options.profile ?? this.baseProfile);
    this.draftProfileId = this.baseProfile.id;
    this.activeLayer = this.profile.layers[0]?.id ?? "base";
    this.selection = new Set();

    if (browser) {
      if (autoHydrate) {
        forkApp("editor.hydrate", this.hydrateEffect(), (_label, message) => {
          this.persistenceError = message;
        });
      } else this.hydrated = true;
      forkApp(
        "preferences.target-os.load",
        Effect.tap(TargetOS.load, (targetOs) => Effect.sync(() => (this.targetOs = targetOs))),
        (_label, message) => (this.persistenceError = message),
      );
      forkApp(
        "preferences.editor-layout.load",
        Effect.tap(EditorLayout.load, (layout) => Effect.sync(() => (this.editorLayout = layout))),
        (_label, message) => (this.persistenceError = message),
      );
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

  replaceProfile(
    baseProfile: DeviceProfile,
    profile?: DeviceProfile,
    options: ReplaceProfileOptions = {},
  ) {
    return runApp(
      "editor.replace-profile",
      this.replaceProfileEffect(baseProfile, profile, options),
      (_label, message) => (this.persistenceError = message),
    );
  }

  protected replaceProfileEffect(
    baseProfile: DeviceProfile,
    profile?: DeviceProfile,
    options: ReplaceProfileOptions = {},
  ) {
    return Effect.gen({ self: this }, function* () {
      if (options.flushPersistence !== false) yield* this.flushPersistenceEffect();
      this.baseProfile = profileWithOptionalOrigin(baseProfile, options.origin);
      this.profile = profileWithOptionalOrigin(profile ?? this.baseProfile, options.origin);
      this.draftProfileId = this.baseProfile.id;
      this.activeLayer = this.profile.layers[0]?.id ?? "base";
      this.selection = new Set();
      this.persistenceError = null;
      this.hydrated = !browser || !this.persistEnabled || options.hydrateDraft === false;

      if (browser && options.hydrateDraft !== false) yield* this.hydrateEffect();
    });
  }

  commitCurrentDraftAsBase() {
    return runApp(
      "editor.commit-draft-as-base",
      this.commitCurrentDraftAsBaseEffect(),
      (_label, message) => (this.persistenceError = message),
    );
  }

  protected commitCurrentDraftAsBaseEffect() {
    return Effect.gen({ self: this }, function* () {
      yield* this.flushPersistenceEffect();

      const committedProfile = cloneDevice(this.profile);
      this.baseProfile = cloneDevice(committedProfile);
      this.profile = cloneDevice(committedProfile);
      this.draftProfileId = committedProfile.id;
      this.activeLayer = this.profile.layers.some((layer) => layer.id === this.activeLayer)
        ? this.activeLayer
        : (this.profile.layers[0]?.id ?? "base");
      this.selection = sanitizeSelection(this.profile, this.selection);

      if (!this.persistEnabled || !browser) return;
      yield* saveLocalDeviceEffect(committedProfile);
      yield* clearLocalDraftEffect(committedProfile.id);
      this.persistenceError = null;
    });
  }

  markBindingSyncedToBase(layerId: string, keyId: string, binding?: KeyBinding) {
    return runApp(
      "editor.mark-binding-synced",
      Effect.gen({ self: this }, function* () {
        const base = cloneDevice(this.baseProfile);
        const layer = base.layers.find((candidate) => candidate.id === layerId);
        const draftLayer = this.profile.layers.find((candidate) => candidate.id === layerId);
        const syncedBinding = binding ?? draftLayer?.bindings[keyId];
        if (!layer || !syncedBinding) return false;

        layer.bindings[keyId] = { ...syncedBinding };
        base.updatedAt = new Date().toISOString();
        this.baseProfile = base;

        if (!this.persistEnabled || !browser) return true;
        yield* this.cancelQueuedPersistenceEffect();
        yield* saveLocalDeviceEffect(base);
        yield* this.persistDraftEffect();
        this.persistenceError = null;
        return true;
      }),
      (_label, message) => (this.persistenceError = message),
    );
  }

  loadProfileAsDraft(profile: DeviceProfile, options: { origin?: DeviceProfileOrigin } = {}) {
    return runApp(
      "editor.load-profile-as-draft",
      this.loadProfileAsDraftEffect(profile, options),
      (_label, message) => (this.persistenceError = message),
    );
  }

  protected loadProfileAsDraftEffect(
    profile: DeviceProfile,
    options: { origin?: DeviceProfileOrigin } = {},
  ) {
    return Effect.gen({ self: this }, function* () {
      yield* this.flushPersistenceEffect();

      this.profile = profileWithOptionalOrigin(profile, options.origin);
      this.activeLayer = this.profile.layers.some((layer) => layer.id === this.activeLayer)
        ? this.activeLayer
        : (this.profile.layers[0]?.id ?? "base");
      this.selection = sanitizeSelection(this.profile, this.selection);
      this.persistenceError = null;
      this.queuePersistence();
    });
  }

  setLens(lens: EditorLens) {
    this.lens = lens;
  }

  setTargetOs(targetOs: EditorTargetOs) {
    this.targetOs = targetOs;
    if (browser) {
      forkApp("preferences.target-os.save", TargetOS.save(targetOs), (_label, message) => {
        this.persistenceError = message;
      });
    }
  }

  setEditorLayout(layout: EditorLayoutId) {
    this.editorLayout = layout;
    if (browser) {
      forkApp("preferences.editor-layout.save", EditorLayout.save(layout), (_label, message) => {
        this.persistenceError = message;
      });
    }
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

  updateSettings(patch: Partial<KeyboardSettings>) {
    const nextSettings = {
      ...this.profile.settings,
      ...patch,
    };

    if (settingsEqual(this.profile.settings, nextSettings)) return;
    this.commitProfile({
      ...this.profile,
      settings: nextSettings,
    });
  }

  updateFirmwareMetadata(metadata: FirmwareMetadata) {
    if (JSON.stringify(this.profile.firmwareMetadata ?? {}) === JSON.stringify(metadata)) return;
    this.commitProfile({
      ...this.profile,
      firmwareMetadata: metadata,
    });
  }

  setFirmwareEditIntent(intent: FirmwareEditIntent) {
    if (this.profile.firmwareEditIntent === intent) return;
    this.commitProfile({
      ...this.profile,
      firmwareEditIntent: intent,
    });
  }

  setTappingTerm(value: number) {
    const next = Math.round(value);
    this.updateSettings({ tappingTerm: next });
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

  addMacro(): Macro {
    const macro: Macro = {
      id: uniqueLogicId("macro"),
      name: "",
      sequence: [],
      trigger: "Unassigned",
    };
    this.commitProfile({
      ...this.profile,
      macros: [...this.profile.macros, macro],
    });
    return macro;
  }

  updateMacro(id: string, patch: Partial<Pick<Macro, "name" | "sequence" | "trigger">>) {
    const current = this.profile.macros.find((macro) => macro.id === id);
    if (!current) return;

    const sequence =
      "sequence" in patch
        ? normalizeKeycodeSequence(patch.sequence ?? current.sequence)
        : current.sequence;
    const next: Macro = {
      ...current,
      name: "name" in patch ? (patch.name ?? current.name).trim() : current.name,
      trigger: "trigger" in patch ? (patch.trigger ?? current.trigger).trim() : current.trigger,
      sequence,
    };

    if (macroEquals(current, next)) return;
    this.commitProfile({
      ...this.profile,
      macros: this.profile.macros.map((macro) => (macro.id === id ? next : macro)),
    });
  }

  duplicateMacro(id: string): Macro | undefined {
    const current = this.profile.macros.find((macro) => macro.id === id);
    if (!current) return undefined;

    const copy: Macro = {
      ...current,
      id: uniqueLogicId("macro"),
      name: copyName(current.name),
    };
    this.commitProfile({
      ...this.profile,
      macros: [...this.profile.macros, copy],
    });
    return copy;
  }

  removeMacro(id: string) {
    if (!this.profile.macros.some((macro) => macro.id === id)) return;
    const next = cloneDevice({
      ...this.profile,
      macros: this.profile.macros.filter((macro) => macro.id !== id),
    });
    reconcileMacroBindings(next);
    this.commitProfile(next);
  }

  addCombo(): Combo {
    const combo: Combo = {
      id: uniqueLogicId("combo"),
      name: "",
      keys: [],
      binding: "",
    };
    this.commitProfile({
      ...this.profile,
      combos: [...this.profile.combos, combo],
    });
    return combo;
  }

  updateCombo(id: string, patch: Partial<Pick<Combo, "binding" | "keys" | "layerIds" | "name">>) {
    const current = this.profile.combos.find((combo) => combo.id === id);
    if (!current) return;

    const validKeyIds = new Set(this.profile.keys.map((key) => key.id));
    const validLayerIds = new Set(this.profile.layers.map((layer) => layer.id));
    const nextKeys = "keys" in patch ? uniqueValidIds(patch.keys ?? [], validKeyIds) : current.keys;

    const rawLayerIds = "layerIds" in patch ? patch.layerIds : current.layerIds;
    const nextLayerIds = rawLayerIds ? uniqueValidIds(rawLayerIds, validLayerIds) : undefined;
    const normalizedLayerIds =
      nextLayerIds && nextLayerIds.length > 0 && nextLayerIds.length < this.profile.layers.length
        ? nextLayerIds
        : undefined;
    const next: Combo = {
      ...current,
      name: "name" in patch ? (patch.name ?? current.name).trim() : current.name,
      binding:
        "binding" in patch
          ? normalizeEditorKeycode(patch.binding ?? current.binding, "")
          : current.binding,
      keys: nextKeys,
      layerIds: normalizedLayerIds,
    };

    if (comboEquals(current, next)) return;
    this.commitProfile({
      ...this.profile,
      combos: this.profile.combos.map((combo) => (combo.id === id ? next : combo)),
    });
  }

  duplicateCombo(id: string): Combo | undefined {
    const current = this.profile.combos.find((combo) => combo.id === id);
    if (!current) return undefined;

    const copy: Combo = {
      ...current,
      id: uniqueLogicId("combo"),
      name: copyName(current.name),
      keys: [...current.keys],
      layerIds: current.layerIds ? [...current.layerIds] : undefined,
    };
    this.commitProfile({
      ...this.profile,
      combos: [...this.profile.combos, copy],
    });
    return copy;
  }

  removeCombo(id: string) {
    if (!this.profile.combos.some((combo) => combo.id === id)) return;
    this.commitProfile({
      ...this.profile,
      combos: this.profile.combos.filter((combo) => combo.id !== id),
    });
  }

  updateComboKeys(id: string, keyIds: readonly string[]) {
    this.updateCombo(id, { keys: [...keyIds] });
  }

  addTapDance(): TapDance | undefined {
    const dance: TapDance = {
      id: uniqueLogicId("td"),
      keyId: "",
      tap: "",
      hold: "",
      doubleTap: "",
    };
    this.commitProfile({
      ...this.profile,
      tapDances: [...this.profile.tapDances, dance],
    });
    return dance;
  }

  updateTapDance(
    id: string,
    patch: Partial<Pick<TapDance, "doubleTap" | "hold" | "keyId" | "tap">>,
  ) {
    const current = this.profile.tapDances.find((dance) => dance.id === id);
    if (!current) return;

    const validKeyIds = new Set(this.profile.keys.map((key) => key.id));
    const next: TapDance = {
      ...current,
      keyId:
        "keyId" in patch
          ? patch.keyId && validKeyIds.has(patch.keyId)
            ? patch.keyId
            : ""
          : current.keyId,
      tap: "tap" in patch ? normalizeEditorKeycode(patch.tap ?? current.tap, "") : current.tap,
      hold: "hold" in patch ? normalizeEditorKeycode(patch.hold ?? current.hold, "") : current.hold,
      doubleTap:
        "doubleTap" in patch
          ? normalizeEditorKeycode(patch.doubleTap ?? current.doubleTap, "")
          : current.doubleTap,
    };

    if (tapDanceEquals(current, next)) return;
    this.commitProfile({
      ...this.profile,
      tapDances: this.profile.tapDances.map((dance) => (dance.id === id ? next : dance)),
    });
  }

  duplicateTapDance(id: string): TapDance | undefined {
    const current = this.profile.tapDances.find((dance) => dance.id === id);
    if (!current) return undefined;

    const copy: TapDance = {
      ...current,
      id: uniqueLogicId("td"),
    };
    this.commitProfile({
      ...this.profile,
      tapDances: [...this.profile.tapDances, copy],
    });
    return copy;
  }

  removeTapDance(id: string) {
    const removedIndex = this.profile.tapDances.findIndex((dance) => dance.id === id);
    if (removedIndex < 0) return;

    const next = cloneDevice({
      ...this.profile,
      tapDances: this.profile.tapDances.filter((dance) => dance.id !== id),
    });
    reconcileTapDanceBindings(next, removedIndex);
    this.commitProfile(next);
  }

  placeLogicBindingOnKey(intent: EditorLogicPlacementIntent, keyId: string): boolean {
    if (!this.profile.keys.some((key) => key.id === keyId)) return false;

    if (intent.kind === "macro") {
      const index = this.profile.macros.findIndex((macro) => macro.id === intent.id);
      if (index < 0) return false;
      if (!isCompleteMacro(this.profile.macros[index])) return false;
      const result = applyBindingToDevice(
        this.profile,
        this.activeLayer,
        [keyId],
        macroBindingCode(index),
        intent.id,
      );
      this.selectKey(keyId);
      this.applyMutation(result);
      return true;
    }

    const index = this.profile.tapDances.findIndex((dance) => dance.id === intent.id);
    if (index < 0) return false;
    if (!isCompleteTapDance(this.profile.tapDances[index])) return false;
    const result = applyBindingToDevice(
      this.profile,
      this.activeLayer,
      [keyId],
      tapDanceBindingCode(index),
    );
    this.selectKey(keyId);
    this.applyMutation(result);
    return true;
  }

  flushPersistence() {
    return runApp("editor.flush-persistence", this.flushPersistenceEffect(), (_label, message) => {
      this.persistenceError = message;
    });
  }

  private applyMutation(result: EditorMutationResult) {
    if (result.changedKeyIds.length === 0) return;
    this.profile = withUpdatedAt(result.profile);
    this.queuePersistence();
  }

  private commitProfile(profile: DeviceProfile) {
    this.profile = withUpdatedAt(profile);
    this.selection = sanitizeSelection(this.profile, this.selection);
    this.queuePersistence();
  }

  private hydrateEffect() {
    if (!this.persistEnabled) {
      this.hydrated = true;
      return Effect.void;
    }

    return Effect.gen({ self: this }, function* () {
      const draft = yield* loadLocalDraftEffect(this.draftProfileId);
      if (draft) {
        this.profile = withDeviceProfileOrigin(draft, "draft");
        this.activeLayer = this.profile.layers.some((layer) => layer.id === this.activeLayer)
          ? this.activeLayer
          : (this.profile.layers[0]?.id ?? "base");
        this.selection = sanitizeSelection(this.profile, this.selection);
      }
      this.persistenceError = null;
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          this.hydrated = true;
        }),
      ),
    );
  }

  private hydrate() {
    return runApp("editor.hydrate", this.hydrateEffect(), (_label, message) => {
      this.persistenceError = message;
    });
  }

  private queuePersistence() {
    if (!this.persistEnabled || !browser) return;
    if (this.persistFiber) {
      forkApp("editor.cancel-persist-draft", Fiber.interrupt(this.persistFiber));
    }

    let started!: Fiber.Fiber<void, unknown>;
    started = forkApp(
      "editor.persist-draft",
      Effect.sleep("350 millis").pipe(
        Effect.andThen(this.persistDraftEffect()),
        Effect.ensuring(
          Effect.sync(() => {
            if (this.persistFiber === started) this.persistFiber = undefined;
          }),
        ),
      ),
      (_label, message) => {
        this.persistenceError = message;
      },
    );
    this.persistFiber = started;
  }

  private cancelQueuedPersistenceEffect() {
    const fiber = this.persistFiber;
    if (!fiber) return Effect.void;
    this.persistFiber = undefined;
    return Fiber.interrupt(fiber).pipe(Effect.asVoid);
  }

  protected flushPersistenceEffect() {
    if (!this.persistEnabled || !browser) return Effect.void;
    return this.cancelQueuedPersistenceEffect().pipe(Effect.andThen(this.persistDraftEffect()));
  }

  private persistDraftEffect() {
    return Effect.gen({ self: this }, function* () {
      if (this.dirty > 0) yield* saveLocalDraftEffect(this.profile);
      else yield* clearLocalDraftEffect(this.profile.id);
      this.persistenceError = null;
    });
  }
}

const MACRO_BINDING_PATTERN = /^QK_MACRO_(\d+)$/;
const TAP_DANCE_BINDING_PATTERN = /^TD\((\d+)\)$/;

function uniqueLogicId(prefix: string): string {
  return `${prefix}-${newId()}`;
}

function profileWithOptionalOrigin(
  profile: DeviceProfile,
  origin: DeviceProfileOrigin | undefined,
): DeviceProfile {
  return origin ? withDeviceProfileOrigin(profile, origin) : cloneDevice(profile);
}

function normalizeKeycodeSequence(sequence: readonly string[]): string[] {
  const normalized = sequence
    .map((step) => normalizeEditorKeycode(step, ""))
    .filter((step) => step.length > 0);
  return normalized;
}

function copyName(name: string): string {
  const trimmed = name.trim();
  return trimmed ? `${trimmed} copy` : "";
}

function uniqueValidIds(ids: readonly string[], validIds: ReadonlySet<string>): string[] {
  return [...new Set(ids)].filter((id) => validIds.has(id));
}

function macroEquals(left: Macro, right: Macro): boolean {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.trigger === right.trigger &&
    left.sequence.join("|") === right.sequence.join("|")
  );
}

function comboEquals(left: Combo, right: Combo): boolean {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.binding === right.binding &&
    left.keys.join("|") === right.keys.join("|") &&
    (left.layerIds ?? []).join("|") === (right.layerIds ?? []).join("|")
  );
}

function tapDanceEquals(left: TapDance, right: TapDance): boolean {
  return (
    left.id === right.id &&
    left.keyId === right.keyId &&
    left.tap === right.tap &&
    left.hold === right.hold &&
    left.doubleTap === right.doubleTap
  );
}

function clearCodeForLayerIndex(layerIndex: number): string {
  return layerIndex === 0 ? "KC_NO" : "KC_TRNS";
}

function reconcileMacroBindings(profile: DeviceProfile) {
  const macroIndexById = new Map(profile.macros.map((macro, index) => [macro.id, index]));

  profile.layers.forEach((layer, layerIndex) => {
    for (const [keyId, binding] of Object.entries(layer.bindings)) {
      if (!binding.macroId) continue;

      const macroIndex = macroIndexById.get(binding.macroId);
      if (macroIndex === undefined) {
        const next = { ...binding };
        delete next.macroId;
        if (MACRO_BINDING_PATTERN.test(next.code)) next.code = clearCodeForLayerIndex(layerIndex);
        layer.bindings[keyId] = next;
        continue;
      }

      if (
        MACRO_BINDING_PATTERN.test(binding.code) &&
        binding.code !== macroBindingCode(macroIndex)
      ) {
        layer.bindings[keyId] = {
          ...binding,
          code: macroBindingCode(macroIndex),
        };
      }
    }
  });
}

function reconcileTapDanceBindings(profile: DeviceProfile, removedIndex: number) {
  profile.layers.forEach((layer, layerIndex) => {
    for (const [keyId, binding] of Object.entries(layer.bindings)) {
      const match = TAP_DANCE_BINDING_PATTERN.exec(binding.code);
      if (!match) continue;

      const index = Number(match[1]);
      if (index === removedIndex) {
        layer.bindings[keyId] = {
          ...binding,
          code: clearCodeForLayerIndex(layerIndex),
        };
      } else if (index > removedIndex) {
        layer.bindings[keyId] = {
          ...binding,
          code: tapDanceBindingCode(index - 1),
        };
      }
    }
  });
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

function settingsEqual(left: KeyboardSettings, right: KeyboardSettings): boolean {
  return (
    left.tappingTerm === right.tappingTerm &&
    left.debounce === right.debounce &&
    left.permissiveHold === right.permissiveHold &&
    left.retroTapping === right.retroTapping &&
    left.nkro === right.nkro &&
    left.splitTransport === right.splitTransport
  );
}

function validSelection(profile: DeviceProfile, selection: Iterable<string>): string[] {
  const validKeys = new Set(profile.keys.map((key) => key.id));
  return [...new Set(selection)].filter((keyId) => validKeys.has(keyId));
}

function sanitizeSelection(profile: DeviceProfile, selection: Iterable<string>): Set<string> {
  return new Set(validSelection(profile, selection));
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
