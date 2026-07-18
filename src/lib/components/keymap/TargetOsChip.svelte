<script lang="ts">
  import { labels, type TargetOS } from "$lib/app/services/target-os";
  import Button from "$lib/components/ui/Button.svelte";
  import { cn } from "$lib/utils.js";

  type Props = {
    value: TargetOS;
    onclick?: () => void;
  };

  let { value, onclick }: Props = $props();

  const label = $derived(labels[value]);
</script>

<Button
  variant="ghost"
  size="icon"
  type="button"
  class={cn(
    "os-chip size-kb-34 flex-none rounded-md border-line-2 bg-surface p-0 text-ink-2 shadow-card hover:border-ink-3 hover:bg-surface-2 hover:text-ink",
    "data-[os=mac]:border-[color-mix(in_oklch,var(--mint)_35%,var(--line-2))] data-[os=win]:border-[color-mix(in_oklch,var(--teal)_30%,var(--line-2))] data-[os=linux]:border-[color-mix(in_oklch,var(--mustard)_35%,var(--line-2))]",
    "[&_.os-logo]:block [&_.os-logo]:size-[15px]",
  )}
  data-os={value}
  title={`Shortcut labels match ${label}. Click to cycle (or open Settings for more).`}
  aria-label={`Target OS: ${label}. Click to change.`}
  {onclick}
>
  {#if value === "win"}
    <svg class="os-logo" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 5.5 10 4.5v7.5H3V5.5zm0 8.5h7V21L3 19.8V14zm8.5-9.3L22 3v8.5h-9.5V5.2zm0 8.8H22V21l-10.5-1.8V14z"
      />
    </svg>
  {:else if value === "mac"}
    <svg class="os-logo" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
      />
    </svg>
  {:else}
    <svg class="os-logo" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2.5c-2.1 0-3.8 1.6-3.8 3.6 0 .8.3 1.5.7 2.1-1.2.9-2 2.3-2 3.9v3.4c0 2.3 2.2 4.1 5.1 4.1s5.1-1.8 5.1-4.1v-3.4c0-1.6-.8-3-2-3.9.4-.6.7-1.3.7-2.1 0-2-1.7-3.6-3.8-3.6zm-1.2 9.8a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2zm2.4 0a1.1 1.1 0 1 1 0-2.2 1.1 1.1 0 0 1 0 2.2z"
      />
    </svg>
  {/if}
</Button>
