<script lang="ts">
  import {
    BookmarkPlus,
    CheckCircle2,
    GitBranch,
    GitCommit,
    History,
    RotateCcw,
    Zap,
  } from "@lucide/svelte";

  import { getShellContext } from "$lib/app/shell-store.svelte";
  import { planSavePointFlash } from "$lib/app/save-point-flash";
  import { getViaLiveSyncContext, type LiveSyncChangeNotice } from "$lib/app/via-live-sync.svelte";
  import { getWorkbenchContext } from "$lib/app/workbench-store.svelte";
  import FlashOverlay from "$lib/components/flash/FlashOverlay.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Chip from "$lib/components/ui/Chip.svelte";
  import SegmentedNav from "$lib/components/ui/SegmentedNav.svelte";
  import type { SegmentItem } from "$lib/components/ui/types";
  import * as Card from "$lib/components/ui/card/index.js";
  import VersionChangesPanel from "$lib/components/versioning/VersionChangesPanel.svelte";
  import type { ChangeRecord, DeviceProfile, SavePoint } from "$lib/keyboard/schema";
  import { cn } from "$lib/utils.js";

  type VersionTab = "history" | "changes";
  type ChangeGroupId = "keymap" | "lighting" | "settings";

  const shell = getShellContext();
  const workbench = getWorkbenchContext();
  const liveSync = getViaLiveSyncContext();

  let tab = $state<VersionTab>("changes");
  let savePointMessage = $state("");
  let branchName = $state("");
  let changesOpen = $state(true);
  let selectedChangesOpen = $state(true);
  let actionError = $state<string | null>(null);
  let flashStatus = $state<string | null>(null);
  let flashOverlayOpen = $state(false);
  let flashProfile = $state<DeviceProfile | null>(null);
  let flashChanges = $state<LiveSyncChangeNotice[]>([]);
  let saving = $state(false);
  let restoring = $state(false);
  let branching = $state(false);

  const tabItems = $derived([
    { value: "history", label: "History", icon: History },
    {
      value: "changes",
      label: workbench.changes.length ? `Changes - ${workbench.changes.length}` : "Changes",
      icon: GitCommit,
    },
  ] satisfies SegmentItem<VersionTab>[]);
  const changeGroups = $derived(groupChanges(workbench.changes));
  const selectedSavePoint = $derived(workbench.selectedSavePoint);
  const selectedChanges = $derived(workbench.selectedSavePointChanges);
  const selectedVariant = $derived(
    selectedSavePoint
      ? workbench.variants.find((variant) => variant.id === selectedSavePoint.variantId)
      : undefined,
  );
  const versionsPageClass =
    "versions-page grid min-h-full content-start gap-kb-18 p-kb-22 max-[820px]:p-kb-14";
  const versionsToolbarClass =
    "versions-toolbar flex min-w-0 items-center gap-kb-10 max-[820px]:flex-wrap";
  const toolbarSpacerClass = "toolbar-spacer min-w-kb-12 flex-1 max-[820px]:hidden";
  const versionsAlertClass =
    "versions-alert rounded-keycap border border-[oklch(0.62_0.2_25_/_0.28)] bg-[oklch(0.95_0.04_25)] px-kb-12 py-kb-10 font-mono text-[12px] text-[oklch(0.42_0.15_25)]";
  const versionsStatusClass =
    "versions-status rounded-keycap border border-[color-mix(in_oklch,var(--teal)_35%,transparent)] bg-[color-mix(in_oklch,var(--teal)_12%,var(--surface))] px-kb-12 py-kb-10 font-mono text-[12px] leading-[1.45] text-teal-ink";
  const versionsGridClass =
    "versions-grid grid min-h-0 grid-cols-[minmax(0,1fr)_320px] items-start gap-kb-18 max-[1180px]:grid-cols-[minmax(0,1fr)]";
  const historyGridClass = "history-grid items-stretch";
  const versionsMainClass = "versions-main grid min-w-0 gap-kb-14";
  const versionsSidebarClass =
    "versions-sidebar grid min-w-0 gap-kb-14 max-[1180px]:grid-cols-[repeat(2,minmax(0,1fr))] max-[820px]:grid-cols-[minmax(0,1fr)]";
  const historySidebarClass = "history-sidebar content-start max-[1180px]:grid-cols-[minmax(0,1fr)]";
  const changeMetricsClass =
    "change-metrics grid grid-cols-[repeat(3,minmax(0,1fr))] gap-kb-10 max-[820px]:grid-cols-[minmax(0,1fr)]";
  const changeMetricClass =
    "change-metric grid min-h-[66px] grid-cols-[minmax(0,1fr)_auto] items-center gap-kb-10 rounded-keycap border border-line bg-[color-mix(in_oklch,var(--surface)_76%,transparent)] px-kb-14 py-kb-12 data-[empty=true]:[&_b]:text-ink-3";
  const changeMetricTitleClass =
    "block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12px] tracking-[0.04em] uppercase";
  const changeMetricDescriptionClass =
    "mt-kb-4 block overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-ink-3";
  const changeMetricCountClass = "font-mono text-[24px] font-strong";
  const versionsCardHeaderClass =
    "versions-card-header min-h-kb-44 border-line !px-kb-16 !py-kb-13";
  const versionsCardTitleClass = "text-[12px] tracking-[0.08em]";
  const versionsCardBodyClass = "versions-card-body grid gap-kb-13 !p-kb-16";
  const sideCopyClass = "side-copy m-0 text-[12px] leading-[1.6] text-ink-2";
  const fieldClass = "field grid gap-kb-6";
  const fieldLabelClass =
    "text-ink-3 font-mono text-[10px] tracking-[0.08em] uppercase";
  const versionInputClass =
    "version-input h-kb-34 w-full min-w-0 rounded-keycap border border-line-2 bg-surface px-kb-10 py-0 !font-mono !text-[12px] text-ink read-only:bg-paper-2 read-only:text-ink-2";
  const fullActionClass = "full-action w-full";
  const cleanCardClass = "clean-card bg-[color-mix(in_oklch,var(--surface)_64%,transparent)]";
  const cleanBodyClass =
    "clean-body grid grid-cols-[20px_minmax(0,1fr)] items-center gap-kb-8 !px-kb-14 !py-kb-12 font-mono text-[12px] text-ink-2";
  const timelineCardClass = "timeline-card min-h-[540px] max-[820px]:min-h-0";
  const timelineTitleClass = "timeline-title justify-between";
  const timelineDescriptionClass = "mt-kb-4 font-mono text-[11px] text-ink-3";
  const timelineBodyClass = "timeline-body !px-kb-16 !pt-kb-18 !pb-kb-22";
  const timelineEmptyClass =
    "timeline-empty grid min-h-[180px] place-items-center gap-kb-8 text-center font-mono text-[12px] text-ink-3";
  const sideEmptyClass =
    "side-empty grid min-h-[180px] place-items-center gap-kb-8 text-center font-mono text-[12px] text-ink-3";
  const timelineTracksClass =
    "timeline-tracks grid grid-cols-[repeat(3,minmax(180px,1fr))] items-start gap-kb-18 max-[820px]:grid-cols-[minmax(0,1fr)]";
  const timelineTrackClass = "timeline-track min-w-0";
  const trackHeadClass = "track-head flex min-w-0 items-center gap-kb-8 font-mono text-[12px]";
  const trackNameClass = "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap";
  const trackSwatchClass = "track-swatch size-kb-10 flex-none rounded-pill";
  const trackChipClass = "track-chip !min-h-kb-20 !px-kb-7";
  const trackNoteClass =
    "track-note mt-kb-10 flex min-w-0 items-center gap-kb-6 font-mono text-[10px] text-ink-3 [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap";
  const trackLineClass =
    "track-line relative mt-kb-12 grid gap-kb-8 pl-kb-18 before:absolute before:top-kb-4 before:bottom-kb-4 before:left-kb-5 before:w-kb-2 before:rounded-pill before:bg-[var(--track-color,var(--ink))] before:opacity-80 before:content-['']";
  const trackEmptyClass = "track-empty min-h-kb-38 font-mono text-[11px] text-ink-3";
  const savepointRowClass =
    "savepoint-row relative grid w-full min-w-0 grid-cols-[minmax(0,1fr)] rounded-keycap border border-transparent py-kb-8 pr-kb-8 pl-kb-10 text-left hover:border-line hover:bg-paper-2 [&.selected]:border-line [&.selected]:bg-paper-2";
  const savepointDotClass =
    "savepoint-dot absolute top-kb-14 left-[-17px] size-kb-10 rounded-pill border-2 border-paper bg-[var(--track-color,var(--ink))] shadow-[0_0_0_1px_var(--track-color,var(--ink))]";
  const savepointCopyClass = "savepoint-copy grid min-w-0 gap-kb-3";
  const savepointCopyHeadClass = "flex min-w-0 items-center gap-kb-7";
  const savepointMessageClass =
    "overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12px] font-strong";
  const savepointDetailsClass =
    "overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] text-ink-3";
  const savepointCurrentClass =
    "flex-none rounded-pill bg-coral px-kb-7 py-kb-3 font-mono text-[9px] not-italic tracking-[0.04em] text-[#1c0a04] uppercase";
  const savepointHeroClass =
    "savepoint-hero grid grid-cols-[54px_minmax(0,1fr)] items-center gap-kb-12 rounded-keycap bg-paper-2 p-kb-12";
  const savepointCapClass =
    "savepoint-cap grid size-[54px] place-items-center overflow-hidden rounded-big-cap font-mono text-[11px] text-paper uppercase";
  const savepointVariantClass =
    "block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] tracking-[0.08em] text-ink-3 uppercase";
  const savepointTitleClass =
    "mt-kb-4 mb-0 block overflow-hidden text-ellipsis text-[15px] leading-[1.2]";
  const savepointMetaClass = "savepoint-meta m-0 grid gap-0 font-mono text-[11px]";
  const savepointMetaRowClass =
    "grid grid-cols-[74px_minmax(0,1fr)] gap-kb-10 border-b border-line py-kb-8 last:border-b-0";
  const savepointMetaTermClass =
    "m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-ink-3";
  const savepointMetaDescriptionClass =
    "m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap";
  const actionRowClass = "action-row flex flex-wrap gap-kb-7";

  async function createSavePoint() {
    if (workbench.changes.length === 0 || saving) return;

    actionError = null;
    saving = true;
    try {
      const savePoint = await workbench.createSavePoint(savePointMessage);
      if (savePoint) {
        tab = "history";
        savePointMessage = "";
      }
    } catch (error) {
      actionError = messageFor(error, "Could not create save point");
    } finally {
      saving = false;
    }
  }

  async function restoreSelectedSavePoint() {
    if (!selectedSavePoint || restoring) return;

    actionError = null;
    restoring = true;
    try {
      await workbench.restoreSavePoint(selectedSavePoint.id);
      tab = "changes";
    } catch (error) {
      actionError = messageFor(error, "Could not restore save point");
    } finally {
      restoring = false;
    }
  }

  async function branchFromSelectedSavePoint() {
    if (!selectedSavePoint || branching) return;

    actionError = null;
    branching = true;
    try {
      const fork = await workbench.branchFromSavePoint(branchName, {
        savePointId: selectedSavePoint.id,
      });
      if (fork) branchName = "";
    } catch (error) {
      actionError = messageFor(error, "Could not create variant");
    } finally {
      branching = false;
    }
  }

  async function flashSelectedSavePoint() {
    if (!selectedSavePoint) return;
    actionError = null;
    flashStatus = null;

    try {
      const profile = workbench.materializeSavePointProfile(selectedSavePoint.id);
      if (!profile) {
        actionError = "Could not materialize the selected save point for flashing.";
        return;
      }

      const plan = planSavePointFlash({
        baseProfile: workbench.baseProfile,
        connection: shell.liveConnection,
        profile,
        savePointLabel: selectedSavePoint.message,
      });

      if (plan.kind === "live-apply") {
        await workbench.loadProfileAsDraft(plan.profile, { origin: "draft" });
        liveSync.processChanges(shell.liveConnection);
        flashStatus = plan.message;
        return;
      }

      flashProfile = plan.profile;
      flashChanges = plan.changes;
      flashOverlayOpen = true;
    } catch (error) {
      actionError = messageFor(error, "Could not flash save point");
      return;
    }
  }

  function closeFlashOverlay() {
    flashOverlayOpen = false;
    flashProfile = null;
    flashChanges = [];
  }

  function groupChanges(changes: readonly ChangeRecord[]) {
    const groups = [
      {
        id: "keymap" as const,
        label: "Keymap",
        description: "bindings and logic",
        changes: [] as ChangeRecord[],
      },
      {
        id: "lighting" as const,
        label: "Lighting",
        description: "RGB and per-key color",
        changes: [] as ChangeRecord[],
      },
      {
        id: "settings" as const,
        label: "Settings",
        description: "behavior and metadata",
        changes: [] as ChangeRecord[],
      },
    ];
    const byId = new Map<ChangeGroupId, ChangeRecord[]>(
      groups.map((group) => [group.id, group.changes]),
    );

    for (const change of changes) {
      byId.get(groupIdForChange(change))?.push(change);
    }

    return groups;
  }

  function groupIdForChange(change: ChangeRecord): ChangeGroupId {
    if (change.kind === "lighting") return "lighting";
    if (change.kind === "setting" || change.kind === "metadata") return "settings";
    return "keymap";
  }

  function latestPointId(track: { points: SavePoint[] }) {
    return track.points[0]?.id;
  }

  function pointLabel(id: string) {
    const normalized = id.replace(/^sp-/, "");
    return normalized.length > 8 ? normalized.slice(0, 8) : normalized;
  }

  function formatWhen(createdAt: string) {
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) return createdAt;
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  }

  function authorLabel(savePoint: SavePoint) {
    const handle = savePoint.authorMeta.handle ? ` @${savePoint.authorMeta.handle}` : "";
    return `${savePoint.authorMeta.name}${handle}`;
  }

  function messageFor(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
  }
</script>

<section class={versionsPageClass}>
  <header class={versionsToolbarClass}>
    <SegmentedNav
      items={tabItems}
      value={tab}
      onselect={(next) => (tab = next as VersionTab)}
      ariaLabel="Versions tabs"
    />

    <div class={toolbarSpacerClass}></div>

    <Chip dot={workbench.activeVariant.color} title="Active variant">
      {workbench.activeVariant.name}
    </Chip>
    <Chip title="Save point count">{workbench.savePoints.length} save points</Chip>
  </header>

  {#if actionError || workbench.versioningError}
    <div class={versionsAlertClass} role="status">
      {actionError ?? workbench.versioningError}
    </div>
  {/if}

  {#if flashStatus}
    <div class={versionsStatusClass} role="status">
      {flashStatus}
    </div>
  {/if}

  {#if tab === "changes"}
    <div class={versionsGridClass}>
      <div class={versionsMainClass}>
        <div class={changeMetricsClass} aria-label="Uncommitted change groups">
          {#each changeGroups as group (group.id)}
            <article class={changeMetricClass} data-empty={group.changes.length === 0}>
              <div>
                <strong class={changeMetricTitleClass}>{group.label}</strong>
                <span class={changeMetricDescriptionClass}>{group.description}</span>
              </div>
              <b class={changeMetricCountClass}>{group.changes.length}</b>
            </article>
          {/each}
        </div>

        <VersionChangesPanel
          changes={workbench.changes}
          total={workbench.changes.length}
          title="Uncommitted changes"
          bind:open={changesOpen}
        />
      </div>

      <aside class={versionsSidebarClass} aria-label="Save point actions">
        <Card.Root>
          <Card.Header class={versionsCardHeaderClass}>
            <Card.Title class={versionsCardTitleClass}>Save point</Card.Title>
          </Card.Header>
          <Card.Content class={versionsCardBodyClass}>
            <p class={sideCopyClass}>
              Bundle these {workbench.changes.length} change{workbench.changes.length === 1
                ? ""
                : "s"} into a named point on <strong>{workbench.activeVariant.name}</strong>.
            </p>

            <label class={fieldClass}>
              <span class={fieldLabelClass}>Message</span>
              <input
                class={versionInputClass}
                bind:value={savePointMessage}
                placeholder="Describe the layout change"
              />
            </label>

            <Button
              variant="coral"
              class={fullActionClass}
              disabled={workbench.changes.length === 0 || saving}
              onclick={createSavePoint}
            >
              <BookmarkPlus size={15} />
              {saving ? "Saving" : "Save point"}
            </Button>
          </Card.Content>
        </Card.Root>

        <Card.Root class={cleanCardClass}>
          <Card.Content class={cleanBodyClass}>
            {#if workbench.changes.length === 0}
              <CheckCircle2 size={18} />
              <span>Draft matches the current base.</span>
            {:else}
              <GitCommit size={18} />
              <span>{workbench.changes.length} local change{workbench.changes.length === 1 ? "" : "s"} waiting.</span>
            {/if}
          </Card.Content>
        </Card.Root>
      </aside>
    </div>
  {:else}
    <div class={cn(versionsGridClass, historyGridClass)}>
      <Card.Root class={timelineCardClass}>
        <Card.Header class={cn(versionsCardHeaderClass, timelineTitleClass)}>
          <div>
            <Card.Title class={versionsCardTitleClass}>Version history</Card.Title>
            <Card.Description class={timelineDescriptionClass}>
              {workbench.variants.length} variants / {workbench.savePoints.length} save points
            </Card.Description>
          </div>
        </Card.Header>

        <Card.Content class={timelineBodyClass}>
          {#if workbench.savePoints.length === 0}
            <div class={timelineEmptyClass}>
              <History size={24} />
              <span>No save points yet. Create one from the Changes tab.</span>
            </div>
          {:else}
            <div class={timelineTracksClass}>
              {#each workbench.savePointTracks as track (track.id)}
                <article class={timelineTrackClass} data-active={track.id === workbench.activeVariantId}>
                  <div class={trackHeadClass}>
                    <span class={trackSwatchClass} style={`background: ${track.color}`}></span>
                    <strong class={trackNameClass}>{track.name}</strong>
                    {#if track.id === workbench.activeVariantId}
                      <Chip class={trackChipClass}>on</Chip>
                    {/if}
                  </div>

                  {#if track.note}
                    <div class={trackNoteClass}>
                      <GitBranch size={13} />
                      <span>{track.note}</span>
                    </div>
                  {/if}

                  <div class={trackLineClass} style={`--track-color: ${track.color}`}>
                    {#if track.points.length === 0}
                      <div class={trackEmptyClass}>No save points on this variant</div>
                    {:else}
                      {#each track.points as point (point.id)}
                        <button
                          type="button"
                          class={savepointRowClass}
                          class:selected={selectedSavePoint?.id === point.id}
                          onclick={() => workbench.selectSavePoint(point.id)}
                        >
                          <span class={savepointDotClass} aria-hidden="true"></span>
                          <span class={savepointCopyClass}>
                            <span class={savepointCopyHeadClass}>
                              <strong class={savepointMessageClass}>{point.message}</strong>
                              {#if latestPointId(track) === point.id && track.id === workbench.activeVariantId}
                                <em class={savepointCurrentClass}>current</em>
                              {/if}
                            </span>
                            <small class={savepointDetailsClass}>{pointLabel(point.id)} / {authorLabel(point)} / {formatWhen(point.createdAt)}</small>
                          </span>
                        </button>
                      {/each}
                    {/if}
                  </div>
                </article>
              {/each}
            </div>
          {/if}
        </Card.Content>
      </Card.Root>

      <aside class={cn(versionsSidebarClass, historySidebarClass)} aria-label="Selected save point">
        <Card.Root>
          <Card.Header class={versionsCardHeaderClass}>
            <Card.Title class={versionsCardTitleClass}>Save point</Card.Title>
          </Card.Header>
          <Card.Content class={versionsCardBodyClass}>
            {#if selectedSavePoint}
              <div class={savepointHeroClass}>
                <div
                  class={savepointCapClass}
                  style={`background: ${selectedVariant?.color ?? "var(--ink)"}`}
                >
                  {pointLabel(selectedSavePoint.id)}
                </div>
                <div>
                  <span class={savepointVariantClass}>{selectedVariant?.name ?? selectedSavePoint.variantId}</span>
                  <h2 class={savepointTitleClass}>{selectedSavePoint.message}</h2>
                </div>
              </div>

              <dl class={savepointMetaClass}>
                <div class={savepointMetaRowClass}>
                  <dt class={savepointMetaTermClass}>When</dt>
                  <dd class={savepointMetaDescriptionClass}>{formatWhen(selectedSavePoint.createdAt)}</dd>
                </div>
                <div class={savepointMetaRowClass}>
                  <dt class={savepointMetaTermClass}>Author</dt>
                  <dd class={savepointMetaDescriptionClass}>{authorLabel(selectedSavePoint)}</dd>
                </div>
                <div class={savepointMetaRowClass}>
                  <dt class={savepointMetaTermClass}>Changes</dt>
                  <dd class={savepointMetaDescriptionClass}>{selectedChanges.length}</dd>
                </div>
              </dl>

              <div class={actionRowClass}>
                <Button variant="coral" size="sm" disabled={restoring} onclick={restoreSelectedSavePoint}>
                  <RotateCcw size={14} />
                  {restoring ? "Restoring" : "Restore"}
                </Button>
                <Button variant="coral" size="sm" onclick={flashSelectedSavePoint}>
                  <Zap size={14} />
                  Flash this
                </Button>
              </div>

            {:else}
              <div class={sideEmptyClass}>Select a save point to inspect.</div>
            {/if}
          </Card.Content>
        </Card.Root>

        {#if selectedSavePoint}
          <VersionChangesPanel
            changes={selectedChanges}
            total={selectedChanges.length}
            title="Save point changes"
            bind:open={selectedChangesOpen}
          />
        {/if}

        <Card.Root>
          <Card.Header class={versionsCardHeaderClass}>
            <Card.Title class={versionsCardTitleClass}>Branch off a variant</Card.Title>
          </Card.Header>
          <Card.Content class={versionsCardBodyClass}>
            <label class={fieldClass}>
              <span class={fieldLabelClass}>From</span>
              <input
                class={versionInputClass}
                value={selectedSavePoint
                  ? `${selectedVariant?.name ?? selectedSavePoint.variantId} @ ${pointLabel(selectedSavePoint.id)}`
                  : "Select a save point"}
                readonly
              />
            </label>

            <label class={fieldClass}>
              <span class={fieldLabelClass}>Name</span>
              <input class={versionInputClass} bind:value={branchName} placeholder="new-variant" />
            </label>

            <Button
              variant="coral"
              class={fullActionClass}
              disabled={!selectedSavePoint || branching}
              onclick={branchFromSelectedSavePoint}
            >
              <GitBranch size={15} />
              {branching ? "Creating" : "Create variant"}
            </Button>
          </Card.Content>
        </Card.Root>
      </aside>
    </div>
  {/if}
</section>

{#if flashProfile}
  <FlashOverlay
    bind:open={flashOverlayOpen}
    profile={flashProfile}
    changes={flashChanges}
    onclose={closeFlashOverlay}
  />
{/if}
