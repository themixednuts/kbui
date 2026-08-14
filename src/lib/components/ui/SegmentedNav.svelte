<script lang="ts" generics="TValue extends string">
  import { Button as ShadcnButton } from "./button/index.js";
  import type { SegmentItem } from "./types";
  import { cn } from "$lib/utils.js";
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
  class="seg inline-flex flex-none items-center gap-kb-2 rounded-md border border-line-2 bg-surface-3 p-kb-3 {iconOnly} {extra}"
  aria-label={ariaLabel}
>
  {#each items as item (item.value)}
    {@const Icon = item.icon}
    {@const active = item.value === value}
    <ShadcnButton
      href={item.href}
      variant={active ? "segment-active" : "segment"}
      size="sm"
      type="button"
      data-testid={item.testid}
      data-sveltekit-preload-data={item.href ? "hover" : undefined}
      class={cn(
        "flex-none rounded-sm px-kb-14 font-mono text-[11px] tracking-[0.04em] no-underline",
        active && "active",
      )}
      aria-current={item.href && active ? "page" : undefined}
      aria-pressed={!item.href ? active : undefined}
      title={item.title ?? item.label}
      onclick={item.href ? undefined : () => onselect?.(item.value)}
    >
      {#if Icon}<span class="contents pointer-events-none"><Icon size={14} /></span>{/if}
      <span data-label class="pointer-events-none">{item.label}</span>
    </ShadcnButton>
  {/each}
</nav>
