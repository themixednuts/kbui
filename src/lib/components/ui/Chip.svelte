<script lang="ts">
  import type { Snippet } from "svelte";

  import { Badge } from "./badge/index.js";
  import { cn } from "$lib/utils.js";
  import type { ChipTone } from "./types";

  type Props = {
    tone?: ChipTone;
    /** Inline color for the leading dot. Pass a CSS color or a CSS var like `var(--color-teal)`. */
    dot?: string;
    title?: string;
    class?: string;
    children?: Snippet;
  };

  let { tone = "neutral", dot, title, class: extra = "", children }: Props = $props();

  const toneClass = $derived(
    tone === "success"
      ? "border-[oklch(0.62_0.16_150_/_0.36)] bg-[oklch(0.92_0.06_150)] text-[oklch(0.35_0.12_150)]"
      : tone === "error"
        ? "border-[oklch(0.62_0.2_25_/_0.36)] bg-[oklch(0.92_0.07_25)] text-[oklch(0.4_0.16_25)]"
        : tone === "warning"
          ? "border-[oklch(0.7_0.13_90_/_0.4)] bg-[oklch(0.95_0.08_90)] text-[oklch(0.4_0.13_90)]"
          : "border-line-2 bg-surface text-ink-2",
  );
</script>

<Badge
  variant="outline"
  {title}
  class={cn(
    "inline-flex min-h-[26px] items-center gap-[6px] overflow-hidden rounded-pill px-[10px] py-0.5 font-mono text-[11px] tracking-[0.04em] text-ellipsis whitespace-nowrap",
    toneClass,
    extra,
  )}
>
  {#if dot}
    <span class="block size-2 shrink-0 rounded-full" style="background: {dot}" aria-hidden="true"></span>
  {/if}
  {#if children}{@render children()}{/if}
</Badge>
