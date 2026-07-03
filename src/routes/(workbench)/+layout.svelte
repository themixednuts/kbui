<script lang="ts">
  import {
    Activity,
    Braces,
    Cable,
    Check,
    Cloud,
    Code,
    Database,
    Eye,
    EyeOff,
    GitCompare,
    GitFork,
    Keyboard,
    Plus,
    RadioTower,
    RotateCcw,
    Settings as SettingsIcon,
    SlidersHorizontal,
    Trash2,
    Usb,
    UserCircle,
    Zap,
  } from "@lucide/svelte";
  import {
    Button,
    CatalogPicker,
    Chip,
    SegmentedNav,
    SliderField,
    Topbar,
    type CatalogOption,
    type SegmentItem,
  } from "$lib/components/ui";
  import * as Card from "$lib/components/ui/card/index.js";
  import { Toggle } from "$lib/components/ui/toggle/index.js";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import { Label } from "$lib/components/ui/label/index.js";
  import SettingsDrawer from "$lib/components/settings/SettingsDrawer.svelte";
  import TargetOsChip from "$lib/components/keymap/TargetOsChip.svelte";
  import KeyBindInspector from "$lib/components/keymap/KeyBindInspector.svelte";
  import KeyInspectorPanel from "$lib/components/keymap/KeyInspectorPanel.svelte";
  import KeymapRgbPanel from "$lib/components/keymap/KeymapRgbPanel.svelte";
  import LogicBuilder from "$lib/components/logic/LogicBuilder.svelte";
  import VersionChangesPanel from "$lib/components/versioning/VersionChangesPanel.svelte";
  import * as ToggleGroup from "$lib/components/ui/toggle-group/index.js";
  import { cn } from "$lib/utils.js";
  import { KeymapRgbSelection } from "$lib/components/keymap/keymap-rgb-selection.svelte";
  import { runApp, TargetOS } from "$lib/app";
  import { showAppToast, type AppNoticeTone } from "$lib/app-toast";
  import { onMount } from "svelte";
  import { browser, dev } from "$app/environment";
  import { goto, replaceState } from "$app/navigation";
  import { page } from "$app/state";
  import WorkbenchPagesRegistrar from "$lib/workbench/WorkbenchPagesRegistrar.svelte";
  import { setWorkbenchStore } from "$lib/workbench/context-store";
  import { WORKBENCH_ROUTES, type WorkbenchRoute } from "$lib/workbench/routes";
  import { workbenchHref, type InspectorTab, type KeymapMode, type LogicTab, type WorkbenchSearchPatch } from "$lib/workbench/url-search";
  import { WorkbenchStore } from "$lib/workbench/workbench-store.svelte";
  import { catchCauseCompat } from "$lib/effect/compat";
  import { Cause, Effect } from "effect";

  import { authClient } from "$lib/auth-client";
  import {
    bestCatalogEntryForIdentity,
    layoutBounds,
    profileFromCatalog,
    type KeyboardCatalogEntry,
    type KeyboardCatalogIndexEntry,
  } from "$lib/keyboard/catalog";
  import { diffProfiles, qmkSnippet, summarizeDiff } from "$lib/keyboard/changes";
  import {
    isSplitKeyboard,
    isSplitTransportAllowed,
    isZmkDevice,
    normalizeSplitTransport,
    SPLIT_TRANSPORT_OPTIONS,
    splitTransportDisabledReason,
  } from "$lib/keyboard/split-transport";
  import { logicBindingOptions, macroBindingCode, type LogicBindingOption } from "$lib/keyboard/logic-bindings";
  import {
    comboAppliesToLayer,
    comboChordLabels,
    comboMarkerText,
    viaComboDefinitionsUnavailable,
  } from "$lib/keyboard/combo-visibility";
  import {
    routeComboConnectors,
    type ComboConnectorRoute,
  } from "$lib/keyboard/combo-routing";
  import {
    layerActivationMarkerText,
    layerActivationSummary,
    layerActivationsByKey,
    layerActivationsForLayer,
    type LayerActivation,
  } from "$lib/keyboard/layer-activations";
  import {
    bindingFor,
    cloneDevice,
    decodeDeviceProfileFromStorageEffect,
    keyById,
    keycodeGroups,
    qmkKeycodeLabel,
    qmkKeycodeValue,
    normalizeQmkKeycode,
    normalizeDeviceKeycodesEffect,
    profileFromDetectionEffect,
    sampleKeyboard,
    type Combo,
    type DeviceProfile,
    type KeyboardDetection,
    type KeyBinding,
    type KeyLighting,
    type KeyboardKey,
    type WorkspaceFork,
  } from "$lib/keyboard/schema";
  import {
    clearLocalDraftEffect,
    clearLocalStateEffect,
    loadForksEffect,
    loadLocalDeviceEffect,
    loadLocalDraftEffect,
    recordSyncEffect,
    saveForksEffect,
    saveLocalDeviceEffect,
    saveLocalDraftEffect,
  } from "$lib/keyboard/local-store";
  import { flashReadinessSummary, validateFlashReadiness } from "$lib/keyboard/flash-validation";
  import {
    captureMockKeyboardPacket,
    type MockKeyboardPacket,
  } from "$lib/keyboard/mock-device";
  import {
    connectKeyboardEffect,
    detectGrantedKeyboardEffect,
    forgetGrantedKeyboardEffect,
    getConnectionState,
    writeViaKeycodeEffect,
    type ConnectionState,
    type TransportKind,
  } from "$lib/keyboard/transport";

  import { getViaKeyboardDetail, getViaKeyboardIndex } from "../keyboards.remote";

  let { children, data } = $props();

  const store = new WorkbenchStore();
  setWorkbenchStore(store);
  const rgbSelection = new KeymapRgbSelection();
  let rgbBrush = $state<KeyLighting>({ hue: 174, saturation: 76, brightness: 82 });

  const editorRoute = $derived(store.route);
  const selectedLayerId = $derived(store.selectedLayerId);
  const selectedKeyId = $derived(store.selectedKeyId);
  const keymapMode = $derived(store.keymapMode);
  const logicTab = $derived(store.logicTab);
  const inspectorTab = $derived(store.inspectorTab);
  const workbenchReady = $derived(store.workbenchReady);
  const baseProfile = $derived(store.baseProfile);

  const viaCatalog = $derived(data.catalog);

  function navHref(route: WorkbenchRoute, patch: WorkbenchSearchPatch = {}) {
    return workbenchHref(page.url, route, patch);
  }

  function replaceSearch(patch: WorkbenchSearchPatch, route: WorkbenchRoute = editorRoute) {
    if (!browser) return;
    void goto(workbenchHref(page.url, route, patch), {
      replaceState: true,
      noScroll: true,
      keepFocus: true,
    });
  }

  function clearKeySelection() {
    replaceSearch({ key: null });
  }

  function onInspectorEscape(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    (event.currentTarget as HTMLElement | null)?.blur();
    clearKeySelection();
  }

  const viewNavItems = $derived<SegmentItem<WorkbenchRoute>[]>([
    { value: "keymap", label: "Keymap", href: navHref("keymap"), icon: Keyboard, title: "Keymap" },
    { value: "logic", label: "Logic", href: navHref("logic"), icon: Braces, title: "Logic" },
    { value: "versioning", label: "Diff", href: navHref("versioning"), icon: GitCompare, title: "Diff" },
    {
      value: "firmware",
      label: "Compile",
      href: navHref("firmware"),
      icon: Code,
      title: "Compile",
      testid: "open-firmware",
    },
  ]);

  type GlobalLightingKey = Exclude<keyof DeviceProfile["lighting"], "keys">;

  type AuthSessionData = {
    session: { id: string; expiresAt?: Date | string };
    user: { id: string; name?: string | null; email?: string | null; image?: string | null };
  } | null;
  type RenderedBinding = KeyBinding & {
    display: string;
    keycap: string;
    rawCode: string;
    sourceColor: string;
    sourceLayerId: string;
    sourceLayerName: string;
    transparent: boolean;
  };
  type ComboConnector = ComboConnectorRoute & {
    title: string;
  };
  type KeymapPanState = {
    stage: HTMLElement;
    pointerId: number;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  };
  type CatalogPayload<T> = {
    source: "github-api";
    repo: string;
    count: number;
    items: T;
    error?: string;
  };
  type CatalogIdentity = {
    vendorId?: number;
    productId?: number;
    productName?: string;
    serialNumber?: string;
  };
  type AppErrorBlock = {
    id: string;
    title: string;
    detail: string;
    createdAt: string;
  };

  const displayAliases: Record<string, string> = {
    KC_BSPC: "BSPC",
    KC_BSLS: "\\",
    KC_CAPS: "CAPS",
    KC_COMM: ",",
    KC_DEL: "DEL",
    KC_DOT: ".",
    KC_ENT: "ENT",
    KC_EQL: "=",
    KC_ESC: "ESC",
    KC_LALT: "LALT",
    KC_LBRC: "[",
    KC_LCTL: "LCTL",
    KC_LGUI: "LGUI",
    KC_LSFT: "LSFT",
    KC_MINS: "-",
    KC_QUOT: "'",
    KC_RALT: "RALT",
    KC_RBRC: "]",
    KC_RCTL: "RCTL",
    KC_RGHT: "RIGHT",
    KC_RGUI: "RGUI",
    KC_RSFT: "RSFT",
    KC_SCLN: ";",
    KC_SLSH: "/",
    KC_SPC: "SPC",
    KC_TAB: "TAB",
    KC_TRNS: "TRNS",
  };
  const lightingModes: DeviceProfile["lighting"]["mode"][] = ["solid", "breathing", "reactive", "rainbow", "matrix"];
  const lightingModeItems: SegmentItem<DeviceProfile["lighting"]["mode"]>[] = lightingModes.map(
    (mode) => ({
      value: mode,
      label: mode.charAt(0).toUpperCase() + mode.slice(1),
    }),
  );
  // Trimmed to the six bindings users reach for first. Anything else gets
  // typed into the Keycode field — keeping this list short keeps the
  // inspector calm.
  const quickPickCodes = [
    "KC_ESC",
    "KC_TAB",
    "KC_SPC",
    "KC_ENT",
    "KC_BSPC",
    "KC_TRNS",
  ];

  const device = $derived(store.device);
  const splitTransportValue = $derived(
    normalizeSplitTransport(device.settings.splitTransport, device),
  );
  const connection = $derived(store.connection);
  const hasRgbCapability = $derived(device.capabilities.includes("lighting"));
  const rgbSelectionCount = $derived(rgbSelection.count);
  const allKeyIds = $derived(device.keys.map((key) => key.id));
  let paletteQuery = $state("");
  let showFallthrough = $state(true);
  let changesPanelOpen = $state(false);
  // Inline layer-rename: when set, the matching layer chip swaps to an
  // <input>. Double-click any chip to enter rename mode; Enter / blur
  // commits, Escape cancels.
  let renamingLayerId = $state<string | undefined>();
  let layerNameDraft = $state("");
  let hoveredComboKeyId = $state<string | undefined>();

  // --- Target OS for shortcut labels ----------------------------------------
  // Sourced from `$lib/app` so persistence flows through Effect-based
  // services (Preferences) and stays consistent with the auth/sync paths
  // landing next. Initial value is detected synchronously (Effect.runSync
  // on a pure Effect.sync); an onMount call upgrades to the stored override
  // if one exists. All writes go through the TargetOS.save Effect.
  let targetOS = $state<TargetOS.TargetOS>(
    browser ? Effect.runSync(TargetOS.detect) : "win",
  );
  let settingsOpen = $state(false);

  // Sync UI state — surfaced in the Settings drawer. The Effect-based
  // sync pipeline (`syncAgent`) writes here, the drawer reads.
  type SyncStatus = "idle" | "syncing" | "ok" | "error";
  let syncStatus = $state<SyncStatus>("idle");
  let syncLastAt = $state<string | null>(null);

  function relativeTimeFrom(iso: string): string {
    const diffSec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
    if (diffSec < 5) return "just now";
    if (diffSec < 60) return `${diffSec}s ago`;
    if (diffSec < 3600) return `${Math.round(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.round(diffSec / 3600)}h ago`;
    return new Date(iso).toLocaleDateString();
  }

  const syncLastLabel = $derived(syncLastAt ? relativeTimeFrom(syncLastAt) : null);

  function setTargetOS(next: TargetOS.TargetOS) {
    if (next === targetOS) return;
    targetOS = next;
    void runApp("Save target OS", TargetOS.save(next), captureAppError);
  }

  function cycleTargetOS() {
    setTargetOS(TargetOS.next(targetOS));
  }
  let agentName = $state("local-dev");
  let localStatus = $state("SQLocal warming up");
  let cloudStatus = $state("Agent idle");
  let authStatus = $state("Checking GitHub auth");
  let authSession = $state<AuthSessionData>(null);
  let activeForkId = $state("main");
  let forks = $state<WorkspaceFork[]>([]);
  let selectedCatalogId = $state("");
  let catalogQuery = $state("");
  let catalogEntries = $state<KeyboardCatalogIndexEntry[]>([]);
  let catalogItems = $state<KeyboardCatalogIndexEntry[]>([]);
  let catalogStatus = $state("Loading VIA repo");
  let catalogSource = $state("dynamic VIA");
  let appErrors = $state<AppErrorBlock[]>([]);
  let lastBuild = $state<string | undefined>(undefined);
  let profileFileInput = $state<HTMLInputElement | undefined>();
  let keymapZoom = $state(1);
  let keymapIsPanning = $state(false);

  let keymapPanState: KeymapPanState | undefined;
  let suppressNextKeymapClick = false;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  let catalogSearchTimer: ReturnType<typeof setTimeout> | undefined;
  let viaWriteQueue: Promise<void> = Promise.resolve();
  let catalogRequestId = 0;
  let catalogLoadPromise: Promise<CatalogPayload<KeyboardCatalogIndexEntry[]>> | undefined;
  const catalogEntryCache = new Map<string, KeyboardCatalogEntry>();
  const KEYMAP_PAN_BUTTON = 1;
  const KEYMAP_PAN_THRESHOLD = 4;
  const firmwareFlowAvailable = false;

  const selectedLayer = $derived(device.layers.find((layer) => layer.id === selectedLayerId) ?? device.layers[0]);
  const selectedKey = $derived(selectedKeyId ? keyById(device, selectedKeyId) : undefined);
  const selectedBinding = $derived(bindingFor(device, selectedLayerId, selectedKeyId));
  const selectedRenderedBinding = $derived(resolveRenderedBinding(selectedLayerId, selectedKeyId));
  const keyboardRows = $derived(groupKeyboardRows(device.keys));
  const keyboardBounds = $derived(layoutBounds(device.keys));
  const keyboardIsPositioned = $derived(device.keys.some((key) => typeof key.x === "number" && typeof key.y === "number"));
  const keyboardUnit = $derived(keyboardBounds.width > 18 ? 42 : device.keys.length > 70 ? 48 : device.keys.length > 50 ? 54 : 62);
  const zoomedKeyboardUnit = $derived(Math.round(keyboardUnit * keymapZoom * 100) / 100);
  const keymapZoomLabel = $derived(`${Math.round(keymapZoom * 100)}%`);
  const diffs = $derived(diffProfiles(baseProfile, device));
  const diffStats = $derived(summarizeDiff(diffs));
  const sourceSnippet = $derived(qmkSnippet(device, selectedLayerId, selectedKeyId));
  const logicBindings = $derived(logicBindingOptions(device));
  const liveKeyboardConnected = $derived(store.connection.status === "connected");
  const comboDefinitionsNotice = $derived(
    viaComboDefinitionsUnavailable(device, liveKeyboardConnected)
      ? "VIA cannot list compiled QMK combos from the keyboard. Load a profile or source definition to show active combo markers."
      : undefined,
  );
  const keyboardNeedsDefinition = $derived(liveKeyboardConnected && !store.liveProfileResolved);
  const keyboardConnected = $derived(workbenchReady);
  const transportUnavailable = $derived(!store.connection.webUsbSupported && !store.connection.webHidSupported);
  const flashReadiness = $derived(
    validateFlashReadiness({
      connection: store.connection,
      device,
      diffCount: diffStats.total,
      firmwareFlowAvailable,
      mockOnline: false,
    }),
  );
  const flashStatus = $derived(flashReadinessSummary(flashReadiness));
  const flashStatusDetails = $derived(
    flashReadiness.issues.filter((issue) => issue.message !== flashStatus),
  );
  const firmwareActionLabel = $derived(liveKeyboardConnected ? "Flash unavailable" : "Connect WebHID");
  const firmwareActionTitle = $derived(
    liveKeyboardConnected
      ? flashStatus
      : connection.webHidSupported
        ? "Connect a live WebHID keyboard to inspect flash readiness."
        : "WebHID is unavailable in this browser.",
  );
  const firmwareActionDisabled = $derived(
    connection.status === "requesting" || (liveKeyboardConnected ? true : !connection.webHidSupported),
  );
  const syncIdentity = $derived(authSession?.user.id ?? agentName);
  const activeBranchName = $derived(activeForkId === "main" ? "main" : forks.find((fork) => fork.id === activeForkId)?.name ?? "fork");
  const catalogOptions = $derived<CatalogOption[]>(
    catalogItems.map((entry) => ({ id: entry.id, label: `${entry.vendor} / ${entry.name}` })),
  );
  const bootloaderLabel = $derived(
    device.firmware === "zmk"
      ? "ZMK Studio · BLE"
      : device.protocol === "vial"
        ? "Vial bootloader"
        : "QMK bootloader (DFU / RP2040 BOOTSEL)",
  );
  const activeLayerStack = $derived(
    selectedLayerId === device.layers[0]?.id || !device.layers[0]
      ? [selectedLayerId]
      : [selectedLayerId, device.layers[0].id],
  );
  const visibleLayerCombos = $derived.by(() =>
    device.combos.filter((combo) => comboAppliesToLayer(combo, selectedLayerId)),
  );
  const keyCombosById = $derived.by(() => {
    const combosById = new Map<string, Combo[]>();
    for (const combo of visibleLayerCombos) {
      for (const keyId of combo.keys) {
        const combos = combosById.get(keyId);
        if (combos) combos.push(combo);
        else combosById.set(keyId, [combo]);
      }
    }
    return combosById;
  });
  const comboSummariesByKeyId = $derived.by(() => {
    const summaries = new Map<string, string>();
    for (const combo of visibleLayerCombos) {
      const summary = `${combo.name}: ${comboChordLabels(device, combo, displayCode, selectedLayerId).join(" + ")} -> ${displayCode(combo.binding)}`;
      for (const keyId of combo.keys) {
        const current = summaries.get(keyId);
        summaries.set(keyId, current ? `${current}\n${summary}` : summary);
      }
    }
    return summaries;
  });
  const comboConnectorRoutes = $derived.by(() =>
    keyboardIsPositioned && keymapMode !== "rgb"
      ? routeComboConnectors({ combos: visibleLayerCombos, keys: device.keys })
      : [],
  );
  const comboConnectors = $derived.by(() => {
    const comboById = new Map(visibleLayerCombos.map((combo) => [combo.id, combo]));
    return comboConnectorRoutes.map((route) => {
      const combo = comboById.get(route.id) as Combo;
      return {
        ...route,
        title: `${combo.name}: ${comboChordLabels(device, combo, displayCode, selectedLayerId).join(" + ")} -> ${displayCode(combo.binding)}`,
      };
    });
  });
  const visibleLayerActivations = $derived.by(() =>
    layerActivationsForLayer(device, selectedLayerId),
  );
  const layerActivationsByKeyId = $derived.by(() =>
    layerActivationsByKey(visibleLayerActivations),
  );
  const filteredKeycodeGroups = $derived(
    keycodeGroups
      .map((group) => ({
        ...group,
        codes: group.codes.filter((code) => code.toLowerCase().includes(paletteQuery.toLowerCase())),
      }))
      .filter((group) => group.codes.length > 0),
  );

  function causeMessage(cause: unknown) {
    const message = Cause.pretty(cause as never).trim();
    return message || "Unknown Effect failure";
  }

  function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }

  function captureAppError(title: string, detail: string) {
    const errorBlock: AppErrorBlock = {
      id: crypto.randomUUID(),
      title,
      detail,
      createdAt: new Date().toLocaleTimeString(),
    };

    appErrors = [errorBlock, ...appErrors].slice(0, 3);
    cloudStatus = title;
    showNotice(`${title}: ${detail.split("\n")[0] ?? detail}`, "error");
  }

  function clearAppError(id: string) {
    appErrors = appErrors.filter((errorBlock) => errorBlock.id !== id);
  }

  function runAppEffect<A>(title: string, effect: Effect.Effect<A, unknown, never>) {
    return Effect.runPromise(
      effect.pipe(
        catchCauseCompat((cause) =>
          Effect.sync(() => {
            captureAppError(title, causeMessage(cause));
            return undefined as A | undefined;
          }),
        ),
      ),
    );
  }

  onMount(() => {
    // Run startup (local SQLocal hydration + catalog match + auth refresh)
    // first, THEN restore from the cloud workbench agent so the cloud
    // copy wins. Otherwise the catalog auto-match would fire after
    // restore and silently overwrite the user's synced edits.
    void runAppEffect("Startup", startupEffect()).then(() => {
      void Effect.runPromise(
        Effect.tryPromise(async () => {
          const response = await fetch("/api/agent/snapshot", { credentials: "include" });
          if (!response.ok) return;
          const result = (await response.json()) as {
            snapshot?: { profile?: DeviceProfile; state?: { updatedAt?: string } } | null;
          };
          const profile = result?.snapshot?.profile;
          if (!profile) return;
          // Cloud is the source of truth once signed in. Replace both the
          // working device AND baseProfile so the diff view doesn't
          // immediately flag every cloud-side binding as a local change.
          store.applyDeviceProfile(profile);
          store.setBaseProfile(profile);
          if (result.snapshot?.state?.updatedAt) {
            syncLastAt = result.snapshot.state.updatedAt;
            syncStatus = "ok";
          }
          showNotice(`Restored ${profile.name} from your synced workspace.`, "success");
        }).pipe(catchCauseCompat(() => Effect.succeed(undefined))),
      );
    });

    // Upgrade the auto-detected OS to any stored override (Effect service).
    void runApp("Load target OS", TargetOS.load, captureAppError).then((stored) => {
      if (stored && stored !== targetOS) targetOS = stored;
    });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const target = event.target as HTMLElement | null;

      if (target?.closest("[data-layer-rename]")) return;

      if (target?.closest(".key-inspector") && store.selectedKeyId) {
        event.preventDefault();
        target.blur();
        clearKeySelection();
        return;
      }

      const tag = target?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }

      if (store.keymapMode === "rgb") {
        if (rgbSelection.count > 0) {
          rgbSelection.clear();
          return;
        }
      } else if (store.selectedKeyId) {
        clearKeySelection();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      cancelKeymapPan();
    };
  });

  function startupEffect() {
    return Effect.tryPromise(async () => {
      store.connection = getConnectionState();
      void runAppEffect("Keyboard catalog", loadCatalogSearchEffect(""));
      const clearLocal = new URL(globalThis.location.href).searchParams.get("clearLocal") === "1";

      if (clearLocal) {
        await Effect.runPromise(clearLocalStateEffect());
        setBaseProfile(sampleKeyboard);
        applyDeviceProfile(cloneDevice(sampleKeyboard));
        forks = [];
        activeForkId = "main";
        selectedCatalogId = "";
        store.liveProfileResolved = false;
        replaceState(globalThis.location.pathname, {});
        localStatus = "SQLocal cleared";
        showNotice("SQLocal cleared for this browser.", "success");
      }

      const [restoredBase, restoredDraft, restoredForks]: [
        DeviceProfile | undefined,
        DeviceProfile | undefined,
        WorkspaceFork[],
      ] = clearLocal
        ? [undefined, undefined, []]
        : await Promise.all([
            Effect.runPromise(loadLocalDeviceEffect()),
            Effect.runPromise(loadLocalDraftEffect()),
            Effect.runPromise(loadForksEffect()),
          ]);
      await Effect.runPromise(refreshAuthEffect());

      if (restoredBase) {
        setBaseProfile(restoredBase);
        store.device =
          restoredDraft?.id === restoredBase.id ? restoredDraft : cloneDevice(restoredBase);
      } else if (restoredDraft) {
        store.device = restoredDraft;
        if (restoredDraft.id !== sampleKeyboard.id) {
          setBaseProfile(restoredDraft);
        }
      }

      forks = restoredForks;
      store.hydrated = true;
      localStatus = clearLocal ? "SQLocal cleared" : "SQLocal ready";

      const grantedConnection = await Effect.runPromise(detectGrantedKeyboardEffect({
        resolveMatrixHint: matrixHintForConnection,
      }));
      if (grantedConnection?.status === "connected") {
        store.connection = grantedConnection;
        await Effect.runPromise(applyConnectedKeyboardEffect());
      } else if (grantedConnection?.status === "error") {
        store.connection = grantedConnection;
      }
    });
  }

  $effect(() => {
    if (!store.hydrated) return;

    JSON.stringify(device);
    JSON.stringify(forks);
    const hasDraftChanges = diffStats.total > 0;

    if (saveTimer) clearTimeout(saveTimer);

    saveTimer = setTimeout(() => {
      void runAppEffect("Save local state", saveLocalStateEffect(hasDraftChanges));
    }, 160);

    return () => {
      if (saveTimer) clearTimeout(saveTimer);
    };
  });

  function saveLocalStateEffect(hasDraftChanges: boolean) {
    return Effect.all([
      hasDraftChanges ? saveLocalDraftEffect(device) : clearLocalDraftEffect(device.id),
      saveForksEffect(forks),
    ]).pipe(
      Effect.map(() => {
        localStatus = hasDraftChanges
          ? `SQLocal saved draft ${new Date().toLocaleTimeString()}`
          : `SQLocal clean ${new Date().toLocaleTimeString()}`;
      }),
    );
  }

  function groupKeyboardRows(keys: KeyboardKey[]) {
    const rows: KeyboardKey[][] = [];

    for (const key of keys) {
      rows[key.row] ??= [];
      rows[key.row].push(key);
    }

    return rows.map((row) => row.sort((a, b) => a.col - b.col));
  }

  function safeNormalize(profile: DeviceProfile, fallback: DeviceProfile): DeviceProfile {
    const exit = Effect.runSyncExit(normalizeDeviceKeycodesEffect(profile));
    if (exit._tag === "Success") return exit.value;
    captureAppError("Profile normalize", causeMessage(exit.cause));
    return fallback;
  }

  function setBaseProfile(profile: DeviceProfile) {
    store.setBaseProfile(safeNormalize(profile, profile));
  }

  function applyDeviceProfile(profile: DeviceProfile) {
    store.device = safeNormalize(profile, store.device);
    const layerId = store.device.layers.some((layer) => layer.id === selectedLayerId)
      ? selectedLayerId
      : (store.device.layers[0]?.id ?? selectedLayerId);
    const keyId =
      selectedKeyId && store.device.keys.some((key) => key.id === selectedKeyId)
        ? selectedKeyId
        : null;
    replaceSearch({ layer: layerId, key: keyId });
  }

  function cacheCatalogEntry(entry: KeyboardCatalogEntry) {
    catalogEntryCache.set(entry.id, entry);
    catalogEntryCache.set(entry.sourcePath, entry);
    return entry;
  }

  function includeCatalogItem(entry: KeyboardCatalogIndexEntry) {
    if (!catalogItems.some((candidate) => candidate.id === entry.id)) {
      catalogItems = [entry, ...catalogItems];
    }
  }

  /**
   * Per-token match score. Returns `null` when a token finds no hit anywhere
   * in the entry — that's a hard mismatch and the entry should not survive
   * filtering, even if its base priority is high. Returning a number means
   * the token matched somewhere; the magnitude ranks how strong the hit is.
   */
  function catalogTokenScore(
    entry: KeyboardCatalogIndexEntry,
    token: string,
  ): number | null {
    const vendor = entry.vendor.toLowerCase();
    const name = entry.name.toLowerCase();
    const sourcePath = entry.sourcePath.toLowerCase();

    if (vendor === token) return 600;
    if (name.includes(token)) return 350;
    if (sourcePath.includes(`/${token}/`)) return 300;
    if (entry.id.includes(token)) return 220;
    if (vendor.includes(token)) return 200;
    if (sourcePath.includes(token)) return 150;
    return null;
  }

  function catalogSearchScore(entry: KeyboardCatalogIndexEntry, queryTokens: string[]) {
    if (queryTokens.length === 0) return entry.priority;

    let bonus = 0;
    for (const token of queryTokens) {
      const tokenScore = catalogTokenScore(entry, token);
      if (tokenScore === null) return Number.NEGATIVE_INFINITY;
      bonus += tokenScore;
    }

    return entry.priority + bonus;
  }

  function searchCatalogEntries(entries: KeyboardCatalogIndexEntry[], query: string, limit = 60) {
    const queryTokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);

    return entries
      .map((entry) => ({
        entry,
        score: catalogSearchScore(entry, queryTokens),
      }))
      .filter((candidate) => Number.isFinite(candidate.score))
      .sort(
        (left, right) =>
          right.score - left.score || left.entry.name.localeCompare(right.entry.name),
      )
      .slice(0, limit)
      .map((candidate) => candidate.entry);
  }

  function catalogSourceLabel(_source: CatalogPayload<unknown>["source"]) {
    return "GitHub API";
  }

  function loadCatalogPayloadEffect() {
    return Effect.tryPromise(async () => {
      catalogLoadPromise ??= Promise.resolve(getViaKeyboardIndex()).catch((error) => {
        catalogLoadPromise = undefined;
        throw error;
      });

      const payload = await catalogLoadPromise;
      catalogEntries = payload.items;

      catalogSource = catalogSourceLabel(payload.source);
      catalogStatus = `${payload.count} VIA definitions via ${catalogSource}`;
      return payload;
    });
  }

  function loadCatalogSearchEffect(query = catalogQuery) {
    const requestId = ++catalogRequestId;
    catalogStatus = "Loading VIA index";

    return loadCatalogPayloadEffect().pipe(
      Effect.map((payload) => {
      if (requestId !== catalogRequestId) return;

      catalogItems = searchCatalogEntries(payload.items, query);
      catalogStatus = `${payload.count} VIA definitions via ${catalogSource}`;
      cloudStatus = catalogStatus;
      }),
      catchCauseCompat((cause) =>
        Effect.sync(() => {
          if (requestId !== catalogRequestId) return;
          catalogStatus = causeMessage(cause) || "Keyboard catalog unavailable";
          cloudStatus = catalogStatus;
        }),
      ),
    );
  }

  function scheduleCatalogSearch() {
    if (catalogSearchTimer) clearTimeout(catalogSearchTimer);
    catalogSearchTimer = setTimeout(() => {
      void runAppEffect("Keyboard catalog", loadCatalogSearchEffect(catalogQuery));
    }, 220);
  }

  function fetchCatalogEntryEffect(id: string) {
    const cached = catalogEntryCache.get(id);
    if (cached) return Effect.succeed(cached);

    return Effect.flatMap(loadCatalogPayloadEffect(), (payload) => {
    const summary = payload.items.find((candidate) => candidate.id === id || candidate.sourcePath === id);
      if (!summary) {
        return Effect.fail(new Error("Keyboard definition unavailable"));
      }

    includeCatalogItem(summary);
    catalogStatus = `Loading ${summary.name} layout`;
      return Effect.map(
        Effect.promise(() => Promise.resolve(getViaKeyboardDetail(summary.id))),
        (entry) => {
          catalogStatus = `${payload.count} VIA definitions via ${catalogSource}`;
          return cacheCatalogEntry(entry);
        },
      );
    });
  }

  function matchCatalogSummaryEffect(identity: CatalogIdentity) {
    return Effect.map(loadCatalogPayloadEffect(), (payload) =>
      bestCatalogEntryForIdentity(payload.items, identity),
    );
  }

  function matchCatalogEntryEffect(identity: CatalogIdentity) {
    const cached = bestCatalogEntryForIdentity([...catalogEntryCache.values()], identity);
    if (cached) return Effect.succeed(cached);

    return Effect.flatMap(matchCatalogSummaryEffect(identity), (summary) =>
      summary ? fetchCatalogEntryEffect(summary.id) : Effect.succeed(undefined),
    );
  }

  function matrixHintForConnectionEffect(identity: CatalogIdentity) {
    return matchCatalogSummaryEffect(identity).pipe(
      catchCauseCompat(() => Effect.succeed(undefined)),
      Effect.flatMap((summary) => {
        if (summary) return Effect.succeed(summary.matrix);

        return loadLocalDeviceEffect(identityStorageKey(identity)).pipe(
          catchCauseCompat(() => Effect.succeed(undefined)),
          Effect.map((storedProfile) => {
            if (storedProfile) return storedProfile.matrix;
            if (device.identity?.key === identityStorageKey(identity) || selectedCatalogId) return device.matrix;

            return undefined;
          }),
        );
      }),
    );
  }

  async function matrixHintForConnection(identity: CatalogIdentity) {
    return Effect.runPromise(matrixHintForConnectionEffect(identity));
  }

  function loadCatalogEntryEffect(entry: KeyboardCatalogEntry) {
    return Effect.tryPromise(async () => {
    const beforeProfile = snapshotDevice();
    const profile =
      liveKeyboardConnected && connection.detection
        ? await Effect.runPromise(
            profileFromDetectionEffect(
              profileFromCatalog(entry, connection.detection.layerCount ?? 4),
              connection.detection,
            ),
          )
        : profileFromCatalog(entry);
    selectedCatalogId = entry.id;
    setBaseProfile(profile);
    applyDeviceProfile(profile);
    store.liveProfileResolved = liveKeyboardConnected ? true : store.liveProfileResolved;
    activeForkId = "main";
    recordWrite(
      "Catalog load",
      entry.name,
      beforeProfile,
      {
        operation: "catalog.load",
        payload: { catalogId: entry.id, name: entry.name },
      },
    );
      await Effect.runPromise(Effect.all([saveLocalDeviceEffect(profile), clearLocalDraftEffect(profile.id)]));
    localStatus =
      liveKeyboardConnected && connection.detection?.keymap
        ? `Loaded ${entry.name} and imported current VIA keymap`
        : `Loaded ${entry.name} from catalog`;
    cloudStatus = catalogStatus;
    if (liveKeyboardConnected && !connection.detection?.keymap) {
      showNotice(`Loaded ${entry.name}. Reconnect with WebHID to import the current keymap.`, "info");
    }
    });
  }

  function normalizeKeycode(value: string, fallback = "KC_NO") {
    const trimmed = value.trim();
    return trimmed ? normalizeQmkKeycode(trimmed.replace(/\s+/g, "").toUpperCase()) : fallback;
  }

  function normalizeOptionalKeycode(value: string) {
    const normalized = normalizeKeycode(value, "");
    return normalized || undefined;
  }

  function hexId(value?: number) {
    return typeof value === "number" ? value.toString(16).padStart(4, "0") : "unknown";
  }

  function keyboardSlug(value: string) {
    return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-") || "keyboard";
  }

  function identityStorageKey(identity: CatalogIdentity) {
    const serial = identity.serialNumber?.trim();
    if (serial) return `keyboard:${hexId(identity.vendorId)}:${hexId(identity.productId)}:${serial}`;
    return `keyboard:${hexId(identity.vendorId)}:${hexId(identity.productId)}:${keyboardSlug(identity.productName ?? "keyboard")}`;
  }

  function snapshotDeviceEffect(profile: DeviceProfile = device) {
    return normalizeDeviceKeycodesEffect(profile);
  }

  function snapshotDevice(profile: DeviceProfile = device) {
    return Effect.runSync(snapshotDeviceEffect(profile));
  }

  function touchDevice() {
    device.updatedAt = new Date().toISOString();
  }

  function showNotice(message: string, tone: AppNoticeTone = "info") {
    showAppToast(message, tone);
  }

  function connectionResultMessage(nextConnection: ConnectionState) {
    const label = nextConnection.transport === "webusb" ? "WebUSB" : "WebHID";

    if (nextConnection.status === "connected") {
      return `Connected ${nextConnection.productName ?? `${label} keyboard`}.`;
    }

    if (nextConnection.message === "No device selected") {
      return `No ${label} keyboard selected. If no chooser opened, use Chrome/Edge and click the button directly from this page.`;
    }

    if (nextConnection.status === "unsupported") {
      return `${label} is unavailable in this browser. Try Chrome or Edge on localhost/HTTPS.`;
    }

    return nextConnection.message;
  }

  function layerIndex(layerId: string) {
    return device.layers.findIndex((layer) => layer.id === layerId);
  }

  function patchConnectionKeymap(layer: number, row: number, col: number, keycode: number) {
    const detection = connection.detection;
    const keymap = detection?.keymap;
    if (!detection || !keymap?.[layer]?.[row]) return;

    const nextKeymap = keymap.map((layerRows, layerIndex) =>
      layerIndex === layer
        ? layerRows.map((cols, rowIndex) =>
            rowIndex === row
              ? cols.map((value, colIndex) => (colIndex === col ? keycode : value))
              : [...cols],
          )
        : layerRows.map((cols) => [...cols]),
    );

    store.connection = {
      ...connection,
      detection: {
        ...detection,
        keymap: nextKeymap,
      },
    };
  }

  function markBindingSavedToBase(layerId: string, keyId: string, binding: KeyBinding) {
    const nextBase = cloneDevice(baseProfile);
    const layer = nextBase.layers.find((candidate) => candidate.id === layerId);
    if (!layer) return;

    layer.bindings[keyId] = { ...binding };
    nextBase.updatedAt = new Date().toISOString();
    setBaseProfile(nextBase);
    void runAppEffect("Save VIA base", saveLocalDeviceEffect(nextBase));
  }

  function rollbackBindingIfCurrent(
    layerId: string,
    keyId: string,
    attemptedCode: string,
    beforeBinding: KeyBinding,
  ) {
    const layer = device.layers.find((candidate) => candidate.id === layerId);
    if (!layer || layer.bindings[keyId]?.code !== attemptedCode) return;

    layer.bindings[keyId] = { ...beforeBinding };
    touchDevice();
  }

  function keyLocationName(key: KeyboardKey) {
    if (/^R\d+C\d+$/i.test(key.label)) return `row ${key.row + 1} col ${key.col + 1}`;
    return key.label;
  }

  function enqueueLiveKeymapWrite(input: {
    action: string;
    beforeProfile: DeviceProfile;
    code: string;
    keyId: string;
    layerId: string;
    value: string;
  }) {
    const key = keyById(device, input.keyId);
    const sourceLayerIndex = layerIndex(input.layerId);
    const sourceLayer = device.layers[sourceLayerIndex];
    const keycode = qmkKeycodeValue(input.code);

    if (!sourceLayer || !key) {
      localStatus = `${input.action} staged locally · ${input.value}`;
      cloudStatus = "Not saved to VIA: key target is missing";
      return;
    }

    if (keycode === undefined) {
      localStatus = `${input.action} staged locally · ${input.value}`;
      cloudStatus = `Not saved to VIA yet: ${input.value} is not a supported VIA keycode`;
      return;
    }

    const writeConnection = connection;
    const beforeBinding = input.beforeProfile.layers.find((layer) => layer.id === input.layerId)
      ?.bindings[input.keyId] ?? { code: "KC_NO" };
    const savedBinding = { ...sourceLayer.bindings[input.keyId] };
    const locationLabel = `${sourceLayer.name} ${keyLocationName(key)}`;
    const bindingLabel = displayCode(input.code);

    localStatus = `${input.action} saving · ${input.value}`;
    cloudStatus = `Saving ${locationLabel} to VIA`;

    const runWrite = viaWriteQueue.then(async () => {
      await Effect.runPromise(
        writeViaKeycodeEffect(writeConnection, {
          col: key.col,
          keycode,
          layer: sourceLayerIndex,
          row: key.row,
        }),
      );

      patchConnectionKeymap(sourceLayerIndex, key.row, key.col, keycode);
      markBindingSavedToBase(input.layerId, input.keyId, savedBinding);
      localStatus = `VIA saved ${locationLabel}`;
      cloudStatus = `VIA readback ok · ${input.value}`;
      showNotice(`Saved ${locationLabel} -> ${bindingLabel} to keyboard.`, "success");
    });

    viaWriteQueue = runWrite.catch((error: unknown) => {
      rollbackBindingIfCurrent(input.layerId, input.keyId, input.code, beforeBinding);
      const message = errorMessage(error);
      cloudStatus = `VIA save failed: ${message}`;
      showNotice(`VIA save failed: ${message}`, "error");
    });
  }

  /**
   * Validates an in-flight write against the VIA protocol + the current
   * profile, and rolls back the optimistic change if the packet would be
   * rejected. Always runs — there is no production short-circuit. The
   * `mock-device.ts` capture/validator is the single source of truth for
   * "is this packet well-formed?", regardless of whether a real device or
   * a Playwright HID fixture is attached.
   */
  function recordWrite(
    action: string,
    value: string,
    beforeProfile: DeviceProfile,
    packet: MockKeyboardPacket,
  ): boolean {
    touchDevice();

    const labeledPacket: MockKeyboardPacket = {
      label: `${action} ${selectedLayer.name}/${selectedKey?.label ?? "—"}: ${value}`,
      ...packet,
    };
    const capture = captureMockKeyboardPacket(
      { events: [], online: liveKeyboardConnected, rejected: 0, sequence: 0 },
      beforeProfile,
      device,
      labeledPacket,
      { keyId: selectedKeyId, layerId: selectedLayerId },
    );
    const event = capture.events[0];

    if (event && !event.accepted) {
      applyDeviceProfile(beforeProfile);
      const reason = event.errors[0] ?? "Packet rejected";
      cloudStatus = reason;
      showNotice(`${action} rejected: ${reason}`, "error");
      return false;
    }

    if (liveKeyboardConnected && labeledPacket.operation === "keymap.write") {
      enqueueLiveKeymapWrite({
        action,
        beforeProfile,
        code: value,
        keyId: selectedKeyId,
        layerId: selectedLayerId,
        value,
      });
      return true;
    }

    localStatus = `${action} staged locally · ${value}`;
    cloudStatus = liveKeyboardConnected
      ? "Local only: this edit is not writable through the VIA keymap protocol"
      : cloudStatus;
    return true;
  }

  function displayCode(code: string) {
    const normalized = normalizeQmkKeycode(code);
    return displayAliases[normalized] ?? qmkKeycodeLabel(normalized);
  }

  // Well-known shortcuts → their action name. Shown on the cap so users see
  // what the key DOES instead of which keys it sends. The map is split by
  // target OS because Ctrl+C on macOS is NOT Copy — only Cmd+C is. The
  // active `targetOS` chooses which entries to surface; everything else
  // falls through to symbol notation so we never mislabel a key.
  // Keys are the canonical `displayCode` form (LCTL/LCS/LGUI sans KC_).
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

  // Picked dynamically based on `targetOS`. On mac, only Cmd-based labels
  // are surfaced; on Win/Linux, only Ctrl-based. Unmatched codes fall back
  // to symbol notation (^⇧8) below.
  const activeShortcutLabels = $derived<Record<string, string>>(
    targetOS === "mac" ? CMD_SHORTCUTS : CTRL_SHORTCUTS,
  );

  // QMK modifier-combined aliases → keyboard-mod symbols. The L/R prefix
  // is dropped on the cap because most users don't care which side fired
  // (the raw mnemonic is still visible in the inspector + source view).
  const MOD_SYMBOLS: Record<string, string> = {
    LCTL: "⌃", RCTL: "⌃",
    LSFT: "⇧", RSFT: "⇧",
    LALT: "⌥", RALT: "⌥",
    LGUI: "⌘", RGUI: "⌘",
    LCS: "⌃⇧",
    LCA: "⌃⌥",
    LSA: "⇧⌥",
    MEH: "⌃⇧⌥",
    LCG: "⌃⌘",
    LSG: "⇧⌘",
    LCSG: "⌃⇧⌘",
    LAG: "⌥⌘",
    LCAG: "⌃⌥⌘",
    LSAG: "⇧⌥⌘",
    HYPR: "⌃⇧⌥⌘",
  };
  const MOD_PATTERN = new RegExp(`^(${Object.keys(MOD_SYMBOLS).join("|")})\\((.+)\\)$`);
  const MOD_TAP_PATTERN = /^(LCTL|RCTL|LSFT|RSFT|LALT|RALT|LGUI|RGUI)_T\((.+)\)$/;
  const LAYER_TAP_PATTERN = /^LT\((\d+),\s*(.+)\)$/;

  // Resolve the human label for the inner key of a mod-combined code.
  // The inner may already have KC_ stripped (e.g. "EQL"), so try the
  // bare form first and fall back to KC_-prefixed lookup.
  function innerLabel(inner: string): string {
    const direct = displayCode(inner);
    if (direct !== inner) return direct;
    const prefixed = displayCode(`KC_${inner}`);
    if (prefixed !== `KC_${inner}`) return prefixed;
    return inner;
  }

  // What actually shows on the keycap. For well-known shortcuts we show
  // the action NAME (LCTL(C) → "Copy", LCTL(V) → "Paste"). For any other
  // mod-combined code we render the resulting shortcut as symbols
  // (LCS(8) → ⌃⇧8) so the cap still shows what the key produces. Mod-tap
  // and layer-tap get a separator since they're two actions (tap vs hold).
  function compactKeycapCode(code: string) {
    const display = displayCode(code);
    if (display === "TRNS") return "-";

    const named = activeShortcutLabels[display];
    if (named) return named;

    const mod = MOD_PATTERN.exec(display);
    if (mod) return `${MOD_SYMBOLS[mod[1]]}${innerLabel(mod[2])}`;

    const modTap = MOD_TAP_PATTERN.exec(display);
    if (modTap) {
      const symbol = MOD_SYMBOLS[modTap[1]] ?? modTap[1];
      return `${innerLabel(modTap[2])}·${symbol}`;
    }

    const layerTap = LAYER_TAP_PATTERN.exec(display);
    if (layerTap) return `${innerLabel(layerTap[2])}·L${layerTap[1]}`;

    return display;
  }

  function keycapLabelSize(label: string) {
    if (label.length > 12) return "xs";
    if (label.length > 7 || (label.length > 5 && /[()/+]/.test(label))) return "sm";
    return "md";
  }

  function capLegend(binding: RenderedBinding) {
    return binding.keycap.slice(0, 5);
  }

  function keyComboTitle(keyId: string) {
    return comboSummariesByKeyId.get(keyId) ?? "";
  }

  function keyCombosFor(keyId: string) {
    return keyCombosById.get(keyId) ?? [];
  }

  function keyLayerActivationsFor(keyId: string) {
    return layerActivationsByKeyId.get(keyId) ?? [];
  }

  function keyLayerActivationTitle(keyId: string) {
    return keyLayerActivationsFor(keyId).map(layerActivationSummary).join("\n");
  }

  function hasLayerActivationChain(activations: LayerActivation[]) {
    return activations.some((activation) => activation.chain);
  }

  function comboConnectorActive(connector: ComboConnector) {
    return hoveredComboKeyId ? connector.keyIds.includes(hoveredComboKeyId) : false;
  }

  function clampKeymapZoom(value: number) {
    return Math.min(1.8, Math.max(0.55, Math.round(value * 100) / 100));
  }

  function onKeymapWheel(event: WheelEvent) {
    event.preventDefault();
    const factor = Math.exp(-event.deltaY * 0.0015);
    keymapZoom = clampKeymapZoom(keymapZoom * factor);
  }

  function onKeymapPointerDown(event: PointerEvent) {
    if (event.button !== KEYMAP_PAN_BUTTON) return;
    event.preventDefault();
    const stage = event.currentTarget as HTMLElement;
    keymapPanState = {
      stage,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: stage.scrollLeft,
      scrollTop: stage.scrollTop,
    };
    keymapIsPanning = false;
    suppressNextKeymapClick = false;
    window.addEventListener("pointermove", onKeymapPointerMove, { passive: false });
    window.addEventListener("pointerup", finishKeymapPan);
    window.addEventListener("pointercancel", cancelKeymapPan);
  }

  function onKeymapPointerMove(event: PointerEvent) {
    if (!keymapPanState || event.pointerId !== keymapPanState.pointerId) return;
    const deltaX = event.clientX - keymapPanState.startX;
    const deltaY = event.clientY - keymapPanState.startY;

    if (!keymapIsPanning) {
      if (Math.hypot(deltaX, deltaY) < KEYMAP_PAN_THRESHOLD) return;
      keymapIsPanning = true;
      suppressNextKeymapClick = true;
    }

    event.preventDefault();
    keymapPanState.stage.scrollLeft = keymapPanState.scrollLeft - deltaX;
    keymapPanState.stage.scrollTop = keymapPanState.scrollTop - deltaY;
  }

  function finishKeymapPan(event: PointerEvent) {
    if (!keymapPanState || event.pointerId !== keymapPanState.pointerId) return;
    const wasPanning = keymapIsPanning;
    removeKeymapPanListeners();
    if (!wasPanning) suppressNextKeymapClick = false;
    if (suppressNextKeymapClick) window.setTimeout(() => (suppressNextKeymapClick = false), 0);
    keymapPanState = undefined;
    keymapIsPanning = false;
  }

  function cancelKeymapPan(event?: PointerEvent) {
    if (keymapPanState && event && event.pointerId !== keymapPanState.pointerId) return;
    removeKeymapPanListeners();
    keymapPanState = undefined;
    keymapIsPanning = false;
  }

  function removeKeymapPanListeners() {
    if (!browser) return;
    window.removeEventListener("pointermove", onKeymapPointerMove);
    window.removeEventListener("pointerup", finishKeymapPan);
    window.removeEventListener("pointercancel", cancelKeymapPan);
  }

  function onKeymapKeyClick(event: MouseEvent) {
    if (!suppressNextKeymapClick) return;
    event.preventDefault();
    event.stopPropagation();
    suppressNextKeymapClick = false;
  }

  function onKeymapKeyAuxClick(event: MouseEvent) {
    if (event.button !== KEYMAP_PAN_BUTTON && !suppressNextKeymapClick) return;
    event.preventDefault();
    event.stopPropagation();
    suppressNextKeymapClick = false;
  }

  function resetKeymapZoom() {
    keymapZoom = 1;
  }

  const forkLaneColors = ["var(--coral)", "var(--mustard)", "var(--lilac)", "var(--mint)", "var(--teal)"];

  function forkLaneColor(forkId: string) {
    const index = forks.findIndex((fork) => fork.id === forkId);
    return index >= 0 ? forkLaneColors[index % forkLaneColors.length] : "var(--ink-3)";
  }

  function isModifierKey(key: KeyboardKey) {
    return ["Alt", "Caps", "Ctrl", "Fn", "Gui", "Menu", "Shift"].includes(key.label);
  }

  function isAccentKey(key: KeyboardKey) {
    return key.label === "Space" || key.label === "Enter";
  }

  function resolveRenderedBinding(layerId: string, keyId: string): RenderedBinding {
    const fallbackLayer = device.layers[0];
    const layer = device.layers.find((candidate) => candidate.id === layerId) ?? fallbackLayer;
    const rawBinding = bindingFor(device, layer.id, keyId);
    const transparent = layer.id !== fallbackLayer.id && rawBinding.code === "KC_TRNS";
    const visibleBinding = transparent && showFallthrough ? bindingFor(device, fallbackLayer.id, keyId) : rawBinding;
    const sourceLayer = transparent && showFallthrough ? fallbackLayer : layer;

    const display = displayCode(visibleBinding.code);
    const keycap = compactKeycapCode(visibleBinding.code);

    return {
      ...visibleBinding,
      display,
      keycap,
      rawCode: rawBinding.code,
      sourceColor: sourceLayer.color,
      sourceLayerId: sourceLayer.id,
      sourceLayerName: sourceLayer.name,
      transparent,
    };
  }

  function layerLink(layerId: string) {
    return navHref(editorRoute, { layer: layerId });
  }

  function keyLink(keyId: string) {
    return navHref("keymap", { layer: selectedLayerId, key: keyId, bind: inspectorTab, mode: "bind" });
  }

  function keymapModeLink(mode: KeymapMode) {
    return navHref("keymap", { layer: selectedLayerId, key: selectedKeyId, mode });
  }

  function inspectorLink(tab: InspectorTab) {
    return navHref("keymap", { layer: selectedLayerId, key: selectedKeyId, bind: tab });
  }

  function logicLink(tab: LogicTab) {
    return navHref("logic", { logic: tab });
  }

  function syncSelectionSearch(layerId?: string, keyId?: string | null) {
    const layer =
      layerId ??
      (store.device.layers.some((l) => l.id === selectedLayerId)
        ? selectedLayerId
        : (store.device.layers[0]?.id ?? selectedLayerId));
    const key =
      keyId === null
        ? null
        : keyId !== undefined
          ? keyId || null
          : selectedKeyId && store.device.keys.some((k) => k.id === selectedKeyId)
            ? selectedKeyId
            : null;
    replaceSearch({ layer, key });
  }

  function onVersionMainScroll(event: Event) {
    const node = event.currentTarget as HTMLElement;
    if (node.scrollTop > 48) {
      changesPanelOpen = false;
    }
  }

  // --- Layer rename --------------------------------------------------------
  // Svelte action: focus + select the input when it mounts. Used by the
  // inline layer-rename input so users can start typing immediately.
  function focusOnMount(node: HTMLInputElement) {
    node.focus();
    node.select();
  }

  function startRenameLayer(layerId: string) {
    const layer = device.layers.find((candidate) => candidate.id === layerId);
    if (!layer) return;
    renamingLayerId = layerId;
    layerNameDraft = layer.name;
  }

  function commitRenameLayer() {
    const layerId = renamingLayerId;
    if (!layerId) return;
    const trimmed = layerNameDraft.trim();
    const layer = device.layers.find((candidate) => candidate.id === layerId);
    renamingLayerId = undefined;
    if (!layer || trimmed.length === 0 || trimmed === layer.name) return;
    const beforeProfile = snapshotDevice();
    layer.name = trimmed;
    recordWrite(`Rename layer ${layerId}`, trimmed, beforeProfile, {
      operation: "layer.rename",
      payload: { layerId, name: trimmed },
    });
  }

  function cancelRenameLayer() {
    renamingLayerId = undefined;
  }

  function setSelectedCode(code: string, macroId?: string) {
    const layer = device.layers.find((candidate) => candidate.id === selectedLayerId);
    if (!layer) return false;

    const normalizedCode = normalizeKeycode(code);
    const previousBinding = bindingFor(device, selectedLayerId, selectedKeyId);
    if (previousBinding.code === normalizedCode && previousBinding.macroId === macroId) return true;
    const beforeProfile = snapshotDevice();

    const nextBinding: KeyBinding = { ...previousBinding, code: normalizedCode };
    if (macroId) nextBinding.macroId = macroId;
    else delete nextBinding.macroId;

    layer.bindings[selectedKeyId] = nextBinding;
    return recordWrite("Keymap write", normalizedCode, beforeProfile, {
      operation: "keymap.write",
      payload: { code: normalizedCode },
    });
  }

  function bindLogicOption(item: LogicBindingOption) {
    if (!item.code) return;
    if (item.kind === "macro") setSelectedCode(item.code, item.macroId);
    else setSelectedCode(item.code);
  }

  function setHoldTap(kind: "tap" | "hold", value: string) {
    const layer = device.layers.find((candidate) => candidate.id === selectedLayerId);
    if (!layer) return false;

    const normalizedValue = normalizeOptionalKeycode(value);
    const previousBinding = bindingFor(device, selectedLayerId, selectedKeyId);
    if (previousBinding[kind] === normalizedValue) return true;
    const beforeProfile = snapshotDevice();

    layer.bindings[selectedKeyId] = {
      ...previousBinding,
      [kind]: normalizedValue,
    };
    return recordWrite(`${kind === "tap" ? "Tap" : "Hold"} behavior`, normalizedValue ?? "none", beforeProfile, {
      operation: "behavior.write",
      payload: { code: layer.bindings[selectedKeyId]?.code ?? "KC_NO", kind, value: normalizedValue ?? null },
    });
  }

  function updateSetting<T extends keyof DeviceProfile["settings"]>(key: T, value: DeviceProfile["settings"][T]) {
    if (store.device.settings[key] === value) return;
    const beforeProfile = snapshotDevice();
    store.device.settings[key] = value;
    recordWrite("Setting write", `${key}=${String(value)}`, beforeProfile, {
      operation: "setting.write",
      payload: { key, value: String(value) },
      target: { path: `settings.${String(key)}` },
    });
  }

  $effect(() => {
    const current = store.device.settings.splitTransport;
    const safe = normalizeSplitTransport(current, store.device);
    if (current !== safe) updateSetting("splitTransport", safe);
  });

  function updateLighting<T extends GlobalLightingKey>(key: T, value: DeviceProfile["lighting"][T]) {
    if (store.device.lighting[key] === value) return;
    const beforeProfile = snapshotDevice();
    store.device.lighting[key] = value;
    recordWrite("Lighting write", `${key}=${String(value)}`, beforeProfile, {
      operation: "lighting.write",
      payload: { key, value: String(value) },
      target: { path: `lighting.${String(key)}` },
    });
  }

  function defaultKeyLighting(): KeyLighting {
    return {
      hue: device.lighting.hue,
      saturation: device.lighting.saturation,
      brightness: device.lighting.brightness,
    };
  }

  function keyLightingFor(keyId: string): KeyLighting {
    return device.lighting.keys?.[keyId] ?? defaultKeyLighting();
  }

  function hasKeyLightingOverride(keyId: string) {
    return Boolean(device.lighting.keys?.[keyId]);
  }

  function keyRgbStyle(keyId: string) {
    const rgb = keyLightingFor(keyId);
    const light = 0.52 + (rgb.brightness / 100) * 0.28;
    const chroma = ((rgb.saturation / 100) * 0.2).toFixed(3);
    return `oklch(${light.toFixed(3)} ${chroma} ${rgb.hue})`;
  }

  function applyKeyLightingBatch(keyIds: readonly string[], next: KeyLighting) {
    if (keyIds.length === 0) return;
    const beforeProfile = snapshotDevice();
    store.device.lighting.keys ??= {};
    let changed = false;
    for (const keyId of keyIds) {
      const existing = device.lighting.keys[keyId];
      if (
        existing?.hue === next.hue &&
        existing?.saturation === next.saturation &&
        existing?.brightness === next.brightness
      ) {
        continue;
      }
      store.device.lighting.keys[keyId] = { ...next };
      changed = true;
    }
    if (!changed) return;
    recordWrite("Key RGB batch", `${keyIds.length} keys`, beforeProfile, {
      operation: "lighting.key.write",
      payload: { keyIds: [...keyIds], ...next },
      target: { path: "lighting.keys.batch" },
    });
  }

  function clearKeyLightingBatch(keyIds: readonly string[]) {
    if (keyIds.length === 0 || !device.lighting.keys) return;
    const beforeProfile = snapshotDevice();
    const nextKeys = { ...device.lighting.keys };
    let changed = false;
    for (const keyId of keyIds) {
      if (!(keyId in nextKeys)) continue;
      delete nextKeys[keyId];
      changed = true;
    }
    if (!changed) return;
    store.device.lighting.keys = nextKeys;
    recordWrite("Key RGB batch clear", `${keyIds.length} keys`, beforeProfile, {
      operation: "lighting.key.write",
      payload: { keyIds: [...keyIds], clear: true },
      target: { path: "lighting.keys.batch" },
    });
  }

  function onRgbKeyPointerDown(event: PointerEvent, keyId: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    if (event.shiftKey) rgbSelection.add(keyId);
    else if (event.metaKey || event.ctrlKey) rgbSelection.toggle(keyId);
    else rgbSelection.selectOnly(keyId);
    rgbBrush = keyLightingFor(keyId);
  }

  function onRgbBrushChange(patch: Partial<KeyLighting>) {
    rgbBrush = { ...rgbBrush, ...patch };
    applyKeyLightingBatch([...rgbSelection.ids], rgbBrush);
  }

  function applyBoardColorToSelection() {
    rgbBrush = defaultKeyLighting();
    applyKeyLightingBatch([...rgbSelection.ids], rgbBrush);
  }

  function clearRgbOverridesOnSelection() {
    clearKeyLightingBatch([...rgbSelection.ids]);
  }


  function addMacroFromKey() {
    if (!selectedKey || !selectedKeyId) return;
    addMacro({ bindToKey: true });
  }

  function addMacro(options: { bindToKey?: boolean } = {}) {
    const bindToKey = options.bindToKey ?? false;
    const id = crypto.randomUUID();
    const macroIndex = device.macros.length;
    const layer = bindToKey ? device.layers.find((candidate) => candidate.id === selectedLayerId) : undefined;
    const beforeProfile = snapshotDevice();

    store.device.macros = [
      ...store.device.macros,
      {
        id,
        name: `Macro ${macroIndex + 1}`,
        sequence: ["KC_LCTL", "KC_LSFT", "KC_P"],
        trigger: bindToKey && selectedKey ? selectedKey.label : "Unassigned",
      },
    ];

    if (bindToKey && layer && selectedKeyId) {
      const code = macroBindingCode(macroIndex);
      layer.bindings[selectedKeyId] = {
        ...bindingFor(device, selectedLayerId, selectedKeyId),
        code,
        macroId: id,
      };
    }
    const code = macroBindingCode(macroIndex);
    const accepted = recordWrite("Macro write", code, beforeProfile, {
      operation: "macro.write",
      payload: { code, macroId: id, macroIndex },
    });
    if (!accepted) return;
  }

  function addCombo() {
    const id = crypto.randomUUID();
    const comboIndex = device.combos.length;
    const beforeProfile = snapshotDevice();
    const keys = device.keys.slice(0, 2).map((key) => key.id);

    store.device.combos = [
      ...store.device.combos,
      {
        id,
        name: `Combo ${comboIndex + 1}`,
        keys,
        binding: "KC_NO",
      },
    ];
    recordWrite("Combo write", id, beforeProfile, {
      operation: "feature.write",
      payload: { capability: "combos", comboId: id, comboIndex },
    });
  }

  function updateCombo(
    id: string,
    patch: Partial<Pick<Combo, "name" | "keys" | "binding" | "layerIds">>,
  ) {
    const current = device.combos.find((combo) => combo.id === id);
    if (!current) return;

    const validKeyIds = new Set(device.keys.map((key) => key.id));
    const validLayerIds = new Set(device.layers.map((layer) => layer.id));
    const nextKeys =
      "keys" in patch
        ? Array.from(new Set(patch.keys ?? [])).filter((keyId) => validKeyIds.has(keyId))
        : current.keys;
    if (nextKeys.length < 2) return;

    const rawLayerIds =
      "layerIds" in patch
        ? patch.layerIds
        : current.layerIds;
    const nextLayerIds = rawLayerIds
      ? Array.from(new Set(rawLayerIds)).filter((layerId) => validLayerIds.has(layerId))
      : undefined;
    const normalizedLayerIds =
      nextLayerIds && nextLayerIds.length > 0 && nextLayerIds.length < device.layers.length
        ? nextLayerIds
        : undefined;

    const next: Combo = {
      ...current,
      name: "name" in patch ? (patch.name ?? current.name) : current.name,
      keys: nextKeys,
      binding:
        "binding" in patch
          ? normalizeKeycode(patch.binding ?? current.binding, "KC_NO")
          : current.binding,
      layerIds: normalizedLayerIds,
    };

    const unchanged =
      next.name === current.name &&
      next.binding === current.binding &&
      next.keys.join("|") === current.keys.join("|") &&
      (next.layerIds ?? []).join("|") === (current.layerIds ?? []).join("|");
    if (unchanged) return;

    const beforeProfile = snapshotDevice();
    store.device.combos = store.device.combos.map((combo) => (combo.id === id ? next : combo));
    recordWrite("Combo update", next.name || id, beforeProfile, {
      operation: "feature.write",
      payload: {
        capability: "combos",
        comboId: id,
        name: next.name,
        binding: next.binding,
        keys: next.keys,
        layerIds: next.layerIds ?? [],
      },
      target: { path: `combos.${id}` },
    });
  }

  function removeCombo(id: string) {
    if (!device.combos.some((combo) => combo.id === id)) return;
    const beforeProfile = snapshotDevice();
    store.device.combos = store.device.combos.filter((combo) => combo.id !== id);
    recordWrite("Combo remove", id, beforeProfile, {
      operation: "feature.write",
      payload: { capability: "combos", comboId: id, remove: true },
      target: { path: `combos.${id}` },
    });
  }

  function addTapDance() {
    const id = crypto.randomUUID();
    const keyId = device.keys[0]?.id;
    if (!keyId) return;
    const beforeProfile = snapshotDevice();

    store.device.tapDances = [
      ...store.device.tapDances,
      {
        id,
        keyId,
        tap: "KC_NO",
        hold: "KC_NO",
        doubleTap: "KC_NO",
      },
    ];
    recordWrite("Tap dance write", id, beforeProfile, {
      operation: "feature.write",
      payload: { capability: "tapDance", tapDanceId: id },
    });
  }

  function addLogicEntry() {
    if (logicTab === "macros") addMacro();
    else if (logicTab === "combos") addCombo();
    else addTapDance();
  }

  const logicTabItems = $derived<SegmentItem<LogicTab>[]>([
    { value: "macros", label: "Macros", href: logicLink("macros") },
    { value: "combos", label: "Combos", href: logicLink("combos") },
    { value: "tapDance", label: "Tap Dance", href: logicLink("tapDance") },
  ]);

  /** Reads the layer color and resolves CSS-var references (`var(--coral)`)
   * to a real hex by reading the computed `--coral` from `:root`. The native
   * color input requires `#rrggbb`. Falls back to the input string if it
   * already looks like hex. */
  function resolveLayerColor(value: string): string {
    if (value.startsWith("#") && value.length === 7) return value;
    if (typeof document === "undefined") return "#808080";
    const match = value.match(/var\((--[^)]+)\)/);
    if (!match) return value;
    const computed = getComputedStyle(document.documentElement)
      .getPropertyValue(match[1])
      .trim();
    if (computed.startsWith("#") && computed.length === 7) return computed;
    // For oklch/non-hex values, paint into a probe element and read RGB.
    const probe = document.createElement("span");
    probe.style.color = computed;
    document.body.appendChild(probe);
    const rgb = getComputedStyle(probe).color;
    document.body.removeChild(probe);
    const m = rgb.match(/\d+/g);
    if (!m || m.length < 3) return "#808080";
    return (
      "#" +
      m
        .slice(0, 3)
        .map((n) => Number(n).toString(16).padStart(2, "0"))
        .join("")
    );
  }

  function shortHexFromValue(hex: string): string {
    return hex.toUpperCase().replace(/^#/, "");
  }

  function setLayerColor(index: number, hex: string) {
    const layer = device.layers[index];
    if (!layer || layer.color === hex) return;
    const beforeProfile = snapshotDevice();
    layer.color = hex;
    recordWrite("Layer color", hex, beforeProfile, {
      operation: "feature.write",
      payload: { capability: "lighting", layerId: layer.id, color: hex },
      target: { path: `layers.${layer.id}.color` },
    });
  }

  function forgetDevice() {
    void runAppEffect(
      "Forget device",
      Effect.tryPromise(async () => {
        const productName = connection.productName ?? "keyboard";
        const nextConnection = await Effect.runPromise(
          forgetGrantedKeyboardEffect({
            vendorId: connection.vendorId,
            productId: connection.productId,
            serialNumber: connection.serialNumber,
          }),
        );
        store.connection = nextConnection;
        store.liveProfileResolved = false;
        showNotice(
          `Forgot ${productName}. Click Connect to re-pair.`,
          "success",
        );
      }),
    );
  }

  function enterPreviewMode() {
    store.previewMode = true;
    showNotice("Preview mode — edits stay local until you connect a real keyboard.", "info");
  }

  function triggerLoadProfile() {
    profileFileInput?.click();
  }

  function handleProfileFileChange(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ""; // allow re-picking the same file
    if (!file) return;

    void runAppEffect(
      "Load profile",
      Effect.tryPromise(async () => {
        const text = await file.text();
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch (error) {
          throw new Error(
            `${file.name} is not valid JSON (${error instanceof Error ? error.message : "parse error"}).`,
          );
        }
        const profile = await Effect.runPromise(decodeDeviceProfileFromStorageEffect(parsed));
        setBaseProfile(profile);
        applyDeviceProfile(profile);
        store.previewMode = true;
        showNotice(`Loaded ${profile.name} from ${file.name}.`, "success");
      }),
    );
  }

  function removeMacro(id: string) {
    const beforeProfile = snapshotDevice();
    store.device.macros = store.device.macros.filter((macro) => macro.id !== id);
    recordWrite("Macro remove", id, beforeProfile, {
      operation: "macro.remove",
      payload: { macroId: id },
      target: { path: `macros.${id}` },
    });
  }

  function createFork() {
    const fork: WorkspaceFork = {
      id: crypto.randomUUID(),
      name: `${device.name} fork ${forks.length + 1}`,
      baseProfileId: baseProfile.id,
      createdAt: new Date().toISOString(),
      device: snapshotDevice(),
    };

    forks = [fork, ...forks];
    activeForkId = fork.id;
  }

  function switchFork(fork: WorkspaceFork) {
    void runAppEffect("Switch fork", switchForkEffect(fork));
  }

  function switchForkEffect(fork: WorkspaceFork) {
    return Effect.map(normalizeDeviceKeycodesEffect(fork.device), (nextDevice) => {
      store.device = nextDevice;
      activeForkId = fork.id;
      syncSelectionSearch();
    });
  }

  function commitLocalBase() {
    return runAppEffect("Commit local base", commitLocalBaseEffect());
  }

  function commitLocalBaseEffect() {
    return Effect.tryPromise(async () => {
    const committedProfile = snapshotDevice();
    setBaseProfile(committedProfile);
      await Effect.runPromise(Effect.all([saveLocalDeviceEffect(committedProfile), clearLocalDraftEffect(committedProfile.id)]));
    localStatus = "SQLocal committed local base";
    cloudStatus = "Local base advanced";
    });
  }

  function resetDraft() {
    void runAppEffect("Reset draft", resetDraftEffect());
  }

  function resetDraftEffect() {
    return Effect.tryPromise(async () => {
      const resetProfile = Effect.runSync(
        normalizeDeviceKeycodesEffect(store.baseProfile),
      );
      store.device = resetProfile;
      syncSelectionSearch();
      await Effect.runPromise(clearLocalDraftEffect(resetProfile.id));
      localStatus = "SQLocal draft cleared";
    cloudStatus = "Draft reset";
    });
  }

  function profileMatchesCatalog(profile: DeviceProfile | undefined, entry: KeyboardCatalogEntry | undefined) {
    if (!profile || !entry) return false;
    return (
      profile.matrix.rows === entry.matrix.rows &&
      profile.matrix.cols === entry.matrix.cols &&
      profile.keys.length === entry.keys.length
    );
  }

  function applyConnectedKeyboard() {
    return runAppEffect("Apply connected keyboard", applyConnectedKeyboardEffect());
  }

  function applyConnectedKeyboardEffect() {
    return Effect.tryPromise(async () => {
    if (!connection.detection) return;

    const detection = connection.detection;
      const catalogEntry = await Effect.runPromise(
        matchCatalogEntryEffect(detection.identity).pipe(
          catchCauseCompat(() => Effect.succeed(undefined)),
        ),
      );
    const [existingProfile, existingDraft] = await Promise.all([
        Effect.runPromise(loadLocalDeviceEffect(detection.identity.key)),
        Effect.runPromise(loadLocalDraftEffect(detection.identity.key)),
    ]);
    const hasLiveKeymap = Boolean(detection.keymap);
    const existingMatchesCatalog = profileMatchesCatalog(existingProfile, catalogEntry);
    const shouldUseDetectedProfile =
      hasLiveKeymap || !existingProfile || Boolean(catalogEntry && !existingMatchesCatalog);

    if (!shouldUseDetectedProfile && existingProfile) {
      setBaseProfile(existingProfile);
      applyDeviceProfile(existingDraft ?? cloneDevice(existingProfile));
      selectedCatalogId = catalogEntry?.id ?? selectedCatalogId;
      activeForkId = "main";
      store.liveProfileResolved = true;
      localStatus = existingDraft
        ? `Loaded local draft for ${existingProfile.name}`
        : `Loaded saved profile for ${existingProfile.name}`;
      cloudStatus = detection.notes[0] ?? "Device auto-detected";
      showNotice(`Connected ${existingProfile.name} from saved layout.`, "success");
    } else {
      const catalogBase = catalogEntry
        ? profileFromCatalog(catalogEntry, detection.layerCount ?? 4)
        : existingProfile
          ? cloneDevice(existingProfile)
          : selectedCatalogId || hasLiveKeymap
            ? cloneDevice(device)
            : undefined;

      if (!catalogBase) {
        store.liveProfileResolved = false;
        selectedCatalogId = "";
        localStatus = `Choose a VIA definition for ${detection.identity.productName ?? "this keyboard"}`;
        cloudStatus = detection.notes[0] ?? "No matching VIA definition";
        showNotice(
          `Connected ${detection.identity.productName ?? "keyboard"}, but no matching VIA definition was found. Search the catalog and reconnect WebHID to import the current keymap.`,
          "error",
        );
        return;
      }

      const detectedProfile = await Effect.runPromise(profileFromDetectionEffect(catalogBase, detection));
      applyDeviceProfile(detectedProfile);
      selectedCatalogId = catalogEntry?.id ?? selectedCatalogId;
      setBaseProfile(detectedProfile);
      activeForkId = "main";
      store.liveProfileResolved = true;
      await Effect.runPromise(Effect.all([saveLocalDeviceEffect(detectedProfile), clearLocalDraftEffect(detectedProfile.id)]));
      localStatus = detection.keymap
        ? `Imported current VIA keymap for ${detectedProfile.name}`
        : `Seeded detected profile for ${detectedProfile.name}`;
      showNotice(
        detection.keymap
          ? `Matched ${catalogEntry?.name ?? detectedProfile.name} and imported the current VIA keymap.`
          : `Matched ${catalogEntry?.name ?? detectedProfile.name}. Live keymap import needs WebHID with a definition.`,
        detection.keymap ? "success" : "info",
      );
    }

    syncSelectionSearch(store.device.layers[0]?.id, null);
    cloudStatus = detection.notes[0] ?? "Device auto-detected";
    });
  }

  function refreshAuth() {
    return runAppEffect("Refresh auth", refreshAuthEffect());
  }

  function refreshAuthEffect() {
    if (dev) {
      return Effect.sync(() => {
        authSession = null;
        authStatus = "Local draft";
      });
    }

    return Effect.tryPromise(async () => {
      const result = await authClient.getSession();
      authSession = (result.data ?? null) as AuthSessionData;

      if (authSession?.user.id) {
        agentName = authSession.user.id;
        authStatus = authSession.user.name ?? authSession.user.email ?? "GitHub signed in";
      } else {
        authStatus = "Local draft";
      }
    }).pipe(
      catchCauseCompat((cause) =>
        Effect.sync(() => {
      authSession = null;
          authStatus = causeMessage(cause) || "Auth unavailable";
        }),
      ),
    );
  }

  function signInGithub() {
    return runAppEffect("GitHub sign-in", signInGithubEffect());
  }

  function signInGithubEffect() {
    return Effect.tryPromise(async () => {
    authStatus = "Opening GitHub";
    showNotice("Opening GitHub sign-in.", "info");

    if (dev) {
      authStatus = "GitHub auth requires Wrangler-backed dev. Run `vp run dev:worker` to use AuthAgent.";
      showNotice(authStatus, "error");
      return;
    }

      const result = await authClient.signIn.social({
        provider: "github",
        callbackURL: "/",
        disableRedirect: true,
      });

      if (result.error) {
        authStatus = result.error.message ?? "GitHub sign-in failed";
        showNotice(authStatus, "error");
        return;
      }

      const data = result.data as { redirect?: boolean; url?: string } | null;
      if (data?.url) {
        authStatus = "Redirecting to GitHub";
        showNotice("Redirecting to GitHub.", "success");
        globalThis.location.assign(data.url);
        return;
      }

      authStatus = "GitHub sign-in did not return a redirect URL";
      showNotice(authStatus, "error");
    }).pipe(
      catchCauseCompat((cause) =>
        Effect.sync(() => {
          authStatus = causeMessage(cause) || "GitHub sign-in failed";
          showNotice(authStatus, "error");
        }),
      ),
    );
  }

  function signOutGithub() {
    return runAppEffect("GitHub sign-out", signOutGithubEffect());
  }

  function signOutGithubEffect() {
    return Effect.tryPromise(async () => {
    authStatus = "Signing out";
    const result = await authClient.signOut();

    if (result.error) {
      authStatus = result.error.message ?? "Sign out failed";
      return;
    }

    authSession = null;
    agentName = "local-dev";
    authStatus = "Local draft";
    showNotice("Signed out of GitHub.", "success");
    });
  }

  function connect(transport: TransportKind) {
    return runAppEffect(`Connect ${transport === "webusb" ? "WebUSB" : "WebHID"}`, connectEffect(transport));
  }

  function runFirmwareAction() {
    if (!liveKeyboardConnected) return connect("webhid");
    showNotice(flashStatus ?? "Firmware flashing is unavailable.", "error");
  }

  function connectEffect(transport: TransportKind) {
    return Effect.tryPromise(async () => {
    const label = transport === "webusb" ? "WebUSB" : "WebHID";
    showNotice(`Choose a ${label} keyboard in the browser prompt.`, "info");
    store.connection = {
      ...store.connection,
      status: "requesting",
      transport,
      message: `Waiting for ${label} permission`,
    };
    store.liveProfileResolved = false;
      const nextConnection = await Effect.runPromise(connectKeyboardEffect(
      transport,
      [
        { vendorId: device.vendorId, productId: device.productId },
        { vendorId: device.vendorId },
      ],
      { resolveMatrixHint: matrixHintForConnection },
      ));
    store.connection = nextConnection;
    showNotice(
      connectionResultMessage(nextConnection),
      nextConnection.status === "connected" ? "success" : nextConnection.status === "error" ? "error" : "info",
    );

    if (nextConnection.status === "connected") {
      store.previewMode = false;
      await Effect.runPromise(applyConnectedKeyboardEffect());
    }
    });
  }

  function syncAgent() {
    return runAppEffect("Sync Agent", syncAgentEffect());
  }

  function syncAgentEffect() {
    return Effect.tryPromise(async () => {
      syncStatus = "syncing";
      cloudStatus = "Syncing Agent";
      const payload = {
        userId: syncIdentity,
        profile: device,
        changes: diffs,
      };

      const response = await fetch("/api/agent/snapshot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`Sync failed with status ${response.status}`);
      }
      const result = await response.json();
      await Effect.runPromise(
        recordSyncEffect(
          result.agentName ?? agentName,
          result.synced ? "synced" : "queued",
          result,
        ),
      );
      if (result.synced) {
        syncStatus = "ok";
        syncLastAt = new Date().toISOString();
        cloudStatus = `Agent ${result.agentName} synced`;
      } else {
        // The server returned 200 but flagged the save as not-yet-
        // persisted (e.g. missing binding). Surface as an error so the
        // user can retry instead of silently looking "ok".
        syncStatus = "error";
        cloudStatus = result.reason ?? "Sync queued — server unavailable";
      }
    }).pipe(
      catchCauseCompat((cause) =>
        Effect.sync(() => {
          syncStatus = "error";
          cloudStatus = causeMessage(cause) || "Agent sync failed";
        }),
      ),
    );
  }
</script>

<svelte:head>
  <title>Klakson - QMK/ZMK GUI</title>
  <meta
    name="description"
    content="A bright, split-aware QMK and ZMK keyboard workbench with VIA transport, local drafts, and git-like diffs."
  />
</svelte:head>

{#snippet appErrorBlock(errorBlock: AppErrorBlock)}
  <section class="app-error-block" data-testid="effect-error-block">
    <div class="error-icon">
      <Activity size={15} />
    </div>
    <div class="error-copy">
      <div class="error-title">
        <strong>{errorBlock.title}</strong>
        <span>{errorBlock.createdAt}</span>
      </div>
      <pre>{errorBlock.detail}</pre>
    </div>
    <Button
      variant="ghost"
      size="icon"
      type="button"
      aria-label="Dismiss error"
      title="Dismiss"
      onclick={() => clearAppError(errorBlock.id)}
    >
      <Trash2 size={14} />
    </Button>
  </section>
{/snippet}


{#snippet keymapPage()}
  {#if !workbenchReady}
    <section class="connect-view view-shell" data-testid="connect-screen">
        <div class="connect-onboarding">
          <div class="connect-copy">
            <Chip class="mono">{keyboardNeedsDefinition ? "LAYOUT" : "STEP 1"}</Chip>
            <h1>
              {#if keyboardNeedsDefinition}
                Choose a <span class="accent-word">layout</span>
              {:else if transportUnavailable}
                No <span class="accent-word">transport</span>
              {:else}
                <span class="accent-word">Connect</span> a keyboard
              {/if}
            </h1>
            <p>
              {keyboardNeedsDefinition
                ? "The keyboard is connected, but Klakson needs a matching VIA definition before it can safely place keys or import the live keymap."
                : transportUnavailable
                ? "Open this app in a browser with WebHID or WebUSB support to read a live VIA keyboard."
                : "Klakson opens the editor once it can read a live VIA keyboard over WebHID or WebUSB."}
            </p>
          </div>

          <Card.Root class="connect-card min-w-0">
            <Card.Content class="gap-3.5 p-4">
              {#if keyboardNeedsDefinition}
                <div class="definition-needed" data-testid="layout-resolution-needed">
                  Pick your board in the catalog above, then reconnect with WebHID.
                </div>
              {/if}

              <div class="flex flex-col gap-2.5">
                <Button
                  variant="coral"
                  size="sm"
                  class="connect-primary-cta h-11 w-full justify-between px-3.5"
                  data-testid="connect-webhid"
                  title="Preferred for VIA keymap reads and live reports"
                  onclick={() => connect("webhid")}
                  disabled={connection.status === "requesting"}
                >
                  <span class="font-medium">WebHID</span>
                  <span class="font-mono text-[11px] tracking-[0.04em] text-[#1c0a04]/70">Connect</span>
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  class="h-11 w-full justify-between px-3.5"
                  data-testid="connect-webusb"
                  title="Use when the board exposes USB but not a VIA HID collection"
                  onclick={() => connect("webusb")}
                  disabled={connection.status === "requesting"}
                >
                  <span class="font-medium">WebUSB</span>
                  <span class="font-mono text-[11px] tracking-[0.04em] text-ink-3">Connect</span>
                </Button>
              </div>

              <div class="flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5 pt-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  href="/trace"
                  class="h-auto min-h-0 px-0 font-mono text-[11px] tracking-wide text-muted-foreground hover:text-foreground"
                  data-testid="connect-open-tracer"
                  title="Trace a photo to build a layout — no device required"
                >
                  Trace from photo
                </Button>
                <span class="font-mono text-[11px] text-ink-3" aria-hidden="true">·</span>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  class="h-auto min-h-0 px-0 font-mono text-[11px] tracking-wide text-muted-foreground hover:text-foreground"
                  data-testid="connect-load-profile"
                  onclick={triggerLoadProfile}
                >
                  Load JSON
                </Button>
                <span class="font-mono text-[11px] text-ink-3" aria-hidden="true">·</span>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  class="h-auto min-h-0 px-0 font-mono text-[11px] tracking-wide text-muted-foreground hover:text-foreground"
                  data-testid="connect-continue-offline"
                  onclick={enterPreviewMode}
                >
                  Continue without device
                </Button>
              </div>

              <input
                bind:this={profileFileInput}
                type="file"
                accept="application/json,.json"
                class="hidden-file-input"
                onchange={handleProfileFileChange}
              />
            </Card.Content>
          </Card.Root>
        </div>
      </section>
  {:else}
    <section
      class="keymap-view view-shell"
      class:keymap-rgb-mode={keymapMode === "rgb"}
      class:keymap-bind-mode={keymapMode === "bind"}
    >
        <KeyInspectorPanel
          chromeLabel={keymapMode === "rgb" ? "RGB paint" : "Key inspector"}
          rgbMode={keymapMode === "rgb"}
        >
        {#snippet main()}
        <div class="keymap-main">
          <div class="layer-row">
            <div class="layer-stack" role="tablist" aria-label="Layers">
              {#each device.layers as layer (layer.id)}
                {#if renamingLayerId === layer.id}
                  <span class="layer-chip renaming" style={`--c: ${layer.color}`}>
                    <span class="swatch"></span>
                    <input
                      type="text"
                      class="layer-name-input"
                      data-layer-rename
                      bind:value={layerNameDraft}
                      onkeydown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitRenameLayer();
                        } else if (event.key === "Escape") {
                          event.preventDefault();
                          cancelRenameLayer();
                        }
                      }}
                      onblur={commitRenameLayer}
                      aria-label={`Rename ${layer.name}`}
                      maxlength="20"
                      use:focusOnMount
                    />
                  </span>
                {:else}
                  <a
                    href={layerLink(layer.id)}
                    data-sveltekit-preload-data="hover"
                    class="layer-chip"
                    class:active={selectedLayerId === layer.id}
                    style={`--c: ${layer.color}`}
                    ondblclick={(event) => {
                      event.preventDefault();
                      startRenameLayer(layer.id);
                    }}
                    title="Double-click to rename"
                  >
                    <span class="swatch"></span>
                    {layer.name.toUpperCase()}
                  </a>
                {/if}
              {/each}
            </div>

            <div class="spacer"></div>

            <TargetOsChip value={targetOS} onclick={cycleTargetOS} />

            {#if hasRgbCapability}
              <SegmentedNav
                items={[
                  { value: "bind", label: "Bind", href: keymapModeLink("bind"), icon: Keyboard, title: "Edit bindings" },
                  { value: "rgb", label: "RGB", href: keymapModeLink("rgb"), icon: RadioTower, title: "Paint RGB" },
                ]}
                value={keymapMode}
                ariaLabel="Keymap mode"
                class="keymap-mode-nav"
              />
            {/if}

            <Toggle
              bind:pressed={showFallthrough}
              class="ft-toggle"
              title={showFallthrough
                ? "Showing inherited bindings from lower layers. Click to hide."
                : "Hiding inherited bindings. Click to show fall-through."}
              aria-label={showFallthrough ? "Hide fall-through" : "Show fall-through"}
            >
              {#if showFallthrough}
                <Eye size={14} />
              {:else}
                <EyeOff size={14} />
              {/if}
              <span class="ft-label">Fall-through</span>
            </Toggle>
          </div>

          {#if keymapMode !== "rgb"}
            <div class="layer-stack-bar" aria-label="Layer compositing">
              <span class="muted mono layer-stack-label">Stack</span>
              {#each activeLayerStack as layerId, index (layerId)}
                {@const layer = device.layers.find((candidate) => candidate.id === layerId)}
                {#if layer}
                  <Chip dot={layer.color} class="layer-stack-chip" style={`border-color: ${layer.color}`}>
                    {layer.name.toUpperCase()}
                  </Chip>
                  {#if index < activeLayerStack.length - 1}
                    <span class="muted stack-arrow">›</span>
                  {/if}
                {/if}
              {/each}
              <span class="stack-hint muted mono">Hatched = inherited</span>
              <button
                type="button"
                class="keymap-zoom-readout mono"
                title="Reset keymap zoom"
                onclick={resetKeymapZoom}
              >
                {keymapZoomLabel}
              </button>
            </div>

            {#if comboDefinitionsNotice}
              <div class="combo-source-note" role="status">
                <span class="combo-source-label mono">Combos</span>
                <span>{comboDefinitionsNotice}</span>
              </div>
            {/if}
          {/if}

          <div
            class="keyboard-stage"
            class:keymap-panning={keymapIsPanning}
            role="region"
            aria-label="Keymap viewport"
            title="Mouse wheel zoom; middle-drag pan"
            onwheel={onKeymapWheel}
            onpointerdown={onKeymapPointerDown}
          >
            <div
              class="kb-block app-kb-block"
              class:positioned={keyboardIsPositioned}
              style={`--u: ${zoomedKeyboardUnit}px; --layout-w: ${keyboardBounds.width}; --layout-h: ${keyboardBounds.height}`}
            >
            {#if keyboardIsPositioned}
              {#if comboConnectors.length > 0}
                <svg
                  class="combo-connectors"
                  viewBox={`0 0 ${keyboardBounds.width} ${keyboardBounds.height}`}
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  {#each comboConnectors as connector (connector.id)}
                    <g class="combo-connector" class:combo-connector-active={comboConnectorActive(connector)}>
                      <title>{connector.title}</title>
                      {#each connector.segments as segment (segment.id)}
                        <path class="combo-connector-hit" d={segment.path}></path>
                        <path
                          class="combo-connector-line"
                          class:combo-connector-line-active={comboConnectorActive(connector)}
                          d={segment.path}
                        ></path>
                      {/each}
                    </g>
                  {/each}
                </svg>
              {/if}
              {#each device.keys as key, keyIndex (key.id)}
                {@const rendered = resolveRenderedBinding(selectedLayerId, key.id)}
                {@const keyRgb = hasRgbCapability ? keyRgbStyle(key.id) : null}
                {@const rgbOverride = hasRgbCapability && hasKeyLightingOverride(key.id)}
                {@const rgbSelected = keymapMode === "rgb" && rgbSelection.has(key.id)}
                {@const keyCombos = keyCombosFor(key.id)}
                {@const comboTitle = keyComboTitle(key.id)}
                {@const layerActivations = keyLayerActivationsFor(key.id)}
                {@const layerActivationTitle = keyLayerActivationTitle(key.id)}
                {@const layerActivationHasChain = hasLayerActivationChain(layerActivations)}
                {#if keymapMode === "rgb"}
                <button
                  type="button"
                  class="keycap"
                  class:accent={isAccentKey(key)}
                  class:encoder={key.encoder}
                  class:homing={key.homing}
                  class:modifier={isModifierKey(key)}
                  class:rgb-selected={rgbSelected}
                  class:transparent={rendered.transparent && showFallthrough}
                  class:inherits-binding={rendered.transparent}
                  class:rgb-override={rgbOverride}
                  class:layer-activation-key={layerActivations.length > 0}
                  class:layer-chain-key={layerActivationHasChain}
                  data-label-size={keycapLabelSize(rendered.keycap)}
                  style={`left: calc(var(--u) * ${key.x ?? key.col}); top: calc(var(--u) * ${key.y ?? key.row}); width: calc(var(--u) * ${key.width ?? 1} - 4px); height: calc(var(--u) * ${key.height ?? 1} - 4px); --source-color: ${rendered.sourceColor};${keyRgb ? ` --key-rgb: ${keyRgb};` : ""} --cap-i: ${keyIndex}; transform: rotate(${key.rotation ?? 0}deg); transform-origin: top left;`}
                  title={`${key.label} - ${rgbSelected ? "selected" : "click to select for RGB"}${comboTitle ? `\n${comboTitle}` : ""}${layerActivationTitle ? `\n${layerActivationTitle}` : ""}`}
                  aria-label={`${key.label}${rgbSelected ? ", selected for RGB" : ""}${keyCombos.length ? `, ${keyCombos.length} combo marker${keyCombos.length === 1 ? "" : "s"}` : ""}${layerActivations.length ? `, layer activation ${layerActivationMarkerText(layerActivations)}` : ""}`}
                  aria-pressed={rgbSelected}
                  onpointerenter={() => (hoveredComboKeyId = key.id)}
                  onpointerleave={() => {
                    if (hoveredComboKeyId === key.id) hoveredComboKeyId = undefined;
                  }}
                  onpointerdown={(event) => onRgbKeyPointerDown(event, key.id)}
                  onclick={onKeymapKeyClick}
                  onauxclick={onKeymapKeyAuxClick}
                >
                  <span class="legend">{key.label}</span>
                  <span class="glyph">{rendered.keycap}</span>
                  <span class="corner">{rendered.sourceLayerId !== selectedLayerId ? rendered.sourceLayerName : ""}</span>
                  {#if keyCombos.length > 0}
                    <span class="combo-marker" title={comboTitle}>{comboMarkerText(keyCombos.length)}</span>
                  {/if}
                  {#if layerActivations.length > 0}
                    <span
                      class="layer-activation-marker"
                      class:layer-activation-chain={layerActivationHasChain}
                      title={layerActivationTitle}
                    >
                      {layerActivationMarkerText(layerActivations)}
                    </span>
                  {/if}
                </button>
                {:else}
                <a
                  href={keyLink(key.id)}
                  data-sveltekit-preload-data="hover"
                  class="keycap"
                  class:accent={isAccentKey(key)}
                  class:encoder={key.encoder}
                  class:homing={key.homing}
                  class:modifier={isModifierKey(key)}

                  class:selected={selectedKeyId === key.id}
                  class:transparent={rendered.transparent && showFallthrough}
                  class:inherits-binding={rendered.transparent}
                  class:rgb-override={rgbOverride}
                  class:layer-activation-key={layerActivations.length > 0}
                  class:layer-chain-key={layerActivationHasChain}
                  data-label-size={keycapLabelSize(rendered.keycap)}
                  style={`left: calc(var(--u) * ${key.x ?? key.col}); top: calc(var(--u) * ${key.y ?? key.row}); width: calc(var(--u) * ${key.width ?? 1} - 4px); height: calc(var(--u) * ${key.height ?? 1} - 4px); --source-color: ${rendered.sourceColor};${keyRgb ? ` --key-rgb: ${keyRgb};` : ""} --cap-i: ${keyIndex}; transform: rotate(${key.rotation ?? 0}deg); transform-origin: top left;`}
                  title={`${key.label}: ${rendered.display}${rendered.display !== rendered.rawCode ? ` (${rendered.rawCode})` : ""}${comboTitle ? `\n${comboTitle}` : ""}${layerActivationTitle ? `\n${layerActivationTitle}` : ""}`}
                  aria-label={`${key.label}: ${rendered.display}${keyCombos.length ? `, ${keyCombos.length} combo marker${keyCombos.length === 1 ? "" : "s"}` : ""}${layerActivations.length ? `, layer activation ${layerActivationMarkerText(layerActivations)}` : ""}`}
                  onpointerenter={() => (hoveredComboKeyId = key.id)}
                  onpointerleave={() => {
                    if (hoveredComboKeyId === key.id) hoveredComboKeyId = undefined;
                  }}
                  onclick={onKeymapKeyClick}
                  onauxclick={onKeymapKeyAuxClick}
                >
                  <span class="legend">{key.label}</span>
                  <span class="glyph">{rendered.keycap}</span>
                  <span class="corner">{rendered.sourceLayerId !== selectedLayerId ? rendered.sourceLayerName : ""}</span>
                  {#if keyCombos.length > 0}
                    <span class="combo-marker" title={comboTitle}>{comboMarkerText(keyCombos.length)}</span>
                  {/if}
                  {#if layerActivations.length > 0}
                    <span
                      class="layer-activation-marker"
                      class:layer-activation-chain={layerActivationHasChain}
                      title={layerActivationTitle}
                    >
                      {layerActivationMarkerText(layerActivations)}
                    </span>
                  {/if}
                </a>
                {/if}
              {/each}
            {:else}
              {#each keyboardRows as row, rowIndex (rowIndex)}
                <div class="kb-row">
                  {#each row as key, colIndex (key.id)}
                    {@const rendered = resolveRenderedBinding(selectedLayerId, key.id)}
                    {@const keyRgb = hasRgbCapability ? keyRgbStyle(key.id) : null}
                    {@const rgbOverride = hasRgbCapability && hasKeyLightingOverride(key.id)}
                    {@const rgbSelected = keymapMode === "rgb" && rgbSelection.has(key.id)}
                    {@const keyCombos = keyCombosFor(key.id)}
                    {@const comboTitle = keyComboTitle(key.id)}
                    {@const layerActivations = keyLayerActivationsFor(key.id)}
                    {@const layerActivationTitle = keyLayerActivationTitle(key.id)}
                    {@const layerActivationHasChain = hasLayerActivationChain(layerActivations)}
                    {@const capIndex = rowIndex * 16 + colIndex}
                    {#if keymapMode === "rgb"}
                    <button
                      type="button"
                      class="keycap"
                      class:accent={isAccentKey(key)}
                      class:homing={key.homing}
                      class:modifier={isModifierKey(key)}
                      class:rgb-selected={rgbSelected}
                      class:transparent={rendered.transparent && showFallthrough}
                      class:inherits-binding={rendered.transparent}
                      class:rgb-override={rgbOverride}
                      class:layer-activation-key={layerActivations.length > 0}
                      class:layer-chain-key={layerActivationHasChain}
                      data-label-size={keycapLabelSize(rendered.keycap)}
                      style={`width: calc(var(--u) * ${key.width ?? 1} - 4px); --source-color: ${rendered.sourceColor};${keyRgb ? ` --key-rgb: ${keyRgb};` : ""} --cap-i: ${capIndex};`}
                      title={`${key.label} - ${rgbSelected ? "selected" : "click to select for RGB"}${comboTitle ? `\n${comboTitle}` : ""}${layerActivationTitle ? `\n${layerActivationTitle}` : ""}`}
                      aria-label={`${key.label}${rgbSelected ? ", selected for RGB" : ""}${keyCombos.length ? `, ${keyCombos.length} combo marker${keyCombos.length === 1 ? "" : "s"}` : ""}${layerActivations.length ? `, layer activation ${layerActivationMarkerText(layerActivations)}` : ""}`}
                      aria-pressed={rgbSelected}
                      onpointerenter={() => (hoveredComboKeyId = key.id)}
                      onpointerleave={() => {
                        if (hoveredComboKeyId === key.id) hoveredComboKeyId = undefined;
                      }}
                      onpointerdown={(event) => onRgbKeyPointerDown(event, key.id)}
                      onclick={onKeymapKeyClick}
                      onauxclick={onKeymapKeyAuxClick}
                    >
                      <span class="legend">{key.label}</span>
                      <span class="glyph">{rendered.keycap}</span>
                      <span class="corner">{rendered.sourceLayerId !== selectedLayerId ? rendered.sourceLayerName : ""}</span>
                      {#if keyCombos.length > 0}
                        <span class="combo-marker" title={comboTitle}>{comboMarkerText(keyCombos.length)}</span>
                      {/if}
                      {#if layerActivations.length > 0}
                        <span
                          class="layer-activation-marker"
                          class:layer-activation-chain={layerActivationHasChain}
                          title={layerActivationTitle}
                        >
                          {layerActivationMarkerText(layerActivations)}
                        </span>
                      {/if}
                    </button>
                    {:else}
                    <a
                      href={keyLink(key.id)}
                      data-sveltekit-preload-data="hover"
                      class="keycap"
                      class:accent={isAccentKey(key)}
                      class:homing={key.homing}
                      class:modifier={isModifierKey(key)}
    
                      class:selected={selectedKeyId === key.id}
                      class:transparent={rendered.transparent && showFallthrough}
                      class:inherits-binding={rendered.transparent}
                      class:rgb-override={rgbOverride}
                      class:layer-activation-key={layerActivations.length > 0}
                      class:layer-chain-key={layerActivationHasChain}
                      data-label-size={keycapLabelSize(rendered.keycap)}
                      style={`width: calc(var(--u) * ${key.width ?? 1} - 4px); --source-color: ${rendered.sourceColor};${keyRgb ? ` --key-rgb: ${keyRgb};` : ""} --cap-i: ${capIndex};`}
                      title={`${key.label}: ${rendered.display}${rendered.display !== rendered.rawCode ? ` (${rendered.rawCode})` : ""}${comboTitle ? `\n${comboTitle}` : ""}${layerActivationTitle ? `\n${layerActivationTitle}` : ""}`}
                      aria-label={`${key.label}: ${rendered.display}${keyCombos.length ? `, ${keyCombos.length} combo marker${keyCombos.length === 1 ? "" : "s"}` : ""}${layerActivations.length ? `, layer activation ${layerActivationMarkerText(layerActivations)}` : ""}`}
                      onpointerenter={() => (hoveredComboKeyId = key.id)}
                      onpointerleave={() => {
                        if (hoveredComboKeyId === key.id) hoveredComboKeyId = undefined;
                      }}
                      onclick={onKeymapKeyClick}
                      onauxclick={onKeymapKeyAuxClick}
                    >
                      <span class="legend">{key.label}</span>
                      <span class="glyph">{rendered.keycap}</span>
                      <span class="corner">{rendered.sourceLayerId !== selectedLayerId ? rendered.sourceLayerName : ""}</span>
                      {#if keyCombos.length > 0}
                        <span class="combo-marker" title={comboTitle}>{comboMarkerText(keyCombos.length)}</span>
                      {/if}
                      {#if layerActivations.length > 0}
                        <span
                          class="layer-activation-marker"
                          class:layer-activation-chain={layerActivationHasChain}
                          title={layerActivationTitle}
                        >
                          {layerActivationMarkerText(layerActivations)}
                        </span>
                      {/if}
                    </a>
                    {/if}
                  {/each}
                </div>
              {/each}
            {/if}
            </div>
          </div>
        </div>
        {/snippet}

          {#if keymapMode === "rgb" && hasRgbCapability}
            <KeymapRgbPanel
              {device}
              selectionCount={rgbSelectionCount}
              brush={rgbBrush}
              {lightingModeItems}
              {updateLighting}
              onBrushChange={onRgbBrushChange}
              onSelectAll={() => rgbSelection.selectAll(allKeyIds)}
              onClearSelection={() => rgbSelection.clear()}
              onApplyBoardToSelection={applyBoardColorToSelection}
              onClearOverridesOnSelection={clearRgbOverridesOnSelection}
              {resolveLayerColor}
              {setLayerColor}
              {shortHexFromValue}
            />
          {:else}
            <KeyBindInspector
              {selectedKeyId}
              {selectedKey}
              selectedLayerName={selectedLayer.name}
              {selectedBinding}
              {selectedRenderedBinding}
              inspectorTab={inspectorTab}
              {sourceSnippet}
              tappingTerm={device.settings.tappingTerm}
              {quickPickCodes}
              logicBindings={logicBindings}
              bindLink={inspectorLink("binding")}
              behaviorLink={inspectorLink("behavior")}
              sourceLink={inspectorLink("source")}
              {displayCode}
              {capLegend}
              bindingCode={() => bindingFor(device, selectedLayerId, selectedKeyId).code}
              onClearSelection={clearKeySelection}
              {onInspectorEscape}
              onSetCode={setSelectedCode}
              onSetHoldTap={setHoldTap}
              onBindLogic={bindLogicOption}
              onAddMacroFromKey={addMacroFromKey}
              onTappingTermChange={(next) => updateSetting("tappingTerm", next)}
            />
          {/if}
        </KeyInspectorPanel>
      </section>
  {/if}
{/snippet}

{#snippet versioningPage()}
  <section class="versioning-view view-shell" data-testid="git-diff-panel">
        <VersionChangesPanel changes={diffs} total={diffStats.total} bind:open={changesPanelOpen} />

        <div class="version-main" onscroll={onVersionMainScroll}>
          <Card.Root>
            <Card.Header>
              <Card.Title>Visual diff</Card.Title>
              <Card.Description class="font-mono">{activeBranchName} compared to local base</Card.Description>
              <div class="spacer"></div>
              <Chip>{diffStats.total} change{diffStats.total === 1 ? "" : "s"}</Chip>
            </Card.Header>
            <Card.Content class="visual-diff">
              {#if diffs.length === 0}
                <div class="empty-state">
                  <Database size={18} />
                  <span>Working layout matches the local base.</span>
                </div>
              {:else}
                <div class="diff-pair-list" role="list">
                  {#each diffs.slice(0, 12) as change (change.id)}
                    <div class="diff-pair-row" role="listitem" data-kind={change.kind}>
                      <span class="diff-pair-path mono" title={change.path}>{change.path}</span>
                      <span class="seq-key removed-key">{change.before || "empty"}</span>
                      <span class="seq-arrow" aria-hidden="true">→</span>
                      <span class="seq-key added-key">{change.after}</span>
                    </div>
                  {/each}
                  {#if diffs.length > 12}
                    <div class="diff-pair-more muted mono">+{diffs.length - 12} more change{diffs.length - 12 === 1 ? "" : "s"} below in source diff</div>
                  {/if}
                </div>
              {/if}
            </Card.Content>
          </Card.Root>

          {#if diffs.length > 0}
            <Card.Root>
              <Card.Header>
                <Card.Title>Source diff</Card.Title>
                <div class="spacer"></div>
                <Button variant="ghost" size="sm" type="button" onclick={() => resetDraft()}>
                  <RotateCcw size={14} />
                  Discard
                </Button>
                <Button variant="coral" size="sm" type="button" onclick={() => commitLocalBase()}>
                  <Check size={14} />
                  Commit {diffStats.total}
                </Button>
                <Button variant="ghost" size="sm" type="button" title={cloudStatus} onclick={syncAgent}>
                  <Cloud size={14} />
                  Sync
                </Button>
              </Card.Header>
              <Card.Content class="source-diff-body">
                <div class="diff-side">
                  <div class="diff-pane left">
                    <h4><span>base · keymap.c</span><span>-</span></h4>
                    {#each diffs.slice(0, 8) as change, index (change.id)}
                      <div class="diff-line rm"><span class="gut">{112 + index}</span><span>{change.path}: {change.before || "empty"}</span></div>
                    {/each}
                  </div>
                  <div class="diff-pane right">
                    <h4><span>{activeBranchName} · keymap.c</span><span>+</span></h4>
                    {#each diffs.slice(0, 8) as change, index (change.id)}
                      <div class="diff-line add"><span class="gut">{112 + index}</span><span>{change.path}: {change.after}</span></div>
                    {/each}
                  </div>
                </div>
              </Card.Content>
            </Card.Root>
          {/if}

          <Card.Root>
            <Card.Header>
              <Card.Title>Branches</Card.Title>
              <Card.Description class="font-mono">{forks.length + 1} forks · local graph</Card.Description>
              <div class="spacer"></div>
              <Button variant="coral" size="sm" class="font-mono tracking-[0.04em]" onclick={createFork}>
                <GitFork size={14} strokeWidth={1.75} />
                New fork
              </Button>
            </Card.Header>
            <Card.Content>
              <div class="branch-legend">
                <div class="branch-legend-item">
                  <span class="lane-swatch" style="background: var(--ink)"></span>
                  <span>main</span>
                </div>
                {#each forks as fork (fork.id)}
                  {@const laneColor = forkLaneColor(fork.id)}
                  <div class="branch-legend-item">
                    <span class="lane-swatch" style={`background: ${laneColor}`}></span>
                    <span>{fork.name}</span>
                  </div>
                {/each}
              </div>
              <div class="branch-graph">
                <article class="branch-row active-row">
                  <div class="branch-lanes">
                    <span class="lane lane-main"></span>
                    <span class="commit-dot" style="--c: var(--coral); left: 14px"></span>
                  </div>
                  <div>
                    <strong>{diffStats.total ? `${diffStats.total} uncommitted edit${diffStats.total === 1 ? "" : "s"}` : "Clean working layout"}</strong>
                    <small>HEAD · {activeBranchName}{diffStats.total ? " · now" : ""}</small>
                  </div>
                  <Chip class="head-tag">HEAD</Chip>
                </article>
                <button
                  type="button"
                  class="branch-row"
                  class:current={activeForkId === "main"}
                  onclick={() => (activeForkId = "main")}
                  aria-label="Switch to main branch"
                >
                  <div class="branch-lanes">
                    <span class="lane lane-main"></span>
                    <span class="commit-dot" style="--c: var(--ink); left: 14px"></span>
                  </div>
                  <div>
                    <strong>Local base profile</strong>
                    <small>main · committed via SQLocal</small>
                  </div>
                  <Chip>main</Chip>
                </button>
                {#each forks as fork, index (fork.id)}
                  {@const laneColor = forkLaneColor(fork.id)}
                  {@const lanePx = 14 + (index + 1) * 18}
                  <button
                    class="branch-row fork-row"
                    class:current={activeForkId === fork.id}
                    onclick={() => switchFork(fork)}
                    aria-label={`Switch to fork ${fork.name}`}
                  >
                    <div class="branch-lanes">
                      <span class="lane lane-main"></span>
                      <span class="lane fork-lane" style={`--c: ${laneColor}; left: ${lanePx}px`}></span>
                      <span class="lane fork-connector" style={`--c: ${laneColor}; left: 14px; width: ${lanePx - 14}px`}></span>
                      <span class="commit-dot" style={`--c: ${laneColor}; left: ${lanePx}px`}></span>
                    </div>
                    <div>
                      <strong>{fork.name}</strong>
                      <small>fork · {new Date(fork.createdAt).toLocaleDateString()}</small>
                    </div>
                    <Chip>fork</Chip>
                  </button>
                {/each}
              </div>
            </Card.Content>
          </Card.Root>
        </div>
      </section>
{/snippet}

{#snippet logicPage()}
  <LogicBuilder
    {device}
    tab={logicTab}
    tabItems={logicTabItems}
    {displayCode}
    {comboDefinitionsNotice}
    onAdd={addLogicEntry}
    onRemoveMacro={removeMacro}
    onUpdateCombo={updateCombo}
    onRemoveCombo={removeCombo}
  />
{/snippet}

{#snippet lightingPage()}
  <section class="view-shell"></section>
{/snippet}

{#snippet firmwarePage()}
  <section class="firmware-view view-shell">
        <Card.Root class="build-log-card">
          <Card.Header>
            <Card.Title>Firmware output</Card.Title>
            <Card.Description class="font-mono">source preview · external flash required</Card.Description>
            <div class="spacer"></div>
            <Button
              variant="ghost"
              size="sm"
              disabled={!lastBuild}
              title={lastBuild ? "Download the compiled firmware" : "No firmware artifact is available yet"}
            >
              Download .uf2
            </Button>
            <Button
              variant="coral"
              size="sm"
              data-testid="flash-to-device"
              disabled={firmwareActionDisabled}
              title={firmwareActionTitle}
              onclick={runFirmwareAction}
            >
              {#if liveKeyboardConnected}
                <Zap size={14} />
              {:else}
                <Cable size={14} />
              {/if}
              {firmwareActionLabel}
            </Button>
          </Card.Header>
          <Card.Content class="log-body">
            {#if lastBuild}
              <pre class="build-log">{lastBuild}</pre>
            {:else}
              <div class="build-log build-log-empty">
                <Activity size={16} />
                <strong>No firmware artifact</strong>
                <small>Firmware build and device flashing are not wired in this app yet. Use the generated source with local QMK for now.</small>
                <ul>
                  <li>{device.layers.length} layer{device.layers.length === 1 ? "" : "s"} ({device.layers.map((l) => l.name).join(", ")})</li>
                  <li>{device.keys.length} keys · {device.macros.length} macro{device.macros.length === 1 ? "" : "s"} · {device.combos.length} combo{device.combos.length === 1 ? "" : "s"} · {device.tapDances.length} tap dance{device.tapDances.length === 1 ? "" : "s"}</li>
                  <li>tap term {device.settings.tappingTerm}ms · debounce {device.settings.debounce}ms</li>
                </ul>
              </div>
            {/if}
          </Card.Content>
        </Card.Root>

        <aside class="side-stack">
          <Card.Root>
            <Card.Header>
              <Card.Title>Target</Card.Title>
            </Card.Header>
            <Card.Content>
              <div class="device-card">
                <div class="icon mono">USB</div>
                <div>
                  <strong class="mono">{device.name}</strong>
                  <small>{device.firmwareVersion}</small>
                </div>
                <Chip>{connection.status}</Chip>
              </div>
              {#if device.identity}
                <div class="identity-card">
                  <span class="field-label">Detected identity</span>
                  <code>{device.identity.key}</code>
                </div>
              {/if}
              {#if device.detectionNotes?.length}
                <div class="detect-notes">
                  {#each device.detectionNotes as note (note)}
                    <span>{note}</span>
                  {/each}
                </div>
              {/if}
              <div class="flash-validation" data-testid="flash-validation" data-blocked={flashReadiness.blocked}>
                <div class="field-label">Flash validation</div>
                <strong>{flashStatus}</strong>
                {#if flashStatusDetails.length}
                  <div class="validation-list">
                    {#each flashStatusDetails as issue (issue.code)}
                      <span class:error={issue.severity === "error"}>{issue.message}</span>
                    {/each}
                  </div>
                {/if}
              </div>
              <div class="divider"></div>
              <div class="field-label">Bootloader</div>
              <div class="mono firmware-meta">{bootloaderLabel}</div>
              <div class="field-label" style="margin-top: 10px">Firmware</div>
              <div class="mono firmware-meta">{device.firmware.toUpperCase()} · {device.protocol}</div>
              {#if liveKeyboardConnected}
                <div class="divider"></div>
                <Button
                  variant="ghost"
                  size="sm"
                  type="button"
                  data-testid="forget-device"
                  onclick={forgetDevice}
                  title="Revoke this browser's WebHID/USB grant — you'll need to re-pair next time"
                >
                  Forget device
                </Button>
              {/if}
            </Card.Content>
          </Card.Root>

          <Card.Root>
            <Card.Header>
              <Card.Title>What would be flashed</Card.Title>
              <div class="spacer"></div>
              <Card.Description class="shrink-0 font-mono">{activeBranchName}</Card.Description>
            </Card.Header>
            <Card.Content>
              <ul class="flash-summary">
                <li>{device.layers.length} layer{device.layers.length === 1 ? "" : "s"} ({device.layers.map((l) => l.name).join(", ")})</li>
                <li>{device.keys.length} keys · {diffStats.bindings} pending binding edit{diffStats.bindings === 1 ? "" : "s"}</li>
                <li>{device.macros.length} macro{device.macros.length === 1 ? "" : "s"} · {device.combos.length} combo{device.combos.length === 1 ? "" : "s"} · {device.tapDances.length} tap dance{device.tapDances.length === 1 ? "" : "s"}</li>
                <li>tap term {device.settings.tappingTerm}ms · debounce {device.settings.debounce}ms{device.settings.permissiveHold ? " · permissive hold" : ""}</li>
                {#if hasRgbCapability}
                  <li>RGB {device.lighting.mode} · hue {device.lighting.hue}°</li>
                {/if}
              </ul>
            </Card.Content>
          </Card.Root>

          <Card.Root>
            <Card.Header>
              <Card.Title>Generated source</Card.Title>
              <Card.Description class="ml-auto font-mono">selected key</Card.Description>
            </Card.Header>
            <Card.Content>
              {#if selectedKeyId}
                <pre class="source-block">{sourceSnippet}</pre>
              {:else}
                <p class="muted" style="margin: 0;">Select a key on the Keymap view to preview generated source.</p>
              {/if}
            </Card.Content>
          </Card.Root>

          <Card.Root>
            <Card.Header>
              <Card.Title>Behavior</Card.Title>
            </Card.Header>
            <Card.Content class="flex flex-col gap-4">
              <SliderField
                label="Tap term"
                value={device.settings.tappingTerm}
                min={100}
                max={300}
                suffix="ms"
                showBounds
                defaultValue={sampleKeyboard.settings.tappingTerm}
                defaultLabel="default"
                onValueChange={(next) => updateSetting("tappingTerm", next)}
              />
              <SliderField
                label="Debounce"
                value={device.settings.debounce}
                min={1}
                max={20}
                suffix="ms"
                showBounds
                defaultValue={sampleKeyboard.settings.debounce}
                defaultLabel="default"
                onValueChange={(next) => updateSetting("debounce", next)}
              />
              <div class="flex flex-col gap-3">
                <Label class="flex cursor-pointer items-center justify-between gap-3 font-mono text-[12px] text-ink">
                  Permissive hold
                  <Checkbox
                    checked={device.settings.permissiveHold}
                    onCheckedChange={(checked) => {
                      if (typeof checked === "boolean") updateSetting("permissiveHold", checked);
                    }}
                  />
                </Label>
                <Label class="flex cursor-pointer items-center justify-between gap-3 font-mono text-[12px] text-ink">
                  Retro tapping
                  <Checkbox
                    checked={device.settings.retroTapping}
                    onCheckedChange={(checked) => {
                      if (typeof checked === "boolean") updateSetting("retroTapping", checked);
                    }}
                  />
                </Label>
                <Label class="flex cursor-pointer items-center justify-between gap-3 font-mono text-[12px] text-ink">
                  NKRO
                  <Checkbox
                    checked={device.settings.nkro}
                    onCheckedChange={(checked) => {
                      if (typeof checked === "boolean") updateSetting("nkro", checked);
                    }}
                  />
                </Label>
              </div>
              <div class="split-transport-section">
                <div class="split-transport-intro">
                  <span class="field-label">Split link</span>
                  <p class="split-transport-copy">
                    {#if isZmkDevice(device)}
                      ZMK wireless splits use BLE. Single-piece boards stay on Single.
                    {:else if isSplitKeyboard(device)}
                      Pick how TRRS halves connect in the generated firmware.
                    {:else}
                      Single-piece board — wired split options unlock on split layouts.
                    {/if}
                  </p>
                </div>
                <ToggleGroup.Root
                  type="single"
                  value={splitTransportValue}
                  onValueChange={(next) => {
                    if (!next) return;
                    const mode = next as DeviceProfile["settings"]["splitTransport"];
                    if (!isSplitTransportAllowed(mode, device)) return;
                    updateSetting("splitTransport", mode);
                  }}
                  class="split-transport-grid"
                  variant="outline"
                >
                  {#each SPLIT_TRANSPORT_OPTIONS as mode (mode.id)}
                    {@const allowed = isSplitTransportAllowed(mode.id, device)}
                    {@const disabledReason = splitTransportDisabledReason(mode.id, device)}
                    <ToggleGroup.Item
                      value={mode.id}
                      disabled={!allowed}
                      title={disabledReason ?? undefined}
                      class={`split-transport-option${!allowed ? " split-transport-option-disabled" : ""}`}
                    >
                      <strong class="font-mono text-[13px]">{mode.name}</strong>
                      <small class="text-[11px] text-ink-3">{mode.detail}</small>
                      {#if disabledReason}
                        <span class="split-transport-lock">{disabledReason}</span>
                      {/if}
                    </ToggleGroup.Item>
                  {/each}
                </ToggleGroup.Root>
              </div>
            </Card.Content>
          </Card.Root>
        </aside>
      </section>
{/snippet}

<main class="paper-bg">
  <section class="app-frame density-3" data-hydrated={store.hydrated} data-testid="app-frame">
    {#snippet catalogSlot()}
      <CatalogPicker
        query={catalogQuery}
        onQueryChange={(next) => {
          catalogQuery = next;
          scheduleCatalogSearch();
        }}
        selectedId={selectedCatalogId}
        onSelectedIdChange={(next) => {
          selectedCatalogId = next;
          if (next) {
            void runAppEffect(
              "Load catalog layout",
              Effect.flatMap(fetchCatalogEntryEffect(next), loadCatalogEntryEffect),
            );
          }
        }}
        options={catalogOptions}
        title={catalogStatus}
        placeholderOption={catalogQuery.trim()
          ? catalogItems.length
            ? `${catalogItems.length} match${catalogItems.length === 1 ? "" : "es"}`
            : "No matches"
          : catalogItems.length
            ? `Search ${catalogItems.length} keyboards…`
            : "Catalog"}
      />
    {/snippet}

    {#snippet navSlot()}
      <SegmentedNav
        items={viewNavItems}
        iconOnlyAt="topbar"
        value={editorRoute}
        class="view-seg"
      />
    {/snippet}

    {#snippet transportsSlot()}
      <!-- Unified state-aware transport pill: the old separate USB/HID
           buttons + a "Connected" status chip collapsed into a single
           element that morphs with the connection state. Idle shows a
           pair of pickable transport icons; the other states each show
           a single combined indicator. -->
      {#if connection.status === "connected"}
        <span
          class="transport-pill connected"
          title={connection.productName
            ? `Connected to ${connection.productName} via ${connection.transport === "webhid" ? "WebHID" : "WebUSB"}`
            : `Connected via ${connection.transport === "webhid" ? "WebHID" : "WebUSB"}`}
          aria-live="polite"
        >
          <span class="state-dot" aria-hidden="true"></span>
          {#if connection.transport === "webhid"}
            <Cable size={13} />
          {:else}
            <Usb size={13} />
          {/if}
          <span class="state-label">Connected</span>
        </span>
      {:else if connection.status === "requesting"}
        <span class="transport-pill requesting" aria-live="polite">
          <Activity size={13} />
          <span class="state-label">Connecting…</span>
        </span>
      {:else if connection.status === "unsupported"}
        <span class="transport-pill unsupported" title={connection.message || "Browser does not support WebHID/WebUSB"}>
          <Activity size={13} />
          <span class="state-label">Unsupported</span>
        </span>
      {:else if connection.status === "error"}
        <span class="transport-pill error" title={connection.message}>
          <Activity size={13} />
          <span class="state-label">Error</span>
        </span>
      {:else}
        <!-- Idle: split picker — click the transport you want to use. -->
        <span class="transport-pill idle" role="group" aria-label="Connect a keyboard">
          <button
            type="button"
            class="transport-btn"
            title="Connect with WebUSB"
            data-testid="connect-webusb-topbar"
            disabled={!connection.webUsbSupported}
            onclick={() => connect("webusb")}
          >
            <Usb size={13} />
          </button>
          <span class="transport-divider" aria-hidden="true"></span>
          <button
            type="button"
            class="transport-btn"
            title="Connect with WebHID"
            data-testid="connect-webhid-topbar"
            disabled={!connection.webHidSupported}
            onclick={() => connect("webhid")}
          >
            <Cable size={13} />
          </button>
        </span>
      {/if}
    {/snippet}

    {#snippet topbarExtrasSlot()}
      <button
        type="button"
        class="settings-gear"
        title="Open settings"
        aria-label="Open settings"
        onclick={() => (settingsOpen = true)}
      >
        <SettingsIcon size={14} />
      </button>
    {/snippet}

    {#snippet signInIcon()}
      <UserCircle size={18} />
    {/snippet}

    <Topbar
      deviceName={workbenchReady ? device.name : "No keyboard"}
      deviceTitle={localStatus}
      protocolLabel={workbenchReady ? device.protocol.toUpperCase() : undefined}
      catalog={catalogSlot}
      nav={navSlot}
      transports={transportsSlot}
      extras={topbarExtrasSlot}
      avatar={authSession?.user
        ? {
            cta: false,
            title: `Signed in as ${authSession.user.email ?? authSession.user.id}. Open settings.`,
            ariaLabel: "Open settings",
            onclick: () => (settingsOpen = true),
            image: authSession.user.image ?? null,
            initials: (authSession.user.name ?? authSession.user.email ?? "GH").slice(0, 2).toUpperCase(),
            testid: "auth-avatar",
          }
        : {
            cta: true,
            title: authStatus,
            ariaLabel: "Sign in with GitHub",
            onclick: signInGithub,
            ctaIcon: signInIcon,
            testid: "auth-avatar",
          }}
      brandHref={WORKBENCH_ROUTES.keymap}
    />

    {#if appErrors.length}
      <div class="app-error-stack" data-testid="effect-error-stack">
        {#each appErrors as errorBlock (errorBlock.id)}
          {@render appErrorBlock(errorBlock)}
        {/each}
      </div>
    {/if}

    <WorkbenchPagesRegistrar
      pages={{
        keymap: keymapPage,
        logic: logicPage,
        lighting: lightingPage,
        versioning: versioningPage,
        firmware: firmwarePage,
      }}
    >
      {@render children()}
    </WorkbenchPagesRegistrar>

  </section>

  <SettingsDrawer
    bind:open={settingsOpen}
    {targetOS}
    onTargetOSChange={setTargetOS}
    authSignedIn={Boolean(authSession?.user)}
    authName={authSession?.user.name ?? null}
    authEmail={authSession?.user.email ?? null}
    authImage={authSession?.user.image ?? null}
    onSignIn={signInGithub}
    onSignOut={signOutGithub}
    {syncStatus}
    syncLastAt={syncLastLabel}
    onSyncNow={syncAgent}
  />
</main>
