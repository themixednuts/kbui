<script lang="ts">
  import { Eye, EyeOff, Keyboard, Lightbulb } from "@lucide/svelte";
  import { onDestroy } from "svelte";

  import { getShellContext } from "$lib/app/shell-store.svelte";
  import { EditorStore, type EditorLens } from "$lib/app/editor-store.svelte";
  import { KeyboardBoard } from "$lib/components/board";
  import { createBoardViewModel } from "$lib/components/board/board-view-model";
  import ActiveStackCard from "$lib/components/editor/ActiveStackCard.svelte";
  import EditorKeyInspector from "$lib/components/editor/EditorKeyInspector.svelte";
  import EditorLayerStack from "$lib/components/editor/EditorLayerStack.svelte";
  import LightingComingSoon from "$lib/components/editor/LightingComingSoon.svelte";
  import KeyInspectorPanel from "$lib/components/keymap/KeyInspectorPanel.svelte";
  import { Button, Chip, SegmentedNav } from "$lib/components/ui";
  import type { SegmentItem } from "$lib/components/ui/types";

  const editor = new EditorStore();
  const shell = getShellContext();

  let boardZoom = $state(1);
  let boardPan = $state({ x: 0, y: 0 });

  const lensItems: SegmentItem<EditorLens>[] = [
    { value: "keys", label: "Keys", icon: Keyboard, title: "Edit key bindings" },
    { value: "lighting", label: "Lighting", icon: Lightbulb, title: "Lighting lens" },
  ];

  const boardModel = $derived(
    createBoardViewModel({
      profile: editor.profile,
      activeLayer: editor.activeLayer,
      lens: "keys",
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

  $effect(() => {
    shell.setDirty(editor.dirty);
    shell.setDevice({
      connected: true,
      name: editor.profile.name,
      protocol: protocolLabel(editor.profile.protocol),
      transport: editor.profile.firmware.toUpperCase(),
    });
  });

  onDestroy(() => {
    void editor.flushPersistence();
  });

  function protocolLabel(protocol: string) {
    if (protocol === "via-v3") return "VIA v3";
    if (protocol === "zmk-studio") return "ZMK Studio";
    return protocol.toUpperCase();
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

      <EditorLayerStack {editor} />

      <div class="toolbar-spacer"></div>

      {#if editor.persistenceError}
        <Chip tone="error" title={editor.persistenceError}>Draft save issue</Chip>
      {/if}

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
    </header>

    {#if editor.lens === "keys"}
      <section class="board-stage" aria-label="Keyboard editor">
        <KeyboardBoard
          profile={editor.profile}
          activeLayer={editor.activeLayer}
          lens="keys"
          selection={editor.selectionIds}
          showFallthrough={editor.showFallthrough}
          targetOs={editor.boardTargetOs}
          bind:zoom={boardZoom}
          bind:pan={boardPan}
          onSelectKey={(keyId) => editor.selectKey(keyId)}
          onToggleKey={(keyId) => editor.toggleKey(keyId)}
          onClearSelection={() => editor.clearSelection()}
        />
      </section>

      <ActiveStackCard {editor} />
    {:else}
      <LightingComingSoon {editor} />
    {/if}
  </div>
{/snippet}

<section class="editor-route" class:split={splitLayout} data-lens={editor.lens}>
  {#if splitLayout}
    {@render editorMain()}
    <aside class="split-inspector-dock" aria-label={inspectorLabel}>
      <EditorKeyInspector {editor} compact />
    </aside>
  {:else}
    <KeyInspectorPanel chromeLabel={inspectorLabel}>
      {#snippet main()}
        {@render editorMain()}
      {/snippet}

      <EditorKeyInspector {editor} />
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

  .split-inspector-dock {
    min-width: 0;
    padding: 14px 22px 18px;
    border-top: 1px solid var(--line);
    background: color-mix(in oklch, var(--surface) 86%, var(--paper));
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
