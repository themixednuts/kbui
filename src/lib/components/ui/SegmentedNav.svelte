<script lang="ts" generics="TValue extends string">
  import type { SegmentItem } from "./types";
  type Props = {
    items: SegmentItem<TValue>[];
    value: TValue;
    /** Used when items omit `href` (e.g. in-page tabs). */
    onselect?: (next: TValue) => void;
    /** Hide labels when the segment is below this width. Defaults to never. */
    iconOnlyAt?: "sm" | "md" | "topbar";
    ariaLabel?: string;
    /** Optional extra class — useful for legacy test selectors (e.g. `view-seg`). */
    class?: string;
  };

  let {
    items,
    value,
    onselect,
    iconOnlyAt,
    ariaLabel = "Workspace views",
    class: extra = "",
  }: Props = $props();

  const iconOnly = $derived(
    iconOnlyAt === "sm"
      ? "[&_[data-label]]:max-md:hidden"
      : iconOnlyAt === "md"
        ? "[&_[data-label]]:max-lg:hidden"
        : iconOnlyAt === "topbar"
          ? "[&_[data-label]]:max-[1180px]:hidden"
          : "",
  );
</script>

<nav
  class="seg inline-flex items-center gap-[2px] p-[3px] rounded-pill bg-paper-2 flex-none {iconOnly} {extra}"
  aria-label={ariaLabel}
>
  {#each items as item (item.value)}
    {@const Icon = item.icon}
    {@const active = item.value === value}
    {#if item.href}
      <a
        href={item.href}
        data-testid={item.testid}
        data-sveltekit-preload-data="hover"
        class="inline-flex items-center justify-center gap-[6px] h-[28px] px-[14px] rounded-pill font-mono text-xs tracking-[0.04em] whitespace-nowrap transition-colors no-underline"
        class:active
        class:text-ink={active}
        class:bg-paper={active}
        class:shadow-card={active}
        class:text-ink-2={!active}
        aria-current={active ? "page" : undefined}
        title={item.title ?? item.label}
      >
        {#if Icon}<span class="contents pointer-events-none"><Icon size={14} /></span>{/if}
        <span data-label class="pointer-events-none">{item.label}</span>
      </a>
    {:else}
      <button
        type="button"
        data-testid={item.testid}
        class="inline-flex items-center justify-center gap-[6px] h-[28px] px-[14px] rounded-pill font-mono text-xs tracking-[0.04em] whitespace-nowrap transition-colors"
        class:active
        class:text-ink={active}
        class:bg-paper={active}
        class:shadow-card={active}
        class:text-ink-2={!active}
        title={item.title ?? item.label}
        onclick={() => onselect?.(item.value)}
      >
        {#if Icon}<span class="contents pointer-events-none"><Icon size={14} /></span>{/if}
        <span data-label class="pointer-events-none">{item.label}</span>
      </button>
    {/if}
  {/each}
</nav>
