<script lang="ts">
  import { strToU8, zipSync } from "fflate";

  import type { LiveSyncChangeNotice } from "$lib/app/via-live-sync.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import {
    generateFirmwareArtifacts,
    type FirmwareArtifacts,
    type FirmwareDiagnostic,
  } from "$lib/keyboard/firmware-source";
  import type { DeviceProfile } from "$lib/keyboard/schema";

  type Props = {
    changes?: readonly LiveSyncChangeNotice[];
    onclose?: () => void;
    open?: boolean;
    profile: DeviceProfile;
  };

  let { changes = [], onclose, open = $bindable(false), profile }: Props = $props();

  let result = $state<FirmwareArtifacts | null>(null);
  let copied = $state(false);
  let copyError = $state<string | null>(null);

  const commandLog = $derived(result ? commandLogFor(result, profile, changes) : "");
  const diagnosticPreview = $derived(result?.diagnostics.slice(0, 4) ?? []);
  const targetLabel = $derived(result?.target === "zmk" ? "ZMK" : "QMK");

  $effect(() => {
    if (!open) {
      result = null;
      copied = false;
      copyError = null;
      return;
    }

    result = generateFirmwareArtifacts(profile);
    copied = false;
    copyError = null;
  });

  function close() {
    open = false;
    onclose?.();
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
    const blob = new Blob([zipped], { type: "application/zip" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${bundleSlug(profile)}-${result.sourceHash}.zip`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
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
      "",
      "next waves: in-browser compilation and device flashing are not run by this export.",
    ].join("\n");
  }

  function diagnosticClass(item: FirmwareDiagnostic) {
    if (item.severity === "error") return "error";
    if (item.severity === "warning") return "warning";
    return "info";
  }
</script>

{#if open && result}
  <div class="flash-overlay" data-testid="flash-overlay">
    <button type="button" class="flash-scrim" aria-label="Close firmware source overlay" onclick={close}></button>

    <div class="flash-modal" role="dialog" aria-modal="true" aria-labelledby="flash-overlay-title">
      <header class="modal-head">
        <span class="material-symbols-outlined modal-bolt" aria-hidden="true">bolt</span>
        <div>
          <h2 id="flash-overlay-title">Build firmware source for {profile.name}</h2>
          <p>{targetLabel} source export · manual compile</p>
        </div>
        <button type="button" class="modal-close" aria-label="Close" onclick={close}>
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
        </button>
      </header>

      <div class="flash-steps" aria-label="Firmware source export steps">
        <div class="flash-step done">
          <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
          <span>Validate profile</span>
        </div>
        <div class="flash-step done">
          <span class="material-symbols-outlined" aria-hidden="true">check_circle</span>
          <span>Generate source</span>
        </div>
        <div class="flash-step active">
          <span class="material-symbols-outlined" aria-hidden="true">download_done</span>
          <span>Download bundle</span>
        </div>
      </div>

      <div class="source-facts" aria-label="Generated source summary">
        <div>
          <span>Target</span>
          <strong>{targetLabel}</strong>
        </div>
        <div>
          <span>Files</span>
          <strong>{result.artifacts.length}</strong>
        </div>
        <div>
          <span>Hash</span>
          <strong>{result.sourceHash}</strong>
        </div>
      </div>

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

      {#if copyError}
        <p class="copy-error" role="status">{copyError}</p>
      {/if}

      <footer class="modal-actions">
        <Button variant="ghost" onclick={copyLog}>
          <span class="material-symbols-outlined" aria-hidden="true">{copied ? "check" : "content_copy"}</span>
          {copied ? "Copied" : "Copy log"}
        </Button>
        <Button variant="coral" onclick={downloadSourceBundle}>
          <span class="material-symbols-outlined" aria-hidden="true">download</span>
          Download source zip
        </Button>
        <Button variant="ghost" onclick={close}>
          <span class="material-symbols-outlined" aria-hidden="true">close</span>
          Done
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
    width: min(540px, calc(100vw - 28px));
    max-height: min(760px, calc(100vh - 28px));
    gap: 14px;
    overflow: hidden;
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
    gap: 9px;
  }

  .flash-step {
    display: flex;
    align-items: center;
    gap: 9px;
    color: var(--ink-2);
    font-size: 13px;
  }

  .flash-step .material-symbols-outlined {
    font-size: 20px;
  }

  .flash-step.done .material-symbols-outlined {
    color: var(--added);
  }

  .flash-step.active .material-symbols-outlined {
    color: var(--coral);
  }

  .source-facts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
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

  .source-facts span {
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
    min-height: 180px;
    max-height: 230px;
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

  .copy-error {
    margin: -6px 0 0;
    color: oklch(0.42 0.15 25);
    font-size: 11px;
  }

  .modal-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
  }

  @media (max-width: 560px) {
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

    .source-facts {
      grid-template-columns: minmax(0, 1fr);
    }

    .modal-actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
