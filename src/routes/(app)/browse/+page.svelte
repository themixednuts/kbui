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
  import { decodeDeviceProfileFromStorage, profileDisplayName } from "$lib/keyboard/schema";
  import { cn } from "$lib/utils.js";
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
  const browseRouteClass =
    "browse-route min-h-[calc(100vh-58px)] bg-[radial-gradient(ellipse_82%_52%_at_84%_0%,color-mix(in_oklch,var(--coral)_8%,transparent),transparent_64%),radial-gradient(ellipse_70%_44%_at_0%_16%,color-mix(in_oklch,var(--teal)_8%,transparent),transparent_62%),var(--paper)] p-kb-22 max-[640px]:p-kb-12";
  const browseShellClass = "browse-shell grid min-w-0 gap-kb-16";
  const browseHeaderClass =
    "browse-header grid grid-cols-[minmax(0,1fr)_minmax(280px,420px)] items-end gap-kb-16 max-[940px]:grid-cols-[minmax(0,1fr)]";
  const headlineClass = "headline grid min-w-0 gap-kb-4";
  const eyebrowClass = "font-mono text-kb-10 tracking-[0.12em] text-ink-3 uppercase";
  const searchBoxClass =
    "search-box grid h-kb-38 min-w-0 grid-cols-[18px_minmax(0,1fr)] items-center gap-kb-8 rounded-[8px] border border-line-2 bg-surface px-kb-12 py-0 shadow-card";
  const filterPanelClass =
    "filter-panel grid min-w-0 gap-kb-10 rounded-[8px] border border-line-2 bg-[color-mix(in_oklch,var(--surface)_86%,transparent)] p-kb-12 shadow-card";
  const filterGroupClass = "flex min-w-0 flex-wrap items-center gap-kb-8";
  const filterRowClass = `${filterGroupClass} max-[640px]:items-start`;
  const filterButtonClass =
    "min-h-[28px] rounded-pill border border-line bg-paper-2 px-kb-10 py-0 font-mono text-kb-11 text-ink-2 hover:border-line-2 hover:text-ink";
  const activeFilterButtonClass =
    "active border-[color-mix(in_oklch,var(--coral)_55%,var(--line-2))] bg-coral text-[#1c0a04]";
  const toggleFilterClass =
    "toggle-filter inline-flex min-h-kb-30 items-center gap-kb-8 font-mono text-kb-11 text-ink-2";
  const sortControlClass =
    "sort-control ml-auto inline-flex items-center gap-kb-8 max-[940px]:ml-0 max-[940px]:w-full max-[940px]:justify-between max-[640px]:flex-col max-[640px]:items-start";
  const listErrorClass =
    "list-error flex min-h-kb-44 items-center gap-kb-10 rounded-[8px] border border-[oklch(0.62_0.2_25_/_0.32)] bg-[oklch(0.95_0.04_25)] px-kb-12 py-kb-10 text-[12px] text-[oklch(0.42_0.15_25)]";
  const cardGridClass =
    "card-grid grid min-w-0 grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-kb-14 aria-busy:opacity-[0.62] max-[640px]:grid-cols-[minmax(0,1fr)]";
  const emptyPanelClass =
    "empty-panel grid min-h-[260px] place-items-center content-center gap-kb-10 rounded-[8px] border border-dashed border-line-2 bg-[color-mix(in_oklch,var(--surface)_64%,transparent)] font-mono text-[12px] text-ink-3";
  const reportBackdropClass =
    "report-backdrop fixed inset-0 z-40 grid place-items-center bg-[rgba(20,18,16,0.48)] p-kb-18 backdrop-blur-[8px]";
  const reportModalClass =
    "report-modal grid w-[min(420px,calc(100vw-36px))] gap-kb-14 rounded-[10px] border border-line-2 bg-surface p-kb-16 shadow-modal";
  const reportHeaderClass =
    "grid grid-cols-[minmax(0,1fr)_32px] items-start gap-kb-10";
  const reportLabelTextClass = "font-mono text-kb-10 tracking-[0.1em] text-ink-3 uppercase";
  const reportCloseButtonClass =
    "grid size-[32px] place-items-center rounded-[8px] border border-line bg-paper-2 text-ink-2";
  const reportFieldClass = "grid gap-kb-6";
  const reportFieldControlClass =
    "w-full min-w-0 rounded-[8px] border border-line bg-paper-2 text-[13px] text-ink";
  const reportErrorClass =
    "report-error m-0 rounded-[8px] border border-[oklch(0.62_0.2_25_/_0.26)] bg-[oklch(0.95_0.04_25)] px-kb-10 py-kb-8 text-[12px] text-[oklch(0.42_0.15_25)]";
  const reportActionsClass = "report-actions flex justify-end gap-kb-8";

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

  const currentBoardName = $derived(profileDisplayName(workbench.profile));
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

<section class={browseRouteClass}>
  <div class={browseShellClass}>
    <header class={browseHeaderClass}>
      <div class={headlineClass}>
        <span class={eyebrowClass}>Community</span>
        <h2 class="m-0 text-kb-30">Browse keymaps</h2>
      </div>

      <div class={searchBoxClass}>
        <span class="search-icon grid place-items-center text-ink-3" aria-hidden="true"><Search size={15} /></span>
        <input
          class="min-w-0 border-0 bg-transparent text-[13px] text-ink outline-0 placeholder:text-ink-3"
          type="search"
          placeholder="Search title, author, board, tag"
          bind:value={search}
          aria-label="Search community keymaps"
        />
      </div>
    </header>

    <section class={filterPanelClass} aria-label="Browse filters">
      <div class={cn("tag-strip", filterGroupClass)} aria-label="Tag filters">
        <button
          type="button"
          class={cn(filterButtonClass, !activeTag && activeFilterButtonClass)}
          aria-pressed={!activeTag}
          onclick={() => setTag(undefined)}
        >
          All
        </button>
        {#each tagBank as tag (tag)}
          <button
            type="button"
            class={cn(filterButtonClass, activeTag === tag && activeFilterButtonClass)}
            aria-pressed={activeTag === tag}
            onclick={() => setTag(activeTag === tag ? undefined : tag)}
          >
            #{tag}
          </button>
        {/each}
      </div>

      <div class={filterRowClass}>
        <label class={toggleFilterClass}>
          <Switch bind:checked={compatibleOnly} size="sm" aria-label="Compatible with my board" />
          <span>Compatible with {currentBoardName}</span>
        </label>

        <button
          type="button"
          class={cn("official-filter", filterButtonClass, officialOnly && activeFilterButtonClass)}
          aria-pressed={officialOnly}
          onclick={() => (officialOnly = !officialOnly)}
        >
          Official only
        </button>

        <div class={sortControlClass}>
          <span class={eyebrowClass}>Sort</span>
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
      <div class={listErrorClass} role="status">
        <span class="material-symbols-outlined" aria-hidden="true">warning</span>
        {listError}
        <Button variant="ghost" size="sm" onclick={() => refreshList(listInput, listKey)}>Retry</Button>
      </div>
    {/if}

    {#if cards.length === 0 && !loading}
      <div class={emptyPanelClass}>
        <span class="material-symbols-outlined !text-[28px]" aria-hidden="true">explore_off</span>
        <strong>No matching keymaps</strong>
        <Button variant="ghost" size="sm" onclick={clearFilters}>Clear filters</Button>
      </div>
    {:else}
      <div class={cardGridClass} aria-busy={loading}>
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
  <div class={reportBackdropClass} role="presentation" onclick={closeReport}>
    <div
      class={reportModalClass}
      role="dialog"
      aria-modal="true"
      aria-label={`Report ${reportTarget.title}`}
      tabindex="-1"
      onclick={(event) => event.stopPropagation()}
      onkeydown={(event) => event.stopPropagation()}
    >
      <form
        class="report-form contents"
        onsubmit={(event) => {
          event.preventDefault();
          void submitReport();
        }}
      >
        <header class={reportHeaderClass}>
          <div>
            <span class={reportLabelTextClass}>Report keymap</span>
            <h3 class="m-0 mt-kb-4 overflow-hidden text-ellipsis whitespace-nowrap text-kb-16">{reportTarget.title}</h3>
          </div>
          <button class={reportCloseButtonClass} type="button" aria-label="Close report dialog" onclick={closeReport}>
            <span class="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </header>

        <label class={reportFieldClass}>
          <span class={reportLabelTextClass}>Reason</span>
          <select class={cn(reportFieldControlClass, "h-[36px] px-kb-10 py-0")} bind:value={reportReason}>
            <option value="spam">Spam</option>
            <option value="unsafe">Unsafe</option>
            <option value="misleading">Misleading</option>
            <option value="copyright">Copyright</option>
            <option value="harassment">Harassment</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label class={reportFieldClass}>
          <span class={reportLabelTextClass}>Detail</span>
          <textarea
            class={cn(reportFieldControlClass, "min-h-kb-92 resize-y p-kb-10 leading-[1.45]")}
            bind:value={reportDetail}
            maxlength="500"
            rows="4"
            placeholder="Optional context for moderators"
          ></textarea>
        </label>

        {#if reportError}
          <p class={reportErrorClass} role="status">{reportError}</p>
        {/if}

        <div class={reportActionsClass}>
          <Button variant="ghost" type="button" onclick={closeReport}>Cancel</Button>
          <Button variant="coral" type="submit" disabled={reportBusyId === reportTarget.id}>
            {reportBusyId === reportTarget.id ? "Sending" : "Send report"}
          </Button>
        </div>
      </form>
    </div>
  </div>
{/if}

