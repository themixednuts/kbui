<script lang="ts">
  import type { Snippet } from "svelte";

  import Button from "./Button.svelte";
  import { cn } from "$lib/utils.js";

  type Props = {
    /** When true, uses the coral accent style for "sign in" CTA. */
    cta?: boolean;
    title?: string;
    ariaLabel?: string;
    onclick?: () => void;
    image?: string | null;
    initials?: string;
    children?: Snippet;
    testid?: string;
  };

  let {
    cta = false,
    title,
    ariaLabel,
    onclick,
    image,
    initials,
    children,
    testid,
  }: Props = $props();
</script>

<Button
  variant={cta ? "coral" : "ghost"}
  size="icon"
  type="button"
  data-testid={testid}
  aria-label={ariaLabel}
  {title}
  {onclick}
  class={cn(
    "size-[34px] overflow-hidden rounded-pill border border-line-2 bg-surface p-0 font-mono text-[11px] font-bold shadow-card",
    !cta && "text-ink hover:border-ink",
  )}
>
  {#if image}
    <img class="size-full object-cover" src={image} alt="" />
  {:else if initials}
    <span>{initials}</span>
  {:else if children}
    {@render children()}
  {/if}
</Button>
