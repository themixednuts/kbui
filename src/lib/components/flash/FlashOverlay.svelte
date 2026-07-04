<script lang="ts">
  import { browser } from "$app/environment";
  import { strToU8, zipSync } from "fflate";

  import { connectViaAndActivate } from "$lib/app/connect-flow";
  import { getShellContext } from "$lib/app/shell-store.svelte";
  import { getWorkbenchContext } from "$lib/app/workbench-store.svelte";
  import type { LiveSyncChangeNotice } from "$lib/app/via-live-sync.svelte";
  import Button from "$lib/components/ui/Button.svelte";
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
  import { profileDisplayName, type DeviceProfile } from "$lib/keyboard/schema";
  import { createWebHidViaTransport } from "$lib/keyboard/transport";
  import {
    createUf2DownloadFallback,
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
  import { encodeViaCommandReport } from "$lib/keyboard/via-protocol";
  import { cn } from "$lib/utils.js";

  type Props = {
    changes?: readonly LiveSyncChangeNotice[];
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
    "flash-scrim absolute inset-0 ![background-color:rgba(27,25,23,0.46)] backdrop-blur-[5px]";
  const modalClass =
    "flash-modal relative grid w-[min(720px,calc(100vw-28px))] max-h-[min(860px,calc(100vh-28px))] gap-[14px] overflow-auto rounded-[20px] border border-[color-mix(in_oklch,var(--surface)_42%,var(--line-2))] bg-surface p-[22px] shadow-modal max-[720px]:w-full max-[720px]:max-h-[calc(100vh-20px)] max-[720px]:rounded-[16px] max-[720px]:p-[16px]";
  const modalHeadClass =
    "modal-head grid grid-cols-[22px_minmax(0,1fr)_30px] items-start gap-[10px]";
  const modalBoltClass = "material-symbols-outlined modal-bolt !text-[22px] text-coral";
  const modalTitleClass = "m-0 text-[15px] leading-[1.25] [overflow-wrap:anywhere]";
  const modalSubtitleClass =
    "mt-[3px] mb-0 font-mono text-[11px] text-ink-3 [overflow-wrap:anywhere]";
  const modalCloseClass =
    "modal-close grid size-[30px] place-items-center rounded-[8px] !text-ink-3 hover:bg-paper-2 hover:!text-ink";
  const flashStepsClass =
    "flash-steps grid grid-cols-[repeat(3,minmax(0,1fr))] gap-x-[10px] gap-y-[8px] max-[720px]:grid-cols-[minmax(0,1fr)]";
  const flashStepClass = "flash-step flex min-w-0 items-center gap-[8px] text-[12px] text-ink-3";
  const flashStepActiveClass = "active text-ink [&_.material-symbols-outlined]:text-coral";
  const flashStepDoneClass = "done [&_.material-symbols-outlined]:text-added";
  const flashStepIconClass = "material-symbols-outlined flex-none !text-[19px]";
  const flashStepLabelClass = "overflow-hidden text-ellipsis whitespace-nowrap";
  const sourceFactsClass =
    "source-facts grid grid-cols-[repeat(5,minmax(0,1fr))] gap-[8px] max-[720px]:grid-cols-[minmax(0,1fr)]";
  const sourceFactClass =
    "grid min-w-0 gap-[3px] rounded-[8px] border border-line bg-paper-2 px-[10px] py-[9px]";
  const sourceFactBlockedClass =
    "source-blocked border-[oklch(0.62_0.2_25_/_0.36)] bg-[oklch(0.95_0.04_25)]";
  const microLabelClass =
    "font-mono text-[9px] tracking-[0.08em] text-ink-3 uppercase";
  const sourceFactValueClass =
    "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px]";
  const diagnosticBannerClass =
    "diagnostic-banner grid min-w-0 gap-[9px] rounded-[10px] border border-line px-[12px] py-[11px]";
  const diagnosticBannerErrorClass =
    "error border-[oklch(0.62_0.2_25_/_0.36)] bg-[oklch(0.95_0.04_25)]";
  const diagnosticBannerWarningClass =
    "warning border-[color-mix(in_oklch,var(--mustard)_48%,var(--line-2))] bg-[color-mix(in_oklch,var(--mustard)_14%,var(--surface))]";
  const diagnosticTitleClass =
    "diagnostic-title grid min-w-0 grid-cols-[26px_minmax(0,1fr)] items-start gap-[9px]";
  const diagnosticIconClass =
    "material-symbols-outlined !grid size-[26px] place-items-center rounded-[8px] border border-[color-mix(in_oklch,currentColor_30%,var(--surface))] bg-surface !text-[17px]";
  const diagnosticIconErrorClass = "text-[oklch(0.42_0.15_25)]";
  const diagnosticIconWarningClass =
    "text-[color-mix(in_oklch,var(--mustard)_72%,var(--ink))]";
  const diagnosticTitleStrongClass =
    "block min-w-0 font-mono text-[12px] leading-[1.35] text-ink [overflow-wrap:anywhere]";
  const diagnosticTitleSmallClass =
    "mt-[3px] block min-w-0 text-[11px] leading-[1.35] text-ink-3 [overflow-wrap:anywhere]";
  const diagnosticListClass = "diagnostic-list m-0 grid list-none gap-[6px] p-0";
  const diagnosticListItemClass =
    "grid min-w-0 grid-cols-[minmax(110px,0.42fr)_minmax(0,1fr)] items-start gap-[8px] rounded-[8px] border border-[color-mix(in_oklch,var(--surface)_55%,var(--line))] bg-[color-mix(in_oklch,var(--surface)_70%,transparent)] px-[8px] py-[7px]";
  const diagnosticListTargetClass =
    "min-w-0 font-mono text-[10px] leading-[1.35] text-ink-3 [overflow-wrap:anywhere]";
  const diagnosticListMessageClass = "m-0 min-w-0 text-[11px] leading-[1.35] text-ink-2";
  const flashPanelsClass =
    "flash-panels grid grid-cols-[repeat(2,minmax(0,1fr))] gap-[10px] max-[720px]:grid-cols-[minmax(0,1fr)]";
  const flashPanelClass =
    "flash-panel grid min-w-0 gap-[10px] rounded-[10px] border border-line bg-[color-mix(in_oklch,var(--paper-2)_62%,transparent)] p-[12px]";
  const copyPanelClass =
    "copy-panel grid min-w-0 gap-[11px] rounded-[10px] border border-line bg-[color-mix(in_oklch,var(--paper-2)_62%,transparent)] p-[12px]";
  const panelHeadClass =
    "panel-head grid min-w-0 grid-cols-[26px_minmax(0,1fr)] items-start gap-[9px]";
  const supportRowClass =
    "support-row grid min-w-0 grid-cols-[26px_minmax(0,1fr)] items-start gap-[9px] data-[supported=true]:[&>.material-symbols-outlined]:border-[oklch(0.62_0.16_150_/_0.28)] data-[supported=true]:[&>.material-symbols-outlined]:text-[oklch(0.35_0.12_150)]";
  const panelIconClass =
    "material-symbols-outlined !grid size-[26px] place-items-center rounded-[8px] border border-line-2 bg-surface !text-[17px] text-coral-ink";
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
    "verify-message m-0 rounded-[8px] px-[10px] py-[8px] font-mono text-[11px] leading-[1.35]";
  const verifyOkClass = "verify-ok bg-[oklch(0.94_0.05_150)] text-[oklch(0.35_0.12_150)]";
  const verifyErrorClass =
    "verify-error bg-[oklch(0.95_0.04_25)] text-[oklch(0.42_0.15_25)]";
  const commandLogClass =
    "command-log m-0 min-h-[170px] max-h-[220px] overflow-auto whitespace-pre-wrap rounded-[10px] bg-ink px-[16px] py-[14px] font-mono text-[11px] leading-[1.65] text-paper";
  const hardwareNoteClass = "hardware-note mt-[-4px] mb-0 text-[11px] leading-[1.4] text-ink-3";
  const copyErrorClass =
    "copy-error mt-[-4px] mb-0 text-[11px] leading-[1.4] text-[oklch(0.42_0.15_25)]";
  const copyActionsClass = "copy-actions max-[720px]:grid max-[720px]:grid-cols-[minmax(0,1fr)]";
  const modalActionsClass =
    "modal-actions flex flex-wrap justify-end gap-[8px] max-[720px]:grid max-[720px]:grid-cols-[minmax(0,1fr)]";
  const hiddenFileInputClass =
    "hidden-file-input pointer-events-none absolute size-px overflow-hidden opacity-0";

  let { changes = [], onclose, open = $bindable(false), profile }: Props = $props();

  const shell = getShellContext();
  const workbench = getWorkbenchContext();

  let result = $state<FirmwareArtifacts | null>(null);
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
  let manualCopied = $state(false);
  let flashProgress = $state<Uf2FlashProgress | null>(null);
  let flashResult = $state<Uf2FileSystemFlashResult | null>(null);
  let verifyResult = $state<Uf2VerifyResult | null>(null);
  let browserBuildAvailable = $state(false);
  let browserBuilding = $state(false);
  let browserBuildResult = $state<FirmwareBuildResult | null>(null);
  let browserBuildError = $state<string | null>(null);
  let fsSupport = $state<Uf2FlashSupport>(
    detectUf2FileSystemAccessSupport({ isBrowser: false }),
  );

  const commandLog = $derived(
    result
      ? commandLogFor(
          result,
          profile,
          changes,
          uf2Plan,
          uf2Log,
          fsSupport,
          flashResult,
          browserBuildResult,
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
    if (!open) {
      resetOverlayState();
      return;
    }

    const generated = generateFirmwareArtifacts(profile);
    result = generated;
    resetUf2State();
    copied = false;
    copyError = null;
    fsSupport = currentFileSystemSupport();
    browserBuildAvailable = canOfferBrowserBuild(profile, generated);
  });

  function resetOverlayState() {
    result = null;
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
    manualCopied = false;
    flashProgress = null;
    flashResult = null;
    verifyResult = null;
    browserBuildAvailable = false;
    browserBuilding = false;
    browserBuildResult = null;
    browserBuildError = null;
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

  async function copyLog() {
    if (!commandLog) return;

    try {
      await navigator.clipboard.writeText(commandLog);
      copied = true;
      copyError = null;
      setTimeout(() => {
        copied = false;
      }, 1500);
    } catch (error) {
      copyError = error instanceof Error ? error.message : "Could not copy command log";
    }
  }

  function chooseUf2File() {
    uf2Input?.click();
  }

  async function loadUf2File(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const plan = createUf2FlashPlan({
        boardName: profile.name,
        expectedVolumeHints: volumeHintsFor(profile),
        fileName: file.name,
        uf2Bytes: bytes,
      });
      uf2Bytes = bytes;
      uf2Plan = plan;
      uf2Error = null;
      flashProgress = null;
      flashResult = null;
      verifyResult = null;
      manualCopied = false;
      phase = "enter_bootloader";
      appendUf2Log(
        `selected ${plan.artifact.fileName} (${formatBytes(plan.artifact.size)}, ${plan.artifact.blockCount} UF2 blocks)`,
      );
      if (plan.artifact.familyIdHex) appendUf2Log(`family id ${plan.artifact.familyIdHex}`);
      for (const warning of plan.warnings) appendUf2Log(`warning: ${warning}`);
    } catch (error) {
      uf2Bytes = null;
      uf2Plan = null;
      phase = "artifact";
      uf2Error = error instanceof Error ? error.message : "Could not read UF2 artifact.";
      appendUf2Log(`UF2 rejected: ${uf2Error}`);
    } finally {
      input.value = "";
    }
  }

  async function buildFirmwareInBrowser() {
    if (!result || browserBuilding) return;
    if (!result.buildReady) {
      browserBuildError = `Browser build blocked: generated source is not build-ready (${diagnosticSummary(errorDiagnostics)}).`;
      appendUf2Log(browserBuildError);
      return;
    }

    const manifest = experimentalBrowserBuildManifest(profile);
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
      outputFileName: `${bundleSlug(profile)}-${result.sourceHash}.uf2`,
      requestId: `flash-${result.sourceHash}`,
    };

    try {
      const build = await new WasmFirmwareBuilder().build(request);
      browserBuildResult = build;
      for (const line of build.log) appendUf2Log(`${line.phase}: ${line.message}`);
      if (!build.ok) {
        browserBuildError = build.error.message;
        phase = "artifact";
        appendUf2Log(`browser build failed: ${build.error.message}`);
        return;
      }

      const bytes = build.artifact.bytes;
      const plan = createUf2FlashPlan({
        boardName: profile.name,
        expectedFamilyId: manifest.output.uf2FamilyId,
        expectedVolumeHints: volumeHintsFor(profile),
        fileName: build.artifact.fileName,
        uf2Bytes: bytes,
      });
      uf2Bytes = bytes;
      uf2Plan = plan;
      uf2Error = null;
      flashProgress = null;
      flashResult = null;
      verifyResult = null;
      manualCopied = false;
      phase = "enter_bootloader";
      appendUf2Log(
        `browser build produced ${plan.artifact.fileName} (${formatBytes(plan.artifact.size)}, ${plan.artifact.blockCount} UF2 blocks)`,
      );
    } catch (error) {
      browserBuildError = error instanceof Error ? error.message : "Browser firmware build failed.";
      phase = "artifact";
      appendUf2Log(`browser build failed: ${browserBuildError}`);
    } finally {
      browserBuilding = false;
    }
  }

  async function enterBootloaderVia() {
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
    try {
      await sendReport(0, encodeViaCommandReport("bootloaderJump"));
      appendUf2Log("sent VIA bootloader jump command");
    } catch (error) {
      appendUf2Log(
        `bootloader jump failed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    } finally {
      jumping = false;
    }
  }

  async function chooseBootloaderVolume() {
    if (!uf2Bytes || !uf2Plan || flashing) return;
    fsSupport = currentFileSystemSupport();
    if (!fsSupport.supported) {
      appendUf2Log(fsSupport.reason ?? "File System Access copy is unavailable");
      downloadUf2();
      return;
    }

    const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
    if (!picker) return;

    flashing = true;
    phase = "flash";
    flashResult = null;
    verifyResult = null;
    appendUf2Log("opening bootloader volume picker");

    try {
      const handle = (await picker({ mode: "readwrite" })) as Uf2FileSystemAccessTarget;
      // Real device copy/reboot timing is hardware-unverified; tests cover injected mock handles.
      const written = await flashUf2ViaFileSystemAccess(handle, uf2Bytes, {
        fileName: uf2Plan.artifact.fileName,
        onProgress: (progress) => {
          flashProgress = progress;
        },
      });
      flashResult = written;
      for (const line of written.log) appendUf2Log(line);
      phase = "verify";
    } catch (error) {
      appendUf2Log(
        `UF2 copy failed: ${error instanceof Error ? error.message : "permission or write failed"}`,
      );
    } finally {
      flashing = false;
    }
  }

  function downloadUf2() {
    if (!uf2Bytes || !uf2Plan) return;

    const fallback = createUf2DownloadFallback(uf2Bytes, uf2Plan.artifact.fileName);
    downloadBlob(fallback.blob, fallback.fileName);
    manualCopied = false;
    phase = "flash";
    appendUf2Log(`downloaded ${fallback.fileName} for manual copy`);
  }

  function markManualCopied() {
    if (!uf2Plan) return;
    manualCopied = true;
    phase = "verify";
    appendUf2Log("manual UF2 copy marked complete");
  }

  async function verifyReconnect() {
    if (!uf2Plan || verifying) return;

    verifying = true;
    phase = "verify";
    verifyResult = null;
    appendUf2Log("starting Connect flow verification");

    try {
      const verified = await verifyUf2Reconnect(
        async () => {
          const result = await connectViaAndActivate({
            baseProfile: profile,
            connectOptions: { matrixHint: profile.matrix },
            shell,
            transport: createWebHidViaTransport(currentFilters(profile)),
            workbench,
          });
          if (!result.connection) throw new Error("Connect flow did not return a connection.");
          return result.connection;
        },
        {
          productId: profile.productId,
          protocol: profile.protocol === "via-v3" ? "via-v3" : undefined,
          vendorId: profile.vendorId,
        },
      );
      verifyResult = verified;
      for (const line of verified.log) appendUf2Log(line);
      for (const warning of verified.warnings) appendUf2Log(`warning: ${warning}`);
      phase = verified.ok ? "done" : "verify";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Reconnect verification failed.";
      verifyResult = {
        log: [message],
        message,
        ok: false,
        warnings: [],
      };
      appendUf2Log(`verification failed: ${message}`);
    } finally {
      verifying = false;
    }
  }

  function downloadSourceBundle() {
    if (!result) return;

    const entries: Record<string, Uint8Array> = {};
    for (const file of result.artifacts) entries[file.path] = strToU8(file.content);
    entries["COMMANDS.txt"] = strToU8(`${commandLog}\n`);
    entries["kbgui-diagnostics.json"] = strToU8(
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
      `${bundleSlug(profile)}-${result.sourceHash}.zip`,
    );
  }

  function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.append(anchor);
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
    return defaultUf2VolumeHints(activeProfile.name);
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
      .replace(/(^-|-$)/g, "") || "kbgui-firmware-source";
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

    return [
      `$ kbgui firmware-source generate --target ${artifacts.target}`,
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
      ...flashLines,
      "",
      "notes:",
      artifacts.buildReady
        ? "  Generated source has no build-blocking diagnostics."
        : "  Generated source is not build-ready; replace required metadata markers before compiling or flashing firmware from it.",
      "  UF2 guided flash is mock-tested and real-device hardware-unverified.",
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
          <h2 id="flash-overlay-title" class={modalTitleClass}>Flash to {profileDisplayName(profile)}</h2>
          <p class={modalSubtitleClass}>{targetLabel} source export · UF2 guided flash</p>
        </div>
        <button type="button" class={modalCloseClass} aria-label="Close" onclick={close}>
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
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
              <small class={diagnosticTitleSmallClass}>These source sections compile to fallbacks, TODOs, or board-specific review points.</small>
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
            {#each (uf2Plan?.targetBootloader.expectedVolumeHints ?? volumeHintsFor(profile)) as hint (hint)}
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
              <strong class={panelTitleClass}>{fsSupport.supported ? "Browser copy available" : "Manual copy fallback"}</strong>
              <small class={panelSmallClass}>{fsSupport.supported ? "Choose the mounted bootloader volume and kbgui will copy the UF2 file." : fsSupport.reason}</small>
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
            <Button variant="coral" size="sm" disabled={flashing} onclick={chooseBootloaderVolume}>
              <span class="material-symbols-outlined" aria-hidden="true">drive_folder_upload</span>
              {flashing ? "Copying..." : fsSupport.supported ? "Choose UF2 volume" : "Download UF2"}
            </Button>
            <Button variant="ghost" size="sm" onclick={downloadUf2}>
              <span class="material-symbols-outlined" aria-hidden="true">download</span>
              Download UF2
            </Button>
            <Button variant="ghost" size="sm" onclick={markManualCopied}>
              <span class="material-symbols-outlined" aria-hidden="true">{manualCopied ? "check" : "task_alt"}</span>
              Copied manually
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
        Real device flashing is hardware-unverified in this wave. VIA firmware may keep using existing EEPROM keymaps after a default keymap flash; a reset VIA EEPROM flow is still future work.
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
