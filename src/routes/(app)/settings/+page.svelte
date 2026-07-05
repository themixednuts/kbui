<script lang="ts">
  import { browser } from "$app/environment";

  import { Accent, runApp, TargetOS } from "$lib/app";
  import { authClient } from "$lib/auth-client";
  import { DEFAULT_MONKEYTYPE_MODE, DEFAULT_MONKEYTYPE_MODE2 } from "$lib/monkeytype/types";
  import {
    Button,
    Card,
    SegmentedNav,
    SliderField,
    Switch,
    ToggleGroup,
  } from "$lib/components/ui";
  import { cn } from "$lib/utils.js";
  import type { SegmentItem } from "$lib/components/ui/types";
  import { getShellContext } from "$lib/app/shell-store.svelte";
  import { getWorkbenchContext } from "$lib/app/workbench-store.svelte";
  import { profileDisplayName, type KeyboardSettings } from "$lib/keyboard/schema";
  import type {
    CreatePairingTokenResponse,
    ExtensionDeviceDto,
    KeyboardChoicesResponse,
  } from "$lib/typing-runs/contracts";
  import {
    isSplitKeyboard,
    isSplitTransportAllowed,
    isZmkDevice,
    normalizeSplitTransport,
    SPLIT_TRANSPORT_OPTIONS,
    splitTransportDisabledReason,
    type SplitTransport,
  } from "$lib/keyboard/split-transport";
  import {
    createExtensionPairingToken,
    listExtensionDevices,
    revokeExtensionDevice,
    syncExtensionKeyboardChoices,
  } from "./typing-runs.remote";

  type AuthClientError = {
    code?: string;
    message?: string;
    status?: number;
    statusText?: string;
  };

  type BehaviorToggleKey = "permissiveHold" | "retroTapping" | "nkro";

  const shell = getShellContext();
  const workbench = getWorkbenchContext();
  let accentId = $state<Accent.AccentId>(Accent.DEFAULT_ACCENT_ID);
  let accentLoaded = $state(false);
  let preferenceError = $state<string | null>(null);
  let monkeytypeApeKey = $state("");
  let monkeytypeUsername = $state("");
  let monkeytypePreset = $state(`${DEFAULT_MONKEYTYPE_MODE}:${DEFAULT_MONKEYTYPE_MODE2}`);
  let monkeytypeBusy = $state(false);
  let monkeytypeError = $state<string | null>(null);
  let monkeytypeSeeded = $state(false);
  let extensionDevices = $state<ExtensionDeviceDto[]>([]);
  let extensionPairing = $state<CreatePairingTokenResponse | null>(null);
  let extensionBusy = $state(false);
  let extensionRevokingId = $state<string | null>(null);
  let extensionError = $state<string | null>(null);
  let extensionNotice = $state<string | null>(null);
  let extensionLoadedFor = $state<string | null>(null);
  let extensionSyncedChoiceKey = $state("");
  let extensionSyncStatus = $state<"idle" | "synced" | "error">("idle");

  const profile = $derived(workbench.profile);
  const settings = $derived(profile.settings);
  const baseSettings = $derived(workbench.baseProfile.settings);
  const normalizedSplitTransport = $derived(
    normalizeSplitTransport(settings.splitTransport, profile),
  );
  const activeTransport = $derived(
    SPLIT_TRANSPORT_OPTIONS.find((option) => option.id === normalizedSplitTransport) ??
      SPLIT_TRANSPORT_OPTIONS[0],
  );
  const settingsChangeCount = $derived(
    workbench.changes.filter((change) => change.kind === "setting").length,
  );
  const appPreferenceSummary = $derived(
    `${TargetOS.labels[workbench.targetOs]} key labels · ${Accent.accentById(accentId).label} accent`,
  );
  const monkeytypeSignedIn = $derived(shell.account.status === "signed-in");
  const monkeytypeCanSubmit = $derived(
    monkeytypeSignedIn &&
      !monkeytypeBusy &&
      (shell.monkeytype.connected || monkeytypeApeKey.trim().length > 0),
  );
  const monkeytypeSummary = $derived(
    shell.monkeytype.connected
      ? `${statValue(shell.monkeytype.wpm)} wpm · ${statValue(shell.monkeytype.accuracy, 1)}%`
      : "Not connected",
  );
  const extensionChoices = $derived.by(extensionChoicesForWorkbench);
  const extensionChoiceKey = $derived(JSON.stringify(extensionChoices));
  const activeExtensionDevices = $derived(
    extensionDevices.filter((device) => device.revokedAt === null),
  );
  const extensionSummary = $derived(
    monkeytypeSignedIn
      ? `${activeExtensionDevices.length} paired · ${extensionChoices.keyboards.length} keyboard${extensionChoices.keyboards.length === 1 ? "" : "s"}`
      : "Sign in required",
  );
  const splitTransportCopy = $derived.by(() => {
    if (isZmkDevice(profile)) return "ZMK wireless split boards use BLE; wired TRRS modes stay locked.";
    if (isSplitKeyboard(profile)) return "Pick the link used by each half in generated firmware.";
    return "Single-piece board: wired split options unlock when the active profile is a split layout.";
  });

  const osItems = [
    { value: "mac", label: "macOS", title: "Use macOS shortcut labels" },
    { value: "win", label: "Windows", title: "Use Windows shortcut labels" },
    { value: "linux", label: "Linux", title: "Use Linux shortcut labels" },
  ] satisfies SegmentItem<TargetOS.TargetOS>[];

  const monkeytypePresets = [
    { value: "time:60", label: "time 60", mode: "time", mode2: "60" },
    { value: "time:15", label: "time 15", mode: "time", mode2: "15" },
    { value: "words:50", label: "words 50", mode: "words", mode2: "50" },
    { value: "words:25", label: "words 25", mode: "words", mode2: "25" },
  ] as const;

  const behaviorToggles = [
    {
      key: "permissiveHold",
      label: "Permissive hold",
      detail: "Any other key pressed during a hold-tap counts as the hold action.",
    },
    {
      key: "retroTapping",
      label: "Retro tapping",
      detail: "When the key is released alone inside the tap window, emit the tap.",
    },
    {
      key: "nkro",
      label: "NKRO",
      detail: "Report all simultaneous keys, with USB fallback handled by firmware.",
    },
  ] satisfies ReadonlyArray<{
    key: BehaviorToggleKey;
    label: string;
    detail: string;
  }>;

  const settingsPageClass =
    "settings-page grid min-h-[calc(100vh-58px)] content-start gap-kb-18 p-kb-22 [background:radial-gradient(ellipse_86%_56%_at_82%_0%,color-mix(in_oklch,var(--coral)_7%,transparent),transparent_66%),var(--paper)] max-[560px]:p-kb-14";
  const settingsToolbarClass =
    "settings-toolbar flex min-w-0 items-center gap-kb-12 max-[820px]:flex-wrap";
  const settingsTitleClass = "settings-title grid min-w-0 gap-kb-4 max-[820px]:w-full";
  const settingsEyebrowClass =
    "text-ink-3 font-mono text-[10px] tracking-[0.14em] uppercase";
  const settingsHeadingClass =
    "m-0 overflow-hidden text-ellipsis whitespace-nowrap text-[24px] leading-[1.05] max-[560px]:text-[20px]";
  const settingsToolbarSpacerClass =
    "settings-toolbar-spacer min-w-kb-12 flex-1 max-[820px]:hidden";
  const settingsMeterClass =
    "settings-meter grid min-h-kb-34 max-w-[250px] grid-cols-[17px_auto_minmax(0,auto)] items-center gap-kb-6 rounded-keycap border border-[color-mix(in_oklch,var(--coral)_34%,var(--line-2))] px-kb-10 py-0 text-ink [background:color-mix(in_oklch,var(--coral)_9%,var(--surface))] data-[empty=true]:border-line-2 data-[empty=true]:text-ink-3 data-[empty=true]:[background:color-mix(in_oklch,var(--surface)_68%,transparent)] max-[820px]:flex-[1_1_210px] max-[560px]:max-w-none";
  const settingsMeterIconClass = "material-symbols-outlined !text-[17px]";
  const settingsMeterCountClass = "font-mono text-[13px]";
  const settingsMeterCopyClass = "overflow-hidden text-ellipsis whitespace-nowrap text-[11px]";
  const settingsGridClass =
    "settings-grid grid grid-cols-[minmax(0,1fr)_minmax(300px,340px)] items-start gap-kb-18 max-[1120px]:grid-cols-1";
  const deviceColumnClass =
    "device-column grid min-w-0 grid-cols-2 gap-kb-16 max-[820px]:grid-cols-1";
  const appColumnClass = "app-column grid min-w-0 gap-kb-16 max-[1120px]:order-[-1]";
  const settingsCardClass = "settings-card min-w-0";
  const settingsCardHeaderClass =
    "settings-card-header min-h-[54px] [&_[data-slot=card-description]]:!whitespace-normal";
  const cardTitleStackClass = "card-title-stack grid min-w-0 flex-1 gap-kb-4";
  const settingsCardBodyClass = "settings-card-body grid gap-kb-16";
  const toggleListClass = "settings-card-body toggle-list grid gap-kb-8";
  const monkeytypeSettingsClass = "settings-card-body monkeytype-settings grid gap-kb-12";
  const extensionSettingsClass = "settings-card-body extension-settings grid gap-kb-12";
  const appPreferencesClass = "settings-card-body app-preferences grid gap-kb-18";
  const scopeChipClass =
    "scope-chip inline-flex min-h-kb-24 items-center whitespace-nowrap rounded-[7px] border border-line-2 bg-paper-2 px-kb-8 py-0 font-mono text-[10px] text-ink-2";
  const appScopeClass = cn(
    scopeChipClass,
    "app-scope border-[color-mix(in_oklch,var(--teal)_34%,var(--line-2))] [background:color-mix(in_oklch,var(--teal)_9%,var(--paper))]",
  );
  const integrationScopeClass = cn(
    scopeChipClass,
    "integration-scope border-[color-mix(in_oklch,var(--coral)_34%,var(--line-2))] [background:color-mix(in_oklch,var(--coral)_9%,var(--paper))] data-[connected=true]:border-[color-mix(in_oklch,var(--mint)_48%,var(--line-2))] data-[connected=true]:text-[oklch(0.36_0.12_155)] data-[connected=true]:[background:color-mix(in_oklch,var(--mint)_13%,var(--paper))]",
  );
  const extensionScopeClass = cn(
    scopeChipClass,
    "extension-scope border-[color-mix(in_oklch,var(--teal)_38%,var(--line-2))] [background:color-mix(in_oklch,var(--teal)_9%,var(--paper))] data-[connected=true]:border-[color-mix(in_oklch,var(--mint)_48%,var(--line-2))] data-[connected=true]:text-[oklch(0.36_0.12_155)] data-[connected=true]:[background:color-mix(in_oklch,var(--mint)_12%,var(--paper))]",
  );
  const transportChipClass = cn(
    scopeChipClass,
    "transport-chip border-[color-mix(in_oklch,var(--coral)_40%,var(--line-2))] text-coral-ink [background:color-mix(in_oklch,var(--coral)_10%,var(--paper))]",
  );
  const timingNoteClass =
    "timing-note grid grid-cols-[22px_minmax(0,1fr)] items-start gap-kb-10 rounded-keycap border border-line px-kb-12 py-[11px] [background:color-mix(in_oklch,var(--paper-2)_72%,transparent)]";
  const timingNoteIconClass = "material-symbols-outlined text-coral-ink !text-[20px]";
  const bodyCopyClass = "m-0 text-[12px] leading-[1.55] text-ink-2";
  const toggleRowClass =
    "toggle-row grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-kb-14 rounded-keycap border border-transparent bg-paper-2 px-kb-12 py-[11px] hover:border-line-2";
  const toggleCopyStackClass = "grid min-w-0 gap-kb-4";
  const toggleTitleClass = "font-mono text-[12px] font-strong";
  const toggleDetailClass = "text-[12px] leading-[1.4] text-ink-3";
  const transportGridClass =
    "settings-transport-grid !grid !w-full !grid-cols-4 !gap-kb-8 max-[820px]:!grid-cols-2 max-[560px]:!grid-cols-1";
  const transportOptionClass =
    "settings-transport-option !flex !h-auto !min-h-kb-92 !w-full !flex-col !items-start !justify-start !gap-kb-3 !whitespace-normal !rounded-keycap !border-line-2 !bg-paper !p-kb-12 !text-left data-[state=on]:!border-[color-mix(in_oklch,var(--coral)_58%,var(--line-2))] data-[state=on]:![background:color-mix(in_oklch,var(--coral)_9%,var(--paper))] data-[state=on]:!shadow-[0_0_0_1px_color-mix(in_oklch,var(--coral)_34%,transparent)]";
  const transportOptionDisabledClass = "disabled !cursor-not-allowed !opacity-[0.52]";
  const transportOptionTitleClass = "font-mono text-[13px] text-ink";
  const transportOptionDetailClass = "text-[11px] text-ink-3";
  const transportOptionReasonClass = "mt-auto font-mono text-[9.5px] leading-[1.25] text-ink-3";
  const preferenceSectionClass = "preference-section grid min-w-0 gap-kb-10";
  const monkeytypeScoreboardClass =
    "monkeytype-scoreboard grid grid-cols-2 gap-kb-8 max-[560px]:grid-cols-1";
  const monkeytypeScoreClass =
    "grid min-h-[54px] gap-kb-2 rounded-keycap border border-line bg-paper-2 px-kb-10 py-kb-9";
  const monkeytypeScoreDisconnectedClass =
    "text-ink-3 [background:color-mix(in_oklch,var(--paper-2)_60%,transparent)]";
  const monkeytypeScoreValueClass =
    "overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[16px] leading-none";
  const monkeytypeScoreLabelClass =
    "overflow-hidden text-ellipsis whitespace-nowrap text-[10.5px] text-ink-3";
  const extensionSyncGridClass =
    "extension-sync-grid grid grid-cols-4 gap-kb-7 max-[560px]:grid-cols-1";
  const extensionSyncStatClass =
    "grid min-h-kb-50 min-w-0 gap-kb-2 rounded-keycap border border-line bg-paper-2 p-kb-8";
  const extensionSyncValueClass =
    "overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[13px] leading-none";
  const extensionSyncLabelClass =
    "overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-ink-3";
  const extensionPairingCodeClass =
    "extension-pairing-code grid min-w-0 gap-kb-5 rounded-keycap border border-[color-mix(in_oklch,var(--coral)_36%,var(--line-2))] px-kb-12 py-[11px] [background:color-mix(in_oklch,var(--coral)_10%,var(--paper))]";
  const extensionPairingMetaClass =
    "font-mono text-[10px] tracking-[0.1em] text-ink-3 uppercase";
  const extensionPairingValueClass =
    "[overflow-wrap:anywhere] font-mono text-[18px] tracking-[0.08em] text-ink";
  const extensionCommandRowClass =
    "extension-command-row grid grid-cols-2 gap-kb-6 max-[560px]:grid-cols-1";
  const commandButtonClass = "w-full justify-center px-kb-8";
  const extensionDeviceListClass = "extension-device-list grid min-w-0 gap-kb-7";
  const extensionDeviceRowClass =
    "extension-device-row grid min-h-[46px] min-w-0 grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-kb-8 rounded-keycap border border-line px-kb-9 py-kb-8 [background:color-mix(in_oklch,var(--paper-2)_76%,transparent)] data-[revoked=true]:opacity-[0.62]";
  const extensionDeviceIconClass = "material-symbols-outlined text-teal !text-[18px]";
  const extensionDeviceCopyClass = "min-w-0";
  const extensionDeviceTitleClass =
    "block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11.5px]";
  const extensionDeviceMetaClass =
    "block overflow-hidden text-ellipsis whitespace-nowrap text-[10.5px] text-ink-3";
  const extensionDeviceStateClass = "device-state text-[10.5px] text-ink-3";
  const extensionDeviceButtonClass =
    "grid size-kb-28 place-items-center rounded-keycap border border-line bg-paper text-ink-2 hover:border-[color-mix(in_oklch,var(--coral)_44%,var(--line-2))] hover:text-coral-ink hover:[background:color-mix(in_oklch,var(--coral)_10%,var(--paper))] disabled:cursor-wait disabled:opacity-50";
  const monkeytypeFormClass = "monkeytype-form grid min-w-0 gap-kb-10";
  const monkeytypeFieldClass = "monkeytype-field grid min-w-0 gap-kb-6";
  const monkeytypeFieldLabelClass =
    "font-mono text-[10px] tracking-[0.12em] text-ink-3 uppercase";
  const monkeytypeInputClass = "input !h-kb-34 !border-line-2 !bg-paper";
  const monkeytypePresetSelectClass =
    "input !h-kb-34 !border-line-2 appearance-none ![background:var(--paper)]";
  const monkeytypeCommandRowClass =
    "monkeytype-command-row grid grid-cols-3 gap-kb-6 max-[560px]:grid-cols-1";
  const statusMessageClass = "m-0 rounded-keycap px-kb-10 py-kb-9 text-[12px] leading-[1.4]";
  const errorMessageClass = cn(
    statusMessageClass,
    "border border-[oklch(0.62_0.2_25_/_0.3)] text-[oklch(0.42_0.15_25)] [background:oklch(0.95_0.04_25)]",
  );
  const noteMessageClass = cn(
    statusMessageClass,
    "border border-[color-mix(in_oklch,var(--mustard)_42%,var(--line-2))] text-ink-2 [background:color-mix(in_oklch,var(--mustard)_15%,var(--surface))]",
  );
  const preferenceHeadClass =
    "preference-head flex min-w-0 items-baseline justify-between gap-kb-10";
  const preferenceHeadTitleClass =
    "m-0 font-mono text-[10px] tracking-[0.14em] text-ink-2 uppercase";
  const preferenceHeadValueClass =
    "overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10.5px] text-ink-3";
  const settingsOsSegmentClass =
    "settings-os-segment w-full [&_button]:min-w-0 [&_button]:flex-1 [&_button]:!px-kb-8";
  const accentGridClass = "accent-grid grid grid-cols-2 gap-kb-8 max-[560px]:grid-cols-1";
  const accentSwatchClass =
    "accent-swatch grid min-h-kb-38 grid-cols-[26px_minmax(0,1fr)] items-center gap-kb-8 rounded-keycap !border !border-line-2 ![background:var(--paper)] px-kb-8 py-kb-6 text-left !text-ink-2 transition-[border-color,background,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-out-soft)] hover:!border-[color-mix(in_oklch,var(--accent-color)_66%,var(--line-2))] hover:![background:color-mix(in_oklch,var(--accent-color)_10%,var(--paper))]";
  const accentSwatchActiveClass =
    "active !border-[color-mix(in_oklch,var(--accent-color)_66%,var(--line-2))] ![background:color-mix(in_oklch,var(--accent-color)_10%,var(--paper))] shadow-[0_0_0_1px_color-mix(in_oklch,var(--accent-color)_40%,transparent)]";
  const accentPreviewClass =
    "h-kb-22 w-kb-26 rounded-[7px] border border-[rgba(27,25,23,0.16)] [background:var(--accent-color)] shadow-[inset_0_-3px_0_rgba(27,25,23,0.14)]";
  const accentLabelClass =
    "overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] font-strong";
  const inlineCodeClass = "rounded-[5px] bg-paper-2 px-kb-4 py-px font-mono text-[11px] text-ink";
  const preferenceErrorClass = cn(errorMessageClass, "preference-error leading-[1.45]");

  $effect(() => {
    const safe = normalizeSplitTransport(settings.splitTransport, profile);
    if (safe !== settings.splitTransport) {
      workbench.updateSettings({ splitTransport: safe });
    }
  });

  $effect(() => {
    if (!browser || accentLoaded) return;
    accentLoaded = true;
    void runApp("Load accent", Accent.loadAndApply, capturePreferenceError).then((loaded) => {
      if (loaded) accentId = loaded;
    });
  });

  $effect(() => {
    if (!shell.monkeytype.connected) {
      monkeytypeSeeded = false;
      return;
    }
    if (monkeytypeSeeded) return;
    monkeytypeUsername = shell.monkeytype.username ?? "";
    monkeytypePreset = `${shell.monkeytype.mode}:${shell.monkeytype.mode2}`;
    monkeytypeSeeded = true;
  });

  $effect(() => {
    if (!browser) return;
    const userId = shell.account.status === "signed-in" ? (shell.account.id ?? null) : null;
    if (!userId) {
      extensionDevices = [];
      extensionPairing = null;
      extensionLoadedFor = null;
      extensionSyncedChoiceKey = "";
      extensionSyncStatus = "idle";
      return;
    }
    if (extensionLoadedFor === userId) return;
    extensionLoadedFor = userId;
    void refreshExtensionDevices(false);
  });

  $effect(() => {
    if (!browser || !monkeytypeSignedIn) return;
    if (extensionChoiceKey === extensionSyncedChoiceKey) return;
    extensionSyncedChoiceKey = extensionChoiceKey;
    void syncExtensionChoices(extensionChoices);
  });

  function updateTiming(key: "tappingTerm" | "debounce", value: number) {
    const next = Math.round(value);
    if (key === "tappingTerm") workbench.updateSettings({ tappingTerm: next });
    else workbench.updateSettings({ debounce: next });
  }

  function updateBehavior(key: BehaviorToggleKey, value: boolean) {
    switch (key) {
      case "permissiveHold":
        workbench.updateSettings({ permissiveHold: value });
        break;
      case "retroTapping":
        workbench.updateSettings({ retroTapping: value });
        break;
      case "nkro":
        workbench.updateSettings({ nkro: value });
        break;
    }
  }

  function updateSplitTransport(mode: SplitTransport) {
    if (!isSplitTransportAllowed(mode, profile)) return;
    workbench.updateSettings({ splitTransport: mode });
  }

  function updateTargetOS(next: TargetOS.TargetOS) {
    workbench.setTargetOs(next);
  }

  function updateAccent(next: Accent.AccentId) {
    accentId = next;
    preferenceError = null;
    void runApp("Save accent", Accent.saveAndApply(next), capturePreferenceError);
  }

  async function connectMonkeytype(event: SubmitEvent) {
    event.preventDefault();
    if (!monkeytypeCanSubmit) return;

    monkeytypeBusy = true;
    monkeytypeError = null;

    try {
      const preset = monkeytypePresets.find((option) => option.value === monkeytypePreset);
      const result = await authClient.monkeytype.connect({
        apeKey: monkeytypeApeKey,
        username: monkeytypeUsername,
        mode: preset?.mode ?? DEFAULT_MONKEYTYPE_MODE,
        mode2: preset?.mode2 ?? DEFAULT_MONKEYTYPE_MODE2,
      });
      const error = result.error as AuthClientError | null | undefined;
      if (error) {
        monkeytypeError = clientErrorMessage(error, "Monkeytype connect failed");
        return;
      }
      shell.setMonkeytypeStatus(result.data);
      monkeytypeApeKey = "";
    } catch (error) {
      monkeytypeError = clientErrorMessage(error, "Monkeytype connect failed");
    } finally {
      monkeytypeBusy = false;
    }
  }

  async function refreshMonkeytype() {
    if (!shell.monkeytype.connected || monkeytypeBusy) return;
    monkeytypeBusy = true;
    monkeytypeError = null;
    try {
      const result = await authClient.monkeytype.refresh({ force: true });
      const error = result.error as AuthClientError | null | undefined;
      if (error) {
        monkeytypeError = clientErrorMessage(error, "Monkeytype refresh failed");
        return;
      }
      shell.setMonkeytypeStatus(result.data);
    } catch (error) {
      monkeytypeError = clientErrorMessage(error, "Monkeytype refresh failed");
    } finally {
      monkeytypeBusy = false;
    }
  }

  async function disconnectMonkeytype() {
    if (!shell.monkeytype.connected || monkeytypeBusy) return;
    monkeytypeBusy = true;
    monkeytypeError = null;
    try {
      const result = await authClient.monkeytype.disconnect();
      const error = result.error as AuthClientError | null | undefined;
      if (error) {
        monkeytypeError = clientErrorMessage(error, "Monkeytype disconnect failed");
        return;
      }
      shell.setMonkeytypeStatus(result.data);
      monkeytypeApeKey = "";
      monkeytypeUsername = "";
      monkeytypePreset = `${DEFAULT_MONKEYTYPE_MODE}:${DEFAULT_MONKEYTYPE_MODE2}`;
    } catch (error) {
      monkeytypeError = clientErrorMessage(error, "Monkeytype disconnect failed");
    } finally {
      monkeytypeBusy = false;
    }
  }

  async function createExtensionPairingCode() {
    if (!monkeytypeSignedIn) {
      extensionError = "Sign in with GitHub first.";
      shell.profileOpen = true;
      return;
    }
    if (extensionBusy) return;

    extensionBusy = true;
    extensionError = null;
    extensionNotice = null;
    try {
      extensionPairing = await createExtensionPairingToken();
      extensionNotice = "Pairing code created.";
      await refreshExtensionDevices(false);
    } catch (error) {
      extensionError = clientErrorMessage(error, "Pairing code could not be created.");
    } finally {
      extensionBusy = false;
    }
  }

  async function refreshExtensionDevices(showBusy = true) {
    if (!monkeytypeSignedIn) return;
    if (showBusy) extensionBusy = true;
    extensionError = null;
    try {
      extensionDevices = await listExtensionDevices();
    } catch (error) {
      extensionError = clientErrorMessage(error, "Extension devices could not be loaded.");
    } finally {
      if (showBusy) extensionBusy = false;
    }
  }

  async function revokeExtension(id: string) {
    if (extensionRevokingId) return;
    extensionRevokingId = id;
    extensionError = null;
    extensionNotice = null;
    try {
      await revokeExtensionDevice(id);
      await refreshExtensionDevices(false);
      extensionNotice = "Device revoked.";
    } catch (error) {
      extensionError = clientErrorMessage(error, "Extension device could not be revoked.");
    } finally {
      extensionRevokingId = null;
    }
  }

  async function syncExtensionChoices(choices: KeyboardChoicesResponse) {
    extensionSyncStatus = "idle";
    try {
      await syncExtensionKeyboardChoices(choices);
      extensionSyncStatus = "synced";
    } catch (error) {
      extensionSyncStatus = "error";
      extensionError = clientErrorMessage(error, "Extension keyboard choices could not be synced.");
    }
  }

  function statValue(value: number | null, digits = 0, fallback = "--") {
    if (value === null || !Number.isFinite(value)) return fallback;
    return value.toLocaleString(undefined, {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    });
  }

  function extensionChoicesForWorkbench(): KeyboardChoicesResponse {
    const variants = [
      {
        id: "main",
        name: "main",
        forkId: undefined,
        profile: workbench.activeVariantId === "main" ? workbench.profile : workbench.baseProfile,
      },
      ...workbench.forks.map((fork) => ({
        id: fork.id,
        name: fork.name,
        forkId: fork.id,
        profile: workbench.activeVariantId === fork.id ? workbench.profile : fork.device,
      })),
    ];

    return {
      keyboards: variants.map((variant) => {
        const profile = variant.profile;
        return {
          keyboardId: profile.identity?.key ?? profile.id,
          displayName: variant.id === "main" ? profile.name : `${profile.name} · ${variant.name}`,
          profileId: profile.id,
          forkId: variant.forkId,
          catalogId: profile.id,
          vendorId: profile.vendorId,
          productId: profile.productId,
          boardName: profile.name,
        };
      }),
      layouts: variants.map((variant) => {
        const profile = variant.profile;
        return {
          layoutId: `${variant.id}:${profile.id}`,
          displayName: variant.id === "main" ? "main" : variant.name,
          variantId: variant.id,
          layerNames: profile.layers.map((layer) => layer.name),
          layoutHash: [
            profile.id,
            profile.updatedAt,
            profile.layers.map((layer) => layer.id).join(","),
          ].join(":"),
        };
      }),
    };
  }

  function shortDate(value: string | null) {
    if (!value) return "never";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "unknown";
    return date.toLocaleString(undefined, {
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
    });
  }

  function clientErrorMessage(error: unknown, fallback: string) {
    if (error instanceof Error) return error.message || fallback;
    if (error && typeof error === "object") {
      const authError = error as AuthClientError;
      if (authError.message) return authError.message;
      if (authError.statusText) return authError.statusText;
      if (authError.status) return `${fallback} (${authError.status})`;
      if (authError.code) return authError.code;
    }
    return fallback;
  }

  function capturePreferenceError(label: string, message: string) {
    preferenceError = `${label}: ${message.split("\n")[0] ?? message}`;
  }

  function checkedValue(checked: boolean | "indeterminate" | undefined): boolean | undefined {
    return typeof checked === "boolean" ? checked : undefined;
  }
</script>

<section class={settingsPageClass}>
  <header class={settingsToolbarClass}>
    <div class={settingsTitleClass}>
      <span class={settingsEyebrowClass}>Profile settings</span>
      <h2 class={settingsHeadingClass}>{profileDisplayName(profile)}</h2>
    </div>

    <div class={settingsToolbarSpacerClass}></div>

    <div class={settingsMeterClass} data-empty={settingsChangeCount === 0}>
      <span class={settingsMeterIconClass} aria-hidden="true">manufacturing</span>
      <strong class={settingsMeterCountClass}>{settingsChangeCount}</strong>
      <small class={settingsMeterCopyClass}
        >firmware setting{settingsChangeCount === 1 ? "" : "s"} changed</small
      >
    </div>

    <Button variant="coral" href="/versions" disabled={workbench.dirty === 0}>
      <span class="material-symbols-outlined" aria-hidden="true">bookmark_add</span>
      Review save point
    </Button>
  </header>

  <div class={settingsGridClass}>
    <div class={deviceColumnClass}>
      <Card.Root class={cn(settingsCardClass, "timing-card")}>
        <Card.Header class={settingsCardHeaderClass}>
          <div class={cardTitleStackClass}>
            <Card.Title>Timing</Card.Title>
            <Card.Description>Device-scoped behavior on the active profile</Card.Description>
          </div>
          <span class={scopeChipClass}>profile.settings</span>
        </Card.Header>
        <Card.Content class={settingsCardBodyClass}>
          <SliderField
            label="Tap term"
            min={100}
            max={300}
            suffix="ms"
            showBounds
            value={settings.tappingTerm}
            defaultValue={baseSettings.tappingTerm}
            defaultLabel="base"
            onValueChange={(value) => updateTiming("tappingTerm", value)}
          />
          <SliderField
            label="Debounce"
            min={1}
            max={20}
            suffix="ms"
            showBounds
            value={settings.debounce}
            defaultValue={baseSettings.debounce}
            defaultLabel="base"
            onValueChange={(value) => updateTiming("debounce", value)}
          />

          <div class={timingNoteClass}>
            <span class={timingNoteIconClass} aria-hidden="true">timer</span>
            <p class={bodyCopyClass}>
              Tap term controls how long a hold-tap waits before becoming a hold. Lower values feel
              faster; higher values reduce accidental holds.
            </p>
          </div>
        </Card.Content>
      </Card.Root>

      <Card.Root class={cn(settingsCardClass, "behavior-card")}>
        <Card.Header class={settingsCardHeaderClass}>
          <div class={cardTitleStackClass}>
            <Card.Title>Behavior</Card.Title>
            <Card.Description>Global QMK/ZMK toggles stored with this variant</Card.Description>
          </div>
        </Card.Header>
        <Card.Content class={toggleListClass}>
          {#each behaviorToggles as toggle (toggle.key)}
            <label class={toggleRowClass}>
              <span class={toggleCopyStackClass}>
                <strong class={toggleTitleClass}>{toggle.label}</strong>
                <small class={toggleDetailClass}>{toggle.detail}</small>
              </span>
              <Switch
                checked={settings[toggle.key]}
                aria-label={toggle.label}
                onCheckedChange={(checked) => {
                  const next = checkedValue(checked);
                  if (next !== undefined) updateBehavior(toggle.key, next);
                }}
              />
            </label>
          {/each}
        </Card.Content>
      </Card.Root>

      <Card.Root class={cn(settingsCardClass, "transport-card col-span-full")}>
        <Card.Header class={settingsCardHeaderClass}>
          <div class={cardTitleStackClass}>
            <Card.Title>Split Transport</Card.Title>
            <Card.Description>{splitTransportCopy}</Card.Description>
          </div>
          <span class={transportChipClass}>{activeTransport.name}</span>
        </Card.Header>
        <Card.Content class={settingsCardBodyClass}>
          <ToggleGroup.Root
            type="single"
            value={normalizedSplitTransport}
            onValueChange={(next) => {
              if (next) updateSplitTransport(next as SplitTransport);
            }}
            class={transportGridClass}
            variant="outline"
          >
            {#each SPLIT_TRANSPORT_OPTIONS as option (option.id)}
              {@const allowed = isSplitTransportAllowed(option.id, profile)}
              {@const disabledReason = splitTransportDisabledReason(option.id, profile)}
              <ToggleGroup.Item
                value={option.id}
                disabled={!allowed}
                title={disabledReason ?? option.detail}
                class={cn(transportOptionClass, !allowed && transportOptionDisabledClass)}
              >
                <strong class={transportOptionTitleClass}>{option.name}</strong>
                <small class={transportOptionDetailClass}>{option.detail}</small>
                {#if disabledReason}
                  <span class={transportOptionReasonClass}>{disabledReason}</span>
                {/if}
              </ToggleGroup.Item>
            {/each}
          </ToggleGroup.Root>
        </Card.Content>
      </Card.Root>
    </div>

    <aside class={appColumnClass} aria-label="Application preferences">
      <Card.Root class={cn(settingsCardClass, "monkeytype-card")}>
        <Card.Header class={settingsCardHeaderClass}>
          <div class={cardTitleStackClass}>
            <Card.Title>Monkeytype</Card.Title>
            <Card.Description>{monkeytypeSummary}</Card.Description>
          </div>
          <span class={integrationScopeClass} data-connected={shell.monkeytype.connected}>
            {shell.monkeytype.connected ? "connected" : "data source"}
          </span>
        </Card.Header>
        <Card.Content class={monkeytypeSettingsClass}>
          <div class={monkeytypeScoreboardClass} data-connected={shell.monkeytype.connected}>
            <div
              class={cn(
                monkeytypeScoreClass,
                !shell.monkeytype.connected && monkeytypeScoreDisconnectedClass,
              )}
            >
              <strong class={monkeytypeScoreValueClass}>{statValue(shell.monkeytype.wpm)}</strong>
              <span class={monkeytypeScoreLabelClass}>wpm avg</span>
            </div>
            <div
              class={cn(
                monkeytypeScoreClass,
                !shell.monkeytype.connected && monkeytypeScoreDisconnectedClass,
              )}
            >
              <strong class={monkeytypeScoreValueClass}
                >{statValue(shell.monkeytype.accuracy, 1)}%</strong
              >
              <span class={monkeytypeScoreLabelClass}>accuracy</span>
            </div>
            <div
              class={cn(
                monkeytypeScoreClass,
                !shell.monkeytype.connected && monkeytypeScoreDisconnectedClass,
              )}
            >
              <strong class={monkeytypeScoreValueClass}>{statValue(shell.monkeytype.pb)}</strong>
              <span class={monkeytypeScoreLabelClass}>pb wpm</span>
            </div>
            <div
              class={cn(
                monkeytypeScoreClass,
                !shell.monkeytype.connected && monkeytypeScoreDisconnectedClass,
              )}
            >
              <strong class={monkeytypeScoreValueClass}>{statValue(shell.monkeytype.tests)}</strong>
              <span class={monkeytypeScoreLabelClass}>tests</span>
            </div>
          </div>

          <form class={monkeytypeFormClass} onsubmit={connectMonkeytype}>
            <label class={monkeytypeFieldClass}>
              <span class={monkeytypeFieldLabelClass}>ApeKey</span>
              <input
                class={monkeytypeInputClass}
                type="password"
                bind:value={monkeytypeApeKey}
                autocomplete="off"
                spellcheck="false"
                placeholder={shell.monkeytype.connected ? "Stored key stays encrypted" : "ApeKey"}
              />
            </label>

            <label class={monkeytypeFieldClass}>
              <span class={monkeytypeFieldLabelClass}>Username</span>
              <input
                class={monkeytypeInputClass}
                type="text"
                bind:value={monkeytypeUsername}
                autocomplete="username"
                spellcheck="false"
                placeholder="optional"
              />
            </label>

            <label class={cn(monkeytypeFieldClass, "monkeytype-preset")}>
              <span class={monkeytypeFieldLabelClass}>PB mode</span>
              <select class={monkeytypePresetSelectClass} bind:value={monkeytypePreset}>
                {#each monkeytypePresets as option (option.value)}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            </label>

            <div class={monkeytypeCommandRowClass}>
              <Button
                variant="coral"
                size="sm"
                type="submit"
                disabled={!monkeytypeCanSubmit}
                class={commandButtonClass}
              >
                <span class="material-symbols-outlined" aria-hidden="true">link</span>
                {shell.monkeytype.connected ? "Update" : "Connect"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onclick={refreshMonkeytype}
                disabled={!shell.monkeytype.connected || monkeytypeBusy}
                class={commandButtonClass}
              >
                <span class="material-symbols-outlined" aria-hidden="true">sync</span>
                Refresh
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onclick={disconnectMonkeytype}
                disabled={!shell.monkeytype.connected || monkeytypeBusy}
                class={commandButtonClass}
              >
                <span class="material-symbols-outlined" aria-hidden="true">link_off</span>
                Disconnect
              </Button>
            </div>
          </form>

          {#if !monkeytypeSignedIn}
            <p class={cn(errorMessageClass, "monkeytype-error")} role="status">
              Sign in with GitHub first.
            </p>
          {:else if monkeytypeError || shell.monkeytype.error}
            <p class={cn(errorMessageClass, "monkeytype-error")} role="status">
              {monkeytypeError ?? shell.monkeytype.error}
            </p>
          {:else if shell.monkeytype.connected && shell.monkeytype.stale}
            <p class={cn(noteMessageClass, "monkeytype-note")} role="status">Stale sync</p>
          {/if}
        </Card.Content>
      </Card.Root>

      <Card.Root class={cn(settingsCardClass, "extension-card")}>
        <Card.Header class={settingsCardHeaderClass}>
          <div class={cardTitleStackClass}>
            <Card.Title>Monkeytype run tagger</Card.Title>
            <Card.Description>{extensionSummary}</Card.Description>
          </div>
          <span class={extensionScopeClass} data-connected={activeExtensionDevices.length > 0}>
            extension
          </span>
        </Card.Header>
        <Card.Content class={extensionSettingsClass}>
          <div class={extensionSyncGridClass}>
            <div class={extensionSyncStatClass}>
              <strong class={extensionSyncValueClass}>{extensionChoices.keyboards.length}</strong>
              <span class={extensionSyncLabelClass}>keyboards</span>
            </div>
            <div class={extensionSyncStatClass}>
              <strong class={extensionSyncValueClass}>{extensionChoices.layouts.length}</strong>
              <span class={extensionSyncLabelClass}>layouts</span>
            </div>
            <div class={extensionSyncStatClass}>
              <strong class={extensionSyncValueClass}>{activeExtensionDevices.length}</strong>
              <span class={extensionSyncLabelClass}>active</span>
            </div>
            <div class={extensionSyncStatClass}>
              <strong class={extensionSyncValueClass}>{extensionSyncStatus}</strong>
              <span class={extensionSyncLabelClass}>sync</span>
            </div>
          </div>

          {#if extensionPairing}
            <div class={extensionPairingCodeClass}>
              <span class={extensionPairingMetaClass}>Pairing code</span>
              <strong class={extensionPairingValueClass}>{extensionPairing.code}</strong>
              <small class={extensionPairingMetaClass}
                >Expires {shortDate(extensionPairing.expiresAt)}</small
              >
            </div>
          {/if}

          <div class={extensionCommandRowClass}>
            <Button
              variant="coral"
              size="sm"
              onclick={createExtensionPairingCode}
              disabled={!monkeytypeSignedIn || extensionBusy}
              class={commandButtonClass}
            >
              <span class="material-symbols-outlined" aria-hidden="true">add_link</span>
              {extensionBusy ? "Working" : "Create code"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onclick={() => refreshExtensionDevices()}
              disabled={!monkeytypeSignedIn || extensionBusy}
              class={commandButtonClass}
            >
              <span class="material-symbols-outlined" aria-hidden="true">sync</span>
              Refresh
            </Button>
          </div>

          {#if !monkeytypeSignedIn}
            <p class={cn(noteMessageClass, "extension-note")} role="status">
              Sign in with GitHub first.
            </p>
          {:else if extensionDevices.length === 0}
            <p class={cn(noteMessageClass, "extension-note")} role="status">No paired devices.</p>
          {:else}
            <div class={extensionDeviceListClass}>
              {#each extensionDevices as device (device.id)}
                <div class={extensionDeviceRowClass} data-revoked={device.revokedAt !== null}>
                  <span class={extensionDeviceIconClass} aria-hidden="true">
                    {device.revokedAt ? "phonelink_erase" : "extension"}
                  </span>
                  <div class={extensionDeviceCopyClass}>
                    <strong class={extensionDeviceTitleClass}
                      >{device.label ?? "Monkeytype tagger"}</strong
                    >
                    <small class={extensionDeviceMetaClass}>
                      {device.extensionVersion ?? "unknown"} · last {shortDate(device.lastSeenAt)}
                    </small>
                  </div>
                  {#if device.revokedAt}
                    <span class={extensionDeviceStateClass}>revoked</span>
                  {:else}
                    <button
                      type="button"
                      onclick={() => revokeExtension(device.id)}
                      disabled={extensionRevokingId === device.id}
                      aria-label={`Revoke ${device.label ?? "extension device"}`}
                      class={extensionDeviceButtonClass}
                    >
                      <span class="material-symbols-outlined" aria-hidden="true">link_off</span>
                    </button>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}

          {#if extensionError}
            <p class={cn(errorMessageClass, "extension-error")} role="status">{extensionError}</p>
          {:else if extensionNotice}
            <p class={cn(noteMessageClass, "extension-note")} role="status">{extensionNotice}</p>
          {/if}
        </Card.Content>
      </Card.Root>

      <Card.Root class={cn(settingsCardClass, "app-card")}>
        <Card.Header class={settingsCardHeaderClass}>
          <div class={cardTitleStackClass}>
            <Card.Title>App Preferences</Card.Title>
            <Card.Description>{appPreferenceSummary}</Card.Description>
          </div>
          <span class={appScopeClass}>local</span>
        </Card.Header>
        <Card.Content class={appPreferencesClass}>
          <section class={preferenceSectionClass}>
            <div class={preferenceHeadClass}>
              <h3 class={preferenceHeadTitleClass}>Target OS</h3>
              <span class={preferenceHeadValueClass}>{TargetOS.labels[workbench.targetOs]}</span>
            </div>
            <SegmentedNav
              items={osItems}
              value={workbench.targetOs}
              onselect={updateTargetOS}
              ariaLabel="Target operating system"
              class={settingsOsSegmentClass}
            />
            <p class={bodyCopyClass}>
              Keycaps and binding summaries use this OS when translating common shortcuts.
            </p>
          </section>

          <section class={preferenceSectionClass}>
            <div class={preferenceHeadClass}>
              <h3 class={preferenceHeadTitleClass}>Accent</h3>
              <span class={preferenceHeadValueClass}>{Accent.accentById(accentId).label}</span>
            </div>
            <div class={accentGridClass} role="radiogroup" aria-label="Accent color">
              {#each Accent.accentOptions as accent (accent.id)}
                <button
                  type="button"
                  class={cn(accentSwatchClass, accent.id === accentId && accentSwatchActiveClass)}
                  style={`--accent-color: ${accent.value}`}
                  role="radio"
                  aria-checked={accent.id === accentId}
                  title={`${accent.label} accent`}
                  onclick={() => updateAccent(accent.id)}
                >
                  <span class={accentPreviewClass} aria-hidden="true"></span>
                  <strong class={accentLabelClass}>{accent.label}</strong>
                </button>
              {/each}
            </div>
            <p class={bodyCopyClass}>
              Accent is an app preference. It is persisted locally and applied by overriding
              <code class={inlineCodeClass}>--coral</code> at startup.
            </p>
          </section>

          {#if preferenceError}
            <p class={preferenceErrorClass} role="status">{preferenceError}</p>
          {/if}
        </Card.Content>
      </Card.Root>
    </aside>
  </div>
</section>
