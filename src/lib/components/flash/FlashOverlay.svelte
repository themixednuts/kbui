<script lang="ts">
  import { browser } from "$app/environment";
  import { Effect } from "effect";
  import { strToU8, unzipSync, zipSync } from "fflate";
  import { untrack } from "svelte";

  import { authClient } from "$lib/auth-client";
  import { runApp } from "$lib/app";
  import { getFirmwareBuildEventsContext } from "$lib/app/firmware-build-events.svelte";
  import {
    authClientErrorMessage,
    createFirmwareGithubSyncInput,
    firmwareGithubBranchLabel,
    firmwareGithubVariantInput,
    type AuthClientError,
  } from "$lib/app/firmware-github-actions";
  import { connectViaAndActivate } from "$lib/app/connect-flow";
  import { getShellContext } from "$lib/app/shell-store.svelte";
  import { getWorkbenchContext } from "$lib/app/workbench-store.svelte";
  import type { LiveSyncChangeNotice } from "$lib/app/via-live-sync.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import type {
    GitHubFirmwareAppStatus,
    GitHubFirmwareArtifactDownloadResponse,
    GitHubFirmwareBuildResponse,
    GitHubFirmwareRunDto,
    GitHubFirmwareVariantInput,
  } from "$lib/github-app/types";
  import {
    generateFirmwareArtifacts,
    type FirmwareArtifacts,
    type FirmwareDiagnostic,
    type FirmwareSourceBundle,
  } from "$lib/keyboard/firmware-source";
  import { WasmFirmwareBuilder, isBrowserBuildAvailable } from "$lib/keyboard/firmware-build/builder";
  import type {
    FirmwareBuildRequest,
    FirmwareBuildResult,
    FirmwareObjectBundleManifest,
  } from "$lib/keyboard/firmware-build/types";
  import { verifyGitHubArtifactSha256Digest } from "$lib/keyboard/github-artifact-digest";
  import { profileDisplayName, type DeviceProfile } from "$lib/keyboard/schema";
  import { createWebHidViaTransport } from "$lib/keyboard/transport";
  import {
    createUf2FlashPlan,
    defaultUf2VolumeHints,
    detectUf2FileSystemAccessSupport,
    flashUf2ViaFileSystemAccess,
    verifyUf2Reconnect,
    type Uf2FileSystemAccessTarget,
    type Uf2FileSystemFlashResult,
    type Uf2FlashPlan,
    type Uf2FlashProgress,
    type Uf2FlashSupport,
    type Uf2FlashSupportEnvironment,
    type Uf2VerifyResult,
  } from "$lib/keyboard/uf2-flash";
  import { uf2TargetForProfile } from "$lib/keyboard/uf2-families";
  import { encodeViaCommandReport } from "$lib/keyboard/via-protocol";
  import { cn } from "$lib/utils.js";
  import { platformError } from "$lib/effect/errors";

  type Props = {
    changes?: readonly LiveSyncChangeNotice[];
    githubVariant?: GitHubFirmwareVariantInput | null;
    onclose?: () => void;
    open?: boolean;
    profile: DeviceProfile;
  };

  type FlashPhase =
    | "validate"
    | "generate"
    | "artifact"
    | "enter_bootloader"
    | "flash"
    | "verify"
    | "done";

  type DirectoryPickerWindow = Window & {
    showDirectoryPicker?: (options?: { mode?: "read" | "readwrite" }) => Promise<unknown>;
  };

  const phaseOrder: FlashPhase[] = [
    "validate",
    "generate",
    "artifact",
    "enter_bootloader",
    "flash",
    "verify",
    "done",
  ];

  const overlayClass =
    "flash-overlay fixed inset-0 z-40 grid place-items-center p-[20px] max-[720px]:items-end max-[720px]:p-[10px]";
  const scrimClass =
    "flash-scrim absolute inset-0 [background-color:color-mix(in_oklch,var(--ink)_46%,transparent)] backdrop-blur-[5px]";
  const modalClass =
    "flash-modal relative grid w-[min(720px,calc(100vw-28px))] max-h-[min(860px,calc(100vh-28px))] gap-kb-14 overflow-auto rounded-lg border border-line-2 bg-surface p-kb-22 shadow-modal max-[720px]:w-full max-[720px]:max-h-[calc(100vh-20px)] max-[720px]:p-kb-16";
  const modalHeadClass =
    "modal-head grid grid-cols-[22px_minmax(0,1fr)_30px] items-start gap-[10px]";
  const modalBoltClass = "material-symbols-outlined modal-bolt text-[22px] text-coral";
  const modalTitleClass = "m-0 text-[15px] leading-[1.25] [overflow-wrap:anywhere]";
  const modalSubtitleClass =
    "mt-[3px] mb-0 font-mono text-[11px] text-ink-3 [overflow-wrap:anywhere]";
  const modalCloseClass =
    "modal-close size-kb-30 text-ink-3 hover:bg-surface-2 hover:text-ink";
  const flashStepsClass =
    "flash-steps grid grid-cols-[repeat(3,minmax(0,1fr))] gap-x-[10px] gap-y-[8px] max-[720px]:grid-cols-[minmax(0,1fr)]";
  const flashStepClass = "flash-step flex min-w-0 items-center gap-[8px] text-[12px] text-ink-3";
  const flashStepActiveClass = "active text-ink [&_.material-symbols-outlined]:text-coral";
  const flashStepDoneClass = "done [&_.material-symbols-outlined]:text-success";
  const flashStepIconClass = "material-symbols-outlined flex-none text-[19px]";
  const flashStepLabelClass = "overflow-hidden text-ellipsis whitespace-nowrap";
  const sourceFactsClass =
    "source-facts grid grid-cols-[repeat(5,minmax(0,1fr))] gap-[8px] max-[720px]:grid-cols-[minmax(0,1fr)]";
  const sourceFactClass =
    "grid min-w-0 gap-kb-3 rounded-lg border border-line bg-surface-2 px-kb-10 py-kb-9";
  const sourceFactBlockedClass =
    "source-blocked border-[var(--danger-border)] bg-danger-surface";
  const microLabelClass =
    "font-mono text-[9px] tracking-[0.08em] text-ink-3 uppercase";
  const sourceFactValueClass =
    "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px]";
  const diagnosticBannerClass =
    "diagnostic-banner grid min-w-0 gap-kb-9 rounded-lg border border-line px-kb-12 py-kb-11";
  const diagnosticBannerErrorClass =
    "error border-[var(--danger-border)] bg-danger-surface";
  const diagnosticBannerWarningClass =
    "warning border-[var(--warning-border)] bg-warning-surface";
  const diagnosticTitleClass =
    "diagnostic-title grid min-w-0 grid-cols-[26px_minmax(0,1fr)] items-start gap-[9px]";
  const diagnosticIconClass =
    "material-symbols-outlined grid size-kb-26 place-items-center rounded-md border border-[color-mix(in_oklch,currentColor_30%,var(--surface))] bg-surface text-kb-17";
  const diagnosticIconErrorClass = "text-danger-ink";
  const diagnosticIconWarningClass = "text-warning-ink";
  const diagnosticTitleStrongClass =
    "block min-w-0 font-mono text-[12px] leading-[1.35] text-ink [overflow-wrap:anywhere]";
  const diagnosticTitleSmallClass =
    "mt-[3px] block min-w-0 text-[11px] leading-[1.35] text-ink-3 [overflow-wrap:anywhere]";
  const diagnosticListClass = "diagnostic-list m-0 grid list-none gap-[6px] p-0";
  const diagnosticListItemClass =
    "grid min-w-0 grid-cols-[minmax(110px,0.42fr)_minmax(0,1fr)] items-start gap-kb-8 rounded-lg border border-line bg-surface px-kb-8 py-kb-7";
  const diagnosticListTargetClass =
    "min-w-0 font-mono text-[10px] leading-[1.35] text-ink-3 [overflow-wrap:anywhere]";
  const diagnosticListMessageClass = "m-0 min-w-0 text-[11px] leading-[1.35] text-ink-2";
  const flashPanelsClass =
    "flash-panels grid grid-cols-[repeat(2,minmax(0,1fr))] gap-[10px] max-[720px]:grid-cols-[minmax(0,1fr)]";
  const flashPanelClass =
    "flash-panel grid min-w-0 gap-kb-10 rounded-lg border border-line bg-surface-2 p-kb-12";
  const copyPanelClass =
    "copy-panel grid min-w-0 gap-kb-11 rounded-lg border border-line bg-surface-2 p-kb-12";
  const panelHeadClass =
    "panel-head grid min-w-0 grid-cols-[26px_minmax(0,1fr)] items-start gap-[9px]";
  const supportRowClass =
    "support-row grid min-w-0 grid-cols-[26px_minmax(0,1fr)] items-start gap-kb-9 data-[supported=true]:[&>.material-symbols-outlined]:border-[var(--success-border)] data-[supported=true]:[&>.material-symbols-outlined]:text-success-ink";
  const panelIconClass =
    "material-symbols-outlined grid size-kb-26 place-items-center rounded-md border border-line-2 bg-surface text-kb-17 text-coral-ink";
  const panelTitleClass =
    "block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12px]";
  const panelSmallClass =
    "mt-[2px] block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-ink-3";
  const panelCopyClass = "panel-copy m-0 text-[12px] leading-[1.45] text-ink-2";
  const artifactMetaClass = "artifact-meta m-0 grid gap-[5px]";
  const artifactMetaRowClass =
    "grid min-w-0 grid-cols-[58px_minmax(0,1fr)] items-center gap-[8px]";
  const artifactMetaDescriptionClass =
    "m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px]";
  const browserBuildCalloutClass =
    "browser-build-callout grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-[10px] rounded-[8px] border border-[color-mix(in_oklch,var(--coral)_35%,var(--line))] bg-[color-mix(in_oklch,var(--coral)_8%,var(--surface))] p-[9px]";
  const githubBuildCalloutClass = cn(
    browserBuildCalloutClass,
    "github-build-callout border-[var(--success-border)] bg-success-surface",
  );
  const browserBuildTitleClass =
    "block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px]";
  const browserBuildSmallClass =
    "mt-[2px] block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-ink-3";
  const browserBuildMetaClass = "browser-build-meta pt-[2px]";
  const manualStepsClass =
    "manual-steps m-0 grid gap-[3px] pl-[18px] text-[12px] leading-[1.35] text-ink-2";
  const buttonRowClass = "button-row flex flex-wrap gap-[7px]";
  const volumeHintsClass = "volume-hints flex flex-wrap gap-[7px]";
  const volumeHintClass =
    "min-h-[22px] rounded-[6px] border border-line bg-surface px-[7px] py-[4px] font-mono text-[10px] text-ink-2";
  const progressBlockClass = "progress-block grid gap-[6px]";
  const progressLabelClass =
    "progress-label flex items-center justify-between gap-[10px] font-mono text-[11px]";
  const progressTrackClass = "progress-track h-[8px] overflow-hidden rounded-[999px] bg-line";
  const progressTrackBarClass =
    "block h-full rounded-[inherit] bg-coral [transition:width_160ms_ease]";
  const verifyMessageClass =
    "verify-message m-0 rounded-lg px-kb-10 py-kb-8 font-mono text-kb-11 leading-[1.35]";
  const verifyOkClass = "verify-ok bg-success-surface text-success-ink";
  const verifyErrorClass =
    "verify-error bg-danger-surface text-danger-ink";
  const commandLogClass =
    "command-log m-0 min-h-[170px] max-h-[220px] overflow-auto whitespace-pre-wrap rounded-[8px] bg-ink px-[16px] py-[14px] font-mono text-[11px] leading-[1.65] text-paper";
  const hardwareNoteClass = "hardware-note mt-[-4px] mb-0 text-[11px] leading-[1.4] text-ink-3";
  const copyErrorClass =
    "copy-error mt-[-4px] mb-0 text-kb-11 leading-[1.4] text-danger-ink";
  const copyActionsClass = "copy-actions max-[720px]:grid max-[720px]:grid-cols-[minmax(0,1fr)]";
  const modalActionsClass =
    "modal-actions flex flex-wrap justify-end gap-[8px] max-[720px]:grid max-[720px]:grid-cols-[minmax(0,1fr)]";
  const hiddenFileInputClass =
    "hidden-file-input pointer-events-none absolute size-px overflow-hidden opacity-0";

  let {
    changes = [],
    githubVariant = null,
    onclose,
    open = $bindable(false),
    profile,
  }: Props = $props();

  const shell = getShellContext();
  const workbench = getWorkbenchContext();
  const firmwareBuildEvents = getFirmwareBuildEventsContext();

  let result = $state<FirmwareArtifacts | null>(null);
  let transactionProfile = $state<DeviceProfile | null>(null);
  let transactionChanges = $state<readonly LiveSyncChangeNotice[]>([]);
  let transactionVariant = $state<GitHubFirmwareVariantInput | null>(null);
  let copied = $state(false);
  let copyError = $state<string | null>(null);
  let uf2Input = $state<HTMLInputElement | undefined>();
  let uf2Bytes = $state<Uint8Array | null>(null);
  let uf2Plan = $state<Uf2FlashPlan | null>(null);
  let uf2Error = $state<string | null>(null);
  let uf2Log = $state<string[]>([]);
  let phase = $state<FlashPhase>("artifact");
  let jumping = $state(false);
  let flashing = $state(false);
  let verifying = $state(false);
  let flashProgress = $state<Uf2FlashProgress | null>(null);
  let flashResult = $state<Uf2FileSystemFlashResult | null>(null);
  let verifyResult = $state<Uf2VerifyResult | null>(null);
  let browserBuildAvailable = $state(false);
  let browserBuilding = $state(false);
  let browserBuildResult = $state<FirmwareBuildResult | null>(null);
  let browserBuildError = $state<string | null>(null);
  let githubStatus = $state<GitHubFirmwareAppStatus | null>(null);
  let githubLoadedFor = $state<string | null>(null);
  let githubBusy = $state(false);
  let githubError = $state<string | null>(null);
  let githubNotice = $state<string | null>(null);
  let githubBuildResult = $state<GitHubFirmwareBuildResponse | null>(null);
  let githubDownloadingArtifact = $state(false);
  let fsSupport = $state<Uf2FlashSupport>(
    detectUf2FileSystemAccessSupport({ isBrowser: false }),
  );

  const activeProfile = $derived(transactionProfile ?? profile);
  const verifiedUf2Target = $derived(uf2TargetForProfile(activeProfile));
  const expectedUf2FamilyId = $derived(verifiedUf2Target?.familyId);

  const githubVariantRef = $derived(
    githubVariant ??
      transactionVariant ??
      firmwareGithubVariantInput({
        id: workbench.activeVariant.id,
        name: workbench.activeVariant.name,
        sourceSavePointId: workbench.changes.length === 0 ? workbench.selectedSavePoint?.id : undefined,
      }),
  );
  const githubBranchName = $derived(firmwareGithubBranchLabel(activeProfile, githubVariantRef));
  const githubSignedIn = $derived(shell.account.status === "signed-in");
  const githubConnected = $derived(githubStatus?.connected === true);
  const githubBuildEvent = $derived(
    firmwareBuildEvents.latestForRequest(githubBuildResult?.build.requestId),
  );
  const githubRun = $derived(githubBuildEvent?.run ?? null);
  const githubArtifact = $derived(githubRun?.artifact ?? null);
  const commandLog = $derived(
    result
      ? commandLogFor(
          result,
          activeProfile,
          transactionChanges,
          uf2Plan,
          uf2Log,
          fsSupport,
          flashResult,
          browserBuildResult,
          githubBuildResult,
          githubRun,
        )
      : "",
  );
  const errorDiagnostics = $derived(
    result?.diagnostics.filter((item) => item.severity === "error") ?? [],
  );
  const warningDiagnostics = $derived(
    result?.diagnostics.filter((item) => item.severity === "warning") ?? [],
  );
  const targetLabel = $derived(result?.target === "zmk" ? "ZMK" : "QMK");
  const viaJumpAvailable = $derived(
    shell.liveConnection?.status === "connected" &&
      shell.liveConnection.transport === "webhid" &&
      shell.liveConnection.protocol === "via-v3" &&
      typeof shell.liveConnection.hidDevice?.sendReport === "function",
  );
  const flashSteps = $derived.by(() =>
    [
      { key: "validate" as const, label: "Validate profile" },
      { key: "generate" as const, label: "Generate source" },
      { key: "artifact" as const, label: "Select UF2" },
      { key: "enter_bootloader" as const, label: "Enter bootloader" },
      { key: "flash" as const, label: "Copy UF2" },
      { key: "verify" as const, label: "Verify reconnect" },
    ].map((step) => ({ ...step, status: phaseStatus(step.key) })),
  );

  $effect(() => {
    const visible = open;
    untrack(() => {
      if (!visible) {
        resetOverlayState();
        return;
      }

      transactionProfile = $state.snapshot(profile);
      transactionChanges = $state.snapshot([...changes]);
      transactionVariant = firmwareGithubVariantInput({
        id: workbench.activeVariant.id,
        name: workbench.activeVariant.name,
        sourceSavePointId:
          workbench.changes.length === 0 ? workbench.selectedSavePoint?.id : undefined,
      });
      const generated = generateFirmwareArtifacts(transactionProfile);
      result = generated;
      resetUf2State();
      copied = false;
      copyError = null;
      fsSupport = currentFileSystemSupport();
      browserBuildAvailable = canOfferBrowserBuild(transactionProfile, generated);
      maybeLoadGithubStatus();
    });
  });

  function resetOverlayState() {
    result = null;
    transactionProfile = null;
    transactionChanges = [];
    transactionVariant = null;
    copied = false;
    copyError = null;
    resetUf2State();
  }

  function resetUf2State() {
    uf2Bytes = null;
    uf2Plan = null;
    uf2Error = null;
    uf2Log = [];
    phase = "artifact";
    jumping = false;
    flashing = false;
    verifying = false;
    flashProgress = null;
    flashResult = null;
    verifyResult = null;
    browserBuildAvailable = false;
    browserBuilding = false;
    browserBuildResult = null;
    browserBuildError = null;
    githubError = null;
    githubNotice = null;
    githubBuildResult = null;
    githubDownloadingArtifact = false;
  }

  function close() {
    open = false;
    onclose?.();
  }

  function currentFileSystemSupport() {
    if (!browser) return detectUf2FileSystemAccessSupport({ isBrowser: false });
    const pickerWindow = window as DirectoryPickerWindow;
    return detectUf2FileSystemAccessSupport({
      isBrowser: true,
      isSecureContext: window.isSecureContext,
      navigator: navigator as Uf2FlashSupportEnvironment["navigator"],
      showDirectoryPicker: pickerWindow.showDirectoryPicker,
    });
  }

  function appendUf2Log(line: string) {
    uf2Log = [...uf2Log, line];
  }

  function selectUf2Artifact(
    bytes: Uint8Array,
    fileName: string,
    sourceLabel: string,
    options: { expectedFamilyId?: number } = {},
  ) {
    const familyId = options.expectedFamilyId ?? expectedUf2FamilyId;
    if (familyId === undefined) {
      throw new Error(
        "This profile has no verified UF2 processor/family metadata. Direct flashing is blocked.",
      );
    }
    const plan = createUf2FlashPlan({
      boardName: activeProfile.name,
      expectedFamilyId: familyId,
      expectedVolumeHints: volumeHintsFor(activeProfile),
      fileName,
      uf2Bytes: bytes,
    });
    uf2Bytes = bytes;
    uf2Plan = plan;
    uf2Error = null;
    flashProgress = null;
    flashResult = null;
    verifyResult = null;
    phase = "enter_bootloader";
    appendUf2Log(
      `${sourceLabel} ${plan.artifact.fileName} (${formatBytes(plan.artifact.size)}, ${plan.artifact.blockCount} UF2 blocks)`,
    );
    if (plan.artifact.familyIdHex) appendUf2Log(`family id ${plan.artifact.familyIdHex}`);
    for (const warning of plan.warnings) appendUf2Log(`warning: ${warning}`);
  }

  function rejectUf2Artifact(error: unknown) {
    uf2Bytes = null;
    uf2Plan = null;
    phase = "artifact";
    uf2Error = error instanceof Error ? error.message : "Could not read UF2 artifact.";
    appendUf2Log(`UF2 rejected: ${uf2Error}`);
  }

  function hostEffect<A>(operation: string, task: () => PromiseLike<A>) {
    return Effect.tryPromise({
      try: task,
      catch: (cause) => platformError(operation, cause),
    });
  }

  function copyLog() {
    if (!commandLog) return;

    void runApp(
      "flash.copy-log",
      hostEffect("flash.copy-log", () => navigator.clipboard.writeText(commandLog)).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            copied = true;
            copyError = null;
          }),
        ),
        Effect.andThen(Effect.sleep("1500 millis")),
        Effect.tap(() => Effect.sync(() => (copied = false))),
        Effect.catch((error) =>
          Effect.sync(
            () =>
              (copyError =
                error instanceof Error ? error.message : "Could not copy command log"),
          ),
        ),
      ),
    );
  }

  function chooseUf2File() {
    uf2Input?.click();
  }

  function loadUf2File(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    void runApp(
      "flash.load-uf2-file",
      hostEffect("flash.read-uf2-file", () => file.arrayBuffer()).pipe(
        Effect.tap((buffer) =>
          Effect.sync(() => selectUf2Artifact(new Uint8Array(buffer), file.name, "selected")),
        ),
        Effect.catch((error) => Effect.sync(() => rejectUf2Artifact(error))),
        Effect.ensuring(Effect.sync(() => (input.value = ""))),
      ),
    );
  }

  function buildFirmwareInBrowser() {
    if (!result || browserBuilding) return;
    if (!result.buildReady) {
      browserBuildError = `Browser build blocked: generated source is not build-ready (${diagnosticSummary(errorDiagnostics)}).`;
      appendUf2Log(browserBuildError);
      return;
    }

    const manifest = experimentalBrowserBuildManifest(activeProfile);
    if (!manifest) {
      browserBuildError =
        "Browser build unavailable: no RP2040 QMK object-bundle manifest is installed for this board.";
      appendUf2Log(browserBuildError);
      return;
    }

    browserBuilding = true;
    browserBuildResult = null;
    browserBuildError = null;
    phase = "generate";
    appendUf2Log("starting experimental in-browser firmware build");

    const request: FirmwareBuildRequest = {
      cache: {
        backend: "opfs",
        mode: "cache-first",
      },
      generatedSource: sourceBundleFor(result),
      manifest,
      outputFileName: `${bundleSlug(activeProfile)}-${result.sourceHash}.uf2`,
      requestId: `flash-${result.sourceHash}`,
    };

    void runApp(
      "flash.browser-build",
      Effect.gen(function* () {
      const build = yield* hostEffect("flash.browser-build", () =>
        new WasmFirmwareBuilder().build(request),
      );
      browserBuildResult = build;
      for (const line of build.log) appendUf2Log(`${line.phase}: ${line.message}`);
      if (!build.ok) {
        browserBuildError = build.error.message;
        phase = "artifact";
        appendUf2Log(`browser build failed: ${build.error.message}`);
        return;
      }

      const bytes = build.artifact.bytes;
      selectUf2Artifact(bytes, build.artifact.fileName, "browser build produced", {
        expectedFamilyId: manifest.output.uf2FamilyId,
      });
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(() => {
            browserBuildError =
              error instanceof Error ? error.message : "Browser firmware build failed.";
            phase = "artifact";
            appendUf2Log(`browser build failed: ${browserBuildError}`);
          }),
        ),
        Effect.ensuring(Effect.sync(() => (browserBuilding = false))),
      ),
    );
  }

  function maybeLoadGithubStatus() {
    const accountKey =
      shell.account.status === "signed-in"
        ? (shell.account.id ?? shell.account.login)
        : shell.account.status;
    if (githubLoadedFor === accountKey) return;
    githubLoadedFor = accountKey;

    if (!githubSignedIn) {
      githubStatus = null;
      return;
    }

    void refreshGithubFirmwareStatus(false);
  }

  function refreshGithubFirmwareStatus(showBusy = true) {
    if (!githubSignedIn || (showBusy && githubBusy)) return;
    if (showBusy) githubBusy = true;
    githubError = null;
    void runApp(
      "flash.github-status",
      Effect.gen(function* () {
      const response = yield* hostEffect("flash.github-status", () =>
        authClient.firmwareGithub.status(),
      );
      const error = response.error as AuthClientError | null | undefined;
      if (error) {
        githubError = authClientErrorMessage(error, "GitHub firmware status failed.");
        return;
      }
      githubStatus = response.data;
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(
            () =>
              (githubError = authClientErrorMessage(error, "GitHub firmware status failed.")),
          ),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            if (showBusy) githubBusy = false;
          }),
        ),
      ),
    );
  }

  function buildFirmwareWithGithub() {
    if (!result || githubBusy) return;
    const generated = result;
    if (!githubSignedIn) {
      githubError = "Sign in with GitHub first.";
      shell.profileOpen = true;
      return;
    }
    if (!githubConnected) {
      githubError = "Install the GitHub App in Settings before building firmware.";
      return;
    }
    if (!result.buildReady) {
      githubError = `GitHub build blocked: generated source is not build-ready (${diagnosticSummary(errorDiagnostics)}).`;
      appendUf2Log(githubError);
      return;
    }

    githubBusy = true;
    githubError = null;
    githubNotice = null;
    githubBuildResult = null;
    phase = "generate";
    appendUf2Log(`dispatching GitHub Actions build on ${githubBranchName}`);

    void runApp(
      "flash.github-build",
      Effect.gen(function* () {
        const response = yield* hostEffect("flash.github-build", () =>
          authClient.firmwareGithub.build(
            createFirmwareGithubSyncInput({
              generated,
              profile: activeProfile,
              variant: githubVariantRef,
            }),
          ),
        );
      const error = response.error as AuthClientError | null | undefined;
      if (error) {
        githubError = authClientErrorMessage(error, "GitHub firmware build dispatch failed.");
        appendUf2Log(`GitHub build dispatch failed: ${githubError}`);
        phase = "artifact";
        return;
      }
      if (!response.data) {
        githubError = "GitHub firmware build did not return a result.";
        appendUf2Log(githubError);
        phase = "artifact";
        return;
      }

      githubBuildResult = response.data;
      githubNotice = `Build dispatched on ${response.data.branch.branchName}.`;
      appendUf2Log(
        `GitHub Actions build dispatched: ${response.data.repository.fullName}@${response.data.branch.branchName}`,
      );
      phase = "artifact";
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(() => {
            githubError = authClientErrorMessage(error, "GitHub firmware build dispatch failed.");
            appendUf2Log(`GitHub build dispatch failed: ${githubError}`);
            phase = "artifact";
          }),
        ),
        Effect.ensuring(Effect.sync(() => (githubBusy = false))),
      ),
    );
  }

  function loadGithubArtifactUf2() {
    const requestId = githubRun?.requestId ?? githubBuildResult?.build.requestId;
    const artifact = githubArtifact;
    if (!requestId || !artifact || githubDownloadingArtifact) return;

    githubDownloadingArtifact = true;
    githubError = null;
    void runApp(
      "flash.github-artifact",
      Effect.gen(function* () {
      const response = yield* hostEffect("flash.github-artifact", () =>
        authClient.firmwareGithub.downloadArtifact({
          artifactId: artifact.id,
          requestId,
        }),
      );
      const error = response.error as AuthClientError | null | undefined;
      if (error) {
        githubError = authClientErrorMessage(error, "GitHub artifact download failed.");
        appendUf2Log(`GitHub artifact download failed: ${githubError}`);
        return;
      }
      if (!response.data) {
        githubError = "GitHub artifact download did not return an archive.";
        appendUf2Log(githubError);
        return;
      }
      const archiveBytes = bytesFromBase64(response.data.zipBase64);
      if (response.data.digest) {
        yield* hostEffect("flash.verify-github-artifact", () =>
          verifyGitHubArtifactSha256Digest(archiveBytes, response.data!.digest!),
        );
        appendUf2Log(`verified GitHub artifact digest ${response.data.digest}`);
      } else {
        appendUf2Log("warning: GitHub did not provide an artifact digest");
      }
      const uf2 = uf2FromGithubArtifactZip(response.data, archiveBytes);
      selectUf2Artifact(uf2.bytes, uf2.fileName, "GitHub artifact loaded");
      githubNotice = `Loaded ${uf2.fileName} from ${response.data.artifactName}.`;
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(() => {
            githubError =
              error instanceof Error ? error.message : "GitHub artifact download failed.";
            appendUf2Log(`GitHub artifact download failed: ${githubError}`);
          }),
        ),
        Effect.ensuring(Effect.sync(() => (githubDownloadingArtifact = false))),
      ),
    );
  }

  function enterBootloaderVia() {
    if (!viaJumpAvailable || jumping) return;
    const connection = shell.liveConnection;
    const sendReport = connection?.hidDevice?.sendReport?.bind(connection.hidDevice);
    if (!sendReport) return;

    if (
      browser &&
      !window.confirm(
        "Put the connected keyboard into bootloader mode now? The device may disconnect until you replug or flash it.",
      )
    ) {
      return;
    }

    jumping = true;
    phase = "enter_bootloader";
    void runApp(
      "flash.enter-bootloader",
      hostEffect("flash.enter-bootloader", () =>
        sendReport(0, encodeViaCommandReport("bootloaderJump")),
      ).pipe(
        Effect.tap(() => Effect.sync(() => appendUf2Log("sent VIA bootloader jump command"))),
        Effect.catch((error) =>
          Effect.sync(() =>
            appendUf2Log(
              `bootloader jump failed: ${error instanceof Error ? error.message : "unknown error"}`,
            ),
          ),
        ),
        Effect.ensuring(Effect.sync(() => (jumping = false))),
      ),
    );
  }

  function chooseBootloaderVolume() {
    if (!uf2Bytes || !uf2Plan || flashing) return;
    fsSupport = currentFileSystemSupport();
    if (!fsSupport.supported) {
      appendUf2Log(fsSupport.reason ?? "File System Access copy is unavailable");
      return;
    }

    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) return;

    flashing = true;
    phase = "flash";
    flashResult = null;
    verifyResult = null;
    appendUf2Log("opening bootloader volume picker");

    void runApp(
      "flash.copy-uf2",
      Effect.gen(function* () {
      const handle = (yield* hostEffect("flash.pick-bootloader-volume", () =>
        picker({ mode: "readwrite" }),
      )) as Uf2FileSystemAccessTarget;
      // Real device copy/reboot timing is hardware-unverified; tests cover injected mock handles.
      const written = yield* hostEffect("flash.copy-uf2", () =>
        flashUf2ViaFileSystemAccess(handle, uf2Bytes!, {
          expectedFamilyId: uf2Plan!.targetBootloader.familyId,
          expectedVolumeHints: uf2Plan!.targetBootloader.expectedVolumeHints,
          fileName: uf2Plan!.artifact.fileName,
          onProgress: (progress) => {
            flashProgress = progress;
          },
        }),
      );
      flashResult = written;
      for (const line of written.log) appendUf2Log(line);
      phase = "verify";
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(() =>
            appendUf2Log(
              `UF2 copy failed: ${error instanceof Error ? error.message : "permission or write failed"}`,
            ),
          ),
        ),
        Effect.ensuring(Effect.sync(() => (flashing = false))),
      ),
    );
  }

  function uf2FromGithubArtifactZip(
    download: GitHubFirmwareArtifactDownloadResponse,
    zipBytes: Uint8Array,
  ) {
    const archive = unzipSync(zipBytes);
    const entry = Object.entries(archive)
      .filter(([path]) => path.toLowerCase().endsWith(".uf2"))
      .sort(([left], [right]) => left.localeCompare(right))[0];

    if (!entry) {
      throw new Error(`GitHub artifact ${download.artifactName} did not contain a UF2 file.`);
    }

    const [path, bytes] = entry;
    return {
      bytes,
      fileName: path.split("/").pop() || `${download.artifactName}.uf2`,
    };
  }

  function bytesFromBase64(value: string) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
  }

  function verifyReconnect() {
    if (!uf2Plan || verifying) return;

    verifying = true;
    phase = "verify";
    verifyResult = null;
    appendUf2Log("starting Connect flow verification");

    const reconnect = () =>
      runApp(
        "flash.reconnect-device",
        hostEffect("flash.reconnect-device", () =>
          connectViaAndActivate({
            baseProfile: activeProfile,
            connectOptions: { matrixHint: activeProfile.matrix },
            shell,
            transport: createWebHidViaTransport(currentFilters(activeProfile)),
            workbench,
          }),
        ).pipe(
          Effect.flatMap((result) =>
            result.connection
              ? Effect.succeed(result.connection)
              : Effect.fail(
                  platformError(
                    "flash.reconnect-device",
                    "Connect flow did not return a connection.",
                  ),
                ),
          ),
        ),
      );

    void runApp(
      "flash.verify-reconnect",
      hostEffect("flash.verify-reconnect", () =>
        verifyUf2Reconnect(reconnect, {
          productId: activeProfile.productId,
          protocol: activeProfile.protocol === "via-v3" ? "via-v3" : undefined,
          vendorId: activeProfile.vendorId,
        }),
      ).pipe(
        Effect.tap((verified) =>
          Effect.sync(() => {
      verifyResult = verified;
      for (const line of verified.log) appendUf2Log(line);
      for (const warning of verified.warnings) appendUf2Log(`warning: ${warning}`);
      phase = verified.ok ? "done" : "verify";
          }),
        ),
        Effect.catch((error) =>
          Effect.sync(() => {
            const message =
              error instanceof Error ? error.message : "Reconnect verification failed.";
            verifyResult = {
              log: [message],
              message,
              ok: false,
              warnings: [],
            };
            appendUf2Log(`verification failed: ${message}`);
          }),
        ),
        Effect.ensuring(Effect.sync(() => (verifying = false))),
      ),
    );
  }

  function downloadSourceBundle() {
    if (!result) return;

    const entries: Record<string, Uint8Array> = {};
    for (const file of result.artifacts) entries[file.path] = strToU8(file.content);
    entries["COMMANDS.txt"] = strToU8(`${commandLog}\n`);
    entries["kbui-diagnostics.json"] = strToU8(
      `${JSON.stringify(
        {
          buildCommand: result.buildCommand,
          buildReady: result.buildReady,
          diagnostics: result.diagnostics,
          summary: result.summary,
          sourceHash: result.sourceHash,
          target: result.target,
        },
        null,
        2,
      )}\n`,
    );

    const zipped = zipSync(entries, { level: 6 });
    downloadBlob(
      new Blob([arrayBufferCopy(zipped)], { type: "application/zip" }),
      `${bundleSlug(activeProfile)}-${result.sourceHash}.zip`,
    );
  }

  function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function arrayBufferCopy(bytes: Uint8Array): ArrayBuffer {
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    return copy;
  }

  function currentFilters(activeProfile: DeviceProfile) {
    return [
      { vendorId: activeProfile.vendorId, productId: activeProfile.productId },
      { vendorId: activeProfile.vendorId },
    ];
  }

  function volumeHintsFor(activeProfile: DeviceProfile) {
    return verifiedUf2Target?.volumeLabels.length
      ? verifiedUf2Target.volumeLabels
      : defaultUf2VolumeHints(activeProfile.name);
  }

  function sourceBundleFor(artifacts: FirmwareArtifacts): FirmwareSourceBundle {
    return {
      buildCommand: artifacts.buildCommand,
      diagnostics: artifacts.diagnostics,
      files: artifacts.artifacts,
      sourceHash: artifacts.sourceHash,
    };
  }

  function canOfferBrowserBuild(activeProfile: DeviceProfile, artifacts: FirmwareArtifacts) {
    return (
      browser &&
      artifacts.buildReady &&
      artifacts.target === "qmk" &&
      isBrowserBuildAvailable() &&
      experimentalBrowserBuildManifest(activeProfile) !== null
    );
  }

  function experimentalBrowserBuildManifest(
    _activeProfile: DeviceProfile,
  ): FirmwareObjectBundleManifest | null {
    return null;
  }

  function bundleSlug(activeProfile: DeviceProfile) {
    return activeProfile.name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "kbui-firmware-source";
  }

  function commandLogFor(
    artifacts: FirmwareArtifacts,
    activeProfile: DeviceProfile,
    profileChanges: readonly LiveSyncChangeNotice[],
    plan: Uf2FlashPlan | null,
    log: readonly string[],
    support: Uf2FlashSupport,
    written: Uf2FileSystemFlashResult | null,
    browserBuild: FirmwareBuildResult | null,
    githubBuild: GitHubFirmwareBuildResponse | null,
    githubRun: GitHubFirmwareRunDto | null,
  ) {
    const changeLines =
      profileChanges.length > 0
        ? profileChanges.map((change) => `  - ${change.path} (${change.reason})`)
        : ["  - profile snapshot only"];
    const diagnosticLines =
      artifacts.diagnostics.length > 0
        ? artifacts.diagnostics.map(
            (item) =>
              `  - ${item.severity.toUpperCase()} ${item.code}: ${item.message}${
                item.path ? ` [${item.path}]` : ""
              }`,
          )
        : ["  - none"];
    const uf2Lines = plan
      ? [
          "",
          "UF2 artifact:",
          `  file: ${plan.artifact.fileName}`,
          `  size: ${plan.artifact.size} bytes`,
          `  hash: ${plan.artifact.hash}`,
          `  blocks: ${plan.artifact.blockCount}`,
          `  family: ${plan.artifact.familyIdHex ?? "not declared"}`,
          `  target: ${formatRange(plan.artifact.targetAddressRange)}`,
          `  volume hints: ${plan.targetBootloader.expectedVolumeHints.join(", ")}`,
          `  direct-copy support: ${support.supported ? "available" : support.reason ?? "unavailable"}`,
          `  hardware: ${written?.hardwareVerified === false ? "copy completed but hardware-unverified" : "unverified"}`,
        ]
      : [
          "",
          "UF2 artifact:",
          "  none selected; source export remains available.",
          `  direct-copy support: ${support.supported ? "available after UF2 selection" : support.reason ?? "unavailable"}`,
        ];
    const flashLines = log.length > 0 ? ["", "flash log:", ...log.map((line) => `  ${line}`)] : [];
    const browserBuildLines =
      browserBuild === null
        ? []
        : [
            "",
            "browser build:",
            `  status: ${browserBuild.ok ? "ok" : browserBuild.error.code}`,
            `  total: ${browserBuild.timings?.totalMs ?? 0} ms`,
            ...(browserBuild.ok
              ? [
                  `  artifact: ${browserBuild.artifact.fileName}`,
                  `  size: ${browserBuild.artifact.sizeBytes} bytes`,
                ]
              : [`  error: ${browserBuild.error.message}`]),
          ];
    const githubBuildLines =
      githubBuild === null
        ? []
        : [
            "",
            "github actions:",
            `  status: ${githubBuild.build.status}`,
            `  request: ${githubBuild.build.requestId}`,
            `  repository: ${githubBuild.repository.fullName}`,
            `  branch: ${githubBuild.branch.branchName}`,
            `  commit: ${githubBuild.commit?.sha ?? "not returned"}`,
            `  run: ${githubRun?.runId ?? githubBuild.build.runId ?? "not visible yet"}`,
            `  run-status: ${githubRun?.label ?? githubBuild.build.status}`,
            `  artifact: ${githubRun?.artifact?.name ?? "not available yet"}`,
          ];

    return [
      `$ kbui firmware-source generate --target ${artifacts.target}`,
      `profile: ${profileDisplayName(activeProfile)}`,
      `source-hash: ${artifacts.sourceHash}`,
      `source-status: ${artifacts.buildReady ? "build-ready" : "not build-ready"}`,
      "",
      "profile changes included:",
      ...changeLines,
      "",
      "generated files:",
      ...artifacts.artifacts.map((file) => `  - ${file.path}`),
      "",
      "diagnostics:",
      ...diagnosticLines,
      "",
      "manual local build command:",
      `  ${artifacts.buildCommand}`,
      ...uf2Lines,
      ...browserBuildLines,
      ...githubBuildLines,
      ...flashLines,
      "",
      "notes:",
      artifacts.buildReady
        ? "  Generated source has no build-blocking diagnostics."
        : "  Generated source is not build-ready; replace required metadata markers before compiling or flashing firmware from it.",
      "  UF2 guided flash is automated-test-covered and real-device hardware-unverified.",
      "  VIA EEPROM may override flashed default keymaps until a future reset flow exists.",
    ].join("\n");
  }

  function diagnosticTarget(item: FirmwareDiagnostic) {
    return item.path ?? item.file ?? item.code;
  }

  function diagnosticSummary(items: readonly FirmwareDiagnostic[]) {
    return items.map(diagnosticTarget).join(", ");
  }

  function phaseStatus(key: FlashPhase) {
    if (phase === "done") return "done";
    const currentIndex = phaseOrder.indexOf(phase);
    const keyIndex = phaseOrder.indexOf(key);
    if (keyIndex < currentIndex) return "done";
    if (keyIndex === currentIndex) return "active";
    return "pending";
  }

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function formatHex(value: number) {
    return `0x${value.toString(16).padStart(8, "0")}`;
  }

  function formatRange(range: { endExclusive: number; start: number }) {
    return `${formatHex(range.start)}-${formatHex(range.endExclusive)}`;
  }

  function progressPercent(progress: Uf2FlashProgress | null) {
    if (!progress || progress.totalBytes === 0) return 0;
    return Math.min(100, Math.round((progress.bytesWritten / progress.totalBytes) * 100));
  }
</script>

{#if open && result}
  <div class={overlayClass} data-testid="flash-overlay">
    <button type="button" class={scrimClass} aria-label="Close firmware flash overlay" onclick={close}></button>

    <div class={modalClass} role="dialog" aria-modal="true" aria-labelledby="flash-overlay-title">
      <header class={modalHeadClass}>
        <span class={modalBoltClass} aria-hidden="true">bolt</span>
        <div>
          <h2 id="flash-overlay-title" class={modalTitleClass}>Flash to {profileDisplayName(activeProfile)}</h2>
          <p class={modalSubtitleClass}>{targetLabel} source export · UF2 guided flash</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          class={modalCloseClass}
          aria-label="Close"
          onclick={close}
        >
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </Button>
      </header>

      <div class={flashStepsClass} aria-label="Firmware flash steps">
        {#each flashSteps as step (step.key)}
          <div
            class={cn(
              flashStepClass,
              step.status,
              step.status === "active" && flashStepActiveClass,
              step.status === "done" && flashStepDoneClass,
            )}
          >
            <span class={flashStepIconClass} aria-hidden="true">
              {step.status === "done" ? "check_circle" : step.status === "active" ? "progress_activity" : "radio_button_unchecked"}
            </span>
            <span class={flashStepLabelClass}>{step.label}</span>
          </div>
        {/each}
      </div>

      <div class={sourceFactsClass} aria-label="Generated source and UF2 summary">
        <div class={sourceFactClass}>
          <span class={microLabelClass}>Target</span>
          <strong class={sourceFactValueClass}>{targetLabel}</strong>
        </div>
        <div class={sourceFactClass}>
          <span class={microLabelClass}>Source files</span>
          <strong class={sourceFactValueClass}>{result.artifacts.length}</strong>
        </div>
        <div class={sourceFactClass}>
          <span class={microLabelClass}>Source hash</span>
          <strong class={sourceFactValueClass}>{result.sourceHash}</strong>
        </div>
        <div class={cn(sourceFactClass, !result.buildReady && sourceFactBlockedClass)}>
          <span class={microLabelClass}>Source status</span>
          <strong class={sourceFactValueClass}>{result.buildReady ? "build-ready" : "not build-ready"}</strong>
        </div>
        <div class={sourceFactClass}>
          <span class={microLabelClass}>UF2</span>
          <strong class={sourceFactValueClass}>{uf2Plan ? formatBytes(uf2Plan.artifact.size) : "not selected"}</strong>
        </div>
      </div>

      {#if errorDiagnostics.length > 0}
        <section class={cn(diagnosticBannerClass, diagnosticBannerErrorClass)} aria-label="Build readiness errors">
          <div class={diagnosticTitleClass}>
            <span class={cn(diagnosticIconClass, diagnosticIconErrorClass)} aria-hidden="true">report</span>
            <div>
              <strong class={diagnosticTitleStrongClass}>Not build-ready - missing: {diagnosticSummary(errorDiagnostics)}</strong>
              <small class={diagnosticTitleSmallClass}>Fill these required inputs before compiling, browser-building, or flashing firmware generated from this source.</small>
            </div>
          </div>
          <ul class={diagnosticListClass}>
            {#each errorDiagnostics as item (`${item.code}:${diagnosticTarget(item)}`)}
              <li class={diagnosticListItemClass}>
                <span class={diagnosticListTargetClass}>{diagnosticTarget(item)}</span>
                <p class={diagnosticListMessageClass}>{item.message}</p>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if warningDiagnostics.length > 0}
        <section class={cn(diagnosticBannerClass, diagnosticBannerWarningClass)} aria-label="Incomplete source coverage warnings">
          <div class={diagnosticTitleClass}>
            <span class={cn(diagnosticIconClass, diagnosticIconWarningClass)} aria-hidden="true">warning</span>
            <div>
              <strong class={diagnosticTitleStrongClass}>Incomplete coverage - review before flashing: {warningDiagnostics.length} warning{warningDiagnostics.length === 1 ? "" : "s"}</strong>
              <small class={diagnosticTitleSmallClass}>These source sections compile to placeholders, TODOs, or board-specific review points.</small>
            </div>
          </div>
          <ul class={diagnosticListClass}>
            {#each warningDiagnostics as item (`${item.code}:${diagnosticTarget(item)}`)}
              <li class={diagnosticListItemClass}>
                <span class={diagnosticListTargetClass}>{diagnosticTarget(item)}</span>
                <p class={diagnosticListMessageClass}>{item.message}</p>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      <section class={flashPanelsClass} aria-label="UF2 guided flash controls">
        <div class={flashPanelClass}>
          <div class={panelHeadClass}>
            <span class={panelIconClass} aria-hidden="true">draft</span>
            <div>
              <strong class={panelTitleClass}>Firmware artifact</strong>
              <small class={panelSmallClass}>{uf2Plan ? uf2Plan.artifact.fileName : "Select a compiled .uf2 from a local build"}</small>
            </div>
          </div>

          {#if uf2Plan}
            <dl class={artifactMetaClass}>
              <div class={artifactMetaRowClass}><dt class={microLabelClass}>Family</dt><dd class={artifactMetaDescriptionClass}>{uf2Plan.artifact.familyIdHex ?? "not declared"}</dd></div>
              <div class={artifactMetaRowClass}><dt class={microLabelClass}>Range</dt><dd class={artifactMetaDescriptionClass}>{formatRange(uf2Plan.artifact.targetAddressRange)}</dd></div>
              <div class={artifactMetaRowClass}><dt class={microLabelClass}>Hash</dt><dd class={artifactMetaDescriptionClass}>{uf2Plan.artifact.hash}</dd></div>
            </dl>
          {:else}
            <p class={panelCopyClass}>
              {result.buildReady
                ? "Build externally for now, then bring the UF2 back here."
                : "Resolve the source diagnostics before compiling or flashing firmware from this export. The zip remains available so you can fill the required metadata."}
            </p>
          {/if}

          {#if uf2Error}
            <p class={copyErrorClass} role="status">{uf2Error}</p>
          {/if}

          {#if browserBuildAvailable}
            <div class={browserBuildCalloutClass} aria-label="Experimental browser firmware build">
              <div>
                <strong class={browserBuildTitleClass}>Experimental browser build</strong>
                <small class={browserBuildSmallClass}>WASM LLVM · OPFS cache · RP2040 UF2 output</small>
              </div>
              <Button variant="coral" size="sm" disabled={browserBuilding} onclick={buildFirmwareInBrowser}>
                <span class="material-symbols-outlined" aria-hidden="true">memory</span>
                {browserBuilding ? "Building..." : "Build firmware"}
              </Button>
            </div>
          {/if}

          {#if browserBuildError}
            <p class={copyErrorClass} role="status">{browserBuildError}</p>
          {/if}

          {#if browserBuildResult}
            <dl class={cn(artifactMetaClass, browserBuildMetaClass)}>
              <div class={artifactMetaRowClass}><dt class={microLabelClass}>Browser build</dt><dd class={artifactMetaDescriptionClass}>{browserBuildResult.ok ? "ok" : browserBuildResult.error.code}</dd></div>
              <div class={artifactMetaRowClass}><dt class={microLabelClass}>Total</dt><dd class={artifactMetaDescriptionClass}>{browserBuildResult.timings?.totalMs ?? 0} ms</dd></div>
              {#if browserBuildResult.ok}
                <div class={artifactMetaRowClass}><dt class={microLabelClass}>Artifact</dt><dd class={artifactMetaDescriptionClass}>{browserBuildResult.artifact.fileName}</dd></div>
              {/if}
            </dl>
          {/if}

          <div class={githubBuildCalloutClass} aria-label="GitHub Actions firmware build">
            <div>
              <strong class={browserBuildTitleClass}>GitHub Actions build</strong>
              <small class={browserBuildSmallClass}>
                {githubConnected
                  ? `${githubBranchName} · ${firmwareBuildEvents.connected ? "live" : "reconnecting"}`
                  : "Install the GitHub App in Settings"}
              </small>
            </div>
            {#if githubConnected}
              <Button
                variant="coral"
                size="sm"
                disabled={githubBusy || !result.buildReady}
                onclick={buildFirmwareWithGithub}
              >
                <span class="material-symbols-outlined" aria-hidden="true">cloud_upload</span>
                {githubBusy ? "Dispatching..." : "Build"}
              </Button>
            {:else}
              <Button variant="ghost" size="sm" href="/settings">
                <span class="material-symbols-outlined" aria-hidden="true">settings</span>
                Settings
              </Button>
            {/if}
          </div>

          {#if githubError}
            <p class={copyErrorClass} role="status">{githubError}</p>
          {:else if githubNotice}
            <p class={hardwareNoteClass} role="status">{githubNotice}</p>
          {/if}

          {#if githubBuildResult}
            <dl class={cn(artifactMetaClass, browserBuildMetaClass)}>
              <div class={artifactMetaRowClass}><dt class={microLabelClass}>GitHub build</dt><dd class={artifactMetaDescriptionClass}>{githubRun?.label ?? githubBuildResult.build.status}</dd></div>
              <div class={artifactMetaRowClass}><dt class={microLabelClass}>Repo</dt><dd class={artifactMetaDescriptionClass}>{githubBuildResult.repository.fullName}</dd></div>
              <div class={artifactMetaRowClass}><dt class={microLabelClass}>Branch</dt><dd class={artifactMetaDescriptionClass}>{githubBuildResult.branch.branchName}</dd></div>
              <div class={artifactMetaRowClass}><dt class={microLabelClass}>Run</dt><dd class={artifactMetaDescriptionClass}>{githubRun?.runId ? `#${githubRun.runNumber ?? githubRun.runId}` : "waiting"}</dd></div>
              <div class={artifactMetaRowClass}><dt class={microLabelClass}>Artifact</dt><dd class={artifactMetaDescriptionClass}>{githubArtifact ? `${githubArtifact.name} · ${formatBytes(githubArtifact.sizeBytes)}` : "waiting"}</dd></div>
            </dl>
            <div class={buttonRowClass}>
              <Button
                variant="coral"
                size="sm"
                disabled={!githubArtifact || githubDownloadingArtifact}
                onclick={loadGithubArtifactUf2}
              >
                <span class="material-symbols-outlined" aria-hidden="true">inventory_2</span>
                {githubDownloadingArtifact ? "Loading..." : "Load UF2"}
              </Button>
            </div>
          {/if}

          <div class={buttonRowClass}>
            <Button variant="ghost" size="sm" onclick={chooseUf2File}>
              <span class="material-symbols-outlined" aria-hidden="true">upload_file</span>
              {uf2Plan ? "Replace UF2" : "Select UF2"}
            </Button>
            <Button variant="ghost" size="sm" onclick={downloadSourceBundle}>
              <span class="material-symbols-outlined" aria-hidden="true">download</span>
              Source zip
            </Button>
          </div>

          <input
            bind:this={uf2Input}
            class={hiddenFileInputClass}
            type="file"
            accept=".uf2,application/octet-stream,application/x-uf2"
            onchange={loadUf2File}
          />
        </div>

        <div class={flashPanelClass}>
          <div class={panelHeadClass}>
            <span class={panelIconClass} aria-hidden="true">usb</span>
            <div>
              <strong class={panelTitleClass}>Bootloader volume</strong>
              <small class={panelSmallClass}>{uf2Plan ? uf2Plan.targetBootloader.name : "UF2 mass-storage target"}</small>
            </div>
          </div>

          {#if viaJumpAvailable}
            <p class={panelCopyClass}>
              A VIA keyboard is connected. You can request bootloader mode, then choose the mounted UF2 volume.
            </p>
            <Button variant="coral" size="sm" disabled={!uf2Plan || jumping} onclick={enterBootloaderVia}>
              <span class="material-symbols-outlined" aria-hidden="true">restart_alt</span>
              {jumping ? "Sending..." : "Enter bootloader"}
            </Button>
          {:else}
            <p class={panelCopyClass}>
              Put the board into bootloader mode manually, then wait for the UF2 drive to mount.
            </p>
            <ol class={manualStepsClass}>
              <li>Unplug if needed.</li>
              <li>Hold BOOT/RESET, BOOTSEL, or double-tap reset for this board.</li>
              <li>Look for a volume like {uf2Plan?.targetBootloader.expectedVolumeHints[0] ?? "RPI-RP2"}.</li>
            </ol>
          {/if}

          <div class={volumeHintsClass} aria-label="Expected UF2 volume names">
            {#each (uf2Plan?.targetBootloader.expectedVolumeHints ?? volumeHintsFor(activeProfile)) as hint (hint)}
              <code class={volumeHintClass}>{hint}</code>
            {/each}
          </div>
        </div>
      </section>

      {#if uf2Plan}
        <section class={copyPanelClass} aria-label="UF2 copy and verify">
          <div class={supportRowClass} data-supported={fsSupport.supported}>
            <span class={panelIconClass} aria-hidden="true">{fsSupport.supported ? "folder_managed" : "download"}</span>
            <div>
              <strong class={panelTitleClass}>{fsSupport.supported ? "Browser copy available" : "Direct copy unavailable"}</strong>
              <small class={panelSmallClass}>{fsSupport.supported ? "Choose the mounted bootloader volume and kbui will copy the UF2 file." : fsSupport.reason}</small>
            </div>
          </div>

          {#if flashProgress}
            <div class={progressBlockClass} aria-label="UF2 copy progress">
              <div class={progressLabelClass}>
                <span class={microLabelClass}>{flashProgress.phase}</span>
                <strong>{progressPercent(flashProgress)}%</strong>
              </div>
              <div class={progressTrackClass}>
                <span class={progressTrackBarClass} style={`width: ${progressPercent(flashProgress)}%`}></span>
              </div>
            </div>
          {/if}

          {#if verifyResult}
            <p class={cn(verifyMessageClass, verifyResult.ok ? verifyOkClass : verifyErrorClass)}>
              {verifyResult.message}
            </p>
          {/if}

          <div class={cn(buttonRowClass, copyActionsClass)}>
            <Button variant="coral" size="sm" disabled={flashing || !fsSupport.supported} onclick={chooseBootloaderVolume}>
              <span class="material-symbols-outlined" aria-hidden="true">drive_folder_upload</span>
              {flashing ? "Copying..." : "Choose UF2 volume"}
            </Button>
            <Button variant="ghost" size="sm" disabled={verifying} onclick={verifyReconnect}>
              <span class="material-symbols-outlined" aria-hidden="true">fact_check</span>
              {verifying ? "Verifying..." : "Verify reconnect"}
            </Button>
          </div>
        </section>
      {/if}

      <pre class={commandLogClass}>{commandLog}</pre>

      <p class={hardwareNoteClass}>
        Direct copy requires a verified processor family, matching UF2 family ID, expected bootloader volume, and a successful post-flash reconnect readback.
      </p>

      {#if copyError}
        <p class={copyErrorClass} role="status">{copyError}</p>
      {/if}

      <footer class={modalActionsClass}>
        <Button variant="ghost" onclick={copyLog}>
          <span class="material-symbols-outlined" aria-hidden="true">{copied ? "check" : "content_copy"}</span>
          {copied ? "Copied" : "Copy log"}
        </Button>
        <Button variant="ghost" onclick={downloadSourceBundle}>
          <span class="material-symbols-outlined" aria-hidden="true">download</span>
          Download source zip
        </Button>
        <Button variant={phase === "done" ? "coral" : "ghost"} onclick={close}>
          <span class="material-symbols-outlined" aria-hidden="true">{phase === "done" ? "check" : "close"}</span>
          {phase === "done" ? "Done" : "Close"}
        </Button>
      </footer>
    </div>
  </div>
{/if}
