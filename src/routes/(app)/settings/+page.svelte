<script lang="ts">
  import { page } from "$app/state";
  import {
    GitBranch,
    Link,
    Link2Off,
    Plus,
    RefreshCw,
    Trash2,
    Unplug,
    UploadCloud,
  } from "@lucide/svelte";
  import { Effect } from "effect";
  import { onMount, untrack } from "svelte";

  import { Accent, EditorLayout, TargetOS, Theme } from "$lib/app";
  import {
    decodeAuthClientErrorEffect,
    decodeGitHubFirmwareAppConnectResponseEffect,
    decodeGitHubFirmwareAppStatusEffect,
    decodeGitHubFirmwareBuildResponseEffect,
    decodeGitHubFirmwareCleanupResponseEffect,
    decodeGitHubFirmwareSyncResponseEffect,
    decodeMonkeytypeConnectionStatusEffect,
  } from "$lib/app/auth-client-boundary";
  import {
    authClientErrorMessage,
    createFirmwareGithubSyncInput,
    firmwareGithubVariantInput,
  } from "$lib/app/firmware-github-actions";
  import { forkApp, startScopedApp } from "$lib/app/runtime";
  import { authClient } from "$lib/auth-client";
  import { DEFAULT_MONKEYTYPE_MODE, DEFAULT_MONKEYTYPE_MODE2 } from "$lib/monkeytype/types";
  import type {
    GitHubFirmwareAppStatus,
    GitHubFirmwareSyncResponse,
  } from "$lib/github-app/types";
  import {
    Button,
    Card,
    CatalogPicker,
    Input,
    SegmentedNav,
    SliderField,
    Switch,
    ToggleGroup,
  } from "$lib/components/ui";
  import { cn } from "$lib/utils.js";
  import { platformError } from "$lib/effect/errors";
  import type { CatalogOption, SegmentItem } from "$lib/components/ui/types";
  import { getShellContext } from "$lib/app/shell-store.svelte";
  import { getWorkbenchContext } from "$lib/app/workbench-store.svelte";
  import { getFirmwareBuildEventsContext } from "$lib/app/firmware-build-events.svelte";
  import {
    profileDisplayName,
    type FirmwareMetadata,
    type KeyboardSettings,
  } from "$lib/keyboard/schema";
  import type { KeyboardCatalogIndexEntry } from "$lib/keyboard/catalog";
  import {
    qmkFirmwareTargets,
    zmkFirmwareTargets,
    type QmkFirmwareTarget,
    type ZmkFirmwareTarget,
  } from "$lib/keyboard/firmware-targets";
  import {
    compactFirmwareDiagnostics,
    firmwareDiagnosticKey,
    generateFirmwareArtifacts,
  } from "$lib/keyboard/firmware-source";
  import type {
    CreatePairingTokenResponse,
    ExtensionDeviceDto,
    KeyboardChoicesResponse,
    TaggedRun,
    TypingRunStatsGroup,
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
    getTypingRunStats,
    listExtensionDevices,
    listTaggedRuns,
    retryRunCorrelation,
    revokeExtensionDevice,
    syncExtensionKeyboardChoices,
  } from "./typing-runs.remote";
  import { getViaKeyboardDetail, getViaKeyboardIndex, resolveZmkTarget } from "../../keyboards.remote";

  type BehaviorToggleKey = "permissiveHold" | "retroTapping" | "nkro";
  type SettingsSection = "keyboard" | "integrations" | "app";

  const shell = getShellContext();
  const workbench = getWorkbenchContext();
  const firmwareBuildEvents = getFirmwareBuildEventsContext();
  let accentId = $state<Accent.AccentId>(Accent.DEFAULT_ACCENT_ID);
  let themeId = $state<Theme.ThemeId>(Theme.DEFAULT_THEME);
  let preferenceError = $state<string | null>(null);
  let monkeytypeApeKey = $state("");
  let monkeytypeUsername = $state("");
  let monkeytypePreset = $state(`${DEFAULT_MONKEYTYPE_MODE}:${DEFAULT_MONKEYTYPE_MODE2}`);
  let monkeytypeBusy = $state(false);
  let monkeytypeError = $state<string | null>(null);
  let monkeytypeSeeded = $state(false);
  let extensionDevices = $state<ExtensionDeviceDto[]>([]);
  let taggedRuns = $state<TaggedRun[]>([]);
  let typingRunStats = $state<TypingRunStatsGroup[]>([]);
  let correlationRetrying = $state(false);
  let extensionPairing = $state<CreatePairingTokenResponse | null>(null);
  let extensionBusy = $state(false);
  let extensionRevokingId = $state<string | null>(null);
  let extensionError = $state<string | null>(null);
  let extensionNotice = $state<string | null>(null);
  let extensionLoadedFor = $state<string | null>(null);
  let extensionSyncedChoiceKey = $state("");
  let firmwareGithubStatus = $state<GitHubFirmwareAppStatus | null>(null);
  let firmwareGithubLoadedFor = $state<string | null>(null);
  let firmwareGithubBusy = $state(false);
  let firmwareGithubError = $state<string | null>(null);
  let firmwareGithubNotice = $state<string | null>(null);
  let firmwareGithubSyncResult = $state<GitHubFirmwareSyncResponse | null>(null);
  let firmwareGithubDeleteConfirmation = $state("");
  let firmwareTargetSeedKey = $state("");
  let firmwareTargetSaving = $state(false);
  let firmwareTargetNotice = $state<string | null>(null);
  let firmwareTargetError = $state<string | null>(null);
  let firmwareTargetResolving = $state(false);
  let qmkCatalogItems = $state<KeyboardCatalogIndexEntry[]>([]);
  let qmkCatalogQuery = $state("");
  let qmkCatalogSelectedId = $state("");
  let qmkKeyboard = $state("");
  let qmkLayout = $state("");
  let qmkKeymap = $state("");
  let qmkRepository = $state("");
  let qmkRef = $state("");
  let qmkAlternatives = $state<QmkFirmwareTarget[]>([]);
  let qmkTargetConfirmed = $state(true);
  let zmkTargetQuery = $state("");
  let zmkBoard = $state("");
  let zmkShields = $state("");
  let zmkKeymap = $state("");
  let zmkRepository = $state("");
  let zmkRef = $state("");
  let zmkAlternatives = $state<ZmkFirmwareTarget[]>([]);
  let zmkTargetConfirmed = $state(true);

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
  const generatedFirmware = $derived(generateFirmwareArtifacts(profile));
  const blockingFirmwareDiagnostics = $derived(
    compactFirmwareDiagnostics(
      generatedFirmware.diagnostics.filter((item) => item.severity === "error"),
    ),
  );
  const qmkCatalogOptions = $derived.by(() => qmkOptions(qmkCatalogItems, qmkCatalogQuery));
  const qmkTargetOptions = $derived(
    qmkFirmwareTargets({
      alternatives: qmkAlternatives,
      keyboard: optionalText(qmkKeyboard),
      layout: optionalText(qmkLayout),
    }),
  );
  const zmkTargetOptions = $derived(
    zmkFirmwareTargets({
      alternatives: zmkAlternatives,
      board: optionalText(zmkBoard),
      shields: commaSeparatedValues(zmkShields),
    }),
  );
  const activeFirmwareEvent = $derived(
    firmwareBuildEvents.events.find(
      (event) =>
        event.branch.variantId === workbench.activeVariant.id &&
        event.repository.firmwareFamily === profile.firmware,
    ) ?? null,
  );
  const firmwareGithubRepository = $derived(
    firmwareGithubSyncResult?.repository ?? activeFirmwareEvent?.repository ?? null,
  );
  const firmwareGithubBranch = $derived(
    firmwareGithubSyncResult?.branch ?? activeFirmwareEvent?.branch ?? null,
  );
  const monkeytypeSignedIn = $derived(shell.account.status === "signed-in");
  const monkeytypeCanSubmit = $derived(monkeytypeSignedIn && !monkeytypeBusy);
  const monkeytypeNeedsApeKey = $derived(
    monkeytypeSignedIn && !shell.monkeytype.connected && monkeytypeApeKey.trim().length === 0,
  );
  const extensionChoices = $derived.by(extensionChoicesForWorkbench);
  const extensionChoiceKey = $derived(JSON.stringify(extensionChoices));
  const activeExtensionDevices = $derived(
    extensionDevices.filter((device) => device.revokedAt === null),
  );
  const splitTransportCopy = $derived.by(() => {
    if (isZmkDevice(profile)) return "ZMK wireless splits use BLE.";
    if (isSplitKeyboard(profile)) return "Choose the link between halves.";
    return "Split options unlock for split layouts.";
  });

  const osItems = [
    { value: "mac", label: "macOS", title: "Use macOS shortcut labels" },
    { value: "win", label: "Windows", title: "Use Windows shortcut labels" },
    { value: "linux", label: "Linux", title: "Use Linux shortcut labels" },
  ] satisfies SegmentItem<TargetOS.TargetOS>[];

  const layoutItems = EditorLayout.editorLayoutOptions.map((option) => ({
    value: option.id,
    label: option.label,
    title: option.hint,
  })) satisfies SegmentItem<EditorLayout.EditorLayoutId>[];

  const themeItems = Theme.themeOptions.map((option) => ({
    value: option.id,
    label: option.label,
    title: `${option.label} theme`,
  })) satisfies SegmentItem<Theme.ThemeId>[];

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
      detail: "Another key press resolves hold.",
    },
    {
      key: "retroTapping",
      label: "Retro tapping",
      detail: "A lone release resolves tap.",
    },
    {
      key: "nkro",
      label: "NKRO",
      detail: "Report all simultaneous keys.",
    },
  ] satisfies ReadonlyArray<{
    key: BehaviorToggleKey;
    label: string;
    detail: string;
  }>;

  const settingsSectionItems = [
    { value: "keyboard", label: "Keyboard", href: "/settings?section=keyboard" },
    { value: "integrations", label: "Integrations", href: "/settings?section=integrations" },
    { value: "app", label: "App", href: "/settings?section=app" },
  ] satisfies SegmentItem<SettingsSection>[];
  const settingsSection = $derived.by<SettingsSection>(() => {
    if (page.url.searchParams.has("github_firmware")) return "integrations";
    const value = page.url.searchParams.get("section");
    return value === "integrations" || value === "app" ? value : "keyboard";
  });

  const settingsPageClass =
    "settings-page grid min-h-[calc(100vh-58px)] content-start gap-kb-18 bg-paper p-kb-22 max-[560px]:p-kb-14";
  const settingsToolbarClass =
    "settings-toolbar flex min-w-0 items-center gap-kb-12 max-[820px]:flex-wrap";
  const settingsTitleClass = "settings-title grid min-w-0 gap-kb-4 max-[820px]:w-full";
  const settingsHeadingClass =
    "m-0 overflow-hidden text-ellipsis whitespace-nowrap text-[24px] leading-[1.05] max-[560px]:text-[20px]";
  const settingsToolbarSpacerClass =
    "settings-toolbar-spacer min-w-kb-12 flex-1 max-[820px]:hidden";
  const settingsMeterClass =
    "settings-meter grid min-h-kb-34 max-w-[250px] grid-cols-[17px_auto_minmax(0,auto)] items-center gap-kb-6 rounded-pill border border-[color-mix(in_oklch,var(--coral)_34%,var(--line-2))] px-kb-10 py-0 text-ink [background:color-mix(in_oklch,var(--coral)_9%,var(--surface))] max-[820px]:flex-[1_1_210px] max-[560px]:max-w-none";
  const settingsActionsClass =
    "settings-actions flex min-w-0 items-center gap-kb-8 data-[active=false]:invisible max-[820px]:w-full";
  const settingsMeterIconClass = "material-symbols-outlined text-[17px]";
  const settingsMeterCountClass = "font-mono text-[13px]";
  const settingsMeterCopyClass = "overflow-hidden text-ellipsis whitespace-nowrap text-[11px]";
  const settingsSectionNavClass = "settings-section-nav flex min-w-0 items-center";
  const settingsGridClass = "settings-grid grid items-start gap-kb-18";
  const deviceColumnClass =
    "device-column grid min-w-0 grid-cols-2 gap-kb-16 max-[820px]:grid-cols-1";
  const appColumnClass = "app-column grid w-full min-w-0 gap-kb-16";
  const integrationsColumnClass =
    "integration-column grid w-full min-w-0 grid-cols-2 items-start gap-kb-16 max-[820px]:grid-cols-1";
  const settingsCardClass = "settings-card min-w-0";
  const settingsCardHeaderClass =
    "settings-card-header min-h-[54px] [&_[data-slot=card-description]]:whitespace-normal";
  const cardTitleStackClass = "card-title-stack grid min-w-0 flex-1 gap-kb-4";
  const settingsCardBodyClass = "settings-card-body grid gap-kb-16";
  const toggleListClass = "settings-card-body toggle-list grid gap-kb-8";
  const monkeytypeSettingsClass = "settings-card-body monkeytype-settings grid gap-kb-12";
  const extensionSettingsClass = "settings-card-body extension-settings grid gap-kb-12";
  const firmwareGithubSettingsClass =
    "settings-card-body firmware-github-settings grid gap-kb-12";
  const appPreferencesClass = "settings-card-body app-preferences grid gap-kb-18";
  const scopeChipClass =
    "scope-chip inline-flex min-h-kb-24 items-center whitespace-nowrap rounded-pill border border-line-2 bg-surface-2 px-kb-8 py-0 font-mono text-kb-10 text-ink-2";
  const appScopeClass = cn(scopeChipClass, "app-scope");
  const integrationScopeClass = cn(
    scopeChipClass,
    "integration-scope data-[connected=true]:border-[var(--success-border)] data-[connected=true]:bg-success-surface data-[connected=true]:text-success-ink",
  );
  const extensionScopeClass = cn(
    scopeChipClass,
    "extension-scope data-[connected=true]:border-[var(--success-border)] data-[connected=true]:bg-success-surface data-[connected=true]:text-success-ink",
  );
  const transportChipClass = cn(scopeChipClass, "transport-chip");
  const toggleRowClass =
    "toggle-row grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-kb-14 rounded-keycap border border-transparent bg-paper-2 px-kb-12 py-[11px] hover:border-line-2";
  const toggleCopyStackClass = "grid min-w-0 cursor-pointer gap-kb-4";
  const toggleTitleClass = "font-mono text-[12px] font-strong";
  const toggleDetailClass = "text-[12px] leading-[1.4] text-ink-3";
  const transportGridClass =
    "settings-transport-grid grid w-full grid-cols-4 gap-kb-8 max-[820px]:grid-cols-2 max-[560px]:grid-cols-1";
  const transportOptionClass =
    "settings-transport-option flex h-auto min-h-kb-92 w-full flex-col items-start justify-start gap-kb-3 whitespace-normal rounded-keycap border-line-2 bg-paper p-kb-12 text-left data-[state=on]:border-[color-mix(in_oklch,var(--coral)_58%,var(--line-2))] data-[state=on]:[background:color-mix(in_oklch,var(--coral)_9%,var(--paper))] data-[state=on]:shadow-[0_0_0_1px_color-mix(in_oklch,var(--coral)_34%,transparent)]";
  const transportOptionDisabledClass = "disabled cursor-not-allowed opacity-[0.52]";
  const transportOptionTitleClass = "font-mono text-[13px] text-ink";
  const transportOptionDetailClass = "text-[11px] text-ink-3";
  const preferenceSectionClass = "preference-section grid min-w-0 gap-kb-10";
  const extensionPairingCodeClass =
    "extension-pairing-code grid min-w-0 gap-kb-5 rounded-keycap border border-[color-mix(in_oklch,var(--coral)_36%,var(--line-2))] px-kb-12 py-[11px] [background:color-mix(in_oklch,var(--coral)_10%,var(--paper))]";
  const extensionPairingMetaClass =
    "font-mono text-[10px] tracking-[0.1em] text-ink-3 uppercase";
  const extensionPairingValueClass =
    "[overflow-wrap:anywhere] font-mono text-[18px] tracking-[0.08em] text-ink";
  const extensionCommandRowClass =
    "extension-command-row grid grid-cols-2 gap-kb-6 max-[560px]:grid-cols-1";
  const firmwareCommandRowClass =
    "firmware-command-row grid grid-cols-2 gap-kb-6 max-[560px]:grid-cols-1";
  const firmwareRepoPanelClass =
    "firmware-repo-panel grid gap-kb-8 rounded-keycap border border-line bg-paper-2 p-kb-10";
  const firmwareRepoLineClass =
    "grid grid-cols-[72px_minmax(0,1fr)] gap-kb-8 text-[11px] leading-[1.35]";
  const firmwareRepoKeyClass = "font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase";
  const firmwareRepoValueClass = "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-ink";
  const commandButtonClass =
    "w-full justify-center gap-kb-6 px-kb-10 font-mono text-[11px] font-medium";
  const extensionDeviceListClass = "extension-device-list grid min-w-0 gap-kb-7";
  const extensionDeviceRowClass =
    "extension-device-row grid min-h-[46px] min-w-0 grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-kb-8 rounded-keycap border border-line px-kb-9 py-kb-8 [background:color-mix(in_oklch,var(--paper-2)_76%,transparent)] data-[revoked=true]:opacity-[0.62]";
  const extensionDeviceIconClass = "material-symbols-outlined text-[18px] text-teal";
  const extensionDeviceCopyClass = "min-w-0";
  const extensionDeviceTitleClass =
    "block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11.5px]";
  const extensionDeviceMetaClass =
    "block overflow-hidden text-ellipsis whitespace-nowrap text-[10.5px] text-ink-3";
  const extensionDeviceStateClass = "device-state text-[10.5px] text-ink-3";
  const taggedRunListClass = "tagged-run-list grid min-w-0 gap-kb-7";
  const taggedRunRowClass =
    "tagged-run-row grid min-w-0 gap-kb-3 rounded-keycap border border-line px-kb-9 py-kb-8 [background:color-mix(in_oklch,var(--paper-2)_76%,transparent)]";
  const taggedRunMetaClass =
    "block overflow-hidden text-ellipsis whitespace-nowrap text-[10.5px] text-ink-3";
  const typingRunStatsListClass = "typing-run-stats grid min-w-0 gap-kb-6";
  const monkeytypeFormClass =
    "monkeytype-form grid min-w-0 grid-cols-2 gap-kb-10 max-[640px]:grid-cols-1";
  const monkeytypeFieldClass = "monkeytype-field grid min-w-0 gap-kb-6";
  const monkeytypeFieldLabelClass =
    "font-mono text-[10px] tracking-[0.12em] text-ink-3 uppercase";
  const monkeytypeInputClass = "h-kb-34 border-line-2 bg-paper font-mono text-[12px]";
  const monkeytypeHelpClass = "m-0 text-[11px] leading-[1.45] text-ink-3";
  const monkeytypePresetSelectClass =
    "h-kb-34 w-full rounded-md border border-line-2 bg-surface px-kb-10 font-mono text-[12px] text-ink outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
  const monkeytypeCommandRowClass =
    "monkeytype-command-row col-span-2 grid grid-cols-2 gap-kb-6 max-[640px]:col-span-1 max-[560px]:grid-cols-1";
  const integrationPrimaryButtonClass = cn(
    commandButtonClass,
    "integration-primary-action border-line-2 bg-surface-2 text-ink hover:border-line-3 hover:bg-surface-3",
  );
  const statusMessageClass = "m-0 rounded-lg px-kb-10 py-kb-9 text-kb-12 leading-[1.4]";
  const errorMessageClass = cn(
    statusMessageClass,
    "border border-[var(--danger-border)] bg-danger-surface text-danger-ink",
  );
  const noteMessageClass = cn(
    statusMessageClass,
    "border border-[var(--warning-border)] bg-warning-surface text-warning-ink",
  );
  const preferenceHeadClass =
    "preference-head flex min-w-0 items-baseline justify-between gap-kb-10";
  const preferenceHeadTitleClass =
    "m-0 font-mono text-kb-10 text-ink-2 uppercase";
  const preferenceHeadValueClass =
    "overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10.5px] text-ink-3";
  const settingsOsSegmentClass =
    "settings-os-segment w-full [&>[data-slot=button]]:min-w-0 [&>[data-slot=button]]:flex-1 [&>[data-slot=button]]:px-kb-8";
  const preferenceHintClass = "preference-hint m-0 text-[11px] leading-[1.4] text-ink-3";
  const accentGridClass = "accent-grid grid grid-cols-2 gap-kb-8 max-[560px]:grid-cols-1";
  const accentSwatchClass =
    "accent-swatch grid min-h-kb-38 grid-cols-[26px_minmax(0,1fr)] items-center gap-kb-8 rounded-keycap border border-line-2 [background:var(--paper)] px-kb-8 py-kb-6 text-left text-ink-2 transition-[border-color,background,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-out-soft)] hover:border-[color-mix(in_oklch,var(--accent-color)_66%,var(--line-2))] hover:[background:color-mix(in_oklch,var(--accent-color)_10%,var(--paper))]";
  const accentSwatchActiveClass =
    "active border-[color-mix(in_oklch,var(--accent-color)_66%,var(--line-2))] [background:color-mix(in_oklch,var(--accent-color)_10%,var(--paper))] shadow-[0_0_0_1px_color-mix(in_oklch,var(--accent-color)_40%,transparent)]";
  const accentPreviewClass =
    "h-kb-22 w-kb-26 rounded-md border border-[rgba(27,25,23,0.16)] [background:var(--accent-color)] shadow-[inset_0_-3px_0_rgba(27,25,23,0.14)]";
  const accentLabelClass =
    "overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] font-strong";
  const preferenceErrorClass = cn(errorMessageClass, "preference-error leading-[1.45]");
  const firmwareTargetFormClass = "grid min-w-0 grid-cols-2 gap-kb-10 max-[640px]:grid-cols-1";
  const firmwareTargetFinderClass =
    "col-span-2 grid min-w-0 gap-kb-7 rounded-keycap border border-line bg-paper-2 p-kb-10 max-[640px]:col-span-1";
  const firmwareTargetFinderRowClass =
    "flex min-w-0 items-center gap-kb-8 max-[560px]:items-stretch max-[560px]:flex-col";
  const firmwareTargetCandidatesClass =
    "col-span-2 grid min-w-0 grid-cols-2 gap-kb-7 max-[760px]:grid-cols-1 max-[640px]:col-span-1";
  const firmwareTargetCandidateClass =
    "grid min-h-kb-52 min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-kb-10 rounded-keycap border border-line-2 bg-paper px-kb-10 py-kb-8 text-left hover:border-line-3 data-[active=true]:border-[color-mix(in_oklch,var(--coral)_58%,var(--line-2))] data-[active=true]:[background:color-mix(in_oklch,var(--coral)_8%,var(--paper))]";
  const firmwareTargetCandidateCopyClass = "grid min-w-0 gap-kb-3";
  const firmwareTargetCandidateTitleClass =
    "overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-ink";
  const firmwareTargetCandidateDetailClass =
    "overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] text-ink-3";
  const firmwareTargetFieldClass = "grid min-w-0 gap-kb-6";
  const firmwareTargetLabelClass =
    "font-mono text-[10px] tracking-[0.12em] text-ink-3 uppercase";
  const firmwareTargetInputClass = "h-kb-34 border-line-2 bg-paper font-mono text-[12px]";
  const firmwareTargetHelpClass = "col-span-2 m-0 text-[11px] leading-[1.45] text-ink-3 max-[640px]:col-span-1";
  const firmwareTargetDiagnosticListClass =
    "col-span-2 grid gap-kb-5 rounded-lg border border-[var(--danger-border)] bg-danger-surface p-kb-10 text-[11px] leading-[1.4] text-danger-ink max-[640px]:col-span-1";

  $effect(() => {
    const safe = normalizeSplitTransport(settings.splitTransport, profile);
    if (safe !== settings.splitTransport) {
      workbench.updateSettings({ splitTransport: safe });
    }
  });

  $effect(() => {
    const seedKey = `${profile.id}:${JSON.stringify(profile.firmwareMetadata ?? {})}`;
    if (firmwareTargetSeedKey === seedKey) return;
    firmwareTargetSeedKey = seedKey;
    qmkKeyboard = profile.firmwareMetadata?.qmk?.keyboard ?? "";
    qmkLayout = profile.firmwareMetadata?.qmk?.layout ?? "";
    qmkKeymap = profile.firmwareMetadata?.qmk?.keymap ?? "";
    qmkRepository = profile.firmwareMetadata?.qmk?.repository ?? "";
    qmkRef = profile.firmwareMetadata?.qmk?.ref ?? "";
    qmkAlternatives = profile.firmwareMetadata?.qmk?.alternatives ?? [];
    qmkTargetConfirmed = profile.firmwareMetadata?.qmk?.targetConfirmed !== false;
    qmkCatalogSelectedId = "";
    zmkBoard = profile.firmwareMetadata?.zmk?.board ?? "";
    zmkShields = (
      profile.firmwareMetadata?.zmk?.shields ??
      (profile.firmwareMetadata?.zmk?.shield ? [profile.firmwareMetadata.zmk.shield] : [])
    ).join(", ");
    zmkKeymap = profile.firmwareMetadata?.zmk?.keymap ?? "";
    zmkRepository = profile.firmwareMetadata?.zmk?.repository ?? "";
    zmkRef = profile.firmwareMetadata?.zmk?.ref ?? "";
    zmkAlternatives = profile.firmwareMetadata?.zmk?.alternatives ?? [];
    zmkTargetConfirmed = profile.firmwareMetadata?.zmk?.targetConfirmed !== false;
    zmkTargetQuery = profile.name;
  });

  onMount(() =>
    startScopedApp(
      "settings.initialize",
      Effect.all(
        [
          Accent.loadAndApply.pipe(
            Effect.tap((loaded) => Effect.sync(() => loaded && (accentId = loaded))),
            Effect.catch((error) =>
              Effect.sync(() => capturePreferenceError("Load accent", clientErrorMessage(error, "Could not load accent"))),
            ),
          ),
          Theme.loadAndApply.pipe(
            Effect.tap((loaded) => Effect.sync(() => loaded && (themeId = loaded))),
            Effect.catch((error) =>
              Effect.sync(() => capturePreferenceError("Load theme", clientErrorMessage(error, "Could not load theme"))),
            ),
          ),
          profile.firmware === "qmk" ? loadQmkCatalogEffect() : Effect.void,
        ],
        { concurrency: 3, discard: true },
      ),
    ),
  );

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
    const userId = shell.account.status === "signed-in" ? (shell.account.id ?? null) : null;
    if (!userId) {
      extensionDevices = [];
      extensionPairing = null;
      extensionLoadedFor = null;
      extensionSyncedChoiceKey = "";
      firmwareGithubStatus = null;
      firmwareGithubLoadedFor = null;
      firmwareGithubError = null;
      firmwareGithubSyncResult = null;
      return;
    }

    return untrack(() => {
      const effects = [];
      if (extensionLoadedFor !== userId) {
        extensionLoadedFor = userId;
        effects.push(refreshExtensionDevicesEffect(false));
      }
      if (firmwareGithubLoadedFor !== userId) {
        firmwareGithubLoadedFor = userId;
        effects.push(refreshFirmwareGithubStatusEffect(false));
      }
      if (effects.length === 0) return;
      return startScopedApp(
        "settings.load-account-integrations",
        Effect.all(effects, { concurrency: 2, discard: true }),
      );
    });
  });

  $effect(() => {
    if (!monkeytypeSignedIn) return;
    if (extensionChoiceKey === extensionSyncedChoiceKey) return;
    extensionSyncedChoiceKey = extensionChoiceKey;
    const choices = extensionChoices;
    return startScopedApp("extension.sync-keyboard-choices", syncExtensionChoicesEffect(choices));
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

  function hostEffect<A>(operation: string, task: () => PromiseLike<A>) {
    return Effect.tryPromise({
      try: task,
      catch: (cause) => platformError(operation, cause),
    });
  }

  function loadQmkCatalogEffect() {
    if (qmkCatalogItems.length > 0 || firmwareTargetResolving) return Effect.void;
    return Effect.gen(function* () {
      firmwareTargetResolving = true;
      firmwareTargetError = null;
      const catalog = yield* hostEffect("firmware-target.load-qmk-catalog", () =>
        getViaKeyboardIndex(),
      );
      qmkCatalogItems = catalog.items;
    }).pipe(
      Effect.catch((error) =>
        Effect.sync(
          () =>
            (firmwareTargetError =
              error instanceof Error
                ? error.message
                : "Could not load the VIA/QMK target catalog."),
        ),
      ),
      Effect.ensuring(Effect.sync(() => (firmwareTargetResolving = false))),
    );
  }

  function selectQmkCatalogEntry(id: string) {
    qmkCatalogSelectedId = id;
    if (!id) return;
    firmwareTargetResolving = true;
    firmwareTargetNotice = null;
    firmwareTargetError = null;
    forkApp(
      "firmware-target.select-qmk",
      Effect.gen(function* () {
      const entry = yield* hostEffect("firmware-target.qmk-detail", () =>
        getViaKeyboardDetail(id),
      );
      const metadata = entry.firmwareMetadata?.qmk;
      const targets = qmkFirmwareTargets(metadata);
      const primary = targets[0];
      if (!metadata || !primary) {
        return yield* Effect.fail(
          platformError(
            "firmware-target.qmk-missing",
            `${entry.name} has a VIA definition, but no matching QMK keyboard/layout target was found.`,
          ),
        );
      }

      qmkKeyboard = primary.keyboard;
      qmkLayout = primary.layout;
      qmkKeymap = metadata.keymap ?? qmkKeymap;
      qmkRepository = metadata.repository ?? "qmk/qmk_firmware";
      qmkRef = metadata.ref ?? "";
      qmkAlternatives = targets.slice(1);
      qmkTargetConfirmed = targets.length === 1;
      firmwareTargetNotice =
        targets.length > 1
          ? `Found ${targets.length} compatible QMK targets. Confirm the controller variant, then save.`
          : `Matched ${entry.name} to ${primary.keyboard}. Save to use it for builds.`;
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(
            () =>
              (firmwareTargetError =
                error instanceof Error
                  ? error.message
                  : "Could not resolve the selected QMK target."),
          ),
        ),
        Effect.ensuring(Effect.sync(() => (firmwareTargetResolving = false))),
      ),
    );
  }

  function useQmkTarget(target: QmkFirmwareTarget) {
    const options = qmkTargetOptions;
    qmkKeyboard = target.keyboard;
    qmkLayout = target.layout;
    qmkAlternatives = options.filter(
      (option) => option.keyboard !== target.keyboard || option.layout !== target.layout,
    );
    qmkTargetConfirmed = true;
    firmwareTargetNotice = "QMK target selected. Save to use it for builds.";
    firmwareTargetError = null;
  }

  function findZmkTargets() {
    const query = zmkTargetQuery.trim();
    if (!query) {
      firmwareTargetError = "Enter a ZMK board, shield, or keyboard name.";
      return;
    }

    firmwareTargetResolving = true;
    firmwareTargetNotice = null;
    firmwareTargetError = null;
    forkApp(
      "firmware-target.find-zmk",
      Effect.gen(function* () {
      const resolved = yield* hostEffect("firmware-target.find-zmk", () =>
        resolveZmkTarget({
          deviceName: query,
          manufacturer: optionalText(profile.vendor),
        }),
      );
      const metadata = resolved?.zmk;
      const targets = zmkFirmwareTargets(metadata);
      const primary = targets[0];
      if (!metadata || !primary) {
        return yield* Effect.fail(
          platformError(
            "firmware-target.zmk-missing",
            `No ZMK board or shield target matched “${query}”.`,
          ),
        );
      }

      zmkBoard = primary.board;
      zmkShields = primary.shields.join(", ");
      zmkKeymap = metadata.keymap ?? zmkKeymap;
      zmkRepository = metadata.repository ?? "zmkfirmware/zmk";
      zmkRef = metadata.ref ?? "";
      zmkAlternatives = targets.slice(1);
      zmkTargetConfirmed = targets.length === 1;
      firmwareTargetNotice =
        targets.length > 1
          ? `Found ${targets.length} compatible ZMK targets. Confirm the controller and shields, then save.`
          : `Matched ${query} to ${zmkTargetLabel(primary)}. Save to use it for builds.`;
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(
            () =>
              (firmwareTargetError =
                error instanceof Error
                  ? error.message
                  : "Could not search the ZMK hardware catalog."),
          ),
        ),
        Effect.ensuring(Effect.sync(() => (firmwareTargetResolving = false))),
      ),
    );
  }

  function useZmkTarget(target: ZmkFirmwareTarget) {
    const options = zmkTargetOptions;
    zmkBoard = target.board;
    zmkShields = target.shields.join(", ");
    zmkAlternatives = options.filter(
      (option) =>
        option.board !== target.board || option.shields.join("\0") !== target.shields.join("\0"),
    );
    zmkTargetConfirmed = true;
    firmwareTargetNotice = "ZMK target selected. Save to use it for builds.";
    firmwareTargetError = null;
  }

  function saveFirmwareTarget(event: SubmitEvent) {
    event.preventDefault();
    firmwareTargetSaving = true;
    firmwareTargetNotice = null;
    firmwareTargetError = null;
    const current = profile.firmwareMetadata ?? {};
    const editorKeyOrder = [...profile.keys]
      .sort((left, right) => left.row - right.row || left.col - right.col)
      .map((key) => key.id);
    const next: FirmwareMetadata =
      profile.firmware === "qmk"
        ? {
            ...current,
            qmk: {
              ...current.qmk,
              alternatives: qmkAlternatives,
              keyboard: optionalText(qmkKeyboard),
              keymap: optionalText(qmkKeymap),
              keyOrder: current.qmk?.keyOrder ?? editorKeyOrder,
              layout: optionalText(qmkLayout),
              repository: optionalText(qmkRepository),
              ref: optionalText(qmkRef),
              targetConfirmed: qmkTargetConfirmed,
            },
          }
        : {
            ...current,
            zmk: {
              ...current.zmk,
              alternatives: zmkAlternatives,
              board: optionalText(zmkBoard),
              keymap: optionalText(zmkKeymap),
              keyOrder: current.zmk?.keyOrder ?? editorKeyOrder,
              shield: undefined,
              shields: commaSeparatedValues(zmkShields),
              repository: optionalText(zmkRepository),
              ref: optionalText(zmkRef),
              targetConfirmed: zmkTargetConfirmed,
            },
          };
    forkApp(
      "firmware-target.save",
      Effect.gen(function* () {
        workbench.updateFirmwareMetadata(next);
        yield* workbench.flushPersistenceEffect();
        firmwareTargetNotice = "Firmware target saved locally.";
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(
            () =>
              (firmwareTargetError =
                error instanceof Error ? error.message : "Could not save the firmware target."),
          ),
        ),
        Effect.ensuring(Effect.sync(() => (firmwareTargetSaving = false))),
      ),
    );
  }

  function optionalText(value: string) {
    const normalized = value.trim();
    return normalized || undefined;
  }

  function commaSeparatedValues(value: string) {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function qmkOptions(items: KeyboardCatalogIndexEntry[], query: string): CatalogOption[] {
    const normalized = query.trim().toLowerCase();
    return items
      .filter((item) => {
        if (!normalized) return true;
        return `${item.name} ${item.vendor} ${item.id} ${item.sourcePath}`
          .toLowerCase()
          .includes(normalized);
      })
      .slice(0, 80)
      .map((item) => ({ id: item.id, label: `${item.name} · ${item.vendor}` }));
  }

  function zmkTargetLabel(target: ZmkFirmwareTarget) {
    return target.shields.length > 0
      ? `${target.board} · ${target.shields.join(" + ")}`
      : target.board;
  }

  function updateTargetOS(next: TargetOS.TargetOS) {
    workbench.setTargetOs(next);
  }

  function updateAccent(next: Accent.AccentId) {
    accentId = next;
    preferenceError = null;
    forkApp("Save accent", Accent.saveAndApply(next), capturePreferenceError);
  }

  function updateEditorLayout(next: EditorLayout.EditorLayoutId) {
    workbench.setEditorLayout(next);
  }

  function updateTheme(next: Theme.ThemeId) {
    themeId = next;
    preferenceError = null;
    forkApp("Save theme", Theme.saveAndApply(next), capturePreferenceError);
  }

  function connectMonkeytype(event: SubmitEvent) {
    event.preventDefault();
    if (!monkeytypeCanSubmit) return;
    if (!shell.monkeytype.connected && monkeytypeApeKey.trim().length === 0) {
      monkeytypeError = "Paste a Monkeytype ApeKey before connecting.";
      return;
    }

    monkeytypeBusy = true;
    monkeytypeError = null;

    forkApp(
      "monkeytype.connect",
      Effect.gen(function* () {
      const preset = monkeytypePresets.find((option) => option.value === monkeytypePreset);
      const result = yield* hostEffect("monkeytype.connect", () =>
        authClient.monkeytype.connect({
          apeKey: monkeytypeApeKey,
          username: monkeytypeUsername,
          mode: preset?.mode ?? DEFAULT_MONKEYTYPE_MODE,
          mode2: preset?.mode2 ?? DEFAULT_MONKEYTYPE_MODE2,
        }),
      );
      const error = yield* decodeAuthClientErrorEffect(result.error).pipe(
        Effect.mapError((cause) => platformError("monkeytype.decode-connect-error", cause)),
      );
      if (error) {
        monkeytypeError = clientErrorMessage(error, "Monkeytype connect failed");
        return;
      }
      const status = yield* decodeMonkeytypeConnectionStatusEffect(result.data).pipe(
        Effect.mapError((cause) => platformError("monkeytype.decode-connect", cause)),
      );
      shell.setMonkeytypeStatus(status);
      monkeytypeApeKey = "";
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(
            () => (monkeytypeError = clientErrorMessage(error, "Monkeytype connect failed")),
          ),
        ),
        Effect.ensuring(Effect.sync(() => (monkeytypeBusy = false))),
      ),
    );
  }

  function refreshMonkeytype() {
    if (!shell.monkeytype.connected || monkeytypeBusy) return;
    monkeytypeBusy = true;
    monkeytypeError = null;
    forkApp(
      "monkeytype.refresh",
      Effect.gen(function* () {
      const result = yield* hostEffect("monkeytype.refresh", () =>
        authClient.monkeytype.refresh({ force: true }),
      );
      const error = yield* decodeAuthClientErrorEffect(result.error).pipe(
        Effect.mapError((cause) => platformError("monkeytype.decode-refresh-error", cause)),
      );
      if (error) {
        monkeytypeError = clientErrorMessage(error, "Monkeytype refresh failed");
        return;
      }
      const status = yield* decodeMonkeytypeConnectionStatusEffect(result.data).pipe(
        Effect.mapError((cause) => platformError("monkeytype.decode-refresh", cause)),
      );
      shell.setMonkeytypeStatus(status);
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(
            () => (monkeytypeError = clientErrorMessage(error, "Monkeytype refresh failed")),
          ),
        ),
        Effect.ensuring(Effect.sync(() => (monkeytypeBusy = false))),
      ),
    );
  }

  function disconnectMonkeytype() {
    if (!shell.monkeytype.connected || monkeytypeBusy) return;
    monkeytypeBusy = true;
    monkeytypeError = null;
    forkApp(
      "monkeytype.disconnect",
      Effect.gen(function* () {
      const result = yield* hostEffect("monkeytype.disconnect", () =>
        authClient.monkeytype.disconnect(),
      );
      const error = yield* decodeAuthClientErrorEffect(result.error).pipe(
        Effect.mapError((cause) => platformError("monkeytype.decode-disconnect-error", cause)),
      );
      if (error) {
        monkeytypeError = clientErrorMessage(error, "Monkeytype disconnect failed");
        return;
      }
      const status = yield* decodeMonkeytypeConnectionStatusEffect(result.data).pipe(
        Effect.mapError((cause) => platformError("monkeytype.decode-disconnect", cause)),
      );
      shell.setMonkeytypeStatus(status);
      monkeytypeApeKey = "";
      monkeytypeUsername = "";
      monkeytypePreset = `${DEFAULT_MONKEYTYPE_MODE}:${DEFAULT_MONKEYTYPE_MODE2}`;
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(
            () => (monkeytypeError = clientErrorMessage(error, "Monkeytype disconnect failed")),
          ),
        ),
        Effect.ensuring(Effect.sync(() => (monkeytypeBusy = false))),
      ),
    );
  }

  function createExtensionPairingCode() {
    if (!monkeytypeSignedIn) {
      extensionError = "Sign in with GitHub first.";
      shell.profileOpen = true;
      return;
    }
    if (extensionBusy) return;

    extensionBusy = true;
    extensionError = null;
    extensionNotice = null;
    forkApp(
      "extension.create-pairing-code",
      Effect.gen(function* () {
      extensionPairing = yield* hostEffect("extension.create-pairing-code", () =>
        createExtensionPairingToken(),
      );
      extensionNotice = "Pairing code created.";
      yield* refreshExtensionDevicesEffect(false);
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(
            () =>
              (extensionError = clientErrorMessage(
                error,
                "Pairing code could not be created.",
              )),
          ),
        ),
        Effect.ensuring(Effect.sync(() => (extensionBusy = false))),
      ),
    );
  }

  function refreshExtensionDevicesEffect(showBusy = true) {
    if (!monkeytypeSignedIn) return Effect.void;
    if (showBusy) extensionBusy = true;
    extensionError = null;
    return Effect.gen(function* () {
      const [devicesResult, runsResult, statsResult] = yield* Effect.all(
        [
          hostEffect("extension.list-devices", () => listExtensionDevices()).pipe(Effect.result),
          hostEffect("extension.list-tagged-runs", () => listTaggedRuns({ limit: 12 })).pipe(
            Effect.result,
          ),
          hostEffect("extension.typing-run-stats", () => getTypingRunStats("keyboard-layout")).pipe(
            Effect.result,
          ),
        ],
        { concurrency: 3 },
      );
      const failures: string[] = [];
      if (devicesResult._tag === "Success") {
        extensionDevices = devicesResult.success;
      } else {
        failures.push(
          clientErrorMessage(devicesResult.failure, "Extension devices could not be loaded."),
        );
      }
      if (runsResult._tag === "Success") {
        taggedRuns = runsResult.success;
      } else {
        failures.push(
          clientErrorMessage(runsResult.failure, "Tagged runs could not be loaded."),
        );
      }
      if (statsResult._tag === "Success") {
        typingRunStats = statsResult.success;
      } else {
        failures.push(
          clientErrorMessage(statsResult.failure, "Tagged run stats could not be loaded."),
        );
      }
      if (failures.length > 0) extensionError = failures.join(" ");
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (showBusy) extensionBusy = false;
        }),
      ),
    );
  }

  function refreshExtensionDevices(showBusy = true) {
    forkApp("extension.refresh-devices", refreshExtensionDevicesEffect(showBusy));
  }

  function retryTaggedRunCorrelation() {
    if (!monkeytypeSignedIn || correlationRetrying) return;
    correlationRetrying = true;
    extensionError = null;
    extensionNotice = null;
    forkApp(
      "extension.retry-correlation",
      Effect.gen(function* () {
        const updated = yield* hostEffect("extension.retry-correlation", () =>
          retryRunCorrelation(),
        );
        yield* refreshExtensionDevicesEffect(false);
        extensionNotice =
          updated === 0
            ? "No pending tags needed another match."
            : `Updated ${updated} tagged run${updated === 1 ? "" : "s"}.`;
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(
            () =>
              (extensionError = clientErrorMessage(
                error,
                "Tagged run correlation could not be retried.",
              )),
          ),
        ),
        Effect.ensuring(Effect.sync(() => (correlationRetrying = false))),
      ),
    );
  }

  function revokeExtension(id: string) {
    if (extensionRevokingId) return;
    extensionRevokingId = id;
    extensionError = null;
    extensionNotice = null;
    forkApp(
      "extension.revoke-device",
      Effect.gen(function* () {
      yield* hostEffect("extension.revoke-device", () => revokeExtensionDevice(id));
      yield* refreshExtensionDevicesEffect(false);
      extensionNotice = "Device revoked.";
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(
            () =>
              (extensionError = clientErrorMessage(
                error,
                "Extension device could not be revoked.",
              )),
          ),
        ),
        Effect.ensuring(Effect.sync(() => (extensionRevokingId = null))),
      ),
    );
  }

  function syncExtensionChoicesEffect(choices: KeyboardChoicesResponse) {
    return hostEffect("extension.sync-keyboard-choices", () =>
      syncExtensionKeyboardChoices(choices),
    ).pipe(
      Effect.catch((error) =>
        Effect.sync(
          () =>
            (extensionError = clientErrorMessage(
              error,
              "Extension keyboard choices could not be synced.",
            )),
        ),
      ),
    );
  }

  function refreshFirmwareGithubStatusEffect(showBusy = true) {
    if (!monkeytypeSignedIn) return Effect.void;
    return Effect.gen(function* () {
      if (showBusy) firmwareGithubBusy = true;
      firmwareGithubError = null;
      const result = yield* hostEffect("firmware-github.status", () =>
        authClient.firmwareGithub.status(),
      );
      const error = yield* decodeAuthClientErrorEffect(result.error).pipe(
        Effect.mapError((cause) => platformError("firmware-github.decode-status-error", cause)),
      );
      if (error) {
        firmwareGithubError = clientErrorMessage(error, "GitHub App status could not be loaded.");
        return;
      }
      const status = yield* decodeGitHubFirmwareAppStatusEffect(result.data).pipe(
        Effect.mapError((cause) => platformError("firmware-github.decode-status", cause)),
      );
      firmwareGithubStatus = status;
      if (!status.connected) firmwareGithubSyncResult = null;
    }).pipe(
      Effect.catch((error) =>
        Effect.sync(
          () =>
            (firmwareGithubError = clientErrorMessage(
              error,
              "GitHub App status could not be loaded.",
            )),
        ),
      ),
      Effect.ensuring(
        Effect.sync(() => {
          if (showBusy) firmwareGithubBusy = false;
        }),
      ),
    );
  }

  function connectFirmwareGithub() {
    if (!monkeytypeSignedIn) {
      firmwareGithubError = "Sign in with GitHub first.";
      shell.profileOpen = true;
      return;
    }
    if (firmwareGithubBusy) return;

    firmwareGithubBusy = true;
    firmwareGithubError = null;
    forkApp(
      "firmware-github.connect",
      Effect.gen(function* () {
      const result = yield* hostEffect("firmware-github.connect", () =>
        authClient.firmwareGithub.connect(),
      );
      const error = yield* decodeAuthClientErrorEffect(result.error).pipe(
        Effect.mapError((cause) => platformError("firmware-github.decode-connect-error", cause)),
      );
      if (error) {
        firmwareGithubError = clientErrorMessage(error, "GitHub App connect failed.");
        return;
      }
      const connection = yield* decodeGitHubFirmwareAppConnectResponseEffect(result.data).pipe(
        Effect.mapError((cause) => platformError("firmware-github.decode-connect", cause)),
      );
      globalThis.location.assign(connection.installUrl);
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(
            () =>
              (firmwareGithubError = clientErrorMessage(error, "GitHub App connect failed.")),
          ),
        ),
        Effect.ensuring(Effect.sync(() => (firmwareGithubBusy = false))),
      ),
    );
  }

  function disconnectFirmwareGithub() {
    if (!firmwareGithubStatus?.connected || firmwareGithubBusy) return;
    firmwareGithubBusy = true;
    firmwareGithubError = null;
    firmwareGithubNotice = null;
    forkApp(
      "firmware-github.disconnect",
      Effect.gen(function* () {
      const result = yield* hostEffect("firmware-github.disconnect", () =>
        authClient.firmwareGithub.disconnect(),
      );
      const error = yield* decodeAuthClientErrorEffect(result.error).pipe(
        Effect.mapError((cause) => platformError("firmware-github.decode-disconnect-error", cause)),
      );
      if (error) {
        firmwareGithubError = clientErrorMessage(error, "GitHub App disconnect failed.");
        return;
      }
      firmwareGithubStatus = yield* decodeGitHubFirmwareAppStatusEffect(result.data).pipe(
        Effect.mapError((cause) => platformError("firmware-github.decode-disconnect", cause)),
      );
      firmwareGithubSyncResult = null;
      firmwareGithubNotice = "Disconnected. Managed repositories and generated branches were preserved.";
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(
            () =>
              (firmwareGithubError = clientErrorMessage(error, "GitHub App disconnect failed.")),
          ),
        ),
        Effect.ensuring(Effect.sync(() => (firmwareGithubBusy = false))),
      ),
    );
  }

  function cleanupFirmwareGithub(action: "branch" | "repository") {
    if (!firmwareGithubRepository || firmwareGithubBusy) return;
    if (action === "repository" && firmwareGithubRepository.relationship !== "managed") return;
    const generated = generateFirmwareArtifacts(profile);
    const syncInput = createFirmwareGithubSyncInput({
      generated,
      profile,
      variant: firmwareGithubVariantInput({
        id: workbench.activeVariant.id,
        name: workbench.activeVariant.name,
        sourceSavePointId: workbench.selectedSavePoint?.id,
      }),
    });

    firmwareGithubBusy = true;
    firmwareGithubError = null;
    firmwareGithubNotice = null;
    forkApp(
      "firmware-github.cleanup",
      Effect.gen(function* () {
      const result = yield* hostEffect("firmware-github.cleanup", () =>
        authClient.firmwareGithub.cleanup({
          action,
          confirmation:
            action === "repository" ? firmwareGithubDeleteConfirmation.trim() : undefined,
          profile: syncInput.profile,
          repositoryName: syncInput.repositoryName,
          variant: syncInput.variant,
        }),
      );
      const error = yield* decodeAuthClientErrorEffect(result.error).pipe(
        Effect.mapError((cause) => platformError("firmware-github.decode-cleanup-error", cause)),
      );
      if (error) {
        firmwareGithubError = clientErrorMessage(error, "GitHub firmware cleanup failed.");
        return;
      }
      const cleanup = yield* decodeGitHubFirmwareCleanupResponseEffect(result.data).pipe(
        Effect.mapError((cause) => platformError("firmware-github.decode-cleanup", cause)),
      );
      firmwareGithubNotice =
        action === "repository"
          ? `Deleted managed repository ${cleanup.repositoryFullName}.`
          : `Removed generated branch ${cleanup.branchName}.`;
      firmwareGithubDeleteConfirmation = "";
      firmwareGithubSyncResult = null;
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(
            () =>
              (firmwareGithubError = clientErrorMessage(
                error,
                "GitHub firmware cleanup failed.",
              )),
          ),
        ),
        Effect.ensuring(Effect.sync(() => (firmwareGithubBusy = false))),
      ),
    );
  }

  function syncFirmwareGithub(build = false) {
    if (!monkeytypeSignedIn) {
      firmwareGithubError = "Sign in with GitHub first.";
      shell.profileOpen = true;
      return;
    }
    if (!firmwareGithubStatus?.connected) {
      firmwareGithubError = "Install the GitHub App before syncing firmware.";
      return;
    }
    if (firmwareGithubBusy) return;

    const generated = generateFirmwareArtifacts(profile);
    const input = createFirmwareGithubSyncInput({
      generated,
      profile,
      variant: firmwareGithubVariantInput({
        id: workbench.activeVariant.id,
        name: workbench.activeVariant.name,
        sourceSavePointId: workbench.selectedSavePoint?.id,
      }),
    });
    if (build && !generated.buildReady) {
      firmwareGithubError = "Generated firmware has blocking diagnostics. Sync the branch or fix metadata before building.";
      return;
    }

    firmwareGithubBusy = true;
    firmwareGithubError = null;
    firmwareGithubNotice = null;
    forkApp(
      "firmware-github.sync",
      Effect.gen(function* () {
      const result = yield* hostEffect("firmware-github.sync", () =>
        build ? authClient.firmwareGithub.build(input) : authClient.firmwareGithub.sync(input),
      );
      const error = yield* decodeAuthClientErrorEffect(result.error).pipe(
        Effect.mapError((cause) => platformError("firmware-github.decode-sync-error", cause)),
      );
      if (error) {
        firmwareGithubError = clientErrorMessage(
          error,
          build ? "GitHub firmware build dispatch failed." : "GitHub firmware sync failed.",
        );
        return;
      }
      const synced = yield* (build
        ? decodeGitHubFirmwareBuildResponseEffect(result.data)
        : decodeGitHubFirmwareSyncResponseEffect(result.data)
      ).pipe(Effect.mapError((cause) => platformError("firmware-github.decode-sync", cause)));
      firmwareGithubSyncResult = synced;
      firmwareGithubNotice = build
        ? `Build dispatched on ${synced.branch.branchName}.`
        : `Synced ${synced.files} files to ${synced.branch.branchName}.`;
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(
            () =>
              (firmwareGithubError = clientErrorMessage(
                error,
                build ? "GitHub firmware build dispatch failed." : "GitHub firmware sync failed.",
              )),
          ),
        ),
        Effect.ensuring(Effect.sync(() => (firmwareGithubBusy = false))),
      ),
    );
  }

  function extensionChoicesForWorkbench(): KeyboardChoicesResponse {
    const variants = [
      {
        id: "main",
        name: "main",
        profile: workbench.activeVariantId === "main" ? workbench.profile : workbench.baseProfile,
      },
      ...workbench.forks.map((fork) => ({
        id: fork.id,
        name: fork.name,
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
          ...(variant.id === "main" ? {} : { forkId: variant.id }),
          catalogId: profile.id,
          ...(profile.vendorId === undefined ? {} : { vendorId: profile.vendorId }),
          ...(profile.productId === undefined ? {} : { productId: profile.productId }),
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
    return authClientErrorMessage(error, fallback);
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
      <h2 class={settingsHeadingClass}>{profileDisplayName(profile)}</h2>
    </div>

    <div class={settingsToolbarSpacerClass}></div>

    <div
      class={settingsActionsClass}
      data-active={settingsChangeCount > 0}
      aria-hidden={settingsChangeCount === 0}
    >
      <div class={settingsMeterClass}>
        <span class={settingsMeterIconClass} aria-hidden="true">manufacturing</span>
        <strong class={settingsMeterCountClass}>{settingsChangeCount}</strong>
        <small class={settingsMeterCopyClass}>firmware changes</small>
      </div>

      <Button
        variant="solid"
        size="sm"
        href="/versions"
        tabindex={settingsChangeCount > 0 ? undefined : -1}
      >
        <span class="material-symbols-outlined" aria-hidden="true">bookmark_add</span>
        Review
      </Button>
    </div>
  </header>

  <div class={settingsSectionNavClass}>
    <SegmentedNav
      items={settingsSectionItems}
      value={settingsSection}
      ariaLabel="Settings section"
    />
  </div>

  <div
    class={cn(
      settingsGridClass,
      settingsSection === "keyboard"
        ? "grid-cols-[minmax(0,1fr)]"
        : settingsSection === "integrations"
          ? "grid-cols-[minmax(0,1fr)]"
          : "grid-cols-[minmax(0,720px)]",
    )}
  >
    {#if settingsSection === "keyboard"}
    <div class={deviceColumnClass}>
      <Card.Root class={cn(settingsCardClass, "timing-card")}>
        <Card.Header class={settingsCardHeaderClass}>
          <div class={cardTitleStackClass}>
            <Card.Title>Timing</Card.Title>
          </div>
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

        </Card.Content>
      </Card.Root>

      <Card.Root class={cn(settingsCardClass, "behavior-card")}>
        <Card.Header class={settingsCardHeaderClass}>
          <div class={cardTitleStackClass}>
            <Card.Title>Behavior</Card.Title>
          </div>
        </Card.Header>
        <Card.Content class={toggleListClass}>
          {#each behaviorToggles as toggle (toggle.key)}
            <div class={toggleRowClass}>
              <label class={toggleCopyStackClass} for={`behavior-${toggle.key}`}>
                <strong class={toggleTitleClass}>{toggle.label}</strong>
                <small class={toggleDetailClass}>{toggle.detail}</small>
              </label>
              <Switch
                id={`behavior-${toggle.key}`}
                checked={settings[toggle.key]}
                aria-label={toggle.label}
                onCheckedChange={(checked) => {
                  const next = checkedValue(checked);
                  if (next !== undefined) updateBehavior(toggle.key, next);
                }}
              />
            </div>
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
              </ToggleGroup.Item>
            {/each}
          </ToggleGroup.Root>
        </Card.Content>
      </Card.Root>

      <Card.Root id="firmware-target" class={cn(settingsCardClass, "firmware-target-card col-span-full")}>
        <Card.Header class={settingsCardHeaderClass}>
          <div class={cardTitleStackClass}>
            <Card.Title>Firmware target</Card.Title>
            <Card.Description>
              {profile.firmware === "qmk"
                ? "Select the QMK keyboard and layout used by GitHub builds."
                : "Select the ZMK controller and shield targets used by GitHub builds."}
            </Card.Description>
          </div>
          <span class={integrationScopeClass} data-connected={generatedFirmware.buildReady}>
            {generatedFirmware.buildReady ? "build ready" : `${generatedFirmware.summary.errors} required`}
          </span>
        </Card.Header>
        <Card.Content class={settingsCardBodyClass}>
          <form class={firmwareTargetFormClass} onsubmit={saveFirmwareTarget}>
            {#if profile.firmware === "qmk"}
              <div class={firmwareTargetFinderClass}>
                <span class={firmwareTargetLabelClass}>Find from VIA / QMK</span>
                <CatalogPicker
                  query={qmkCatalogQuery}
                  onQueryChange={(next) => (qmkCatalogQuery = next)}
                  selectedId={qmkCatalogSelectedId}
                  onSelectedIdChange={selectQmkCatalogEntry}
                  options={qmkCatalogOptions}
                  placeholder="Search keyboard"
                  placeholderOption={
                    firmwareTargetResolving
                      ? "Loading catalog…"
                      : `${qmkCatalogOptions.length} matches`
                  }
                  title="Select a VIA definition and resolve its exact QMK build target"
                />
                <small class={firmwareTargetHelpClass}>
                  Selecting a VIA definition resolves the QMK keyboard path, layout macro, upstream
                  repository, and pinned revision automatically.
                </small>
              </div>

              {#if qmkTargetOptions.length > 0}
                <div class={firmwareTargetCandidatesClass} aria-label="Compatible QMK targets">
                  {#each qmkTargetOptions as target (`${target.keyboard}:${target.layout}`)}
                    {@const active = target.keyboard === qmkKeyboard && target.layout === qmkLayout}
                    <button
                      type="button"
                      class={firmwareTargetCandidateClass}
                      data-active={active}
                      aria-pressed={active}
                      onclick={() => useQmkTarget(target)}
                    >
                      <span class={firmwareTargetCandidateCopyClass}>
                        <strong class={firmwareTargetCandidateTitleClass}>{target.keyboard}</strong>
                        <small class={firmwareTargetCandidateDetailClass}>{target.layout}</small>
                      </span>
                      <span class={scopeChipClass}>{active ? "selected" : "use"}</span>
                    </button>
                  {/each}
                </div>
              {/if}

              <label class={firmwareTargetFieldClass}>
                <span class={firmwareTargetLabelClass}>QMK keyboard</span>
                <Input
                  class={firmwareTargetInputClass}
                  bind:value={qmkKeyboard}
                  placeholder="bastardkb/charybdis/4x6"
                  autocomplete="off"
                  spellcheck="false"
                />
              </label>
              <label class={firmwareTargetFieldClass}>
                <span class={firmwareTargetLabelClass}>Layout macro</span>
                <Input
                  class={firmwareTargetInputClass}
                  bind:value={qmkLayout}
                  placeholder="LAYOUT"
                  autocomplete="off"
                  spellcheck="false"
                />
              </label>
              <label class={firmwareTargetFieldClass}>
                <span class={firmwareTargetLabelClass}>Keymap name</span>
                <Input
                  class={firmwareTargetInputClass}
                  bind:value={qmkKeymap}
                  placeholder="kbui"
                  autocomplete="off"
                  spellcheck="false"
                />
              </label>
              <label class={firmwareTargetFieldClass}>
                <span class={firmwareTargetLabelClass}>Firmware repository</span>
                <Input
                  class={firmwareTargetInputClass}
                  bind:value={qmkRepository}
                  placeholder="qmk/qmk_firmware"
                  autocomplete="off"
                  spellcheck="false"
                />
              </label>
              <label class={firmwareTargetFieldClass}>
                <span class={firmwareTargetLabelClass}>Firmware ref</span>
                <Input
                  class={firmwareTargetInputClass}
                  bind:value={qmkRef}
                  placeholder="master"
                  autocomplete="off"
                  spellcheck="false"
                />
              </label>
            {:else}
              <div class={firmwareTargetFinderClass}>
                <span class={firmwareTargetLabelClass}>Find from ZMK hardware</span>
                <div class={firmwareTargetFinderRowClass}>
                  <Input
                    class={cn(firmwareTargetInputClass, "min-w-0 flex-1")}
                    bind:value={zmkTargetQuery}
                    placeholder="corne, nice!nano, glove80…"
                    autocomplete="off"
                    spellcheck="false"
                    onkeydown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      findZmkTargets();
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={firmwareTargetResolving}
                    onclick={() => void findZmkTargets()}
                  >
                    {firmwareTargetResolving ? "Searching…" : "Find targets"}
                  </Button>
                </div>
                <small class={firmwareTargetHelpClass}>
                  Search the upstream ZMK board and shield metadata. Controller alternatives remain
                  explicit when Studio cannot identify the compiled target.
                </small>
              </div>

              {#if zmkTargetOptions.length > 0}
                <div class={firmwareTargetCandidatesClass} aria-label="Compatible ZMK targets">
                  {#each zmkTargetOptions as target (`${target.board}:${target.shields.join(":")}`)}
                    {@const active =
                      target.board === zmkBoard &&
                      target.shields.join("\0") === commaSeparatedValues(zmkShields).join("\0")}
                    <button
                      type="button"
                      class={firmwareTargetCandidateClass}
                      data-active={active}
                      aria-pressed={active}
                      onclick={() => useZmkTarget(target)}
                    >
                      <span class={firmwareTargetCandidateCopyClass}>
                        <strong class={firmwareTargetCandidateTitleClass}>{target.board}</strong>
                        <small class={firmwareTargetCandidateDetailClass}>
                          {target.shields.length > 0 ? target.shields.join(" + ") : "board only"}
                        </small>
                      </span>
                      <span class={scopeChipClass}>{active ? "selected" : "use"}</span>
                    </button>
                  {/each}
                </div>
              {/if}

              <label class={firmwareTargetFieldClass}>
                <span class={firmwareTargetLabelClass}>ZMK board</span>
                <Input
                  class={firmwareTargetInputClass}
                  bind:value={zmkBoard}
                  placeholder="nice_nano//zmk"
                  autocomplete="off"
                  spellcheck="false"
                />
              </label>
              <label class={firmwareTargetFieldClass}>
                <span class={firmwareTargetLabelClass}>Shield targets</span>
                <Input
                  class={firmwareTargetInputClass}
                  bind:value={zmkShields}
                  placeholder="corne_left, corne_right"
                  autocomplete="off"
                  spellcheck="false"
                />
              </label>
              <label class={firmwareTargetFieldClass}>
                <span class={firmwareTargetLabelClass}>Keymap name</span>
                <Input
                  class={firmwareTargetInputClass}
                  bind:value={zmkKeymap}
                  placeholder="kbui"
                  autocomplete="off"
                  spellcheck="false"
                />
              </label>
            {/if}

            <p class={firmwareTargetHelpClass}>
              These values are stored with this keyboard profile and determine generated source,
              branch contents, and build artifacts. The current editor key order is saved the first
              time you set a target.
            </p>

            {#if blockingFirmwareDiagnostics.length > 0}
              <div class={firmwareTargetDiagnosticListClass} role="alert">
                {#each blockingFirmwareDiagnostics as item (firmwareDiagnosticKey(item))}
                  <span><strong>{item.path ?? item.code}</strong> — {item.message}</span>
                {/each}
              </div>
            {/if}

            {#if firmwareTargetError}
              <p
                class={cn(errorMessageClass, "col-span-2 max-[640px]:col-span-1")}
                role="alert"
              >
                {firmwareTargetError}
              </p>
            {:else if firmwareTargetNotice}
              <p
                class={cn(statusMessageClass, "col-span-2 border border-line bg-surface-2 text-ink-2 max-[640px]:col-span-1")}
                role="status"
              >
                {firmwareTargetNotice}
              </p>
            {/if}

            <Button
              variant="outline"
              size="sm"
              type="submit"
              class={integrationPrimaryButtonClass}
              disabled={firmwareTargetSaving}
            >
              {firmwareTargetSaving ? "Saving…" : "Save firmware target"}
            </Button>
            <Button variant="ghost" size="sm" href="/versions" class={commandButtonClass}>
              Review build
            </Button>
          </form>
        </Card.Content>
      </Card.Root>
    </div>
    {/if}

    {#if settingsSection !== "keyboard"}
    <aside
      class={settingsSection === "integrations" ? integrationsColumnClass : appColumnClass}
      aria-label={settingsSection === "integrations" ? "Integrations" : "Application preferences"}
    >
      {#if settingsSection === "integrations"}
      {#if !monkeytypeSignedIn}
        <p
          class={cn(noteMessageClass, "integration-auth-note col-span-2 max-[820px]:col-span-1")}
          role="status"
        >
          Sign in with GitHub to manage integrations.
        </p>
      {/if}

      <Card.Root
        class={cn(
          settingsCardClass,
          "monkeytype-card col-span-2 max-[820px]:col-span-1",
        )}
      >
        <Card.Header class={settingsCardHeaderClass}>
          <div class={cardTitleStackClass}>
            <Card.Title>Monkeytype</Card.Title>
          </div>
          <span class={integrationScopeClass} data-connected={shell.monkeytype.connected}>
            {shell.monkeytype.connected ? "connected" : "data source"}
          </span>
        </Card.Header>
        <Card.Content class={monkeytypeSettingsClass}>
          <form class={monkeytypeFormClass} onsubmit={connectMonkeytype}>
            <label
              class={cn(
                monkeytypeFieldClass,
                "monkeytype-apekey col-span-2 max-[640px]:col-span-1",
              )}
            >
              <span class={monkeytypeFieldLabelClass}>ApeKey</span>
              <Input
                class={monkeytypeInputClass}
                type="password"
                bind:value={monkeytypeApeKey}
                autocomplete="off"
                spellcheck="false"
                aria-invalid={monkeytypeNeedsApeKey}
                aria-describedby="monkeytype-apekey-help"
                placeholder={shell.monkeytype.connected ? "Stored key stays encrypted" : "Paste ApeKey"}
              />
              <p id="monkeytype-apekey-help" class={monkeytypeHelpClass}>
                Create an active ApeKey in Monkeytype. It is stored encrypted.
              </p>
            </label>

            <label class={monkeytypeFieldClass}>
              <span class={monkeytypeFieldLabelClass}>Username</span>
              <Input
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
                variant="outline"
                size="sm"
                type="submit"
                disabled={!monkeytypeCanSubmit}
                class={cn(integrationPrimaryButtonClass, "col-span-2 max-[560px]:col-span-1")}
              >
                <Link size={14} aria-hidden="true" />
                {shell.monkeytype.connected ? "Update" : "Connect ApeKey"}
              </Button>
              {#if shell.monkeytype.connected}
                <Button
                  variant="outline"
                  size="sm"
                  onclick={refreshMonkeytype}
                  disabled={monkeytypeBusy}
                  class={commandButtonClass}
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  Refresh
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onclick={disconnectMonkeytype}
                  disabled={monkeytypeBusy}
                  class={commandButtonClass}
                >
                  <Unplug size={14} aria-hidden="true" />
                  Disconnect
                </Button>
              {/if}
            </div>
          </form>

          {#if monkeytypeError || shell.monkeytype.error}
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
          </div>
          <span class={extensionScopeClass} data-connected={activeExtensionDevices.length > 0}>
            {activeExtensionDevices.length} paired
          </span>
        </Card.Header>
        <Card.Content class={extensionSettingsClass}>
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
              variant="outline"
              size="sm"
              onclick={createExtensionPairingCode}
              disabled={!monkeytypeSignedIn || extensionBusy}
              class={integrationPrimaryButtonClass}
            >
              <Plus size={14} aria-hidden="true" />
              {extensionBusy ? "Working" : "Create code"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onclick={() => refreshExtensionDevices()}
              disabled={!monkeytypeSignedIn || extensionBusy}
              class={commandButtonClass}
            >
              <RefreshCw size={14} aria-hidden="true" />
              Refresh
            </Button>
          </div>

          {#if extensionDevices.length === 0}
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
                    <Button
                      variant="ghost"
                      size="icon"
                      type="button"
                      onclick={() => revokeExtension(device.id)}
                      disabled={extensionRevokingId === device.id}
                      aria-label={`Revoke ${device.label ?? "extension device"}`}
                      class="size-kb-28 rounded-md"
                    >
                      <Link2Off size={14} aria-hidden="true" />
                    </Button>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}

          {#if typingRunStats.length > 0}
            <div class={typingRunStatsListClass} aria-label="Tagged run stats">
              {#each typingRunStats as group (group.key)}
                <div class={taggedRunRowClass}>
                  <strong class={extensionDeviceTitleClass}>{group.label}</strong>
                  <small class={taggedRunMetaClass}>
                    {group.runs} run{group.runs === 1 ? "" : "s"} · {Math.round(group.averageWpm)} wpm · {group.averageAcc.toFixed(1)}%
                    {group.latestCapturedAt ? ` · ${shortDate(group.latestCapturedAt)}` : ""}
                  </small>
                </div>
              {/each}
            </div>
          {/if}

          {#if taggedRuns.length > 0}
            <div class={taggedRunListClass} aria-label="Recent tagged runs">
              {#each taggedRuns as run (run.id)}
                <div class={taggedRunRowClass} data-correlation={run.correlationState}>
                  <strong class={extensionDeviceTitleClass}>
                    {Math.round(run.wpm)} wpm · {run.acc.toFixed(1)}% · {run.keyboard.displayName} / {run.layout.displayName}
                  </strong>
                  <small class={taggedRunMetaClass}>
                    {run.mode ?? "mode?"} {run.mode2 ?? ""} · {run.correlationState}
                    {run.monkeytypeResultId ? ` · ${run.monkeytypeResultId}` : ""}
                    · {shortDate(run.capturedAt)}
                  </small>
                </div>
              {/each}
            </div>
            <Button
              variant="outline"
              size="sm"
              onclick={retryTaggedRunCorrelation}
              disabled={!monkeytypeSignedIn || correlationRetrying}
              class={commandButtonClass}
            >
              <RefreshCw size={14} aria-hidden="true" />
              {correlationRetrying ? "Matching" : "Retry matching"}
            </Button>
          {/if}

          {#if extensionError}
            <p class={cn(errorMessageClass, "extension-error")} role="status">{extensionError}</p>
          {:else if extensionNotice}
            <p class={cn(noteMessageClass, "extension-note")} role="status">{extensionNotice}</p>
          {/if}
        </Card.Content>
      </Card.Root>

      <Card.Root class={cn(settingsCardClass, "firmware-github-card")}>
        <Card.Header class={settingsCardHeaderClass}>
          <div class={cardTitleStackClass}>
            <Card.Title>GitHub firmware builds</Card.Title>
          </div>
          <span
            class={integrationScopeClass}
            data-connected={firmwareGithubStatus?.connected === true}
          >
            {firmwareGithubStatus?.connected ? "connected" : "GitHub App"}
          </span>
        </Card.Header>
        <Card.Content class={firmwareGithubSettingsClass}>
          {#if firmwareGithubStatus?.connected && firmwareGithubRepository}
            <div class={firmwareRepoPanelClass} aria-label="GitHub firmware repository">
              <div class={firmwareRepoLineClass}>
                <span class={firmwareRepoKeyClass}>Repo</span>
                <span class={firmwareRepoValueClass}>{firmwareGithubRepository.fullName}</span>
              </div>
              <div class={firmwareRepoLineClass}>
                <span class={firmwareRepoKeyClass}>Branch</span>
                <span class={firmwareRepoValueClass}>{firmwareGithubBranch?.branchName ?? "--"}</span>
              </div>
              <div class={firmwareRepoLineClass}>
                <span class={firmwareRepoKeyClass}>Commit</span>
                <span class={firmwareRepoValueClass}
                  >{(
                    firmwareGithubSyncResult?.commit?.sha ?? firmwareGithubBranch?.lastCommitSha
                  )?.slice(0, 12) ?? "--"}</span
                >
              </div>
              <div class={firmwareRepoLineClass}>
                <span class={firmwareRepoKeyClass}>Ownership</span>
                <span class={firmwareRepoValueClass}
                  >{firmwareGithubRepository.relationship === "managed" ? "Managed by kbui" : "Adopted"}</span
                >
              </div>
            </div>
            <div class="grid gap-kb-6 rounded-lg border border-line-2 bg-paper p-kb-10">
              <p class="m-0 text-[11px] leading-[1.45] text-ink-3">
                Removing this variant deletes only its generated <code>kbui/…</code> branch.
                {#if firmwareGithubRepository.relationship === "managed"}
                  To delete the managed repository, type its full name exactly.
                {:else}
                  This repository was adopted, so kbui will never delete it.
                {/if}
              </p>
              {#if firmwareGithubRepository.relationship === "managed"}
                <Input
                  bind:value={firmwareGithubDeleteConfirmation}
                  aria-label="Confirm managed repository deletion"
                  placeholder={firmwareGithubRepository.fullName}
                  class="h-kb-32 font-mono text-[11px]"
                />
              {/if}
              <div class="grid grid-cols-2 gap-kb-6 max-[560px]:grid-cols-1">
                <Button
                  variant="outline"
                  size="sm"
                  onclick={() => cleanupFirmwareGithub("branch")}
                  disabled={firmwareGithubBusy || !firmwareGithubBranch}
                >
                  <GitBranch size={14} aria-hidden="true" />
                  Remove variant branch
                </Button>
                {#if firmwareGithubRepository.relationship === "managed"}
                  <Button
                    variant="destructive"
                    size="sm"
                    onclick={() => cleanupFirmwareGithub("repository")}
                    disabled={
                      firmwareGithubBusy ||
                      firmwareGithubDeleteConfirmation.trim() !== firmwareGithubRepository.fullName
                    }
                  >
                    <Trash2 size={14} aria-hidden="true" />
                    Delete managed repo
                  </Button>
                {/if}
              </div>
            </div>
          {/if}

          <div class={firmwareCommandRowClass}>
            <Button
              variant="outline"
              size="sm"
              onclick={connectFirmwareGithub}
              disabled={!monkeytypeSignedIn || firmwareGithubBusy}
              class={cn(
                integrationPrimaryButtonClass,
                "col-span-2 max-[560px]:col-span-1",
              )}
            >
              <GitBranch size={14} aria-hidden="true" />
              {firmwareGithubStatus?.connected ? "Change install" : "Install app"}
            </Button>
            {#if firmwareGithubStatus?.connected}
              <Button
                variant="outline"
                size="sm"
                onclick={() => syncFirmwareGithub(false)}
                disabled={firmwareGithubBusy}
                class={commandButtonClass}
              >
                <UploadCloud size={14} aria-hidden="true" />
                Sync branch
              </Button>
              <Button
                variant="outline"
                size="sm"
                onclick={disconnectFirmwareGithub}
                disabled={firmwareGithubBusy}
                class={commandButtonClass}
              >
                <Unplug size={14} aria-hidden="true" />
                Disconnect
              </Button>
            {/if}
          </div>

          {#if firmwareGithubError}
            <p class={cn(errorMessageClass, "firmware-github-error")} role="status">
              {firmwareGithubError}
            </p>
          {:else if firmwareGithubNotice}
            <p class={cn(noteMessageClass, "firmware-github-note")} role="status">
              {firmwareGithubNotice}
            </p>
          {/if}
        </Card.Content>
      </Card.Root>

      {:else}
      <Card.Root class={cn(settingsCardClass, "app-card")}>
        <Card.Header class={settingsCardHeaderClass}>
          <div class={cardTitleStackClass}>
            <Card.Title>App Preferences</Card.Title>
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
          </section>

          <section class={preferenceSectionClass}>
            <div class={preferenceHeadClass}>
              <h3 class={preferenceHeadTitleClass}>Editor layout</h3>
              <span class={preferenceHeadValueClass}>
                {EditorLayout.editorLayoutById(workbench.editorLayout).label}
              </span>
            </div>
            <SegmentedNav
              items={layoutItems}
              value={workbench.editorLayout}
              onselect={updateEditorLayout}
              ariaLabel="Editor layout"
              class={settingsOsSegmentClass}
            />
            <p class={preferenceHintClass}>
              {EditorLayout.editorLayoutById(workbench.editorLayout).hint}
            </p>
          </section>

          <section class={preferenceSectionClass}>
            <div class={preferenceHeadClass}>
              <h3 class={preferenceHeadTitleClass}>Appearance</h3>
              <span class={preferenceHeadValueClass}>{Theme.themeById(themeId).label}</span>
            </div>
            <SegmentedNav
              items={themeItems}
              value={themeId}
              onselect={updateTheme}
              ariaLabel="Theme"
              class={settingsOsSegmentClass}
            />
          </section>

          {#if preferenceError}
            <p class={preferenceErrorClass} role="status">{preferenceError}</p>
          {/if}
        </Card.Content>
      </Card.Root>
      {/if}
    </aside>
    {/if}
  </div>
</section>
