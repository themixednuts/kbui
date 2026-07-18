<script lang="ts">
  import { goto } from "$app/navigation";
  import { Clock3, GitFork, Heart, Search } from "@lucide/svelte";
  import { Effect } from "effect";

  import { forkApp, startScopedApp } from "$lib/app/runtime";
  import { getShellContext } from "$lib/app/shell-store.svelte";
  import { getWorkbenchContext } from "$lib/app/workbench-store.svelte";
  import CommunityKeymapCard from "$lib/components/browse/CommunityKeymapCard.svelte";
  import CommunityPreviewModal from "$lib/components/browse/CommunityPreviewModal.svelte";
  import { Button, Chip, Input, SegmentedNav } from "$lib/components/ui";
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
  import {
    decodeDeviceProfileFromStorageEffect,
    profileDisplayName,
  } from "$lib/keyboard/schema";
  import { cn } from "$lib/utils.js";
  import { newId } from "$lib/util/id";
  import { platformError } from "$lib/effect/errors";

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
    "browse-route min-h-full bg-paper";
  const browseShellClass = "browse-shell grid min-w-0 gap-0";
  const browseHeaderClass =
    "browse-header flex min-h-[58px] items-center justify-end gap-kb-16 border-b border-line px-kb-24 py-kb-10 max-[640px]:px-kb-12";
  const eyebrowClass = "font-mono text-[10px] tracking-[0.12em] text-ink-3 uppercase";
  const searchBoxClass =
    "search-box grid h-kb-34 w-[min(100%,420px)] min-w-0 grid-cols-[18px_minmax(0,1fr)] items-center gap-kb-8 rounded-lg border border-line-2 bg-card px-kb-12 py-0 shadow-card";
  const filterPanelClass =
    "filter-panel grid min-w-0 gap-kb-12 border-b border-line bg-paper px-kb-24 py-kb-12 max-[640px]:px-kb-12";
  const filterBandClass =
    "filter-band grid min-w-0 grid-cols-[58px_minmax(0,1fr)] items-start gap-x-kb-12 max-[640px]:grid-cols-[minmax(0,1fr)] max-[640px]:gap-y-kb-7";
  const filterBandLabelClass =
    "filter-band-label pt-kb-8 font-mono text-[10px] tracking-[0.1em] text-ink-3 uppercase max-[640px]:pt-0";
  const filterGroupClass = "flex min-w-0 flex-wrap items-center gap-kb-8";
  const scopeGridClass =
    "scope-grid grid min-w-0 grid-cols-[minmax(250px,1fr)_auto_auto] items-center gap-kb-10 max-[820px]:grid-cols-[minmax(0,1fr)] max-[820px]:items-start";
  const scopeFiltersClass = "scope-filters flex min-w-0 flex-wrap items-center gap-kb-10";
  const filterButtonClass =
    "h-[28px] min-h-[28px] rounded-pill border-line bg-paper-2 px-kb-10 py-0 font-mono text-[11px] text-ink-2 hover:border-line-2 hover:bg-paper-2 hover:text-ink";
  const activeFilterButtonClass =
    "active border-transparent bg-ink text-paper hover:bg-ink hover:text-paper";
  const toggleFilterClass =
    "toggle-filter inline-flex min-h-kb-30 items-center gap-kb-8 font-mono text-[11px] text-ink-2";
  const sortControlClass =
    "sort-control inline-flex min-w-0 items-center gap-kb-8 whitespace-nowrap max-[820px]:justify-self-start";
  const listErrorClass =
    "list-error flex min-h-kb-44 items-center gap-kb-10 rounded-lg border border-[var(--danger-border)] bg-danger-surface px-kb-12 py-kb-10 text-kb-12 text-danger-ink";
  const cardGridClass =
    "card-grid grid min-w-0 grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-kb-16 p-kb-24 max-[640px]:grid-cols-[minmax(0,1fr)] max-[640px]:p-kb-12";
  const emptyPanelClass =
    "empty-panel grid min-h-[260px] place-items-center content-center gap-kb-10 rounded-lg border border-dashed border-line-2 bg-surface font-mono text-kb-12 text-ink-3";
  const reportBackdropClass =
    "report-backdrop fixed inset-0 z-40 grid place-items-center bg-[rgba(20,18,16,0.48)] p-kb-18 backdrop-blur-[8px]";
  const reportModalClass =
    "report-modal grid w-[min(420px,calc(100vw-36px))] gap-kb-14 rounded-lg border border-line-2 bg-surface p-kb-16 shadow-modal";
  const reportHeaderClass =
    "grid grid-cols-[minmax(0,1fr)_32px] items-start gap-kb-10";
  const reportLabelTextClass = "font-mono text-[10px] tracking-[0.1em] text-ink-3 uppercase";
  const reportCloseButtonClass =
    "size-[var(--control-height)] border-line bg-surface text-ink-2";
  const reportFieldClass = "grid gap-kb-6";
  const reportFieldControlClass =
    "w-full min-w-0 rounded-md border border-line bg-surface text-kb-13 text-ink";
  const reportErrorClass =
    "report-error m-0 rounded-lg border border-[var(--danger-border)] bg-danger-surface px-kb-10 py-kb-8 text-kb-12 text-danger-ink";
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
  const resultCopy = $derived(`${cards.length} ${cards.length === 1 ? "map" : "maps"}`);

  let lastListKey = JSON.stringify({ sort: "likes", limit: 24 });

  $effect(() => {
    if (listKey === lastListKey) return;
    lastListKey = listKey;
    const input = listInput;
    const requestKey = listKey;
    return startScopedApp(
      "community.refresh-list",
      Effect.sleep("250 millis").pipe(
        Effect.andThen(Effect.suspend(() => refreshListEffect(input, requestKey))),
      ),
    );
  });

  function remoteEffect<A>(operation: string, request: () => PromiseLike<A>) {
    return Effect.tryPromise({
      try: request,
      catch: (cause) => platformError(operation, cause),
    });
  }

  function refreshListEffect(input: CommunityKeymapListInput, requestKey: string) {
    return Effect.gen(function* () {
      loading = true;
      listError = null;
      const next = yield* remoteEffect("community.list", () => listCommunityKeymaps(input));
      if (lastListKey !== requestKey) return;
      cards = next;
      tagBank = uniqueTags([...cards, ...tagBank.map(tagToSyntheticCard)]);
    }).pipe(
      Effect.catch((error) =>
        Effect.sync(() => {
          if (lastListKey !== requestKey) return;
          listError =
            error instanceof Error ? error.message : "Community catalog could not be loaded.";
        }),
      ),
      Effect.ensuring(
        Effect.sync(() => {
          if (lastListKey === requestKey) loading = false;
        }),
      ),
    );
  }

  function refreshList(input: CommunityKeymapListInput, requestKey: string) {
    forkApp("community.refresh-list", refreshListEffect(input, requestKey));
  }

  function openPreview(id: string) {
    selectedId = id;
    selectedDetail = null;
    detailError = null;
    actionError = null;
    actionNotice = null;
    detailLoading = true;

    forkApp(
      "community.open-preview",
      remoteEffect("community.get-keymap", () => getCommunityKeymap(id)).pipe(
        Effect.tap((detail) =>
          Effect.sync(() => {
            if (selectedId !== id) return;
            if (!detail) {
              detailError = "This community keymap is no longer available.";
              return;
            }
            selectedDetail = detail;
          }),
        ),
        Effect.catch((error) =>
          Effect.sync(() => {
            if (selectedId !== id) return;
            detailError =
              error instanceof Error ? error.message : "Community preview could not be loaded.";
          }),
        ),
        Effect.ensuring(
          Effect.sync(() => {
            if (selectedId === id) detailLoading = false;
          }),
        ),
      ),
    );
  }

  function closePreview() {
    selectedId = null;
    selectedDetail = null;
    detailError = null;
    actionError = null;
    actionNotice = null;
    detailLoading = false;
  }

  function toggleLike(detail: CommunityKeymapDetail) {
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

    forkApp(
      "community.toggle-like",
      Effect.gen(function* () {
        yield* remoteEffect("community.toggle-like", () =>
          wasLiked ? unlikeCommunityKeymap(detail.id) : likeCommunityKeymap(detail.id),
        );
        yield* refreshSelectedDetailEffect(detail.id);
        yield* refreshListEffect(listInput, listKey);
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(() => {
            applyCardPatch(detail.id, {
              likedByViewer: wasLiked,
              likesCount: detail.likesCount,
            });
            actionError = messageFor(error, "Could not update like.");
          }),
        ),
        Effect.ensuring(Effect.sync(() => (likeBusyId = null))),
      ),
    );
  }

  function adoptAsVariant(detail: CommunityKeymapDetail) {
    if (!signedIn) {
      promptSignIn();
      return;
    }
    if (adoptBusyId) return;

    const localForkId = newId();
    adoptBusyId = detail.id;
    actionError = null;
    actionNotice = null;

    forkApp(
      "community.adopt-variant",
      Effect.gen(function* () {
        const adopted = yield* remoteEffect("community.adopt", () =>
          adoptCommunityKeymap({ keymapId: detail.id, localForkId }),
        );
        const profile = yield* decodeDeviceProfileFromStorageEffect(adopted.profile).pipe(
          Effect.mapError((cause) => platformError("community.decode-adopted-profile", cause)),
        );
        const adoptedAt = new Date().toISOString();
        yield* workbench.adoptCommunityVariantEffect({
          detail: adopted,
          profile,
          localForkId,
          savePointId: `sp-${newId()}`,
          adoptedAt,
        });
        replaceCardFromDetail(adopted);
        closePreview();
        yield* remoteEffect("community.navigate-editor", () => goto("/editor"));
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(() => (actionError = messageFor(error, "Could not adopt this keymap."))),
        ),
        Effect.ensuring(Effect.sync(() => (adoptBusyId = null))),
      ),
    );
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

  function submitReport() {
    if (!reportTarget || reportBusyId) return;

    reportBusyId = reportTarget.id;
    reportError = null;
    actionError = null;
    actionNotice = null;

    const targetId = reportTarget.id;
    forkApp(
      "community.report",
      Effect.gen(function* () {
        yield* remoteEffect("community.report", () =>
          reportCommunityKeymap({
            keymapId: targetId,
            reason: reportReason,
            detail: reportDetail.trim() || undefined,
          }),
        );
        actionNotice = "Report sent for moderation review.";
        yield* refreshSelectedDetailEffect(targetId);
        yield* refreshListEffect(listInput, listKey);
        closeReport();
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(() => (reportError = messageFor(error, "Could not send report."))),
        ),
        Effect.ensuring(Effect.sync(() => (reportBusyId = null))),
      ),
    );
  }

  function promptSignIn() {
    actionError = "Sign in with GitHub to like, adopt, or report community keymaps.";
    shell.profileOpen = true;
  }

  function refreshSelectedDetailEffect(id: string) {
    if (selectedId !== id) return Effect.void;
    return remoteEffect("community.refresh-selected", () => getCommunityKeymap(id)).pipe(
      Effect.tap((detail) =>
        Effect.sync(() => {
          if (!detail) {
            detailError = "This community keymap is no longer available.";
            selectedDetail = null;
            return;
          }
          selectedDetail = detail;
          replaceCardFromDetail(detail);
        }),
      ),
    );
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

<section class={browseRouteClass} data-community-store={data.communityStore}>
  <div class={browseShellClass}>
    <header class={browseHeaderClass}>
      <div class={searchBoxClass}>
        <span class="search-icon grid place-items-center text-ink-3" aria-hidden="true"><Search size={15} /></span>
        <Input
          class="h-auto min-w-0 border-0 bg-transparent px-0 py-0 text-[13px] text-ink shadow-none placeholder:text-ink-3 focus-visible:border-transparent focus-visible:ring-0"
          type="search"
          placeholder="Search title, author, board, tag"
          bind:value={search}
          aria-label="Search community keymaps"
        />
      </div>
    </header>

    <section class={filterPanelClass} aria-label="Browse filters">
      <div class={filterBandClass}>
        <span class={filterBandLabelClass}>Tags</span>
        <div class={cn("tag-strip", filterGroupClass)} aria-label="Tag filters">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            class={cn(filterButtonClass, !activeTag && activeFilterButtonClass)}
            aria-pressed={!activeTag}
            onclick={() => setTag(undefined)}
          >
            All
          </Button>
          {#each tagBank as tag (tag)}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              class={cn(filterButtonClass, activeTag === tag && activeFilterButtonClass)}
              aria-pressed={activeTag === tag}
              onclick={() => setTag(activeTag === tag ? undefined : tag)}
            >
              #{tag}
            </Button>
          {/each}
        </div>
      </div>

      <div class={filterBandClass}>
        <span class={filterBandLabelClass}>Scope</span>
        <div class={scopeGridClass}>
          <div class={scopeFiltersClass}>
            <label class={toggleFilterClass}>
              <Switch bind:checked={compatibleOnly} size="sm" aria-label="Compatible with my board" />
              <span>Compatible with {currentBoardName}</span>
            </label>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              class={cn("official-filter", filterButtonClass, officialOnly && activeFilterButtonClass)}
              aria-pressed={officialOnly}
              onclick={() => (officialOnly = !officialOnly)}
            >
              Official only
            </Button>
          </div>

          <div class={sortControlClass}>
            <span class={eyebrowClass}>Sort</span>
            <SegmentedNav
              items={sortItems}
              value={sort}
              onselect={(next) => (sort = next)}
              ariaLabel="Community keymap sort"
            />
          </div>

          <Chip
            class="result-count min-w-[62px] justify-self-end max-[820px]:justify-self-start"
            title={loading ? "Updating community keymaps" : "Current result count"}
          >{resultCopy}</Chip>
          <span class="sr-only" aria-live="polite">
            {loading ? "Updating community keymaps" : `${resultCopy} shown`}
          </span>
        </div>
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
        <span class="material-symbols-outlined text-[28px]" aria-hidden="true">explore_off</span>
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
          submitReport();
        }}
      >
        <header class={reportHeaderClass}>
          <div>
            <span class={reportLabelTextClass}>Report keymap</span>
            <h3 class="m-0 mt-kb-4 overflow-hidden text-ellipsis whitespace-nowrap text-kb-16">{reportTarget.title}</h3>
          </div>
          <Button
            class={reportCloseButtonClass}
            variant="outline"
            size="icon"
            type="button"
            aria-label="Close report dialog"
            onclick={closeReport}
          >
            <span class="material-symbols-outlined" aria-hidden="true">close</span>
          </Button>
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
