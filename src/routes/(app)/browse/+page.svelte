<script lang="ts">
  import { Clock3, GitFork, Heart, Search } from "@lucide/svelte";

  import { getWorkbenchContext } from "$lib/app/workbench-store.svelte";
  import CommunityKeymapCard from "$lib/components/browse/CommunityKeymapCard.svelte";
  import CommunityPreviewModal from "$lib/components/browse/CommunityPreviewModal.svelte";
  import { Button, Chip, SegmentedNav } from "$lib/components/ui";
  import { Switch } from "$lib/components/ui/switch/index.js";
  import { untrack } from "svelte";
  import type {
    CommunityKeymapCard as CommunityKeymapCardDto,
    CommunityKeymapDetail,
    CommunityKeymapListInput,
    CommunityKeymapSort,
  } from "$lib/community/types";
  import type { SegmentItem } from "$lib/components/ui/types";

  import type { PageData } from "./$types";
  import { getCommunityKeymap, listCommunityKeymaps } from "./community.remote";

  let { data }: { data: PageData } = $props();

  const workbench = getWorkbenchContext();
  const sortItems: SegmentItem<CommunityKeymapSort>[] = [
    { value: "likes", label: "Likes", title: "Sort by likes", icon: Heart },
    { value: "new", label: "New", title: "Sort by newest", icon: Clock3 },
    { value: "adoptions", label: "Adoptions", title: "Sort by adoptions", icon: GitFork },
  ];

  const initialCards = untrack(() => data.initialCards);

  let cards = $state<CommunityKeymapCardDto[]>(initialCards);
  let tagBank = $state(uniqueTags(initialCards));
  let activeTag = $state<string | undefined>();
  let search = $state("");
  let sort = $state<CommunityKeymapSort>("likes");
  let compatibleOnly = $state(false);
  let officialOnly = $state(false);
  let loading = $state(false);
  let listError = $state<string | null>(null);
  let selectedId = $state<string | null>(null);
  let selectedDetail = $state<CommunityKeymapDetail | null>(null);
  let detailLoading = $state(false);
  let detailError = $state<string | null>(null);

  const currentBoardName = $derived(workbench.profile.name);
  const listInput = $derived.by((): CommunityKeymapListInput => {
    const input: CommunityKeymapListInput = {
      sort,
      limit: 24,
    };
    const trimmedSearch = search.trim();
    if (activeTag) input.tag = activeTag;
    if (trimmedSearch) input.search = trimmedSearch;
    if (officialOnly) input.officialOnly = true;
    if (compatibleOnly) {
      input.compatibleWithCatalogId = workbench.profile.id;
      input.vendorId = workbench.profile.vendorId;
      input.productId = workbench.profile.productId;
    }
    return input;
  });
  const listKey = $derived(JSON.stringify(listInput));
  const resultCopy = $derived(
    loading
      ? "Loading community maps"
      : `${cards.length} ${cards.length === 1 ? "map" : "maps"}`,
  );

  let lastListKey = $state(JSON.stringify({ sort: "likes", limit: 24 }));

  $effect(() => {
    if (listKey === lastListKey) return;
    lastListKey = listKey;
    void refreshList(listInput, listKey);
  });

  async function refreshList(input: CommunityKeymapListInput, requestKey: string) {
    loading = true;
    listError = null;
    try {
      const next = await listCommunityKeymaps(input);
      if (lastListKey !== requestKey) return;
      cards = next;
      tagBank = uniqueTags([...cards, ...tagBank.map(tagToSyntheticCard)]);
    } catch (error) {
      if (lastListKey !== requestKey) return;
      listError = error instanceof Error ? error.message : "Community catalog could not be loaded.";
    } finally {
      if (lastListKey === requestKey) loading = false;
    }
  }

  async function openPreview(id: string) {
    selectedId = id;
    selectedDetail = null;
    detailError = null;
    detailLoading = true;

    try {
      const detail = await getCommunityKeymap(id);
      if (selectedId !== id) return;
      if (!detail) {
        detailError = "This community keymap is no longer available.";
        return;
      }
      selectedDetail = detail;
    } catch (error) {
      if (selectedId !== id) return;
      detailError = error instanceof Error ? error.message : "Community preview could not be loaded.";
    } finally {
      if (selectedId === id) detailLoading = false;
    }
  }

  function closePreview() {
    selectedId = null;
    selectedDetail = null;
    detailError = null;
    detailLoading = false;
  }

  function setTag(tag: string | undefined) {
    activeTag = tag;
  }

  function clearFilters() {
    activeTag = undefined;
    search = "";
    compatibleOnly = false;
    officialOnly = false;
    sort = "likes";
  }

  function uniqueTags(source: readonly Pick<CommunityKeymapCardDto, "tags">[]): string[] {
    return Array.from(new Set(source.flatMap((card) => card.tags))).sort((left, right) =>
      left.localeCompare(right),
    );
  }

  function tagToSyntheticCard(tag: string): Pick<CommunityKeymapCardDto, "tags"> {
    return { tags: [tag] };
  }
</script>

<section class="browse-route">
  <div class="browse-shell">
    <header class="browse-header">
      <div class="headline">
        <span>Community</span>
        <h2>Browse keymaps</h2>
      </div>

      <div class="search-box">
        <span class="search-icon" aria-hidden="true"><Search size={15} /></span>
        <input
          type="search"
          placeholder="Search title, author, board, tag"
          bind:value={search}
          aria-label="Search community keymaps"
        />
      </div>
    </header>

    <section class="filter-panel" aria-label="Browse filters">
      <div class="tag-strip" aria-label="Tag filters">
        <button
          type="button"
          class:active={!activeTag}
          aria-pressed={!activeTag}
          onclick={() => setTag(undefined)}
        >
          All
        </button>
        {#each tagBank as tag (tag)}
          <button
            type="button"
            class:active={activeTag === tag}
            aria-pressed={activeTag === tag}
            onclick={() => setTag(activeTag === tag ? undefined : tag)}
          >
            #{tag}
          </button>
        {/each}
      </div>

      <div class="filter-row">
        <label class="toggle-filter">
          <Switch bind:checked={compatibleOnly} size="sm" aria-label="Compatible with my board" />
          <span>Compatible with {currentBoardName}</span>
        </label>

        <button
          type="button"
          class="official-filter"
          class:active={officialOnly}
          aria-pressed={officialOnly}
          onclick={() => (officialOnly = !officialOnly)}
        >
          Official only
        </button>

        <div class="sort-control">
          <span>Sort</span>
          <SegmentedNav
            items={sortItems}
            value={sort}
            onselect={(next) => (sort = next)}
            ariaLabel="Community keymap sort"
          />
        </div>

        <Chip title="Current result count">{resultCopy}</Chip>
      </div>
    </section>

    {#if listError}
      <div class="list-error" role="status">
        <span class="material-symbols-outlined" aria-hidden="true">warning</span>
        {listError}
        <Button variant="ghost" size="sm" onclick={() => refreshList(listInput, listKey)}>Retry</Button>
      </div>
    {/if}

    {#if cards.length === 0 && !loading}
      <div class="empty-panel">
        <span class="material-symbols-outlined" aria-hidden="true">explore_off</span>
        <strong>No matching keymaps</strong>
        <Button variant="ghost" size="sm" onclick={clearFilters}>Clear filters</Button>
      </div>
    {:else}
      <div class="card-grid" aria-busy={loading}>
        {#each cards as card (card.id)}
          <CommunityKeymapCard {card} onpreview={openPreview} ontag={setTag} />
        {/each}
      </div>
    {/if}
  </div>
</section>

{#if selectedId}
  <CommunityPreviewModal
    detail={selectedDetail}
    loading={detailLoading}
    error={detailError}
    onclose={closePreview}
  />
{/if}

<style>
  .browse-route {
    min-height: calc(100vh - 58px);
    padding: 22px;
    background:
      radial-gradient(ellipse 82% 52% at 84% 0%, color-mix(in oklch, var(--coral) 8%, transparent), transparent 64%),
      radial-gradient(ellipse 70% 44% at 0% 16%, color-mix(in oklch, var(--teal) 8%, transparent), transparent 62%),
      var(--paper);
  }

  .browse-shell {
    display: grid;
    gap: 16px;
    min-width: 0;
  }

  .browse-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 420px);
    gap: 16px;
    align-items: end;
  }

  .headline {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .headline span,
  .sort-control > span {
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h2 {
    margin: 0;
    font-size: 30px;
    line-height: 1.1;
  }

  .search-box {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr);
    gap: 8px;
    align-items: center;
    min-width: 0;
    height: 38px;
    padding: 0 12px;
    border: 1px solid var(--line-2);
    border-radius: 8px;
    background: var(--surface);
    box-shadow: var(--shadow-card);
  }

  .search-icon {
    display: grid;
    place-items: center;
    color: var(--ink-3);
  }

  .search-box input {
    min-width: 0;
    border: 0;
    outline: 0;
    color: var(--ink);
    background: transparent;
    font-size: 13px;
  }

  .search-box input::placeholder {
    color: var(--ink-3);
  }

  .filter-panel {
    display: grid;
    gap: 10px;
    min-width: 0;
    padding: 12px;
    border: 1px solid var(--line-2);
    border-radius: 8px;
    background: color-mix(in oklch, var(--surface) 86%, transparent);
    box-shadow: var(--shadow-card);
  }

  .tag-strip,
  .filter-row {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
    min-width: 0;
  }

  .tag-strip button,
  .official-filter {
    min-height: 28px;
    padding: 0 10px;
    border: 1px solid var(--line);
    border-radius: 999px;
    color: var(--ink-2);
    background: var(--paper-2);
    font-family: var(--mono);
    font-size: 11px;
  }

  .tag-strip button:hover,
  .official-filter:hover {
    border-color: var(--line-2);
    color: var(--ink);
  }

  .tag-strip button.active,
  .official-filter.active {
    border-color: color-mix(in oklch, var(--coral) 55%, var(--line-2));
    color: #1c0a04;
    background: var(--coral);
  }

  .toggle-filter {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 30px;
    color: var(--ink-2);
    font-family: var(--mono);
    font-size: 11px;
  }

  .sort-control {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
  }

  .list-error {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 44px;
    padding: 10px 12px;
    border: 1px solid oklch(0.62 0.2 25 / 0.32);
    border-radius: 8px;
    color: oklch(0.42 0.15 25);
    background: oklch(0.95 0.04 25);
    font-size: 12px;
  }

  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 14px;
    min-width: 0;
  }

  .card-grid[aria-busy="true"] {
    opacity: 0.62;
  }

  .empty-panel {
    display: grid;
    min-height: 260px;
    place-items: center;
    align-content: center;
    gap: 10px;
    border: 1px dashed var(--line-2);
    border-radius: 8px;
    color: var(--ink-3);
    background: color-mix(in oklch, var(--surface) 64%, transparent);
    font-family: var(--mono);
    font-size: 12px;
  }

  .empty-panel .material-symbols-outlined {
    font-size: 28px;
  }

  @media (max-width: 940px) {
    .browse-header {
      grid-template-columns: minmax(0, 1fr);
    }

    .sort-control {
      width: 100%;
      margin-left: 0;
      justify-content: space-between;
    }
  }

  @media (max-width: 640px) {
    .browse-route {
      padding: 12px;
    }

    .filter-row {
      align-items: flex-start;
    }

    .sort-control {
      align-items: flex-start;
      flex-direction: column;
    }

    .card-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
