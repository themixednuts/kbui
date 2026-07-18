<script lang="ts">
  import { GitFork, Heart, ShieldCheck } from "@lucide/svelte";

  import { Button } from "$lib/components/ui";
  import type { CommunityKeymapCard } from "$lib/community/types";
  import { cn } from "$lib/utils.js";

  interface Props {
    card: CommunityKeymapCard;
    onpreview: (id: string) => void;
    ontag?: (tag: string) => void;
  }

  let { card, onpreview, ontag }: Props = $props();

  const communityCardClass =
    "community-card group relative grid min-w-0 grid-rows-[128px_minmax(0,1fr)] overflow-hidden rounded-lg border border-line bg-card text-left shadow-card transition-[border-color,box-shadow,transform] duration-[var(--dur-fast)] ease-[var(--ease-out-soft)] hover:-translate-y-px hover:border-line-2 hover:shadow-float focus-within:border-coral";
  const cardHitTargetClass =
    "card-hit-target absolute inset-0 z-[1] cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--focus-ring)]";
  const previewPlaneClass =
    "preview-plane pointer-events-none relative z-[2] grid min-h-0 min-w-0 place-items-center border-b border-line bg-stage p-kb-16 group-hover:[&_.preview-key.lit]:-translate-y-px";
  const previewGridClass =
    "preview-grid grid w-[min(100%,260px)] grid-cols-[repeat(var(--cols),minmax(4px,1fr))] gap-kb-3";
  const previewKeyClass =
    "preview-key aspect-square min-w-0 rounded-[3px] border border-line [background:var(--keycap-base)] shadow-[0_1px_0_rgba(0,0,0,0.14)] transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-soft)]";
  const previewKeyLitClass =
    "lit border-[color-mix(in_oklch,var(--key-c)_55%,var(--line-2))] [background:color-mix(in_oklch,var(--key-c)_58%,var(--surface))]";
  const cardBodyClass = "card-body pointer-events-none relative z-[2] grid min-w-0 gap-kb-8 p-kb-14";
  const titleRowClass = "title-row flex min-w-0 items-start gap-kb-8";
  const titleClass =
    "m-0 min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[14px] leading-[1.25] font-bold";
  const authorRowClass = "author-row flex min-w-0 items-center gap-kb-7 font-mono text-[11px] text-ink-3";
  const authorTextClass = "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap";
  const authorIdentityClass = "inline-flex min-w-0 items-center gap-kb-4 text-ink-2";
  const officialMarkClass = "inline-grid shrink-0 place-items-center text-ink-3";
  const avatarClass =
    "avatar grid size-kb-24 shrink-0 place-items-center rounded-md border border-[color-mix(in_oklch,var(--coral)_42%,var(--line-2))] bg-coral text-[9px] font-bold text-[#1c0a04]";
  const dotClass = "dot size-[3px] shrink-0 rounded-pill bg-ink-3";
  const noteClass =
    "m-0 overflow-hidden text-ellipsis whitespace-nowrap text-[12px] leading-[1.45] text-ink-2";
  const tagRowClass = "tag-row flex flex-wrap gap-kb-5";
  const tagClass =
    "tag pointer-events-auto h-kb-24 min-h-kb-24 rounded-pill border-line bg-paper-2 px-kb-8 py-0 font-mono text-[10px] text-ink-2 hover:border-line-2 hover:bg-paper-2 hover:text-ink";
  const signalRowClass = "signal-row flex flex-wrap gap-kb-7 font-mono text-[10px] text-ink-2";
  const signalItemClass = "inline-flex min-h-kb-22 items-center gap-kb-4";

  const cells = $derived(previewCells(card));
  const visibleTags = $derived(card.tags.slice(0, 2));
  const isOfficial = $derived(card.source === "official");
  const authorLabel = $derived(card.author.handle ? `@${card.author.handle}` : card.author.displayName);
  const initials = $derived(
    card.author.displayName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "K",
  );

  function formatCount(value: number) {
    if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
    return String(value);
  }

  function previewCells(map: CommunityKeymapCard) {
    const rows = Math.max(1, Math.min(map.matrixRows, 6));
    const cols = Math.max(1, Math.min(map.matrixCols, 16));
    return Array.from({ length: rows }, (_, row) =>
      Array.from({ length: cols }, (_, col) => ({
        id: `${row},${col}`,
        color: map.highlights[`${row},${col}`],
      })),
    );
  }

  function openCard() {
    onpreview(card.id);
  }

  function selectTag(tag: string) {
    ontag?.(tag);
  }
</script>

<article class={communityCardClass}>
  <button type="button" class={cardHitTargetClass} aria-label={`Open ${card.title}`} onclick={openCard}></button>
  <div class={previewPlaneClass} aria-hidden="true">
    <span class={previewGridClass} style={`--cols: ${cells[0]?.length ?? 1}`}>
      {#each cells as row, rowIndex (`row-${card.id}-${rowIndex}`)}
        {#each row as cell (cell.id)}
          <span class={cn(previewKeyClass, cell.color && previewKeyLitClass)} style={cell.color ? `--key-c: ${cell.color}` : ""}></span>
        {/each}
      {/each}
    </span>
  </div>

  <div class={cardBodyClass}>
    <div class={titleRowClass}>
      <h3 class={titleClass}>{card.title}</h3>
    </div>

    <div class={authorRowClass}>
      <span class={avatarClass} aria-hidden="true">{initials}</span>
      <span class={cn(authorTextClass, authorIdentityClass)}>
        {authorLabel}
        {#if isOfficial}
          <span class={officialMarkClass} aria-label="Official first-party layout" title="Official first-party layout">
            <ShieldCheck size={12} aria-hidden="true" />
          </span>
        {/if}
      </span>
      <span class={dotClass} aria-hidden="true"></span>
      <span class={authorTextClass}>{card.boardName}</span>
      <span class={dotClass} aria-hidden="true"></span>
      <span class="shrink-0 whitespace-nowrap">{card.layersCount} {card.layersCount === 1 ? "layer" : "layers"}</span>
    </div>

    <p class={noteClass}>{card.note}</p>

    <div class={tagRowClass} aria-label="Tags">
      {#each visibleTags as tag (tag)}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          class={tagClass}
          onclick={() => selectTag(tag)}
        >#{tag}</Button>
      {/each}
    </div>

    <div class={signalRowClass} aria-label="Community signals">
      <span class={cn(signalItemClass, card.likedByViewer && "liked text-coral-ink")} title={`${card.likesCount} likes`}>
        <Heart size={13} aria-hidden="true" />
        {formatCount(card.likesCount)}
      </span>
      <span class={signalItemClass} title={`${card.adoptionsCount} adoptions`}>
        <GitFork size={13} aria-hidden="true" />
        {formatCount(card.adoptionsCount)}
      </span>
    </div>
  </div>
</article>
