<script lang="ts">
  import {
    AlertTriangle,
    ChevronLeft,
    ChevronRight,
    Flag,
    GitFork,
    Heart,
    Layers,
    ShieldCheck,
    X,
  } from "@lucide/svelte";

  import KeyboardBoard from "$lib/components/board/KeyboardBoard.svelte";
  import { Button } from "$lib/components/ui";
  import type { CommunityKeymapDetail } from "$lib/community/types";
  import { decodeDeviceProfileFromStorageOrNull } from "$lib/keyboard/schema";
  import { cn } from "$lib/utils.js";

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

  const modalBackdropClass =
    "modal-backdrop fixed inset-0 z-30 grid place-items-center bg-[rgba(20,18,16,0.5)] p-kb-22 backdrop-blur-[10px] max-[620px]:p-kb-10";
  const previewModalClass =
    "preview-modal grid max-h-[min(780px,calc(100vh-44px))] min-h-[min(680px,calc(100vh-44px))] w-[min(1120px,calc(100vw-44px))] grid-rows-[auto_minmax(0,1fr)] overflow-hidden rounded-lg border border-line-2 bg-surface shadow-modal max-[900px]:min-h-0 max-[620px]:max-h-[calc(100vh-20px)] max-[620px]:w-[calc(100vw-20px)]";
  const modalHeaderClass =
    "modal-header grid min-w-0 grid-cols-[minmax(0,1fr)_34px] items-center gap-kb-14 border-b border-line px-kb-18 py-kb-16 max-[620px]:p-kb-12";
  const modalTitleClass = "modal-title grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-kb-12";
  const authorAvatarClass =
    "author-avatar grid size-kb-40 place-items-center rounded-lg border border-coral bg-coral font-mono text-kb-12 font-bold text-coral-ink";
  const modalHeadingClass =
    "m-0 overflow-hidden text-ellipsis whitespace-nowrap text-[20px] leading-[1.15] max-[620px]:text-[16px]";
  const modalBylineClass =
    "m-0 mt-kb-4 flex min-w-0 items-center gap-kb-4 overflow-hidden whitespace-nowrap font-mono text-[11px] text-ink-3";
  const modalOfficialMarkClass = "inline-grid shrink-0 place-items-center text-ink-3";
  const closeButtonClass =
    "close-button size-kb-34 border-line bg-surface text-ink-2 hover:border-line-2 hover:bg-surface-2 hover:text-ink";
  const modalContentClass =
    "modal-content grid min-h-0 grid-cols-[minmax(0,1fr)_300px] max-[900px]:grid-cols-[minmax(0,1fr)] max-[900px]:overflow-auto";
  const boardPanelClass =
    "board-panel relative flex min-h-0 min-w-0 border-r border-line max-[900px]:min-h-[380px] max-[900px]:border-r-0 max-[900px]:border-b";
  const previewBoardClass =
    "community-preview-board [&_.keyboard-board-viewport]:min-h-0 [&_.keyboard-board-viewport]:p-kb-24";
  const layerSwitcherClass =
    "preview-layer-switcher absolute top-kb-12 left-1/2 z-20 inline-grid -translate-x-1/2 grid-cols-[30px_minmax(112px,auto)_30px] items-center overflow-hidden rounded-pill border border-line-2 bg-[color-mix(in_oklch,var(--card-surface)_90%,transparent)] shadow-card backdrop-blur-[8px]";
  const layerCycleButtonClass =
    "layer-cycle-button size-kb-30 rounded-none border-0 bg-transparent p-0 text-ink-2 shadow-none transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-30";
  const activeLayerClass =
    "active-preview-layer inline-flex h-kb-30 min-w-0 items-center justify-center gap-kb-7 border-x border-line px-kb-10 font-mono text-[10px] text-ink";
  const detailPanelClass =
    "detail-panel flex min-h-0 min-w-0 flex-col gap-kb-14 overflow-auto p-kb-16 max-[900px]:overflow-visible";
  const wrapRowClass = "flex flex-wrap gap-kb-6";
  const noteClass = "note m-0 text-[13px] leading-[1.5] text-ink-2";
  const tagPillClass =
    "inline-flex min-h-kb-24 items-center rounded-pill border border-line bg-paper-2 px-kb-8 py-0 font-mono text-[10px] text-ink-2";
  const signalGridClass = "signal-grid m-0 grid grid-cols-1 gap-kb-8";
  const signalBlockClass =
    "grid min-h-[42px] grid-cols-[minmax(0,1fr)_auto] items-center gap-kb-10 rounded-[8px] border border-line bg-paper-2 px-kb-10 py-kb-9";
  const signalTermClass = "inline-flex items-center gap-kb-7 font-mono text-[11px] text-ink-2";
  const signalValueClass = "m-0 font-mono text-[13px] font-bold";
  const actionFeedbackClass = "action-feedback m-0 rounded-lg px-kb-10 py-kb-8 text-kb-12 leading-[1.35]";
  const actionFeedbackErrorClass =
    "error border border-[var(--danger-border)] bg-danger-surface text-danger-ink";
  const actionFeedbackSuccessClass =
    "success border border-[color-mix(in_oklch,var(--mint)_46%,var(--line-2))] bg-[color-mix(in_oklch,var(--mint)_15%,var(--surface))] text-[oklch(0.35_0.12_150)]";
  const actionStackClass = "action-stack mt-auto grid gap-kb-8 pt-kb-8";
  const actionButtonClass = "w-full justify-center";
  const likedActionClass =
    "liked border-[color-mix(in_oklch,var(--coral)_56%,var(--line-2))] bg-[color-mix(in_oklch,var(--coral)_82%,var(--surface))] text-[#1c0a04]";
  const modalStateClass =
    "flex min-h-[340px] items-center justify-center gap-kb-8 p-kb-24 font-mono text-[12px] text-ink-3";

  let boardZoom = $state(0.78);
  let boardPan = $state({ x: 0, y: 0 });
  let previewLayerIndex = $state(0);
  let previewProfileId = $state<string | null>(null);

  const profile = $derived(detail ? decodeDeviceProfileFromStorageOrNull(detail.profile) : null);
  const authorLabel = $derived(
    detail?.author.handle ? `@${detail.author.handle}` : (detail?.author.displayName ?? ""),
  );
  const isOfficial = $derived(detail?.source === "official");
  const previewLayers = $derived(profile?.layers ?? []);
  const previewLayer = $derived(previewLayers[previewLayerIndex] ?? previewLayers[0] ?? null);

  $effect(() => {
    const nextProfileId = profile?.id ?? null;
    if (nextProfileId === previewProfileId) return;
    previewProfileId = nextProfileId;
    previewLayerIndex = 0;
  });

  function cyclePreviewLayer(direction: -1 | 1) {
    if (previewLayers.length < 2) return;
    previewLayerIndex =
      (previewLayerIndex + direction + previewLayers.length) % previewLayers.length;
  }

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

<div class={modalBackdropClass} role="presentation" onclick={onclose}>
  <div
    class={previewModalClass}
    role="dialog"
    aria-modal="true"
    aria-label={detail ? `Preview ${detail.title}` : "Preview community keymap"}
    tabindex="-1"
    onclick={(event) => event.stopPropagation()}
    onkeydown={(event) => event.stopPropagation()}
  >
    <header class={modalHeaderClass}>
      <div class={modalTitleClass}>
        {#if detail}
          <span class={authorAvatarClass} aria-hidden="true">
            {detail.author.displayName.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <h2 class={modalHeadingClass}>{detail.title}</h2>
            <p class={modalBylineClass}>
              <span class="text-ink-2">{authorLabel}</span>
              {#if isOfficial}
                <span
                  class={modalOfficialMarkClass}
                  aria-label="Official first-party layout"
                  title="Official first-party layout"
                >
                  <ShieldCheck size={12} aria-hidden="true" />
                </span>
              {/if}
              <span class="overflow-hidden text-ellipsis">· {detail.boardName} · updated {formatDate(detail.updatedAt)}</span>
            </p>
          </div>
        {:else}
          <div>
            <h2 class={modalHeadingClass}>{loading ? "Loading preview" : "Preview unavailable"}</h2>
            <p class={modalBylineClass}>{error ?? "Community keymap detail could not be loaded."}</p>
          </div>
        {/if}
      </div>

      <Button
        type="button"
        variant="outline"
        size="icon"
        class={closeButtonClass}
        aria-label="Close preview"
        onclick={onclose}
      >
        <X size={18} aria-hidden="true" />
      </Button>
    </header>

    {#if error}
      <div class={cn("modal-error", modalStateClass, "text-danger-ink")} role="status">
        <AlertTriangle size={16} aria-hidden="true" />
        {error}
      </div>
    {:else if loading || !detail || !profile}
      <div class={cn("modal-loading", modalStateClass)} role="status">
        <span class="material-symbols-outlined" aria-hidden="true">hourglass_empty</span>
        Loading keymap
      </div>
    {:else}
      <div class={modalContentClass}>
        <div class={boardPanelClass}>
          {#if previewLayer}
            <div
              class={layerSwitcherClass}
              role="group"
              aria-label="Preview layer"
              data-active-layer={previewLayer.id}
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class={layerCycleButtonClass}
                aria-label="Previous layer"
                title="Previous layer"
                disabled={previewLayers.length < 2}
                onclick={() => cyclePreviewLayer(-1)}
              >
                <ChevronLeft size={15} aria-hidden="true" />
              </Button>
              <span class={activeLayerClass} aria-live="polite">
                <i
                  class="size-kb-8 flex-none rounded-[3px]"
                  style={`background: ${previewLayer.color}`}
                  aria-hidden="true"
                ></i>
                <strong class="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-inherit">{previewLayer.name}</strong>
                <span class="flex-none text-ink-3">{previewLayerIndex + 1}/{previewLayers.length}</span>
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class={layerCycleButtonClass}
                aria-label="Next layer"
                title="Next layer"
                disabled={previewLayers.length < 2}
                onclick={() => cyclePreviewLayer(1)}
              >
                <ChevronRight size={15} aria-hidden="true" />
              </Button>
            </div>
          {/if}
          <KeyboardBoard
            {profile}
            activeLayer={previewLayer?.id}
            lens="keys"
            bind:zoom={boardZoom}
            bind:pan={boardPan}
            class={previewBoardClass}
          />
        </div>

        <aside class={detailPanelClass}>
          <p class={noteClass}>{detail.note}</p>

          <div class={cn("tag-row", wrapRowClass)}>
            {#each detail.tags as tag (tag)}
              <span class={tagPillClass}>#{tag}</span>
            {/each}
          </div>

          <dl class={signalGridClass}>
            <div class={signalBlockClass}>
              <dt class={signalTermClass}><Layers size={14} aria-hidden="true" />Layers</dt>
              <dd class={signalValueClass}>{detail.layersCount}</dd>
            </div>
            <div class={signalBlockClass}>
              <dt class={signalTermClass}><Heart size={14} aria-hidden="true" />Likes</dt>
              <dd class={signalValueClass}>{detail.likesCount.toLocaleString()}</dd>
            </div>
            <div class={signalBlockClass}>
              <dt class={signalTermClass}><GitFork size={14} aria-hidden="true" />Adoptions</dt>
              <dd class={signalValueClass}>{detail.adoptionsCount.toLocaleString()}</dd>
            </div>
          </dl>

          {#if actionError}
            <p class={cn(actionFeedbackClass, actionFeedbackErrorClass)} role="status">{actionError}</p>
          {:else if actionNotice}
            <p class={cn(actionFeedbackClass, actionFeedbackSuccessClass)} role="status">{actionNotice}</p>
          {/if}

          <div class={actionStackClass} aria-label="Community actions">
            <Button
              variant="coral"
              class={actionButtonClass}
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
              title={signedIn ? (detail.likedByViewer ? "Unlike this keymap" : "Like this keymap") : "Sign in to like this keymap"}
              aria-pressed={detail.likedByViewer}
              class={cn("like-action", actionButtonClass, detail.likedByViewer && likedActionClass)}
              onclick={() => (signedIn ? onlike?.(detail) : onsignin?.())}
            >
              <Heart size={15} aria-hidden="true" />
              {likeBusy ? "Saving" : detail.likedByViewer ? "Liked" : "Like"}
            </Button>
            <Button
              variant="ghost"
              class={actionButtonClass}
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
