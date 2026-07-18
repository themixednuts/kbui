<script lang="ts">
  import { Plus } from "@lucide/svelte";

  import type { EditorStore } from "$lib/app/editor-store.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import { cn } from "$lib/utils.js";

  type Props = {
    editor: EditorStore;
  };

  let { editor }: Props = $props();

  const layerStackClass =
    "layer-stack flex min-w-0 items-center gap-kb-8 max-[760px]:flex-col max-[760px]:items-start";
  const layerButtonsClass = "layer-buttons flex min-w-0 flex-wrap gap-kb-8";
  const layerButtonClass =
    "layer-button h-[36px] min-w-[74px] gap-kb-8 rounded-md border-line-2 bg-surface px-kb-15 py-0 [font-family:var(--mono)] text-kb-12 font-strong text-ink-2 shadow-card transition-[background,border-color,color,transform] duration-[var(--dur-fast)] ease-[var(--ease-out-soft)] hover:-translate-y-px hover:border-line-2 hover:bg-surface-2 hover:text-ink max-[760px]:h-[32px] max-[760px]:min-w-[66px] max-[760px]:px-kb-12";
  const activeLayerButtonClass =
    "active border-ink bg-ink text-paper hover:border-ink hover:bg-ink hover:text-paper [&_.layer-dot]:shadow-[0_0_0_2px_color-mix(in_oklch,currentColor_16%,transparent)]";
  const layerDotClass =
    "layer-dot h-kb-12 w-kb-12 flex-none rounded-[4px] shadow-[inset_0_0_0_1px_rgba(24,22,20,0.12)]";
</script>

<div class={layerStackClass} aria-label="Keyboard layers">
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

  <Button variant="ghost" size="sm" class="add-layer flex-none" title="Add transparent layer" onclick={() => editor.addLayer()}>
    <Plus size={14} aria-hidden="true" />
    Layer
  </Button>
</div>
