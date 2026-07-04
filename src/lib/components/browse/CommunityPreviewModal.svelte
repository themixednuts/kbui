<script lang="ts">
  import {
    AlertTriangle,
    Flag,
    GitFork,
    Heart,
    Layers,
    ShieldCheck,
    X,
  } from "@lucide/svelte";

  import KeyboardBoard from "$lib/components/board/KeyboardBoard.svelte";
  import { Button, Chip } from "$lib/components/ui";
  import type { CommunityKeymapDetail } from "$lib/community/types";
  import { decodeDeviceProfileFromStorage } from "$lib/keyboard/schema";

  interface Props {
    detail: CommunityKeymapDetail | null;
    loading?: boolean;
    error?: string | null;
    signedIn?: boolean;
    actionError?: string | null;
    actionNotice?: string | null;
    likeBusy?: boolean;
    adoptBusy?: boolean;
    reportBusy?: boolean;
    onclose: () => void;
    onadopt?: (detail: CommunityKeymapDetail) => void;
    onlike?: (detail: CommunityKeymapDetail) => void;
    onreport?: (detail: CommunityKeymapDetail) => void;
    onsignin?: () => void;
  }

  let {
    detail,
    loading = false,
    error = null,
    signedIn = false,
    actionError = null,
    actionNotice = null,
    likeBusy = false,
    adoptBusy = false,
    reportBusy = false,
    onclose,
    onadopt,
    onlike,
    onreport,
    onsignin,
  }: Props = $props();

  let boardZoom = $state(0.78);
  let boardPan = $state({ x: 0, y: 0 });

  const profile = $derived(detail ? decodeDeviceProfileFromStorage(detail.profile) : null);
  const authorLabel = $derived(
    detail?.author.handle ? `@${detail.author.handle}` : (detail?.author.displayName ?? ""),
  );
  const isOfficial = $derived(detail?.source === "official");

  $effect(() => {
    if (!detail?.id) return;
    boardZoom = 0.78;
    boardPan = { x: 0, y: 0 };
  });

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    onclose();
  }

  function formatDate(value: string) {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(value));
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="modal-backdrop" role="presentation" onclick={onclose}>
  <div
    class="preview-modal"
    role="dialog"
    aria-modal="true"
    aria-label={detail ? `Preview ${detail.title}` : "Preview community keymap"}
    tabindex="-1"
    onclick={(event) => event.stopPropagation()}
    onkeydown={(event) => event.stopPropagation()}
  >
    <header class="modal-header">
      <div class="modal-title">
        {#if detail}
          <span class="author-avatar" aria-hidden="true">
            {detail.author.displayName.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <h2>{detail.title}</h2>
            <p>
              {authorLabel} · {detail.boardName} ·
              {#if isOfficial}
                Official curated layout
              {:else}
                updated {formatDate(detail.updatedAt)}
              {/if}
            </p>
          </div>
        {:else}
          <div>
            <h2>{loading ? "Loading preview" : "Preview unavailable"}</h2>
            <p>{error ?? "Community keymap detail could not be loaded."}</p>
          </div>
        {/if}
      </div>

      <button type="button" class="close-button" aria-label="Close preview" onclick={onclose}>
        <X size={18} aria-hidden="true" />
      </button>
    </header>

    {#if error}
      <div class="modal-error" role="status">
        <AlertTriangle size={16} aria-hidden="true" />
        {error}
      </div>
    {:else if loading || !detail || !profile}
      <div class="modal-loading" role="status">
        <span class="material-symbols-outlined" aria-hidden="true">hourglass_empty</span>
        Loading keymap
      </div>
    {:else}
      <div class="modal-content">
        <div class="board-panel">
          <KeyboardBoard
            {profile}
            lens="keys"
            bind:zoom={boardZoom}
            bind:pan={boardPan}
            class="community-preview-board"
          />
        </div>

        <aside class="detail-panel">
          <div class="badge-row">
            {#if isOfficial}
              <Chip tone="warning" title="First-party curated keymap">
                <ShieldCheck size={13} aria-hidden="true" />
                Official
              </Chip>
            {/if}
          </div>

          <p class="note">{detail.note}</p>

          <div class="tag-row">
            {#each detail.tags as tag (tag)}
              <span>#{tag}</span>
            {/each}
          </div>

          <dl class="signal-grid">
            <div>
              <dt><Layers size={14} aria-hidden="true" />Layers</dt>
              <dd>{detail.layersCount}</dd>
            </div>
            <div>
              <dt><Heart size={14} aria-hidden="true" />Likes</dt>
              <dd>{detail.likesCount.toLocaleString()}</dd>
            </div>
            <div>
              <dt><GitFork size={14} aria-hidden="true" />Adoptions</dt>
              <dd>{detail.adoptionsCount.toLocaleString()}</dd>
            </div>
          </dl>

          {#if actionError}
            <p class="action-feedback error" role="status">{actionError}</p>
          {:else if actionNotice}
            <p class="action-feedback success" role="status">{actionNotice}</p>
          {/if}

          <div class="action-stack" aria-label="Community actions">
            <Button
              variant="coral"
              disabled={adoptBusy}
              title={signedIn ? "Adopt as a local variant" : "Sign in to adopt this keymap"}
              onclick={() => (signedIn ? onadopt?.(detail) : onsignin?.())}
            >
              <GitFork size={15} aria-hidden="true" />
              {adoptBusy ? "Adopting" : "Adopt as variant"}
            </Button>
            <Button
              variant="ghost"
              disabled={likeBusy}
              title={signedIn ? "Toggle like" : "Sign in to like this keymap"}
              aria-pressed={detail.likedByViewer}
              class={`like-action ${detail.likedByViewer ? "liked" : ""}`}
              onclick={() => (signedIn ? onlike?.(detail) : onsignin?.())}
            >
              <Heart size={15} aria-hidden="true" />
              {likeBusy ? "Saving" : detail.likedByViewer ? "Liked" : "Like"}
            </Button>
            <Button
              variant="ghost"
              disabled={reportBusy}
              title={signedIn ? "Report this keymap" : "Sign in to report this keymap"}
              onclick={() => (signedIn ? onreport?.(detail) : onsignin?.())}
            >
              <Flag size={15} aria-hidden="true" />
              {reportBusy ? "Sending" : "Report"}
            </Button>
          </div>
        </aside>
      </div>
    {/if}
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: grid;
    place-items: center;
    padding: 22px;
    background: rgba(20, 18, 16, 0.5);
    backdrop-filter: blur(10px);
  }

  .preview-modal {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: min(1120px, calc(100vw - 44px));
    max-height: min(780px, calc(100vh - 44px));
    min-height: min(680px, calc(100vh - 44px));
    overflow: hidden;
    border: 1px solid var(--line-2);
    border-radius: 10px;
    background: var(--surface);
    box-shadow: var(--shadow-modal);
  }

  .modal-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 34px;
    gap: 14px;
    align-items: center;
    min-width: 0;
    padding: 16px 18px;
    border-bottom: 1px solid var(--line);
  }

  .modal-title {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    min-width: 0;
  }

  .author-avatar {
    display: grid;
    width: 40px;
    height: 40px;
    place-items: center;
    border: 1px solid color-mix(in oklch, var(--coral) 45%, var(--line-2));
    border-radius: 8px;
    color: #1c0a04;
    background: var(--coral);
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 700;
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    overflow: hidden;
    font-size: 20px;
    line-height: 1.15;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .modal-title p {
    margin-top: 4px;
    overflow: hidden;
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .close-button {
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink-2);
    background: var(--paper-2);
  }

  .close-button:hover {
    color: var(--ink);
    border-color: var(--line-2);
  }

  .modal-content {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 300px;
    min-height: 0;
  }

  .board-panel {
    display: flex;
    min-width: 0;
    min-height: 0;
    border-right: 1px solid var(--line);
  }

  :global(.community-preview-board .keyboard-board-viewport) {
    min-height: 0;
    padding: 24px;
  }

  .detail-panel {
    display: flex;
    min-width: 0;
    min-height: 0;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
    overflow: auto;
  }

  .badge-row,
  .tag-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .note {
    color: var(--ink-2);
    font-size: 13px;
    line-height: 1.5;
  }

  .tag-row span {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 0 8px;
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--ink-2);
    background: var(--paper-2);
    font-family: var(--mono);
    font-size: 10px;
  }

  .signal-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 8px;
    margin: 0;
  }

  .signal-grid div {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    min-height: 42px;
    padding: 9px 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--paper-2);
  }

  dt {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--ink-2);
    font-family: var(--mono);
    font-size: 11px;
  }

  dd {
    margin: 0;
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 700;
  }

  .action-stack {
    display: grid;
    gap: 8px;
    margin-top: auto;
    padding-top: 8px;
  }

  .action-stack :global(button) {
    width: 100%;
    justify-content: center;
  }

  .action-stack :global(.like-action.liked) {
    border-color: color-mix(in oklch, var(--coral) 56%, var(--line-2));
    color: #1c0a04;
    background: color-mix(in oklch, var(--coral) 82%, var(--surface));
  }

  .action-feedback {
    margin: 0;
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 12px;
    line-height: 1.35;
  }

  .action-feedback.error {
    border: 1px solid oklch(0.62 0.2 25 / 0.26);
    color: oklch(0.42 0.15 25);
    background: oklch(0.95 0.04 25);
  }

  .action-feedback.success {
    border: 1px solid color-mix(in oklch, var(--mint) 46%, var(--line-2));
    color: oklch(0.35 0.12 150);
    background: color-mix(in oklch, var(--mint) 15%, var(--surface));
  }

  .modal-loading,
  .modal-error {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 340px;
    padding: 24px;
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 12px;
  }

  .modal-error {
    color: oklch(0.42 0.15 25);
  }

  @media (max-width: 900px) {
    .preview-modal {
      min-height: 0;
    }

    .modal-content {
      grid-template-columns: minmax(0, 1fr);
      overflow: auto;
    }

    .board-panel {
      min-height: 380px;
      border-right: 0;
      border-bottom: 1px solid var(--line);
    }

    .detail-panel {
      overflow: visible;
    }
  }

  @media (max-width: 620px) {
    .modal-backdrop {
      padding: 10px;
    }

    .preview-modal {
      width: calc(100vw - 20px);
      max-height: calc(100vh - 20px);
    }

    .modal-header {
      padding: 12px;
    }

    h2 {
      font-size: 16px;
    }
  }
</style>
