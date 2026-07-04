<script lang="ts">
  import { goto } from "$app/navigation";
  import { Clock3, GitFork, Heart, Search } from "@lucide/svelte";

  import { getShellContext } from "$lib/app/shell-store.svelte";
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
    CommunityReportReason,
    CommunityKeymapSort,
  } from "$lib/community/types";
  import type { SegmentItem } from "$lib/components/ui/types";
  import { decodeDeviceProfileFromStorage } from "$lib/keyboard/schema";
  import { newId } from "$lib/util/id";

  import type { PageData } from "./$types";
  import {
    adoptCommunityKeymap,
    getCommunityKeymap,
    likeCommunityKeymap,
    listCommunityKeymaps,
    reportCommunityKeymap,
    unlikeCommunityKeymap,
  } from "./community.remote";

  let { data }: { data: PageData } = $props();

  const shell = getShellContext();
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
  let actionError = $state<string | null>(null);
  let actionNotice = $state<string | null>(null);
  let likeBusyId = $state<string | null>(null);
  let adoptBusyId = $state<string | null>(null);
  let reportBusyId = $state<string | null>(null);
  let reportTarget = $state<CommunityKeymapDetail | null>(null);
  let reportReason = $state<CommunityReportReason>("spam");
  let reportDetail = $state("");
  let reportError = $state<string | null>(null);

  const currentBoardName = $derived(workbench.profile.name);
  const signedIn = $derived(shell.account.status === "signed-in");
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
    actionError = null;
    actionNotice = null;
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
    actionError = null;
    actionNotice = null;
    detailLoading = false;
  }

  async function toggleLike(detail: CommunityKeymapDetail) {
    if (!signedIn) {
      promptSignIn();
      return;
    }
    if (likeBusyId) return;

    const wasLiked = detail.likedByViewer;
    likeBusyId = detail.id;
    actionError = null;
    actionNotice = null;
    applyCardPatch(detail.id, {
      likedByViewer: !wasLiked,
      likesCount: wasLiked ? Math.max(0, detail.likesCount - 1) : detail.likesCount + 1,
    });

    try {
      if (wasLiked) {
        await unlikeCommunityKeymap(detail.id);
      } else {
        await likeCommunityKeymap(detail.id);
      }
      await refreshSelectedDetail(detail.id);
      await refreshList(listInput, listKey);
    } catch (error) {
      applyCardPatch(detail.id, {
        likedByViewer: wasLiked,
        likesCount: detail.likesCount,
      });
      actionError = messageFor(error, "Could not update like.");
    } finally {
      likeBusyId = null;
    }
  }

  async function adoptAsVariant(detail: CommunityKeymapDetail) {
    if (!signedIn) {
      promptSignIn();
      return;
    }
    if (adoptBusyId) return;

    const localForkId = newId();
    adoptBusyId = detail.id;
    actionError = null;
    actionNotice = null;

    try {
      const adopted = await adoptCommunityKeymap({ keymapId: detail.id, localForkId });
      const profile = decodeDeviceProfileFromStorage(adopted.profile);
      const adoptedAt = new Date().toISOString();
      await workbench.adoptCommunityVariant({
        detail: adopted,
        profile,
        localForkId,
        savePointId: `sp-${newId()}`,
        adoptedAt,
      });
      replaceCardFromDetail(adopted);
      closePreview();
      await goto("/editor");
    } catch (error) {
      actionError = messageFor(error, "Could not adopt this keymap.");
    } finally {
      adoptBusyId = null;
    }
  }

  function openReport(detail: CommunityKeymapDetail) {
    if (!signedIn) {
      promptSignIn();
      return;
    }

    reportTarget = detail;
    reportReason = "spam";
    reportDetail = "";
    reportError = null;
    actionError = null;
    actionNotice = null;
  }

  function closeReport() {
    reportTarget = null;
    reportError = null;
    reportDetail = "";
  }

  async function submitReport() {
    if (!reportTarget || reportBusyId) return;

    reportBusyId = reportTarget.id;
    reportError = null;
    actionError = null;
    actionNotice = null;

    try {
      await reportCommunityKeymap({
        keymapId: reportTarget.id,
        reason: reportReason,
        detail: reportDetail.trim() || undefined,
      });
      actionNotice = "Report sent for moderation review.";
      await refreshSelectedDetail(reportTarget.id);
      await refreshList(listInput, listKey);
      closeReport();
    } catch (error) {
      reportError = messageFor(error, "Could not send report.");
    } finally {
      reportBusyId = null;
    }
  }

  function promptSignIn() {
    actionError = "Sign in with GitHub to like, adopt, or report community keymaps.";
    shell.profileOpen = true;
  }

  async function refreshSelectedDetail(id: string) {
    if (selectedId !== id) return;
    const detail = await getCommunityKeymap(id);
    if (!detail) {
      detailError = "This community keymap is no longer available.";
      selectedDetail = null;
      return;
    }
    selectedDetail = detail;
    replaceCardFromDetail(detail);
  }

  function applyCardPatch(id: string, patch: Partial<CommunityKeymapCardDto>) {
    cards = cards.map((card) => (card.id === id ? { ...card, ...patch } : card));
    if (selectedDetail?.id === id) {
      selectedDetail = { ...selectedDetail, ...patch };
    }
  }

  function replaceCardFromDetail(detail: CommunityKeymapDetail) {
    cards = cards.map((card) => (card.id === detail.id ? detail : card));
    if (selectedDetail?.id === detail.id) selectedDetail = detail;
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

  function messageFor(error: unknown, fallback: string) {
    if (error instanceof Error) return error.message || fallback;
    if (error && typeof error === "object" && "message" in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string" && message) return message;
    }
    return fallback;
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
    {signedIn}
    {actionError}
    {actionNotice}
    likeBusy={likeBusyId === selectedDetail?.id}
    adoptBusy={adoptBusyId === selectedDetail?.id}
    reportBusy={reportBusyId === selectedDetail?.id}
    onclose={closePreview}
    onadopt={adoptAsVariant}
    onlike={toggleLike}
    onreport={openReport}
    onsignin={promptSignIn}
  />
{/if}

{#if reportTarget}
  <div class="report-backdrop" role="presentation" onclick={closeReport}>
    <div
      class="report-modal"
      role="dialog"
      aria-modal="true"
      aria-label={`Report ${reportTarget.title}`}
      tabindex="-1"
      onclick={(event) => event.stopPropagation()}
      onkeydown={(event) => event.stopPropagation()}
    >
      <form
        class="report-form"
        onsubmit={(event) => {
          event.preventDefault();
          void submitReport();
        }}
      >
        <header>
          <div>
            <span>Report keymap</span>
            <h3>{reportTarget.title}</h3>
          </div>
          <button type="button" aria-label="Close report dialog" onclick={closeReport}>
            <span class="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </header>

        <label>
          <span>Reason</span>
          <select bind:value={reportReason}>
            <option value="spam">Spam</option>
            <option value="unsafe">Unsafe</option>
            <option value="misleading">Misleading</option>
            <option value="copyright">Copyright</option>
            <option value="harassment">Harassment</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label>
          <span>Detail</span>
          <textarea
            bind:value={reportDetail}
            maxlength="500"
            rows="4"
            placeholder="Optional context for moderators"
          ></textarea>
        </label>

        {#if reportError}
          <p class="report-error" role="status">{reportError}</p>
        {/if}

        <div class="report-actions">
          <Button variant="ghost" type="button" onclick={closeReport}>Cancel</Button>
          <Button variant="coral" type="submit" disabled={reportBusyId === reportTarget.id}>
            {reportBusyId === reportTarget.id ? "Sending" : "Send report"}
          </Button>
        </div>
      </form>
    </div>
  </div>
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

  .report-backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    padding: 18px;
    background: rgba(20, 18, 16, 0.48);
    backdrop-filter: blur(8px);
  }

  .report-modal {
    display: grid;
    gap: 14px;
    width: min(420px, calc(100vw - 36px));
    padding: 16px;
    border: 1px solid var(--line-2);
    border-radius: 10px;
    background: var(--surface);
    box-shadow: var(--shadow-modal);
  }

  .report-form {
    display: contents;
  }

  .report-modal header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 32px;
    gap: 10px;
    align-items: start;
  }

  .report-modal header span,
  .report-modal label span {
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .report-modal h3 {
    margin: 4px 0 0;
    overflow: hidden;
    font-size: 16px;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .report-modal header button {
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink-2);
    background: var(--paper-2);
  }

  .report-modal label {
    display: grid;
    gap: 6px;
  }

  .report-modal select,
  .report-modal textarea {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink);
    background: var(--paper-2);
    font-size: 13px;
  }

  .report-modal select {
    height: 36px;
    padding: 0 10px;
  }

  .report-modal textarea {
    resize: vertical;
    min-height: 92px;
    padding: 10px;
    line-height: 1.45;
  }

  .report-error {
    margin: 0;
    padding: 8px 10px;
    border: 1px solid oklch(0.62 0.2 25 / 0.26);
    border-radius: 8px;
    color: oklch(0.42 0.15 25);
    background: oklch(0.95 0.04 25);
    font-size: 12px;
  }

  .report-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
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
