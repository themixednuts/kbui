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
    style?: string;
    class?: string;
    children?: Snippet;
  };

  let { tone = "neutral", dot, title, style, class: extra = "", children }: Props = $props();

  const badgeVariant = $derived(
    tone === "success"
      ? "success"
      : tone === "error"
        ? "error"
        : tone === "warning"
          ? "warning"
          : "neutral",
  );
</script>

<Badge
  variant={badgeVariant}
  {title}
  {style}
  class={cn(
    "inline-flex min-h-kb-24 items-center gap-kb-6 overflow-hidden rounded-pill px-kb-10 py-0.5 font-mono text-kb-11 text-ellipsis whitespace-nowrap",
    extra,
  )}
>
  {#if dot}
    <span class="block size-2 shrink-0 rounded-full" style="background: {dot}" aria-hidden="true"></span>
  {/if}
  {#if children}{@render children()}{/if}
</Badge>
