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
  } from "$lib/keyboard/firmware-source";
  import type { DeviceProfile } from "$lib/keyboard/schema";
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
  let fsSupport = $state<Uf2FlashSupport>(
    detectUf2FileSystemAccessSupport({ isBrowser: false }),
  );

  const commandLog = $derived(
    result ? commandLogFor(result, profile, changes, uf2Plan, uf2Log, fsSupport, flashResult) : "",
  );
  const diagnosticPreview = $derived(result?.diagnostics.slice(0, 4) ?? []);
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

    result = generateFirmwareArtifacts(profile);
    resetUf2State();
    copied = false;
    copyError = null;
    fsSupport = currentFileSystemSupport();
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
          diagnostics: result.diagnostics,
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
    rebuildChanges: readonly LiveSyncChangeNotice[],
    plan: Uf2FlashPlan | null,
    log: readonly string[],
    support: Uf2FlashSupport,
    written: Uf2FileSystemFlashResult | null,
  ) {
    const changeLines =
      rebuildChanges.length > 0
        ? rebuildChanges.map((change) => `  - ${change.path} (${change.reason})`)
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

    return [
      `$ kbgui firmware-source generate --target ${artifacts.target}`,
      `profile: ${activeProfile.name}`,
      `source-hash: ${artifacts.sourceHash}`,
      "",
      "rebuild-required changes:",
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
      ...flashLines,
      "",
      "notes:",
      "  UF2 guided flash is mock-tested and real-device hardware-unverified.",
      "  VIA EEPROM may override flashed default keymaps until a future reset flow exists.",
    ].join("\n");
  }

  function diagnosticClass(item: FirmwareDiagnostic) {
    if (item.severity === "error") return "error";
    if (item.severity === "warning") return "warning";
    return "info";
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
  <div class="flash-overlay" data-testid="flash-overlay">
    <button type="button" class="flash-scrim" aria-label="Close firmware flash overlay" onclick={close}></button>

    <div class="flash-modal" role="dialog" aria-modal="true" aria-labelledby="flash-overlay-title">
      <header class="modal-head">
        <span class="material-symbols-outlined modal-bolt" aria-hidden="true">bolt</span>
        <div>
          <h2 id="flash-overlay-title">Flash to {profile.name}</h2>
          <p>{targetLabel} source export · UF2 guided flash</p>
        </div>
        <button type="button" class="modal-close" aria-label="Close" onclick={close}>
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </header>

      <div class="flash-steps" aria-label="Firmware flash steps">
        {#each flashSteps as step (step.key)}
          <div class={`flash-step ${step.status}`}>
            <span class="material-symbols-outlined" aria-hidden="true">
              {step.status === "done" ? "check_circle" : step.status === "active" ? "progress_activity" : "radio_button_unchecked"}
            </span>
            <span>{step.label}</span>
          </div>
        {/each}
      </div>

      <div class="source-facts" aria-label="Generated source and UF2 summary">
        <div>
          <span>Target</span>
          <strong>{targetLabel}</strong>
        </div>
        <div>
          <span>Source files</span>
          <strong>{result.artifacts.length}</strong>
        </div>
        <div>
          <span>Source hash</span>
          <strong>{result.sourceHash}</strong>
        </div>
        <div>
          <span>UF2</span>
          <strong>{uf2Plan ? formatBytes(uf2Plan.artifact.size) : "not selected"}</strong>
        </div>
      </div>

      <section class="flash-panels" aria-label="UF2 guided flash controls">
        <div class="flash-panel">
          <div class="panel-head">
            <span class="material-symbols-outlined" aria-hidden="true">draft</span>
            <div>
              <strong>Firmware artifact</strong>
              <small>{uf2Plan ? uf2Plan.artifact.fileName : "Select a compiled .uf2 from a local build"}</small>
            </div>
          </div>

          {#if uf2Plan}
            <dl class="artifact-meta">
              <div><dt>Family</dt><dd>{uf2Plan.artifact.familyIdHex ?? "not declared"}</dd></div>
              <div><dt>Range</dt><dd>{formatRange(uf2Plan.artifact.targetAddressRange)}</dd></div>
              <div><dt>Hash</dt><dd>{uf2Plan.artifact.hash}</dd></div>
            </dl>
          {:else}
            <p class="panel-copy">
              Build externally for now, then bring the UF2 back here. The source bundle path remains available without a board.
            </p>
          {/if}

          {#if uf2Error}
            <p class="copy-error" role="status">{uf2Error}</p>
          {/if}

          <div class="button-row">
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
            class="hidden-file-input"
            type="file"
            accept=".uf2,application/octet-stream,application/x-uf2"
            onchange={loadUf2File}
          />
        </div>

        <div class="flash-panel">
          <div class="panel-head">
            <span class="material-symbols-outlined" aria-hidden="true">usb</span>
            <div>
              <strong>Bootloader volume</strong>
              <small>{uf2Plan ? uf2Plan.targetBootloader.name : "UF2 mass-storage target"}</small>
            </div>
          </div>

          {#if viaJumpAvailable}
            <p class="panel-copy">
              A VIA keyboard is connected. You can request bootloader mode, then choose the mounted UF2 volume.
            </p>
            <Button variant="coral" size="sm" disabled={!uf2Plan || jumping} onclick={enterBootloaderVia}>
              <span class="material-symbols-outlined" aria-hidden="true">restart_alt</span>
              {jumping ? "Sending..." : "Enter bootloader"}
            </Button>
          {:else}
            <p class="panel-copy">
              Put the board into bootloader mode manually, then wait for the UF2 drive to mount.
            </p>
            <ol class="manual-steps">
              <li>Unplug if needed.</li>
              <li>Hold BOOT/RESET, BOOTSEL, or double-tap reset for this board.</li>
              <li>Look for a volume like {uf2Plan?.targetBootloader.expectedVolumeHints[0] ?? "RPI-RP2"}.</li>
            </ol>
          {/if}

          <div class="volume-hints" aria-label="Expected UF2 volume names">
            {#each (uf2Plan?.targetBootloader.expectedVolumeHints ?? volumeHintsFor(profile)) as hint (hint)}
              <code>{hint}</code>
            {/each}
          </div>
        </div>
      </section>

      {#if uf2Plan}
        <section class="copy-panel" aria-label="UF2 copy and verify">
          <div class="support-row" data-supported={fsSupport.supported}>
            <span class="material-symbols-outlined" aria-hidden="true">{fsSupport.supported ? "folder_managed" : "download"}</span>
            <div>
              <strong>{fsSupport.supported ? "Browser copy available" : "Manual copy fallback"}</strong>
              <small>{fsSupport.supported ? "Choose the mounted bootloader volume and kbgui will copy the UF2 file." : fsSupport.reason}</small>
            </div>
          </div>

          {#if flashProgress}
            <div class="progress-block" aria-label="UF2 copy progress">
              <div class="progress-label">
                <span>{flashProgress.phase}</span>
                <strong>{progressPercent(flashProgress)}%</strong>
              </div>
              <div class="progress-track">
                <span style={`width: ${progressPercent(flashProgress)}%`}></span>
              </div>
            </div>
          {/if}

          {#if verifyResult}
            <p class:verify-ok={verifyResult.ok} class:verify-error={!verifyResult.ok} class="verify-message">
              {verifyResult.message}
            </p>
          {/if}

          <div class="button-row copy-actions">
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

      {#if result.diagnostics.length > 0}
        <div class="diagnostics" aria-label="Source generation diagnostics">
          {#each diagnosticPreview as item (`${item.code}:${item.path ?? item.file ?? ""}`)}
            <div class:warning={diagnosticClass(item) === "warning"} class:error={diagnosticClass(item) === "error"}>
              <span>{item.severity}</span>
              <strong>{item.message}</strong>
            </div>
          {/each}
          {#if result.diagnostics.length > diagnosticPreview.length}
            <small>{result.diagnostics.length - diagnosticPreview.length} more in the downloaded diagnostics file</small>
          {/if}
        </div>
      {/if}

      <pre class="command-log">{commandLog}</pre>

      <p class="hardware-note">
        Real device flashing is hardware-unverified in this wave. VIA firmware may keep using existing EEPROM keymaps after a default keymap flash; a reset VIA EEPROM flow is still future work.
      </p>

      {#if copyError}
        <p class="copy-error" role="status">{copyError}</p>
      {/if}

      <footer class="modal-actions">
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

<style>
  .flash-overlay {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    padding: 20px;
  }

  .flash-scrim {
    position: absolute;
    inset: 0;
    background: rgba(27, 25, 23, 0.46);
    backdrop-filter: blur(5px);
  }

  .flash-modal {
    position: relative;
    display: grid;
    width: min(720px, calc(100vw - 28px));
    max-height: min(860px, calc(100vh - 28px));
    gap: 14px;
    overflow: auto;
    padding: 22px;
    border: 1px solid color-mix(in oklch, var(--surface) 42%, var(--line-2));
    border-radius: 20px;
    background: var(--surface);
    box-shadow: var(--shadow-modal);
  }

  .modal-head {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) 30px;
    gap: 10px;
    align-items: start;
  }

  .modal-bolt {
    color: var(--coral);
    font-size: 22px;
  }

  .modal-head h2,
  .modal-head p {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .modal-head h2 {
    font-size: 15px;
    line-height: 1.25;
  }

  .modal-head p {
    margin-top: 3px;
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 11px;
  }

  .modal-close {
    display: grid;
    width: 30px;
    height: 30px;
    place-items: center;
    border-radius: 8px;
    color: var(--ink-3);
  }

  .modal-close:hover {
    color: var(--ink);
    background: var(--paper-2);
  }

  .flash-steps {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px 10px;
  }

  .flash-step {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 8px;
    color: var(--ink-3);
    font-size: 12px;
  }

  .flash-step span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .flash-step .material-symbols-outlined {
    flex: none;
    font-size: 19px;
  }

  .flash-step.done .material-symbols-outlined {
    color: var(--added);
  }

  .flash-step.active {
    color: var(--ink);
  }

  .flash-step.active .material-symbols-outlined {
    color: var(--coral);
  }

  .source-facts {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .source-facts div {
    display: grid;
    gap: 3px;
    min-width: 0;
    padding: 9px 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--paper-2);
  }

  .source-facts span,
  .artifact-meta dt,
  .progress-label span {
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .source-facts strong {
    min-width: 0;
    overflow: hidden;
    font-family: var(--mono);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .flash-panels {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .flash-panel,
  .copy-panel {
    display: grid;
    gap: 10px;
    min-width: 0;
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: color-mix(in oklch, var(--paper-2) 62%, transparent);
  }

  .panel-head,
  .support-row {
    display: grid;
    grid-template-columns: 26px minmax(0, 1fr);
    gap: 9px;
    align-items: start;
    min-width: 0;
  }

  .panel-head > .material-symbols-outlined,
  .support-row > .material-symbols-outlined {
    display: grid;
    width: 26px;
    height: 26px;
    place-items: center;
    border: 1px solid var(--line-2);
    border-radius: 8px;
    color: var(--coral-ink);
    background: var(--surface);
    font-size: 17px;
  }

  .panel-head strong,
  .panel-head small,
  .support-row strong,
  .support-row small {
    display: block;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .panel-head strong,
  .support-row strong {
    font-family: var(--mono);
    font-size: 12px;
  }

  .panel-head small,
  .support-row small {
    margin-top: 2px;
    color: var(--ink-3);
    font-size: 11px;
  }

  .panel-copy {
    margin: 0;
    color: var(--ink-2);
    font-size: 12px;
    line-height: 1.45;
  }

  .artifact-meta {
    display: grid;
    gap: 5px;
    margin: 0;
  }

  .artifact-meta div {
    display: grid;
    grid-template-columns: 58px minmax(0, 1fr);
    gap: 8px;
    align-items: center;
    min-width: 0;
  }

  .artifact-meta dd {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    font-family: var(--mono);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .manual-steps {
    display: grid;
    gap: 3px;
    margin: 0;
    padding-left: 18px;
    color: var(--ink-2);
    font-size: 12px;
    line-height: 1.35;
  }

  .volume-hints,
  .button-row {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  .volume-hints code {
    min-height: 22px;
    padding: 4px 7px;
    border: 1px solid var(--line);
    border-radius: 6px;
    color: var(--ink-2);
    background: var(--surface);
    font-family: var(--mono);
    font-size: 10px;
  }

  .copy-panel {
    gap: 11px;
  }

  .support-row[data-supported="true"] > .material-symbols-outlined {
    color: oklch(0.35 0.12 150);
    border-color: oklch(0.62 0.16 150 / 0.28);
  }

  .progress-block {
    display: grid;
    gap: 6px;
  }

  .progress-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-family: var(--mono);
    font-size: 11px;
  }

  .progress-track {
    height: 8px;
    overflow: hidden;
    border-radius: 999px;
    background: var(--line);
  }

  .progress-track span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--coral);
    transition: width 160ms ease;
  }

  .verify-message {
    margin: 0;
    padding: 8px 10px;
    border-radius: 8px;
    font-family: var(--mono);
    font-size: 11px;
    line-height: 1.35;
  }

  .verify-ok {
    color: oklch(0.35 0.12 150);
    background: oklch(0.94 0.05 150);
  }

  .verify-error {
    color: oklch(0.42 0.15 25);
    background: oklch(0.95 0.04 25);
  }

  .diagnostics {
    display: grid;
    gap: 6px;
  }

  .diagnostics div {
    display: grid;
    grid-template-columns: 54px minmax(0, 1fr);
    gap: 8px;
    align-items: start;
    padding: 8px 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: color-mix(in oklch, var(--paper-2) 72%, transparent);
  }

  .diagnostics div.warning {
    border-color: color-mix(in oklch, var(--mustard) 44%, var(--line-2));
    background: color-mix(in oklch, var(--mustard) 14%, var(--surface));
  }

  .diagnostics div.error {
    border-color: oklch(0.62 0.2 25 / 0.32);
    background: oklch(0.95 0.04 25);
  }

  .diagnostics span {
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .diagnostics strong {
    min-width: 0;
    color: var(--ink-2);
    font-size: 11px;
    line-height: 1.35;
  }

  .diagnostics small {
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 10px;
  }

  .command-log {
    min-height: 170px;
    max-height: 220px;
    margin: 0;
    overflow: auto;
    padding: 14px 16px;
    border-radius: 10px;
    color: var(--paper);
    background: var(--ink);
    font-family: var(--mono);
    font-size: 11px;
    line-height: 1.65;
    white-space: pre-wrap;
  }

  .hardware-note,
  .copy-error {
    margin: -4px 0 0;
    font-size: 11px;
    line-height: 1.4;
  }

  .hardware-note {
    color: var(--ink-3);
  }

  .copy-error {
    color: oklch(0.42 0.15 25);
  }

  .modal-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
  }

  .hidden-file-input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
  }

  @media (max-width: 720px) {
    .flash-overlay {
      align-items: end;
      padding: 10px;
    }

    .flash-modal {
      width: 100%;
      max-height: calc(100vh - 20px);
      padding: 16px;
      border-radius: 16px;
    }

    .flash-steps,
    .source-facts,
    .flash-panels {
      grid-template-columns: minmax(0, 1fr);
    }

    .modal-actions,
    .copy-actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
