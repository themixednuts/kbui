<script lang="ts">
  import { GitBranch } from "@lucide/svelte";

  import type { EditorStore } from "$lib/app/editor-store.svelte";
  import Chip from "$lib/components/ui/Chip.svelte";
  import { cn } from "$lib/utils.js";

  type Props = {
    editor: EditorStore;
  };

  let { editor }: Props = $props();

  const metaTextClass = "font-mono text-[10px] tracking-[0.1em] text-ink-3 uppercase";
  const activeStackCardClass =
    "active-stack-card grid gap-kb-10 rounded-[10px] border border-line bg-[color-mix(in_oklch,var(--surface)_76%,transparent)] px-kb-16 py-kb-13 shadow-card";
</script>

<section class={activeStackCardClass} aria-label="Active layer stack">
  <header class="flex min-w-0 items-baseline justify-between gap-kb-12 max-[680px]:grid">
    <div class="min-w-0">
      <span class={cn("eyebrow", metaTextClass)}>Active layer stack</span>
      <strong class="mt-kb-2 block text-[13px]">{editor.activeLayerRecord?.name ?? "Layer"}</strong>
    </div>
    <span class={cn("stack-id overflow-hidden text-ellipsis whitespace-nowrap", metaTextClass)}>{editor.activeStack.map((layer) => layer.name).join(" / ")}</span>
  </header>

  <div class="stack-body flex flex-wrap items-center gap-kb-8">
    {#each editor.activeStack as layer (layer.id)}
      <Chip dot={layer.color}>{layer.name}</Chip>
    {/each}
    <span class="inherit-note ml-auto inline-flex items-center gap-kb-6 font-mono text-[10px] tracking-[0.04em] text-ink-3 max-[680px]:ml-0 max-[680px]:w-full">
      <GitBranch size={13} aria-hidden="true" />
      Hatched keys inherit from below
    </span>
  </div>
</section>
