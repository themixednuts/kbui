<script lang="ts">
  import { Plus } from "@lucide/svelte";

  import type { EditorStore } from "$lib/app/editor-store.svelte";
  import Button from "$lib/components/ui/Button.svelte";

  type Props = {
    editor: EditorStore;
  };

  let { editor }: Props = $props();
</script>

<div class="layer-stack" aria-label="Keyboard layers">
  <div class="layer-buttons">
    {#each editor.profile.layers as layer (layer.id)}
      {@const active = layer.id === editor.activeLayer}
      <button
        type="button"
        class="layer-button"
        class:active
        aria-pressed={active}
        title={`Switch to ${layer.name}`}
        onclick={() => editor.setLayer(layer.id)}
      >
        <span class="layer-dot" style={`background: ${layer.color}`} aria-hidden="true"></span>
        <span>{layer.name}</span>
      </button>
    {/each}
  </div>

  <Button variant="ghost" size="sm" class="add-layer" title="Add transparent layer" onclick={() => editor.addLayer()}>
    <Plus size={14} aria-hidden="true" />
    Layer
  </Button>
</div>

<style>
  .layer-stack {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .layer-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    min-width: 0;
  }

  .layer-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-width: 74px;
    height: 36px;
    padding: 0 15px;
    border: 1px solid var(--line-2);
    border-radius: var(--r-pill);
    background: color-mix(in oklch, var(--surface) 78%, transparent);
    box-shadow: var(--shadow-card);
    color: var(--ink-2);
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
    transition:
      background var(--dur-fast) var(--ease-out-soft),
      border-color var(--dur-fast) var(--ease-out-soft),
      color var(--dur-fast) var(--ease-out-soft),
      transform var(--dur-fast) var(--ease-out-soft);
  }

  .layer-button:hover {
    border-color: rgba(24, 22, 20, 0.28);
    color: var(--ink);
    transform: translateY(-1px);
  }

  .layer-button.active {
    border-color: var(--ink);
    background: var(--ink);
    color: var(--paper);
  }

  .layer-button.active .layer-dot {
    box-shadow: 0 0 0 2px color-mix(in oklch, currentColor 16%, transparent);
  }

  .layer-dot {
    width: 12px;
    height: 12px;
    flex: 0 0 auto;
    border-radius: 4px;
    box-shadow: inset 0 0 0 1px rgba(24, 22, 20, 0.12);
  }

  :global(.add-layer) {
    flex: 0 0 auto;
  }

  @media (max-width: 760px) {
    .layer-stack {
      align-items: flex-start;
      flex-direction: column;
    }

    .layer-button {
      min-width: 66px;
      height: 32px;
      padding-inline: 12px;
    }
  }
</style>
