<script lang="ts">
  import { AlertCircle, CheckCircle2, Plug, RefreshCw, RotateCcw, UploadCloud } from "@lucide/svelte";
  import { readable, type Readable } from "svelte/store";

  import type { ExtensionUiState, ContentRunState, RunCapturePostResult } from "../kbgui/messages";
  import { sendBackgroundMessage } from "../kbgui/messages";
  import { DEFAULT_KBGUI_BASE_URL } from "../storage";

  export let runState: Readable<ContentRunState> = readable({ status: "idle" });

  let state: ExtensionUiState | null = null;
  let selectedKeyboardId = "";
  let selectedLayoutId = "";
  let pairCode = "";
  let baseUrl = DEFAULT_KBGUI_BASE_URL;
  let busy = false;
  let pairing = false;
  let error = "";
  let notice = "";
  let manualPost: RunCapturePostResult | null = null;

  $: keyboardCount = state?.choices.keyboards.length ?? 0;
  $: layoutCount = state?.choices.layouts.length ?? 0;
  $: readyToPost = Boolean(state?.selectedKeyboard && state?.selectedLayout);
  $: connectionLabel = state?.paired
    ? "Paired"
    : state?.sessionCanUse
      ? "Session"
      : "Needs pairing";
  $: visiblePost = manualPost ?? ($runState.status !== "idle" && $runState.status !== "capturing"
    ? $runState.post
    : null);

  void loadState();

  async function loadState() {
    busy = true;
    error = "";
    try {
      applyState(await sendBackgroundMessage<ExtensionUiState>({ type: "GET_STATE" }));
    } catch (caught) {
      error = messageFrom(caught);
    } finally {
      busy = false;
    }
  }

  async function refreshChoices() {
    busy = true;
    error = "";
    notice = "";
    try {
      applyState(await sendBackgroundMessage<ExtensionUiState>({ type: "REFRESH_CHOICES" }));
      notice = "Choices refreshed";
    } catch (caught) {
      error = messageFrom(caught);
    } finally {
      busy = false;
    }
  }

  async function saveBaseUrl() {
    busy = true;
    error = "";
    notice = "";
    try {
      applyState(await sendBackgroundMessage<ExtensionUiState>({ type: "SET_BASE_URL", baseUrl }));
      notice = "URL saved";
    } catch (caught) {
      error = messageFrom(caught);
    } finally {
      busy = false;
    }
  }

  async function pair() {
    if (!pairCode.trim()) return;
    pairing = true;
    error = "";
    notice = "";
    try {
      applyState(
        await sendBackgroundMessage<ExtensionUiState>({
          type: "PAIR_DEVICE",
          code: pairCode,
          baseUrl
        })
      );
      pairCode = "";
      notice = "Paired";
    } catch (caught) {
      error = messageFrom(caught);
    } finally {
      pairing = false;
    }
  }

  async function saveSelection() {
    if (!state) return;
    busy = true;
    error = "";
    notice = "";
    try {
      const response = await sendBackgroundMessage<{
        state: ExtensionUiState;
        post?: RunCapturePostResult;
      }>({
        type: "SAVE_SELECTION",
        keyboardId: selectedKeyboardId,
        layoutId: selectedLayoutId,
        repostLatest: $runState.status !== "idle"
      });
      applyState(response.state);
      manualPost = response.post ?? manualPost;
      notice = response.post ? postStatusLabel(response.post.status) : "Selection saved";
    } catch (caught) {
      error = messageFrom(caught);
    } finally {
      busy = false;
    }
  }

  async function retryQueue() {
    busy = true;
    error = "";
    notice = "";
    try {
      applyState(await sendBackgroundMessage<ExtensionUiState>({ type: "RETRY_QUEUE" }));
      notice = "Retry complete";
    } catch (caught) {
      error = messageFrom(caught);
    } finally {
      busy = false;
    }
  }

  function applyState(next: ExtensionUiState) {
    state = next;
    baseUrl = next.baseUrl;
    selectedKeyboardId = next.selectedKeyboard?.keyboardId ?? "";
    selectedLayoutId = next.selectedLayout?.layoutId ?? "";
  }

  function messageFrom(value: unknown): string {
    return value instanceof Error ? value.message : "Extension action failed.";
  }

  function modeText(post: RunCapturePostResult): string {
    const mode = [post.result.mode, post.result.mode2].filter(Boolean).join(" ");
    return mode || post.result.testTypeText || "run";
  }

  function postStatusLabel(status: RunCapturePostResult["status"]): string {
    switch (status) {
      case "posted":
        return "Posted";
      case "duplicate":
        return "Already posted";
      case "queued":
        return "Queued";
      case "needs-selection":
        return "Needs selection";
      case "unpaired":
        return "Pairing needed";
      case "error":
        return "Upload failed";
    }
  }
</script>

<section class="shell" aria-label="kbui Monkeytype tagger">
  <div class="bar">
    <div>
      <div class="eyebrow">kbui</div>
      <div class="title">Run tagger</div>
    </div>
    <div class:warn={!state?.paired && !state?.sessionCanUse} class="status">
      {#if state?.paired || state?.sessionCanUse}
        <CheckCircle2 size={14} strokeWidth={2.4} />
      {:else}
        <AlertCircle size={14} strokeWidth={2.4} />
      {/if}
      <span>{connectionLabel}</span>
    </div>
  </div>

  <div class="controls">
    <label>
      <span>Keyboard</span>
      <select
        bind:value={selectedKeyboardId}
        disabled={busy || keyboardCount === 0}
        onchange={saveSelection}
      >
        {#if keyboardCount === 0}
          <option value="">No keyboards</option>
        {:else}
          {#each state?.choices.keyboards ?? [] as keyboard}
            <option value={keyboard.keyboardId}>{keyboard.displayName}</option>
          {/each}
        {/if}
      </select>
    </label>

    <label>
      <span>Layout</span>
      <select
        bind:value={selectedLayoutId}
        disabled={busy || layoutCount === 0}
        onchange={saveSelection}
      >
        {#if layoutCount === 0}
          <option value="">No layouts</option>
        {:else}
          {#each state?.choices.layouts ?? [] as layout}
            <option value={layout.layoutId}>{layout.displayName}</option>
          {/each}
        {/if}
      </select>
    </label>
  </div>

  <div class="actions">
    <button type="button" class="iconButton" disabled={busy} onclick={refreshChoices} title="Refresh choices">
      <RefreshCw size={15} />
    </button>
    <button type="button" class="iconButton" disabled={busy || (state?.queueCount ?? 0) === 0} onclick={retryQueue} title="Retry queued runs">
      <RotateCcw size={15} />
    </button>
    <div class="queue" class:active={(state?.queueCount ?? 0) > 0}>
      <UploadCloud size={14} />
      <span>{state?.queueCount ?? 0}</span>
    </div>
  </div>

  {#if visiblePost}
    <div class:soft={visiblePost.status === "queued"} class:bad={visiblePost.status === "error" || visiblePost.status === "unpaired" || visiblePost.status === "needs-selection"} class="run">
      <div class="runTop">
        <strong>{postStatusLabel(visiblePost.status)}</strong>
        <span>{modeText(visiblePost)}</span>
      </div>
      <div class="metrics">
        <span>{visiblePost.result.wpm}<small>wpm</small></span>
        <span>{visiblePost.result.acc}<small>acc</small></span>
      </div>
      <div class="tagLine">
        {state?.selectedKeyboard?.displayName ?? "Keyboard"} · {state?.selectedLayout?.displayName ?? "Layout"}
      </div>
    </div>
  {:else if $runState.status === "capturing"}
    <div class="run soft">
      <div class="runTop">
        <strong>Captured</strong>
        <span>{modeText({ status: "posted", result: $runState.result, queueCount: 0 })}</span>
      </div>
      <div class="metrics">
        <span>{$runState.result.wpm}<small>wpm</small></span>
        <span>{$runState.result.acc}<small>acc</small></span>
      </div>
    </div>
  {/if}

  {#if !readyToPost || !state?.paired}
    <div class="pairing">
      <label>
        <span>kbui URL</span>
        <input bind:value={baseUrl} disabled={pairing || busy} onblur={saveBaseUrl} />
      </label>
      {#if !state?.paired}
        <div class="pairRow">
          <input
            bind:value={pairCode}
            disabled={pairing}
            placeholder="Pairing code"
            onkeydown={(event) => {
              if (event.key === "Enter") void pair();
            }}
          />
          <button type="button" disabled={pairing || !pairCode.trim()} onclick={pair}>
            <Plug size={14} />
            <span>Pair</span>
          </button>
        </div>
      {/if}
    </div>
  {/if}

  {#if error || notice}
    <div class:error={Boolean(error)} class="message">{error || notice}</div>
  {/if}
</section>

<style>
  :global(:host) {
    all: initial;
    color-scheme: dark;
    font-size: 14px;
  }

  .shell {
    --panel: #111318;
    --panel-2: #191d24;
    --text: #f0f4ef;
    --muted: #9ea8a1;
    --line: #2b3230;
    --accent: #b7f06a;
    --accent-2: #65d3ff;
    --danger: #ff8a7a;
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 2147483647;
    width: 286px;
    box-sizing: border-box;
    border: 1px solid color-mix(in srgb, var(--accent) 28%, var(--line));
    border-radius: 8px;
    background:
      linear-gradient(135deg, rgba(183, 240, 106, 0.13), transparent 38%),
      linear-gradient(180deg, var(--panel), #0d0f13);
    box-shadow: 0 18px 48px rgba(0, 0, 0, 0.38);
    color: var(--text);
    font-family:
      "Segoe UI",
      "Aptos",
      system-ui,
      sans-serif;
    font-size: 14px;
    line-height: 1.35;
    padding: 12px;
    letter-spacing: 0;
  }

  .bar,
  .actions,
  .runTop,
  .pairRow {
    display: flex;
    align-items: center;
  }

  .bar {
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
  }

  .eyebrow {
    color: var(--accent);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0;
    text-transform: uppercase;
  }

  .title {
    font-size: 17px;
    font-weight: 750;
  }

  .status,
  .queue {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border-radius: 999px;
    color: var(--accent);
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
  }

  .status.warn {
    color: var(--danger);
  }

  .controls {
    display: grid;
    gap: 8px;
  }

  label {
    display: grid;
    gap: 4px;
    color: var(--muted);
    font-size: 11px;
    font-weight: 750;
  }

  select,
  input {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--panel-2);
    color: var(--text);
    font: inherit;
    font-size: 13px;
    height: 34px;
    outline: none;
    padding: 0 9px;
  }

  select:focus,
  input:focus {
    border-color: var(--accent-2);
    box-shadow: 0 0 0 2px rgba(101, 211, 255, 0.16);
  }

  select:disabled,
  input:disabled,
  button:disabled {
    cursor: not-allowed;
    opacity: 0.56;
  }

  .actions {
    justify-content: space-between;
    margin-top: 10px;
  }

  button,
  .iconButton {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: #20262b;
    color: var(--text);
    cursor: pointer;
    font: inherit;
    font-size: 12px;
    font-weight: 750;
    height: 32px;
    padding: 0 10px;
  }

  .iconButton {
    width: 34px;
    padding: 0;
  }

  button:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--accent) 50%, var(--line));
  }

  .queue {
    background: #171d22;
    border: 1px solid var(--line);
    color: var(--muted);
    height: 30px;
    padding: 0 9px;
  }

  .queue.active {
    color: var(--accent-2);
  }

  .run {
    border: 1px solid rgba(183, 240, 106, 0.25);
    border-radius: 8px;
    background: rgba(183, 240, 106, 0.08);
    margin-top: 10px;
    padding: 9px;
  }

  .run.soft {
    border-color: rgba(101, 211, 255, 0.28);
    background: rgba(101, 211, 255, 0.08);
  }

  .run.bad {
    border-color: rgba(255, 138, 122, 0.32);
    background: rgba(255, 138, 122, 0.09);
  }

  .runTop {
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
  }

  .runTop span {
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .metrics {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 7px;
    margin-top: 8px;
  }

  .metrics span {
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.19);
    font-size: 18px;
    font-weight: 800;
    padding: 7px 8px;
  }

  small {
    color: var(--muted);
    font-size: 10px;
    font-weight: 750;
    margin-left: 4px;
  }

  .tagLine,
  .message {
    color: var(--muted);
    font-size: 11px;
    margin-top: 7px;
    overflow-wrap: anywhere;
  }

  .pairing {
    border-top: 1px solid var(--line);
    display: grid;
    gap: 8px;
    margin-top: 10px;
    padding-top: 10px;
  }

  .pairRow {
    gap: 7px;
  }

  .pairRow input {
    flex: 1;
  }

  .message.error {
    color: var(--danger);
  }
</style>
