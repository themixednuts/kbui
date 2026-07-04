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
  import KeyInspectorPanel from "$lib/components/keymap/KeyInspectorPanel.svelte";
  import { Button, Chip, SegmentedNav } from "$lib/components/ui";
  import type { SegmentItem } from "$lib/components/ui/types";
  import { swatchToKeyLighting } from "$lib/keyboard/lighting-swatches";
  import {
    sampleBoardIdFromParam,
    type SampleBoardId,
  } from "$lib/keyboard/sample-boards";

  const shell = getShellContext();
  const editor = getWorkbenchContext();
  const liveSync = getViaLiveSyncContext();

  let boardZoom = $state(1);
  let boardPan = $state({ x: 0, y: 0 });

  const requestedBoardId = $derived(sampleBoardIdFromParam(page.url.searchParams.get("board")));
  const activeBoardId = $derived(editor.activeBoardId);
  const lensItems: SegmentItem<EditorLens>[] = [
    { value: "keys", label: "Keys", icon: Keyboard, title: "Edit key bindings" },
    { value: "lighting", label: "Lighting", icon: Lightbulb, title: "Lighting lens" },
  ];
  const boardItems = $derived.by(
    (): SegmentItem<SampleBoardId>[] => [
      {
        value: "default",
        label: "Workbench",
        href: boardHref("default"),
        title: "Temporary demo board selector",
      },
      {
        value: "split",
        label: "Split demo",
        href: boardHref("split"),
        title: "Temporary split-board demo selector",
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
  const localOnlyPreview = $derived(liveSync.localOnlyChanges.slice(0, 3));

  $effect(() => {
    if (requestedBoardId === editor.activeBoardId) return;

    void editor.switchSampleBoard(requestedBoardId);
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
    if (boardId === "default") params.delete("board");
    else params.set("board", boardId);

    const query = params.toString();
    return `${page.url.pathname}${query ? `?${query}` : ""}`;
  }
</script>

{#snippet editorMain()}
  <div class="editor-main">
    <header class="editor-toolbar" aria-label="Editor controls">
      <SegmentedNav
        items={lensItems}
        value={editor.lens}
        onselect={(lens) => editor.setLens(lens)}
        ariaLabel="Editor lens"
      />

      <SegmentedNav
        items={boardItems}
        value={activeBoardId}
        ariaLabel="Temporary editor board selector"
        class="board-switcher"
      />

      <EditorLayerStack {editor} />

      <div class="toolbar-spacer"></div>

      {#if editor.persistenceError}
        <Chip tone="error" title={editor.persistenceError}>Draft save issue</Chip>
      {/if}

      <Chip dot={liveSync.dot} title={liveSync.title} class="editor-sync-chip">
        {liveSync.label}
      </Chip>

      {#if liveSync.failedLanes.length > 0}
        <Button
          variant="ghost"
          size="sm"
          data-testid="retry-via-sync"
          title="Retry failed VIA sync"
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

    {#if liveSync.failedLanes.length > 0 || liveSync.rebuildRequiredChanges.length > 0 || liveSync.localOnlyChanges.length > 0 || liveSync.invalidChanges.length > 0}
      <section class="sync-notices" aria-label="VIA sync status">
        {#if liveSync.failedLanes.length > 0}
          <div class="sync-notice failed" data-testid="via-sync-failed">
            <span class="material-symbols-outlined" aria-hidden="true">error</span>
            <div>
              <strong>{liveSync.failedLanes.length} live sync {liveSync.failedLanes.length === 1 ? "write" : "writes"} failed</strong>
              <ul>
                {#each failedPreview as lane (lane.laneKey)}
                  <li>{lane.label} -> {lane.code}{lane.error ? ` · ${lane.error}` : ""}</li>
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
          <div class="sync-notice rebuild" data-testid="via-rebuild-required">
            <span class="material-symbols-outlined" aria-hidden="true">construction</span>
            <div>
              <strong>{liveSync.rebuildRequiredChanges.length} {liveSync.rebuildRequiredChanges.length === 1 ? "change needs" : "changes need"} a firmware rebuild</strong>
              <ul>
                {#each rebuildPreview as change (change.id)}
                  <li>{change.path}</li>
                {/each}
              </ul>
            </div>
          </div>
        {/if}

        {#if liveSync.localOnlyChanges.length > 0}
          <div class="sync-notice local" data-testid="via-local-only">
            <span class="material-symbols-outlined" aria-hidden="true">edit_note</span>
            <div>
              <strong>{liveSync.localOnlyChanges.length} {liveSync.localOnlyChanges.length === 1 ? "change is" : "changes are"} local only</strong>
              <ul>
                {#each localOnlyPreview as change (change.id)}
                  <li>{change.path}</li>
                {/each}
              </ul>
            </div>
          </div>
        {/if}

        {#if liveSync.invalidChanges.length > 0}
          <div class="sync-notice failed" data-testid="via-invalid-change">
            <span class="material-symbols-outlined" aria-hidden="true">report</span>
            <div>
              <strong>{liveSync.invalidChanges.length} invalid {liveSync.invalidChanges.length === 1 ? "change" : "changes"}</strong>
              <ul>
                {#each invalidPreview as change (change.id)}
                  <li>{change.path}</li>
                {/each}
              </ul>
            </div>
          </div>
        {/if}
      </section>
    {/if}

    {#if editor.lens === "keys"}
      <section class="board-stage" aria-label="Keyboard editor">
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
      <section class="board-stage lighting-stage" aria-label="Keyboard lighting editor">
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
        <div class="lighting-hint">
          <MousePointer2 size={15} aria-hidden="true" />
          <span>Drag across keys to select</span>
        </div>
      {/if}
    {/if}
  </div>
{/snippet}

<section class="editor-route" class:split={splitLayout} data-lens={editor.lens}>
  {#if splitLayout}
    {@render editorMain()}
    <aside class="split-inspector-dock" aria-label={inspectorLabel}>
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

<style>
  .editor-route {
    display: flex;
    min-height: calc(100vh - 58px);
    overflow: hidden;
    background:
      radial-gradient(ellipse 80% 55% at 72% 0%, color-mix(in oklch, var(--mustard) 9%, transparent), transparent 62%),
      var(--paper);
  }

  .editor-route.split {
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto;
  }

  .editor-main {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: 14px;
    min-width: 0;
    min-height: 0;
    padding: 20px 22px;
  }

  .editor-toolbar {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    min-width: 0;
    flex-wrap: wrap;
  }

  .toolbar-spacer {
    flex: 1;
    min-width: 10px;
  }

  :global(.editor-sync-chip) {
    max-width: 180px;
  }

  .sync-notices {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .sync-notice {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) auto;
    align-items: start;
    gap: 10px;
    min-width: 0;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: color-mix(in oklch, var(--surface) 78%, transparent);
    font-size: 12px;
  }

  .sync-notice.rebuild {
    border-color: color-mix(in oklch, var(--coral) 38%, var(--line-2));
    background: color-mix(in oklch, var(--coral) 10%, var(--surface));
  }

  .sync-notice.failed {
    border-color: oklch(0.62 0.2 25 / 0.34);
    background: oklch(0.95 0.04 25);
  }

  .sync-notice.local {
    border-color: color-mix(in oklch, var(--ink-3) 35%, var(--line));
  }

  .sync-notice > .material-symbols-outlined {
    margin-top: 1px;
    font-size: 18px;
  }

  .sync-notice strong {
    display: block;
    font-size: 12px;
    line-height: 1.3;
  }

  .sync-notice ul {
    display: flex;
    flex-wrap: wrap;
    gap: 5px 12px;
    margin: 4px 0 0;
    padding: 0;
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 10px;
    list-style: none;
  }

  .sync-notice li {
    min-width: 0;
    max-width: 360px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  :global(.board-switcher) {
    opacity: 0.86;
  }

  .board-stage {
    display: flex;
    min-width: 0;
    min-height: 430px;
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: 12px;
    background: color-mix(in oklch, var(--surface) 54%, transparent);
    box-shadow: var(--shadow-card);
  }

  .lighting-stage {
    min-height: 460px;
  }

  .lighting-hint {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-radius: 9px;
    background: color-mix(in oklch, var(--surface-2) 72%, var(--surface));
    color: var(--ink-2);
    font-size: 12px;
  }

  .split-inspector-dock {
    min-width: 0;
    padding: 10px 22px 12px;
    border-top: 1px solid var(--line);
    background: color-mix(in oklch, var(--surface) 90%, var(--paper));
    box-shadow: 0 -18px 44px -34px rgba(27, 25, 23, 0.42);
  }

  .editor-route.split .editor-main {
    grid-template-rows: auto minmax(0, 1fr);
    gap: 12px;
    padding: 18px 22px 12px;
  }

  .editor-route.split .board-stage {
    min-height: 300px;
    border-color: transparent;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .editor-route.split .lighting-stage {
    min-height: 312px;
  }

  .editor-route.split :global(.keyboard-board-viewport) {
    min-height: 282px;
    padding: 20px 18px 34px;
    background:
      linear-gradient(to right, oklch(0.13 0.01 60 / 0.028) 1px, transparent 1px),
      linear-gradient(to bottom, oklch(0.13 0.01 60 / 0.028) 1px, transparent 1px),
      radial-gradient(ellipse 58% 62% at 50% 42%, oklch(0.97 0.035 72 / 0.54), transparent 78%);
    background-size:
      24px 24px,
      24px 24px,
      100% 100%;
  }

  .editor-route.split :global(.split-seam) {
    border-left-color: color-mix(in oklch, var(--ink-3) 38%, transparent);
  }

  .editor-route.split :global(.split-label) {
    color: color-mix(in oklch, var(--ink-3) 84%, var(--ink));
  }

  :global(.editor-route .keymap-pane-group) {
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  :global(.editor-route .keymap-main-pane) {
    min-width: 0;
    min-height: 0;
  }

  :global(.editor-route .key-inspector-pane) {
    min-width: 300px;
    background: color-mix(in oklch, var(--surface) 70%, transparent);
  }

  :global(.editor-route .key-inspector) {
    height: 100%;
    border-left: 1px solid var(--line);
    background: color-mix(in oklch, var(--surface) 88%, var(--paper));
  }

  :global(.editor-route .key-inspector-body) {
    display: flex;
    min-height: 0;
    padding: 16px;
  }

  :global(.editor-route .inspector-chrome) {
    border-bottom-color: var(--line);
    background: color-mix(in oklch, var(--surface) 72%, var(--paper));
  }

  @media (max-width: 1180px) {
    .editor-main {
      padding: 16px;
    }

    .board-stage {
      min-height: 390px;
    }
  }

  @media (max-width: 980px) {
    .editor-route {
      min-height: calc(100vh - 68px);
    }

    :global(.editor-route .key-inspector) {
      border-top: 1px solid var(--line);
      border-left: 0;
    }

    .board-stage {
      min-height: 340px;
    }
  }

  @media (max-width: 640px) {
    .editor-main,
    .split-inspector-dock {
      padding: 12px;
    }

    .editor-toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .toolbar-spacer {
      display: none;
    }
  }
</style>
