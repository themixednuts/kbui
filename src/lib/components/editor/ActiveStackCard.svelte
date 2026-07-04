<script lang="ts">
  import { GitBranch } from "@lucide/svelte";

  import type { EditorStore } from "$lib/app/editor-store.svelte";
  import Chip from "$lib/components/ui/Chip.svelte";

  type Props = {
    editor: EditorStore;
  };

  let { editor }: Props = $props();
</script>

<section class="active-stack-card" aria-label="Active layer stack">
  <header>
    <div>
      <span class="eyebrow">Active layer stack</span>
      <strong>{editor.activeLayerRecord?.name ?? "Layer"}</strong>
    </div>
    <span class="stack-id">{editor.activeStack.map((layer) => layer.name).join(" / ")}</span>
  </header>

  <div class="stack-body">
    {#each editor.activeStack as layer (layer.id)}
      <Chip dot={layer.color}>{layer.name}</Chip>
    {/each}
    <span class="inherit-note">
      <GitBranch size={13} aria-hidden="true" />
      Hatched keys inherit from below
    </span>
  </div>
</section>

<style>
  .active-stack-card {
    display: grid;
    gap: 10px;
    padding: 13px 16px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: color-mix(in oklch, var(--surface) 76%, transparent);
    box-shadow: var(--shadow-card);
  }

  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
  }

  header div {
    min-width: 0;
  }

  .eyebrow,
  .stack-id,
  .inherit-note {
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  strong {
    display: block;
    margin-top: 2px;
    font-size: 13px;
  }

  .stack-id {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stack-body {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .inherit-note {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    letter-spacing: 0.04em;
    text-transform: none;
  }

  @media (max-width: 680px) {
    header {
      display: grid;
    }

    .inherit-note {
      width: 100%;
      margin-left: 0;
    }
  }
</style>
