<script lang="ts">
  import type { Snippet } from "svelte";

  type Props = {
    href?: string;
    onclick?: () => void;
    label?: string;
    mark?: Snippet;
  };

  let { href, onclick, label = "Klakson home" }: Props = $props();

  const className =
    "inline-flex items-center gap-[10px] flex-none text-ink font-mono text-[13px] font-semibold tracking-[0.08em] no-underline";
</script>

{#snippet brandMark()}
  <span
    class="brand-mark grid place-items-center w-[28px] h-[28px] rounded-[7px] bg-coral shadow-cap"
    aria-hidden="true"
  >
    <svg
      width="28"
      height="28"
      viewBox="0 0 28 28"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Klakson"
    >
      <rect
        x="1.6"
        y="1.6"
        width="24.8"
        height="24.8"
        rx="5.4"
        fill="none"
        stroke="rgba(28, 10, 4, 0.16)"
        stroke-width="0.6"
      />
      <path
        d="M9 7 V21 M9 14 L20 7.5 M9 14 L20 20.5"
        stroke="#1c0a04"
        stroke-width="2.6"
        stroke-linecap="round"
        stroke-linejoin="round"
        fill="none"
      />
      <circle cx="21.4" cy="6.6" r="1.3" fill="var(--color-mint)" />
    </svg>
  </span>
  <span class="whitespace-nowrap max-[720px]:hidden">KLAKSON</span>
{/snippet}

{#if href}
  <a {href} data-sveltekit-preload-data="hover" class={className} aria-label={label} {onclick}>
    {@render brandMark()}
  </a>
{:else}
  <button type="button" class={className} aria-label={label} {onclick}>
    {@render brandMark()}
  </button>
{/if}
