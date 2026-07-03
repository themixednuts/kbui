<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";

  import { Button as ShadcnButton } from "./button/index.js";
  import { cn } from "$lib/utils.js";
  import type { ButtonSize, ButtonVariant } from "./types";

  type Props = {
    variant?: ButtonVariant;
    size?: ButtonSize;
    class?: string;
    href?: string;
    children?: Snippet;
  } & Omit<HTMLButtonAttributes, "class"> &
    Omit<HTMLAnchorAttributes, "class">;

  let {
    variant = "solid",
    size = "md",
    class: extra = "",
    href,
    children,
    type = "button",
    ...rest
  }: Props = $props();

  const shadcnSize = $derived(size === "sm" ? "sm" : size === "icon" ? "icon-sm" : "default");
  const shadcnVariant = $derived(variant === "ghost" ? "outline" : "default");

  const toneClass = $derived(
    variant === "coral"
      ? "rounded-pill border-coral bg-coral text-[#1c0a04] hover:bg-[oklch(0.68_0.18_30)]"
      : variant === "solid"
        ? "rounded-pill border-ink bg-ink text-paper hover:bg-[#2a2624]"
        : "rounded-pill border-line-2 bg-transparent text-ink hover:border-ink/40 hover:bg-paper-2",
  );

  const sizeClass = $derived(
    size === "sm"
      ? "h-[28px] gap-[5px] px-[10px] text-xs"
      : size === "icon"
        ? "size-8 p-0"
        : "h-[34px] px-[14px] text-[13px]",
  );
</script>

<ShadcnButton {href} {type} variant={shadcnVariant} size={shadcnSize} class={cn(toneClass, sizeClass, extra)} {...rest}>
  {#if children}{@render children()}{/if}
</ShadcnButton>
