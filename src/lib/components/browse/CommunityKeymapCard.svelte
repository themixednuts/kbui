<script lang="ts">
  import { Eye, GitFork, Heart, Keyboard, Layers, ShieldCheck } from "@lucide/svelte";

  import { Button, Chip } from "$lib/components/ui";
  import type { CommunityKeymapCard } from "$lib/community/types";
  import { cn } from "$lib/utils.js";

  interface Props {
    card: CommunityKeymapCard;
    onpreview: (id: string) => void;
    ontag?: (tag: string) => void;
  }

  let { card, onpreview, ontag }: Props = $props();

  const communityCardClass =
    "community-card grid min-w-0 grid-rows-[132px_minmax(0,1fr)] overflow-hidden rounded-[8px] border border-line-2 bg-surface shadow-card";
  const previewPlaneClass =
    "preview-plane grid min-h-0 min-w-0 place-items-center border-b border-line bg-[linear-gradient(to_right,oklch(0.13_0.01_60_/_0.045)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0.13_0.01_60_/_0.045)_1px,transparent_1px),color-mix(in_oklch,var(--paper-2)_76%,var(--surface))] p-kb-16 [background-size:18px_18px] hover:[&_.preview-key.lit]:-translate-y-px";
  const previewGridClass =
    "preview-grid grid w-[min(100%,320px)] grid-cols-[repeat(var(--cols),minmax(4px,1fr))] gap-kb-3";
  const previewKeyClass =
    "preview-key aspect-[1.45] min-w-0 rounded-[4px] border border-[rgba(24,22,20,0.12)] bg-[linear-gradient(180deg,#fffdf7_0%,#e9dfca_100%)] shadow-[0_1px_0_rgba(0,0,0,0.12)] transition-transform duration-[var(--dur-fast)] ease-[var(--ease-out-soft)]";
  const previewKeyLitClass =
    "lit border-[color-mix(in_oklch,var(--key-c)_60%,rgba(24,22,20,0.14))] bg-[color-mix(in_oklch,var(--key-c)_54%,#fffdf7)]";
  const cardBodyClass = "card-body grid min-w-0 gap-kb-10 p-kb-14";
  const titleRowClass = "title-row flex min-w-0 items-start gap-kb-8";
  const titleClass =
    "m-0 min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[14px] leading-[1.25] font-bold";
  const authorRowClass = "author-row flex min-w-0 items-center gap-kb-7 font-mono text-kb-11 text-ink-3";
  const authorTextClass = "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap";
  const avatarClass =
    "avatar grid size-kb-24 shrink-0 place-items-center rounded-[7px] border border-[color-mix(in_oklch,var(--coral)_42%,var(--line-2))] bg-coral text-kb-9 font-bold text-[#1c0a04]";
  const dotClass = "dot size-[3px] shrink-0 rounded-pill bg-ink-3";
  const noteClass =
    "m-0 min-h-kb-38 overflow-hidden text-[12px] leading-[1.45] text-ink-2 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2] [line-clamp:2]";
  const tagRowClass = "tag-row flex flex-wrap gap-kb-5";
  const tagClass =
    "tag min-h-kb-24 rounded-pill border border-line bg-paper-2 px-kb-8 py-0 font-mono text-kb-10 text-ink-2";
  const signalRowClass = "signal-row flex flex-wrap gap-kb-7 font-mono text-kb-10 text-ink-2";
  const signalItemClass = "inline-flex min-h-kb-22 items-center gap-kb-4";

  const cells = $derived(previewCells(card));
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
</script>

<article class={communityCardClass}>
  <button type="button" class={previewPlaneClass} aria-label={`Preview ${card.title}`} onclick={() => onpreview(card.id)}>
    <span class={previewGridClass} style={`--cols: ${cells[0]?.length ?? 1}`}>
      {#each cells as row, rowIndex (`row-${card.id}-${rowIndex}`)}
        {#each row as cell (cell.id)}
          <span class={cn(previewKeyClass, cell.color && previewKeyLitClass)} style={cell.color ? `--key-c: ${cell.color}` : ""}></span>
        {/each}
      {/each}
    </span>
  </button>

  <div class={cardBodyClass}>
    <div class={titleRowClass}>
      <h3 class={titleClass}>{card.title}</h3>
      {#if isOfficial}
        <Chip tone="warning" title="First-party curated keymap">
          <ShieldCheck size={13} aria-hidden="true" />
          Official
        </Chip>
      {/if}
    </div>

    <div class={authorRowClass}>
      <span class={avatarClass} aria-hidden="true">{initials}</span>
      <span class={authorTextClass}>{authorLabel}</span>
      <span class={dotClass} aria-hidden="true"></span>
      <span class={authorTextClass}>{card.boardName}</span>
    </div>

    <p class={noteClass}>{card.note}</p>

    <div class={tagRowClass} aria-label="Tags">
      {#each card.tags as tag (tag)}
        <button type="button" class={tagClass} onclick={() => ontag?.(tag)}>#{tag}</button>
      {/each}
    </div>

    <div class={signalRowClass} aria-label="Community signals">
      <span class={signalItemClass} title={`${card.layersCount} layers`}>
        <Layers size={13} aria-hidden="true" />
        {card.layersCount}
      </span>
      <span class={cn(signalItemClass, card.likedByViewer && "liked text-coral-ink")} title={`${card.likesCount} likes`}>
        <Heart size={13} aria-hidden="true" />
        {formatCount(card.likesCount)}
      </span>
      <span class={signalItemClass} title={`${card.adoptionsCount} adoptions`}>
        <GitFork size={13} aria-hidden="true" />
        {formatCount(card.adoptionsCount)}
      </span>
      <span class={signalItemClass} title={`${card.keyCount} keys`}>
        <Keyboard size={13} aria-hidden="true" />
        {card.keyCount}
      </span>
    </div>

    <Button variant="ghost" size="sm" class="preview-action justify-self-start" onclick={() => onpreview(card.id)}>
      <Eye size={14} aria-hidden="true" />
      Preview
    </Button>
  </div>
</article>

