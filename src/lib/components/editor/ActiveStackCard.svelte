<script lang="ts">
  import { GitBranch } from "@lucide/svelte";

  import type { EditorStore } from "$lib/app/editor-store.svelte";
  import Chip from "$lib/components/ui/Chip.svelte";
  import { cn } from "$lib/utils.js";

  type Props = {
    editor: EditorStore;
  };

  let { editor }: Props = $props();

  const metaTextClass = "font-mono text-[10px] leading-normal tracking-[0.1em] text-ink-3 uppercase";
  const activeStackCardClass =
    "active-stack-card grid min-w-0 gap-kb-8 border-t border-line bg-paper px-kb-20 py-kb-10 shadow-none @max-[640px]/editor-main:gap-kb-6 @max-[640px]/editor-main:px-kb-12 @max-[640px]/editor-main:py-kb-8";
  const inheritNoteClass =
    "inherit-note ml-auto inline-flex min-h-kb-16 min-w-0 shrink items-center gap-kb-6 py-kb-2 font-mono text-[10px] leading-normal tracking-[0.04em] text-ink-3";
</script>

<section class={activeStackCardClass} aria-label="Active layer stack">
  <header class="flex min-w-0 items-baseline justify-between gap-kb-12">
    <div class="min-w-0">
      <span class={cn("eyebrow", metaTextClass)}>Active layer stack</span>
      <strong class="mt-kb-2 block text-[13px] leading-tight">{editor.activeLayerRecord?.name ?? "Layer"}</strong>
    </div>
    <span
      class={cn(
        "stack-id overflow-hidden text-ellipsis whitespace-nowrap",
        metaTextClass,
        "@max-[520px]/editor-main:hidden",
      )}>{editor.activeStack.map((layer) => layer.name).join(" / ")}</span
    >
  </header>

  <div
    class="stack-body flex min-w-0 flex-nowrap items-center gap-kb-8 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
  >
    {#each editor.activeStack as layer (layer.id)}
      <Chip dot={layer.color}>{layer.name}</Chip>
    {/each}
    <span class={inheritNoteClass} title="Hatched keys inherit from below">
      <span class="flex-none" aria-hidden="true"><GitBranch size={13} /></span>
      <span class="min-w-0 truncate">Hatched keys inherit from below</span>
    </span>
  </div>
</section>
