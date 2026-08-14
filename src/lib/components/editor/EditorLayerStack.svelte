<script lang="ts">
  import { Plus } from "@lucide/svelte";

  import type { EditorStore } from "$lib/app/editor-store.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import { cn } from "$lib/utils.js";

  type Props = {
    editor: EditorStore;
    /** When false, hide add-layer (trainer / view-only surfaces). */
    allowAdd?: boolean;
  };

  let { editor, allowAdd = true }: Props = $props();

  const layerStackClass = "layer-stack flex min-w-0 items-center gap-kb-8";
  // The strip scrolls rather than wrapping, so a long layer list never pushes
  // the toolbar into extra rows. Vertical padding leaves room for the hover lift.
  const layerButtonsClass =
    "layer-buttons flex min-w-0 flex-nowrap items-center gap-kb-6 overflow-x-auto overflow-y-hidden py-kb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";
  const layerButtonClass =
    "layer-button h-kb-34 min-w-0 flex-none gap-kb-8 rounded-md border-line-2 bg-surface px-kb-14 py-0 [font-family:var(--mono)] text-[11px] tracking-[0.04em] font-strong text-ink-2 shadow-none transition-[background,border-color,color,transform] duration-[var(--dur-fast)] ease-[var(--ease-out-soft)] hover:border-line-2 hover:bg-surface-2 hover:text-ink @max-[640px]/editor-main:px-kb-10";
  const activeLayerButtonClass =
    "active border-line-2 bg-ink text-paper hover:border-line-2 hover:bg-ink hover:text-paper";
  const layerDotClass =
    "layer-dot h-kb-12 w-kb-12 flex-none rounded-[4px] shadow-[inset_0_0_0_1px_rgba(24,22,20,0.12)]";
</script>

<div class={layerStackClass} role="group" aria-label="Keyboard layers">
  <div class={layerButtonsClass}>
    {#each editor.profile.layers as layer (layer.id)}
      {@const active = layer.id === editor.activeLayer}
      <Button
        type="button"
        variant="outline"
        class={cn(layerButtonClass, active && activeLayerButtonClass)}
        aria-pressed={active}
        title={`Switch to ${layer.name}`}
        onclick={() => editor.setLayer(layer.id)}
      >
        <span class={layerDotClass} style={`background: ${layer.color}`} aria-hidden="true"></span>
        <span>{layer.name}</span>
      </Button>
    {/each}
  </div>

  {#if allowAdd}
    <Button
      variant="ghost"
      size="sm"
      class="add-layer h-kb-34 flex-none gap-kb-6 rounded-md px-kb-12 font-mono text-[11px] tracking-[0.04em] @max-[640px]/editor-main:px-kb-8"
      title="Add transparent layer"
      aria-label="Add transparent layer"
      onclick={() => editor.addLayer()}
    >
      <Plus size={14} aria-hidden="true" />
      <span class="max-[520px]:hidden @max-[640px]/editor-main:hidden">Layer</span>
    </Button>
  {/if}
</div>
