<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLAnchorAttributes, HTMLButtonAttributes } from "svelte/elements";

  import { Button as ShadcnButton } from "./button/index.js";
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

  const shadcnSize = $derived(size === "md" ? "default" : size);
</script>

<ShadcnButton {href} {type} {variant} size={shadcnSize} class={extra} {...rest}>
  {#if children}{@render children()}{/if}
</ShadcnButton>
