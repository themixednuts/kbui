<script lang="ts">
  import {
    Eye,
    EyeOff,
    FileCode2,
    Keyboard,
    Lightbulb,
    MousePointer2,
    PanelBottom,
    PanelRight,
    Sparkles,
    Zap,
  } from "@lucide/svelte";

  import { EditorLayout } from "$lib/app";
  import type { EditorLayoutId } from "$lib/app/editor-store.svelte";
  import { getShellContext } from "$lib/app/shell-store.svelte";
  import { getViaLiveSyncContext } from "$lib/app/via-live-sync.svelte";
  import { getWorkbenchContext } from "$lib/app/workbench-store.svelte";
  import {
    displayCode,
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
  import KeyInspectorDock from "$lib/components/keymap/KeyInspectorDock.svelte";
  import KeyInspectorPanel from "$lib/components/keymap/KeyInspectorPanel.svelte";
  import { Button, Chip, SegmentedNav } from "$lib/components/ui";
  import type { SegmentItem } from "$lib/components/ui/types";
  import type { FirmwareEditIntent } from "$lib/keyboard/schema";
  import { swatchToKeyLighting } from "$lib/keyboard/lighting-swatches";
  import { cn } from "$lib/utils.js";

  const shell = getShellContext();
  const editor = getWorkbenchContext();
  const liveSync = getViaLiveSyncContext();

  const editorRouteClass =
    "editor-route relative flex h-full min-h-0 overflow-hidden bg-paper";
  // Split-board board visuals (dotted grid stage + centre seam). Keyed to the
  // actual board being split, not to the inspector arrangement.
  const editorRouteSplitClass =
    "[&_.keyboard-board-viewport]:min-h-[282px] [&_.keyboard-board-viewport]:px-kb-18 [&_.keyboard-board-viewport]:pt-kb-20 [&_.keyboard-board-viewport]:pb-kb-34 [&_.split-label]:text-[color-mix(in_oklch,var(--ink-3)_84%,var(--ink))] [&_.split-seam]:[border-left-color:color-mix(in_oklch,var(--ink-3)_38%,transparent)]";
  const editorMainClass =
    "editor-main grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)_auto] gap-0 p-0 [container:editor-main/inline-size] max-[640px]:p-0";
  const editorMainSplitClass =
    "grid-rows-[auto_minmax(0,1fr)] gap-0 p-0";
  // Wide panes keep two rows: lens + firmware/status on top, layers full-width
  // beneath. When the pane (not the window) drops below 640px, collapse to one
  // row — lens | scrolling layers | status — so the top row does not leave a
  // large empty gap. The layout switcher stays visible whenever the viewport
  // can still host a side inspector. Nothing wraps: the layer strip scrolls and
  // labels collapse to icons (firmware by 960px, lens by 800px) rather than
  // overflowing into the neighboring group.
  const editorToolbarClass =
    "editor-toolbar grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-kb-10 gap-y-kb-6 border-b border-line bg-paper px-kb-20 py-kb-8 max-[640px]:px-kb-12 @max-[640px]/editor-main:grid-cols-[auto_minmax(0,1fr)_auto] @max-[640px]/editor-main:gap-x-kb-6 @max-[640px]/editor-main:px-kb-10 @max-[640px]/editor-main:py-kb-6";
  const primaryToolbarGroupClass =
    "editor-primary-tools col-start-1 row-start-1 flex flex-none flex-nowrap items-center gap-kb-10";
  const secondaryToolbarGroupClass =
    "editor-secondary-tools col-start-2 row-start-1 flex min-w-0 flex-nowrap items-center justify-end gap-kb-8 overflow-x-auto @max-[640px]/editor-main:col-start-3";
  const layerRowClass =
    "editor-layer-row col-span-2 row-start-2 flex min-w-0 items-center @max-[640px]/editor-main:col-span-1 @max-[640px]/editor-main:col-start-2 @max-[640px]/editor-main:row-start-1";
  const syncNoticeClass =
    "sync-notice grid min-w-0 grid-cols-[20px_minmax(0,1fr)_auto] items-start gap-kb-10 rounded-lg border border-line bg-surface px-kb-12 py-kb-10 text-kb-12";
  const syncNoticeRebuildClass =
    "rebuild border-[color-mix(in_oklch,var(--coral)_38%,var(--line-2))] bg-[color-mix(in_oklch,var(--coral)_10%,var(--surface))]";
  const syncNoticeFailedClass =
    "failed border-[var(--danger-border)] bg-danger-surface text-danger-ink";
  const syncNoticeLocalClass =
    "local border-[var(--warning-border)] bg-warning-surface text-warning-ink";
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
    "board-stage relative flex h-full min-h-0 min-w-0 overflow-hidden border-0 bg-stage shadow-none";
  const boardStageSplitClass =
    "rounded-none border-transparent bg-stage shadow-none";
  const fallthroughChipClass =
    "fallthrough-chip absolute top-kb-12 right-kb-12 z-20 h-kb-28 min-h-kb-28 gap-kb-6 rounded-md border-line-2 bg-[color-mix(in_oklch,var(--card-surface)_86%,transparent)] px-kb-10 py-0 font-mono text-[11px] text-ink-2 shadow-none backdrop-blur-[5px] hover:border-[color-mix(in_oklch,var(--coral)_45%,var(--line-2))] hover:bg-card hover:text-ink data-[active=true]:border-[color-mix(in_oklch,var(--teal)_48%,var(--line-2))] data-[active=true]:bg-[color-mix(in_oklch,var(--teal)_12%,var(--card-surface))] data-[active=true]:text-teal-ink [&_svg]:size-[13px]";
  let boardZoom = $state(1);
  let boardPan = $state({ x: 0, y: 0 });
  let flashOverlayOpen = $state(false);

  const lensItems: SegmentItem<EditorLens>[] = [
    { value: "keys", label: "Keys", icon: Keyboard, title: "Edit key bindings" },
    { value: "lighting", label: "Lighting", icon: Lightbulb, title: "Lighting lens" },
  ];

  const layoutItems: SegmentItem<EditorLayoutId>[] = [
    { value: "auto", label: "Auto", icon: Sparkles, title: "Splits use the dock. Other boards use the side panel." },
    { value: "inspector", label: "Panel", icon: PanelRight, title: "Board on the left, inspector on the right." },
    { value: "dock", label: "Dock", icon: PanelBottom, title: "Board in the middle, inspector along the bottom." },
  ];

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
  // Which inspector arrangement to render. "auto" tracks the board (split → dock),
  // otherwise the user's explicit choice wins for any board.
  const resolvedLayout = $derived(
    EditorLayout.resolveEditorLayout(editor.editorLayout, splitLayout),
  );
  const useDock = $derived(resolvedLayout === "dock");
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
  const firmwareEditIntent = $derived(editor.profile.firmwareEditIntent ?? "live");
  const liveEditLabel = $derived(
    editor.profile.firmware === "zmk" ? "Studio live" : "VIA live",
  );
  const sourceEditLabel = $derived(
    editor.profile.firmware === "zmk" ? "ZMK source" : "QMK source",
  );
  const firmwareTargetItems: SegmentItem<FirmwareEditIntent>[] = $derived([
    {
      value: "live",
      label: liveEditLabel,
      icon: Zap,
      title: `Writes each edit to the keyboard (${liveEditLabel})`,
    },
    {
      value: "source",
      label: sourceEditLabel,
      icon: FileCode2,
      title: `Saves edits for a firmware build (${sourceEditLabel})`,
    },
  ]);
  const failedPreview = $derived(liveSync.failedLanes.slice(0, 3));
  const invalidPreview = $derived(liveSync.invalidChanges.slice(0, 3));
  const rebuildPreview = $derived(liveSync.rebuildRequiredChanges.slice(0, 4));
  const connectedLocalOnlyChanges = $derived(shell.connected ? liveSync.localOnlyChanges : []);
  const localOnlyReasonPreview = $derived(
    shell.connected ? liveSync.localOnlySummary.reasons.slice(0, 4) : [],
  );

  $effect(() => {
    if (shell.placeMode && editor.lens !== "keys") editor.setLens("keys");
  });

  function handleLightingDrag(keyIds: string[], mode: EditorLightingDragMode) {
    editor.applyLightingDrag(keyIds, mode);
  }

  function setFirmwareEditIntent(intent: string) {
    if (intent !== "live" && intent !== "source") return;
    editor.setFirmwareEditIntent(intent satisfies FirmwareEditIntent);
    if (intent === "live") queueMicrotask(() => liveSync.processChanges());
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
</script>

{#snippet editorMain()}
  <div class={cn(editorMainClass, useDock && editorMainSplitClass)}>
    <header class={editorToolbarClass} aria-label="Editor controls">
      <div class={primaryToolbarGroupClass}>
        <SegmentedNav
          items={lensItems}
          value={editor.lens}
          onselect={(lens) => editor.setLens(lens)}
          ariaLabel="Editor lens"
          class="@max-[800px]/editor-main:[&_[data-label]]:hidden @max-[640px]/editor-main:[&_button]:px-kb-8"
        />
      </div>

      <div class={secondaryToolbarGroupClass}>
        <SegmentedNav
          items={firmwareTargetItems}
          value={firmwareEditIntent}
          onselect={setFirmwareEditIntent}
          ariaLabel="Firmware edit target"
          class="firmware-edit-intent @max-[960px]/editor-main:[&_[data-label]]:hidden @max-[640px]/editor-main:[&_button]:px-kb-8 @max-[520px]/editor-main:hidden"
        />

        <!-- Hidden only on phone-sized viewports, where a side inspector is
             impossible either way. It stays available whenever the pane is merely
             narrow — that is exactly when you need it to switch back to the dock. -->
        <SegmentedNav
          items={layoutItems}
          value={editor.editorLayout}
          onselect={(layout) => editor.setEditorLayout(layout)}
          iconOnlyAt="topbar"
          ariaLabel="Editor layout"
          class="editor-layout-seg max-[720px]:hidden"
        />

        {#if editor.persistenceError}
          <Chip tone="error" title={editor.persistenceError}>Could not save draft</Chip>
        {/if}

        <Chip
          dot={liveSync.dot}
          title={liveSync.title}
          class="editor-sync-chip min-w-0 max-w-[180px] flex-none truncate max-[900px]:max-w-[104px] @max-[640px]/editor-main:max-w-none @max-[400px]/editor-main:px-kb-8"
        >
          <span class="@max-[400px]/editor-main:hidden">{liveSync.label}</span>
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
        {/if}
      </div>

      <div class={layerRowClass}>
        <EditorLayerStack {editor} />
      </div>
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
                {connectedLocalOnlyChanges.length === 1 ? "local-only change" : "local-only changes"}
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
        class={cn(boardStageClass, splitLayout && boardStageSplitClass)}
        aria-label="Keyboard editor"
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          class={fallthroughChipClass}
          data-active={editor.showFallthrough}
          aria-pressed={editor.showFallthrough}
          title={editor.showFallthrough ? "Fall-through shown" : "Fall-through hidden"}
          onclick={() => editor.toggleFallthrough()}
        >
          {#if editor.showFallthrough}
            <Eye size={13} aria-hidden="true" />
          {:else}
            <EyeOff size={13} aria-hidden="true" />
          {/if}
          fall-through
        </Button>
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

      {#if !useDock}
        <ActiveStackCard {editor} />
      {/if}
    {:else}
      <section
        class={cn(boardStageClass, "lighting-stage", splitLayout && boardStageSplitClass)}
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

      {#if !useDock}
        <div class="lighting-hint inline-flex min-w-0 items-center gap-kb-8 rounded-[9px] border border-line bg-[color-mix(in_oklch,var(--surface-2)_72%,var(--surface))] px-kb-12 py-kb-10 text-[12px] text-ink-2">
          <MousePointer2 size={15} aria-hidden="true" />
          <span>Drag across keys to select</span>
        </div>
      {/if}
    {/if}
  </div>
{/snippet}

<section
  class={cn(editorRouteClass, splitLayout && editorRouteSplitClass)}
  class:split={splitLayout}
  data-lens={editor.lens}
  data-layout={resolvedLayout}
>
  {#if useDock}
    <KeyInspectorDock chromeLabel={inspectorLabel} rgbMode={editor.lens === "lighting"}>
      {#snippet main()}
        {@render editorMain()}
      {/snippet}

      {#if editor.lens === "lighting"}
        <EditorLightingInspector {editor} compact />
      {:else}
        <EditorKeyInspector {editor} compact />
      {/if}
    </KeyInspectorDock>
  {:else}
    <KeyInspectorPanel>
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
