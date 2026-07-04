<script lang="ts">
  import { CheckCircle2, Eye, GitFork, Heart, Keyboard, Layers, ShieldCheck } from "@lucide/svelte";

  import { Button, Chip } from "$lib/components/ui";
  import type { CommunityKeymapCard } from "$lib/community/types";

  interface Props {
    card: CommunityKeymapCard;
    onpreview: (id: string) => void;
    ontag?: (tag: string) => void;
  }

  let { card, onpreview, ontag }: Props = $props();

  const cells = $derived(previewCells(card));
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

<article class="community-card">
  <button type="button" class="preview-plane" aria-label={`Preview ${card.title}`} onclick={() => onpreview(card.id)}>
    <span class="preview-grid" style={`--cols: ${cells[0]?.length ?? 1}`}>
      {#each cells as row, rowIndex (`row-${card.id}-${rowIndex}`)}
        {#each row as cell (cell.id)}
          <span class="preview-key" class:lit={Boolean(cell.color)} style={cell.color ? `--key-c: ${cell.color}` : ""}></span>
        {/each}
      {/each}
    </span>
  </button>

  <div class="card-body">
    <div class="title-row">
      <h3>{card.title}</h3>
      {#if card.official}
        <Chip tone="warning" title="Official seed map">
          <ShieldCheck size={13} aria-hidden="true" />
          Official
        </Chip>
      {/if}
    </div>

    <div class="author-row">
      <span class="avatar" aria-hidden="true">{initials}</span>
      <span>{authorLabel}</span>
      <span class="dot" aria-hidden="true"></span>
      <span>{card.boardName}</span>
    </div>

    <p>{card.note}</p>

    <div class="tag-row" aria-label="Tags">
      {#each card.tags as tag (tag)}
        <button type="button" class="tag" onclick={() => ontag?.(tag)}>#{tag}</button>
      {/each}
    </div>

    <div class="signal-row" aria-label="Community signals">
      <span title={`${card.layersCount} layers`}>
        <Layers size={13} aria-hidden="true" />
        {card.layersCount}
      </span>
      <span class:liked={card.likedByViewer} title={`${card.likesCount} likes`}>
        <Heart size={13} aria-hidden="true" />
        {formatCount(card.likesCount)}
      </span>
      <span title={`${card.adoptionsCount} adoptions`}>
        <GitFork size={13} aria-hidden="true" />
        {formatCount(card.adoptionsCount)}
      </span>
      {#if card.compileVerified}
        <span class="verified" title="Demo compile verified">
          <CheckCircle2 size={13} aria-hidden="true" />
          compiles
        </span>
      {/if}
      <span title={`${card.keyCount} keys`}>
        <Keyboard size={13} aria-hidden="true" />
        {card.keyCount}
      </span>
    </div>

    <Button variant="ghost" size="sm" class="preview-action" onclick={() => onpreview(card.id)}>
      <Eye size={14} aria-hidden="true" />
      Preview
    </Button>
  </div>
</article>

<style>
  .community-card {
    display: grid;
    grid-template-rows: 132px minmax(0, 1fr);
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--line-2);
    border-radius: 8px;
    background: var(--surface);
    box-shadow: var(--shadow-card);
  }

  .preview-plane {
    display: grid;
    min-width: 0;
    min-height: 0;
    place-items: center;
    padding: 16px;
    border-bottom: 1px solid var(--line);
    background:
      linear-gradient(to right, oklch(0.13 0.01 60 / 0.045) 1px, transparent 1px),
      linear-gradient(to bottom, oklch(0.13 0.01 60 / 0.045) 1px, transparent 1px),
      color-mix(in oklch, var(--paper-2) 76%, var(--surface));
    background-size: 18px 18px;
  }

  .preview-plane:hover .preview-key.lit {
    transform: translateY(-1px);
  }

  .preview-grid {
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(4px, 1fr));
    gap: 3px;
    width: min(100%, 320px);
  }

  .preview-key {
    aspect-ratio: 1.45;
    min-width: 0;
    border: 1px solid rgba(24, 22, 20, 0.12);
    border-radius: 4px;
    background: linear-gradient(180deg, #fffdf7 0%, #e9dfca 100%);
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.12);
    transition: transform var(--dur-fast) var(--ease-out-soft);
  }

  .preview-key.lit {
    border-color: color-mix(in oklch, var(--key-c) 60%, rgba(24, 22, 20, 0.14));
    background: color-mix(in oklch, var(--key-c) 54%, #fffdf7);
  }

  .card-body {
    display: grid;
    gap: 10px;
    min-width: 0;
    padding: 14px;
  }

  .title-row {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    min-width: 0;
  }

  h3 {
    flex: 1;
    min-width: 0;
    margin: 0;
    overflow: hidden;
    font-family: var(--mono);
    font-size: 14px;
    font-weight: 700;
    line-height: 1.25;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .author-row {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 11px;
  }

  .author-row span:not(.avatar, .dot) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .avatar {
    display: grid;
    width: 24px;
    height: 24px;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid color-mix(in oklch, var(--coral) 42%, var(--line-2));
    border-radius: 7px;
    color: #1c0a04;
    background: var(--coral);
    font-size: 9px;
    font-weight: 700;
  }

  .dot {
    width: 3px;
    height: 3px;
    flex: 0 0 auto;
    border-radius: 999px;
    background: var(--ink-3);
  }

  p {
    display: -webkit-box;
    min-height: 38px;
    margin: 0;
    overflow: hidden;
    color: var(--ink-2);
    font-size: 12px;
    line-height: 1.45;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .tag-row {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .tag {
    min-height: 24px;
    padding: 0 8px;
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--ink-2);
    background: var(--paper-2);
    font-family: var(--mono);
    font-size: 10px;
  }

  .signal-row {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    color: var(--ink-2);
    font-family: var(--mono);
    font-size: 10px;
  }

  .signal-row span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 22px;
  }

  .signal-row .verified {
    color: oklch(0.35 0.12 150);
  }

  .signal-row .liked {
    color: var(--coral-ink);
  }

  :global(.preview-action) {
    justify-self: start;
  }
</style>
