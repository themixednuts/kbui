<script lang="ts">
  import type { Snippet } from "svelte";

  import Button from "./Button.svelte";

  type Props = {
    compact?: boolean;
    href?: string;
    onclick?: () => void;
    label?: string;
    mark?: Snippet;
  };

  let { compact = false, href, onclick, label = "KBUI home" }: Props = $props();

  const className = $derived(
    compact
      ? "h-auto flex-none items-center border-0 bg-transparent p-0 text-ink no-underline shadow-none hover:bg-transparent hover:text-ink"
      : "h-auto flex-none items-center gap-[10px] border-0 bg-transparent p-0 text-ink font-mono text-[13px] font-semibold tracking-[0.08em] no-underline shadow-none hover:bg-transparent hover:text-ink",
  );
</script>

{#snippet brandMark()}
  <span
    class="brand-mark grid size-[34px] place-items-center rounded-[9px] bg-ink text-paper shadow-cap"
    aria-hidden="true"
  >
    <svg
      width="34"
      height="34"
      viewBox="0 0 28 28"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="kbui"
    >
      <rect
        x="1.6"
        y="1.6"
        width="24.8"
        height="24.8"
        rx="5.4"
        fill="none"
        stroke="currentColor"
        opacity="0.16"
        stroke-width="0.6"
      />
      <path
        d="M9 7 V21 M9 14 L20 7.5 M9 14 L20 20.5"
        stroke="currentColor"
        stroke-width="2.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        fill="none"
      />
      <circle cx="21.4" cy="6.6" r="1.3" fill="var(--color-coral)" />
    </svg>
  </span>
  {#if !compact}<span class="whitespace-nowrap max-[720px]:hidden">KBUI</span>{/if}
{/snippet}

<Button
  {href}
  type="button"
  variant="ghost"
  data-sveltekit-preload-data={href ? "hover" : undefined}
  class={className}
  aria-label={label}
  {onclick}
>
  {@render brandMark()}
</Button>
