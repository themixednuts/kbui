<script lang="ts">
  import { page } from "$app/state";
  import { Eye, EyeOff, Keyboard, Lightbulb, MousePointer2 } from "@lucide/svelte";

  import { getShellContext } from "$lib/app/shell-store.svelte";
  import { getViaLiveSyncContext } from "$lib/app/via-live-sync.svelte";
  import { getWorkbenchContext } from "$lib/app/workbench-store.svelte";
  import {
    type EditorLens,
    type EditorLightingDragMode,
  } from "$lib/app/editor-store.svelte";
  import { KeyboardBoard } from "$lib/components/board";
  import { createBoardViewModel, keyLightingToCss } from "$lib/components/board/board-view-model";
  import ActiveStackCard from "$lib/components/editor/ActiveStackCard.svelte";
  import EditorKeyInspector from "$lib/components/editor/EditorKeyInspector.svelte";
  import EditorLayerStack from "$lib/components/editor/EditorLayerStack.svelte";
  import EditorLightingInspector from "$lib/components/editor/EditorLightingInspector.svelte";
  import FlashOverlay from "$lib/components/flash/FlashOverlay.svelte";
  import KeyInspectorPanel from "$lib/components/keymap/KeyInspectorPanel.svelte";
  import { Button, Chip, SegmentedNav } from "$lib/components/ui";
  import type { SegmentItem } from "$lib/components/ui/types";
  import type { LiveSyncLocalOnlyReasonSummary } from "$lib/keyboard/live-sync-classification";
  import { swatchToKeyLighting } from "$lib/keyboard/lighting-swatches";
  import {
    sampleBoardIdFromParam,
    type SampleBoardId,
  } from "$lib/keyboard/sample-boards";
  import { cn } from "$lib/utils.js";

  const shell = getShellContext();
  const editor = getWorkbenchContext();
  const liveSync = getViaLiveSyncContext();

  const editorRouteClass =
    "editor-route flex min-h-[calc(100vh-58px)] overflow-hidden bg-[radial-gradient(ellipse_80%_55%_at_72%_0%,color-mix(in_oklch,var(--mustard)_9%,transparent),transparent_62%),var(--paper)] max-[980px]:min-h-[calc(100vh-68px)] [&_.keymap-pane-group]:min-h-0 [&_.keymap-pane-group]:min-w-0 [&_.keymap-pane-group]:flex-1 [&_.keymap-main-pane]:min-h-0 [&_.keymap-main-pane]:min-w-0 [&_.key-inspector-pane]:min-w-[300px] [&_.key-inspector-pane]:bg-[color-mix(in_oklch,var(--surface)_70%,transparent)] [&_.key-inspector]:h-full [&_.key-inspector]:border-l [&_.key-inspector]:border-line [&_.key-inspector]:bg-[color-mix(in_oklch,var(--surface)_88%,var(--paper))] [&_.key-inspector-body]:flex [&_.key-inspector-body]:min-h-0 [&_.key-inspector-body]:p-kb-16 [&_.inspector-chrome]:[border-bottom-color:var(--line)] [&_.inspector-chrome]:bg-[color-mix(in_oklch,var(--surface)_72%,var(--paper))] max-[980px]:[&_.key-inspector]:border-t max-[980px]:[&_.key-inspector]:border-l-0";
  const editorRouteSplitClass =
    "grid grid-rows-[minmax(0,1fr)_auto] [&_.keyboard-board-viewport]:min-h-[282px] [&_.keyboard-board-viewport]:px-kb-18 [&_.keyboard-board-viewport]:pt-kb-20 [&_.keyboard-board-viewport]:pb-kb-34 [&_.keyboard-board-viewport]:bg-[linear-gradient(to_right,oklch(0.13_0.01_60_/_0.028)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.13_0.01_60_/_0.028)_1px,transparent_1px),radial-gradient(ellipse_58%_62%_at_50%_42%,oklch(0.97_0.035_72_/_0.54),transparent_78%)] [&_.keyboard-board-viewport]:[background-size:24px_24px,24px_24px,100%_100%] [&_.split-label]:text-[color-mix(in_oklch,var(--ink-3)_84%,var(--ink))] [&_.split-seam]:[border-left-color:color-mix(in_oklch,var(--ink-3)_38%,transparent)]";
  const editorMainClass =
    "editor-main grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-kb-14 px-kb-22 py-kb-20 max-[640px]:!p-kb-12";
  const editorMainSplitClass =
    "grid-rows-[auto_minmax(0,1fr)] gap-kb-12 px-kb-22 pt-kb-18 pb-kb-12";
  const editorToolbarClass =
    "editor-toolbar flex min-w-0 flex-wrap items-start gap-kb-12 max-[640px]:flex-col max-[640px]:items-stretch";
  const syncNoticeClass =
    "sync-notice grid min-w-0 grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-kb-10 rounded-[8px] border border-line bg-[color-mix(in_oklch,var(--surface)_78%,transparent)] px-kb-12 py-kb-10 text-[12px]";
  const syncNoticeRebuildClass =
    "rebuild border-[color-mix(in_oklch,var(--coral)_38%,var(--line-2))] bg-[color-mix(in_oklch,var(--coral)_10%,var(--surface))]";
  const syncNoticeFailedClass =
    "failed border-[oklch(0.62_0.2_25_/_0.34)] bg-[oklch(0.95_0.04_25)]";
  const syncNoticeLocalClass =
    "local border-[color-mix(in_oklch,var(--mustard)_46%,var(--line-2))] bg-[color-mix(in_oklch,var(--mustard)_13%,var(--surface))]";
  const syncNoticeIconClass = "material-symbols-outlined mt-px text-[18px]";
  const syncNoticeTitleClass = "block text-[12px] leading-[1.3]";
  const syncNoticeListClass =
    "mt-kb-4 mb-0 flex list-none flex-wrap gap-x-kb-12 gap-y-kb-5 p-0 font-mono text-[10px] text-ink-3";
  const syncNoticeListItemClass =
    "min-w-0 max-w-[360px] overflow-hidden text-ellipsis whitespace-nowrap";
  const syncNoticeLocalListClass =
    "mt-kb-4 mb-0 grid list-none gap-kb-4 p-0 font-mono text-[10px] text-ink-3";
  const syncNoticeLocalItemClass =
    "min-w-0 max-w-none overflow-visible text-clip whitespace-normal text-ink-2 text-[11px] leading-[1.35]";
  const noticeCategoryClass =
    "notice-category mr-kb-5 font-mono text-[10px] font-bold text-ink uppercase";
  const boardStageClass =
    "board-stage flex min-h-[430px] min-w-0 overflow-hidden rounded-[12px] border border-line bg-[color-mix(in_oklch,var(--surface)_54%,transparent)] shadow-card";
  const boardStageResponsiveClass =
    "max-[1180px]:min-h-[390px] max-[980px]:min-h-[340px]";
  const boardStageSplitClass =
    "min-h-[300px] rounded-none border-transparent bg-transparent shadow-none";
  const splitInspectorDockClass =
    "split-inspector-dock min-w-0 border-t border-line bg-[color-mix(in_oklch,var(--surface)_90%,var(--paper))] px-kb-22 pt-kb-10 pb-kb-12 shadow-[0_-18px_44px_-34px_rgba(27,25,23,0.42)] max-[640px]:p-kb-12";

  let boardZoom = $state(1);
  let boardPan = $state({ x: 0, y: 0 });
  let flashOverlayOpen = $state(false);

  type StarterBoardPickerId = SampleBoardId | "none";

  const requestedBoardParam = $derived(page.url.searchParams.get("board"));
  const requestedBoardId = $derived(
    requestedBoardParam === null ? null : sampleBoardIdFromParam(requestedBoardParam),
  );
  const activeBoardId = $derived<StarterBoardPickerId>(
    editor.profile.origin === "starter" ? editor.activeBoardId : "none",
  );
  const lensItems: SegmentItem<EditorLens>[] = [
    { value: "keys", label: "Keys", icon: Keyboard, title: "Edit key bindings" },
    { value: "lighting", label: "Lighting", icon: Lightbulb, title: "Lighting lens" },
  ];
  const boardItems = $derived.by(
    (): SegmentItem<StarterBoardPickerId>[] => [
      {
        value: "default",
        label: "Workbench 65",
        href: boardHref("default"),
        title: "Start from the Workbench 65 starter board",
      },
      {
        value: "split",
        label: "Corney Split 34",
        href: boardHref("split"),
        title: "Start from the Corney Split 34 starter board",
      },
    ],
  );

  const boardModel = $derived(
    createBoardViewModel({
      profile: editor.profile,
      activeLayer: editor.activeLayer,
      lens: editor.lens,
      selection: editor.selectionIds,
      showFallthrough: editor.showFallthrough,
      targetOs: editor.boardTargetOs,
    }),
  );
  const splitLayout = $derived(boardModel.split.enabled);
  const inspectorLabel = $derived(
    editor.lens === "lighting"
      ? "Lighting"
      : editor.selectionIds.length > 1
        ? `${editor.selectionIds.length} keys`
        : "Selected key",
  );
  const lightingChipDot = $derived.by(() => {
    const lighting = editor.lightingSelection.keyLighting ?? swatchToKeyLighting(editor.currentSwatch);
    if (editor.lightingSelection.mixed) return "var(--teal)";
    return keyLightingToCss(lighting) ?? "var(--ink-3)";
  });
  const placementMarkedKeys = $derived(
    shell.placeMode?.kind === "combo" ? shell.placeMode.picks : [],
  );
  const failedPreview = $derived(liveSync.failedLanes.slice(0, 3));
  const invalidPreview = $derived(liveSync.invalidChanges.slice(0, 3));
  const rebuildPreview = $derived(liveSync.rebuildRequiredChanges.slice(0, 4));
  const connectedLocalOnlyChanges = $derived(shell.connected ? liveSync.localOnlyChanges : []);
  const localOnlyReasonPreview = $derived(
    shell.connected ? liveSync.localOnlySummary.reasons.slice(0, 4) : [],
  );
  const localOnlyCategorySummary = $derived(
    shell.connected ? localOnlyCategoryText(liveSync.localOnlySummary.reasons) : "",
  );

  $effect(() => {
    if (requestedBoardId === null) return;
    if (requestedBoardId === editor.activeBoardId && editor.profile.origin === "starter") return;

    void editor.selectStarterBoard(requestedBoardId);
    if (shell.connected) void shell.disconnectDevice("Editing a starter board locally.");
    boardZoom = 1;
    boardPan = { x: 0, y: 0 };
  });

  $effect(() => {
    if (shell.placeMode && editor.lens !== "keys") editor.setLens("keys");
  });

  function handleLightingDrag(keyIds: string[], mode: EditorLightingDragMode) {
    editor.applyLightingDrag(keyIds, mode);
  }

  function handleBoardSelectKey(keyId: string) {
    const placement = shell.placeMode;

    if (placement?.kind === "macro" || placement?.kind === "tapDance") {
      if (editor.placeLogicBindingOnKey(placement, keyId)) {
        shell.clearPlacement();
        return;
      }
    }

    if (placement?.kind === "combo") {
      editor.selectKey(keyId);
      const picks = shell.toggleComboPlacementKey(keyId);
      if (picks.length >= 2) {
        editor.updateComboKeys(placement.id, picks.slice(0, 2));
        shell.clearPlacement();
      }
      return;
    }

    editor.selectKey(keyId);
  }

  function handleBoardToggleKey(keyId: string) {
    if (shell.placeMode?.kind === "combo") {
      handleBoardSelectKey(keyId);
      return;
    }

    editor.toggleKey(keyId);
  }

  function boardHref(boardId: SampleBoardId) {
    const params = new URLSearchParams(page.url.searchParams);
    params.set("board", boardId);

    const query = params.toString();
    return `${page.url.pathname}${query ? `?${query}` : ""}`;
  }

  function localOnlyCategoryText(reasons: readonly LiveSyncLocalOnlyReasonSummary[]) {
    const labels = [...new Set(reasons.map((reason) => reason.label))];
    return labels.join(", ");
  }
</script>

{#snippet editorMain()}
  <div class={cn(editorMainClass, splitLayout ? editorMainSplitClass : "max-[1180px]:p-kb-16")}>
    <header class={editorToolbarClass} aria-label="Editor controls">
      <SegmentedNav
        items={lensItems}
        value={editor.lens}
        onselect={(lens) => editor.setLens(lens)}
        ariaLabel="Editor lens"
      />

      <Chip tone="warning" title="Starter board templates">Starter boards</Chip>
      <SegmentedNav
        items={boardItems}
        value={activeBoardId}
        ariaLabel="Starter boards"
        class="board-switcher opacity-[0.86]"
      />

      <EditorLayerStack {editor} />

      <div class="toolbar-spacer min-w-[10px] flex-1 max-[640px]:hidden"></div>

      {#if editor.persistenceError}
        <Chip tone="error" title={editor.persistenceError}>Draft save issue</Chip>
      {/if}

      <Chip dot={liveSync.dot} title={liveSync.title} class="editor-sync-chip max-w-[180px]">
        {liveSync.label}
      </Chip>

      {#if liveSync.failedLanes.length > 0}
        <Button
          variant="ghost"
          size="sm"
          data-testid="retry-via-sync"
          title="Retry failed live sync"
          onclick={() => liveSync.retryFailed()}
        >
          <span class="material-symbols-outlined" aria-hidden="true">sync_problem</span>
          Retry
        </Button>
      {/if}

      {#if editor.lens === "lighting"}
        <Chip dot={lightingChipDot} title={`${editor.lightingSelection.count} selected`}>
          {editor.lightingSelection.count} selected
        </Chip>
      {:else}
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={editor.showFallthrough}
          title="Toggle fall-through display"
          onclick={() => editor.toggleFallthrough()}
        >
          {#if editor.showFallthrough}
            <Eye size={15} aria-hidden="true" />
          {:else}
            <EyeOff size={15} aria-hidden="true" />
          {/if}
          Fall-through
        </Button>
      {/if}
    </header>

    {#if liveSync.failedLanes.length > 0 || liveSync.rebuildRequiredChanges.length > 0 || connectedLocalOnlyChanges.length > 0 || liveSync.invalidChanges.length > 0}
      <section class="sync-notices grid min-w-0 gap-kb-8" aria-label="Live sync status">
        {#if liveSync.failedLanes.length > 0}
          <div class={cn(syncNoticeClass, syncNoticeFailedClass)} data-testid="via-sync-failed">
            <span class={syncNoticeIconClass} aria-hidden="true">error</span>
            <div>
              <strong class={syncNoticeTitleClass}>{liveSync.failedLanes.length} live sync {liveSync.failedLanes.length === 1 ? "write" : "writes"} failed</strong>
              <ul class={syncNoticeListClass}>
                {#each failedPreview as lane (lane.laneKey)}
                  <li class={syncNoticeListItemClass}>{lane.label} -> {lane.code}{lane.error ? ` · ${lane.error}` : ""}</li>
                {/each}
              </ul>
            </div>
            <Button variant="ghost" size="sm" onclick={() => liveSync.retryFailed()}>
              <span class="material-symbols-outlined" aria-hidden="true">replay</span>
              Retry
            </Button>
          </div>
        {/if}

        {#if liveSync.rebuildRequiredChanges.length > 0}
          <div class={cn(syncNoticeClass, syncNoticeRebuildClass)} data-testid="via-rebuild-required">
            <span class={syncNoticeIconClass} aria-hidden="true">construction</span>
            <div>
              <strong class={syncNoticeTitleClass}>{liveSync.rebuildRequiredChanges.length} {liveSync.rebuildRequiredChanges.length === 1 ? "change needs" : "changes need"} a firmware rebuild</strong>
              <ul class={syncNoticeListClass}>
                {#each rebuildPreview as change (change.id)}
                  <li class={syncNoticeListItemClass}>{change.path}</li>
                {/each}
              </ul>
            </div>
            <Button variant="coral" size="sm" onclick={() => (flashOverlayOpen = true)}>
              <span class="material-symbols-outlined" aria-hidden="true">bolt</span>
              Build firmware
            </Button>
          </div>
        {/if}

        {#if connectedLocalOnlyChanges.length > 0}
          <div class={cn(syncNoticeClass, syncNoticeLocalClass)} data-testid="live-sync-local-only" role="status">
            <span class={syncNoticeIconClass} aria-hidden="true">edit_note</span>
            <div>
              <strong class={syncNoticeTitleClass}>
                {connectedLocalOnlyChanges.length}
                {connectedLocalOnlyChanges.length === 1 ? "change applied" : "changes applied"}
                locally - not written to device{localOnlyCategorySummary ? `: ${localOnlyCategorySummary}` : ""}
              </strong>
              <ul class={syncNoticeLocalListClass}>
                {#each localOnlyReasonPreview as reason (`${reason.category}:${reason.reason}`)}
                  <li class={syncNoticeLocalItemClass}>
                    <span class={noticeCategoryClass}>{reason.label}</span>
                    {reason.reason}{reason.count > 1 ? ` (${reason.count})` : ""}
                  </li>
                {/each}
              </ul>
            </div>
          </div>
        {/if}

        {#if liveSync.invalidChanges.length > 0}
          <div class={cn(syncNoticeClass, syncNoticeFailedClass)} data-testid="via-invalid-change">
            <span class={syncNoticeIconClass} aria-hidden="true">report</span>
            <div>
              <strong class={syncNoticeTitleClass}>{liveSync.invalidChanges.length} invalid {liveSync.invalidChanges.length === 1 ? "change" : "changes"}</strong>
              <ul class={syncNoticeListClass}>
                {#each invalidPreview as change (change.id)}
                  <li class={syncNoticeListItemClass}>{change.path}</li>
                {/each}
              </ul>
            </div>
          </div>
        {/if}
      </section>
    {/if}

    {#if editor.lens === "keys"}
      <section
        class={cn(boardStageClass, splitLayout ? boardStageSplitClass : boardStageResponsiveClass)}
        aria-label="Keyboard editor"
      >
        <KeyboardBoard
          profile={editor.profile}
          activeLayer={editor.activeLayer}
          lens="keys"
          selection={editor.selectionIds}
          marked={placementMarkedKeys}
          showFallthrough={editor.showFallthrough}
          targetOs={editor.boardTargetOs}
          bind:zoom={boardZoom}
          bind:pan={boardPan}
          onSelectKey={handleBoardSelectKey}
          onToggleKey={handleBoardToggleKey}
          onClearSelection={() => editor.clearSelection()}
        />
      </section>

      {#if !splitLayout}
        <ActiveStackCard {editor} />
      {/if}
    {:else}
      <section
        class={cn(
          boardStageClass,
          "lighting-stage min-h-[460px]",
          splitLayout
            ? cn(boardStageSplitClass, "min-h-[312px]")
            : boardStageResponsiveClass,
        )}
        aria-label="Keyboard lighting editor"
      >
        <KeyboardBoard
          profile={editor.profile}
          activeLayer={editor.activeLayer}
          lens="lighting"
          selection={editor.selectionIds}
          showFallthrough={editor.showFallthrough}
          targetOs={editor.boardTargetOs}
          bind:zoom={boardZoom}
          bind:pan={boardPan}
          onLightingDrag={handleLightingDrag}
          onClearSelection={() => editor.clearSelection()}
        />
      </section>

      {#if !splitLayout}
        <div class="lighting-hint inline-flex min-w-0 items-center gap-kb-8 rounded-[9px] border border-line bg-[color-mix(in_oklch,var(--surface-2)_72%,var(--surface))] px-kb-12 py-kb-10 text-[12px] text-ink-2">
          <MousePointer2 size={15} aria-hidden="true" />
          <span>Drag across keys to select</span>
        </div>
      {/if}
    {/if}
  </div>
{/snippet}

<section class={cn(editorRouteClass, splitLayout && editorRouteSplitClass)} class:split={splitLayout} data-lens={editor.lens}>
  {#if splitLayout}
    {@render editorMain()}
    <aside class={splitInspectorDockClass} aria-label={inspectorLabel}>
      {#if editor.lens === "lighting"}
        <EditorLightingInspector {editor} compact />
      {:else}
        <EditorKeyInspector {editor} compact />
      {/if}
    </aside>
  {:else}
    <KeyInspectorPanel chromeLabel={inspectorLabel}>
      {#snippet main()}
        {@render editorMain()}
      {/snippet}

      {#if editor.lens === "lighting"}
        <EditorLightingInspector {editor} />
      {:else}
        <EditorKeyInspector {editor} />
      {/if}
    </KeyInspectorPanel>
  {/if}
</section>

<FlashOverlay
  bind:open={flashOverlayOpen}
  profile={editor.profile}
  changes={liveSync.rebuildRequiredChanges}
/>
