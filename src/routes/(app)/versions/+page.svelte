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

<section class="versions-page">
  <header class="versions-toolbar">
    <SegmentedNav
      items={tabItems}
      value={tab}
      onselect={(next) => (tab = next as VersionTab)}
      ariaLabel="Versions tabs"
    />

    <div class="toolbar-spacer"></div>

    <Chip dot={workbench.activeVariant.color} title="Active variant">
      {workbench.activeVariant.name}
    </Chip>
    <Chip title="Save point count">{workbench.savePoints.length} save points</Chip>
  </header>

  {#if actionError || workbench.versioningError}
    <div class="versions-alert" role="status">
      {actionError ?? workbench.versioningError}
    </div>
  {/if}

  {#if flashStatus}
    <div class="versions-status" role="status">
      {flashStatus}
    </div>
  {/if}

  {#if tab === "changes"}
    <div class="versions-grid">
      <div class="versions-main">
        <div class="change-metrics" aria-label="Uncommitted change groups">
          {#each changeGroups as group (group.id)}
            <article class="change-metric" data-empty={group.changes.length === 0}>
              <div>
                <strong>{group.label}</strong>
                <span>{group.description}</span>
              </div>
              <b>{group.changes.length}</b>
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

      <aside class="versions-sidebar" aria-label="Save point actions">
        <Card.Root>
          <Card.Header class="versions-card-header">
            <Card.Title>Save point</Card.Title>
          </Card.Header>
          <Card.Content class="versions-card-body">
            <p class="side-copy">
              Bundle these {workbench.changes.length} change{workbench.changes.length === 1
                ? ""
                : "s"} into a named point on <strong>{workbench.activeVariant.name}</strong>.
            </p>

            <label class="field">
              <span>Message</span>
              <input
                class="version-input"
                bind:value={savePointMessage}
                placeholder="Describe the layout change"
              />
            </label>

            <Button
              variant="coral"
              class="full-action"
              disabled={workbench.changes.length === 0 || saving}
              onclick={createSavePoint}
            >
              <BookmarkPlus size={15} />
              {saving ? "Saving" : "Save point"}
            </Button>
          </Card.Content>
        </Card.Root>

        <Card.Root class="clean-card">
          <Card.Content class="clean-body">
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
    <div class="versions-grid history-grid">
      <Card.Root class="timeline-card">
        <Card.Header class="versions-card-header timeline-title">
          <div>
            <Card.Title>Version history</Card.Title>
            <Card.Description>
              {workbench.variants.length} variants / {workbench.savePoints.length} save points
            </Card.Description>
          </div>
        </Card.Header>

        <Card.Content class="timeline-body">
          {#if workbench.savePoints.length === 0}
            <div class="timeline-empty">
              <History size={24} />
              <span>No save points yet. Create one from the Changes tab.</span>
            </div>
          {:else}
            <div class="timeline-tracks">
              {#each workbench.savePointTracks as track (track.id)}
                <article class="timeline-track" data-active={track.id === workbench.activeVariantId}>
                  <div class="track-head">
                    <span class="track-swatch" style={`background: ${track.color}`}></span>
                    <strong>{track.name}</strong>
                    {#if track.id === workbench.activeVariantId}
                      <Chip class="track-chip">on</Chip>
                    {/if}
                  </div>

                  {#if track.note}
                    <div class="track-note">
                      <GitBranch size={13} />
                      <span>{track.note}</span>
                    </div>
                  {/if}

                  <div class="track-line" style={`--track-color: ${track.color}`}>
                    {#if track.points.length === 0}
                      <div class="track-empty">No save points on this variant</div>
                    {:else}
                      {#each track.points as point (point.id)}
                        <button
                          type="button"
                          class="savepoint-row"
                          class:selected={selectedSavePoint?.id === point.id}
                          onclick={() => workbench.selectSavePoint(point.id)}
                        >
                          <span class="savepoint-dot" aria-hidden="true"></span>
                          <span class="savepoint-copy">
                            <span>
                              <strong>{point.message}</strong>
                              {#if latestPointId(track) === point.id && track.id === workbench.activeVariantId}
                                <em>current</em>
                              {/if}
                            </span>
                            <small>{pointLabel(point.id)} / {authorLabel(point)} / {formatWhen(point.createdAt)}</small>
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

      <aside class="versions-sidebar history-sidebar" aria-label="Selected save point">
        <Card.Root>
          <Card.Header class="versions-card-header">
            <Card.Title>Save point</Card.Title>
          </Card.Header>
          <Card.Content class="versions-card-body">
            {#if selectedSavePoint}
              <div class="savepoint-hero">
                <div
                  class="savepoint-cap"
                  style={`background: ${selectedVariant?.color ?? "var(--ink)"}`}
                >
                  {pointLabel(selectedSavePoint.id)}
                </div>
                <div>
                  <span>{selectedVariant?.name ?? selectedSavePoint.variantId}</span>
                  <h2>{selectedSavePoint.message}</h2>
                </div>
              </div>

              <dl class="savepoint-meta">
                <div>
                  <dt>When</dt>
                  <dd>{formatWhen(selectedSavePoint.createdAt)}</dd>
                </div>
                <div>
                  <dt>Author</dt>
                  <dd>{authorLabel(selectedSavePoint)}</dd>
                </div>
                <div>
                  <dt>Changes</dt>
                  <dd>{selectedChanges.length}</dd>
                </div>
              </dl>

              <div class="action-row">
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
              <div class="side-empty">Select a save point to inspect.</div>
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
          <Card.Header class="versions-card-header">
            <Card.Title>Branch off a variant</Card.Title>
          </Card.Header>
          <Card.Content class="versions-card-body">
            <label class="field">
              <span>From</span>
              <input
                class="version-input"
                value={selectedSavePoint
                  ? `${selectedVariant?.name ?? selectedSavePoint.variantId} @ ${pointLabel(selectedSavePoint.id)}`
                  : "Select a save point"}
                readonly
              />
            </label>

            <label class="field">
              <span>Name</span>
              <input class="version-input" bind:value={branchName} placeholder="new-variant" />
            </label>

            <Button
              variant="coral"
              class="full-action"
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

<style>
  .versions-page {
    display: grid;
    gap: 18px;
    align-content: start;
    min-height: 100%;
    padding: 22px;
  }

  .versions-toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .toolbar-spacer {
    flex: 1;
    min-width: 12px;
  }

  .versions-alert {
    padding: 10px 12px;
    border: 1px solid oklch(0.62 0.2 25 / 0.28);
    border-radius: 8px;
    background: oklch(0.95 0.04 25);
    color: oklch(0.42 0.15 25);
    font-family: var(--mono);
    font-size: 12px;
  }

  .versions-status {
    padding: 10px 12px;
    border: 1px solid color-mix(in oklch, var(--teal) 35%, transparent);
    border-radius: 8px;
    background: color-mix(in oklch, var(--teal) 12%, var(--surface));
    color: var(--teal-ink);
    font-family: var(--mono);
    font-size: 12px;
    line-height: 1.45;
  }

  .versions-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 18px;
    align-items: start;
    min-height: 0;
  }

  .versions-main,
  .versions-sidebar {
    display: grid;
    gap: 14px;
    min-width: 0;
  }

  .change-metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .change-metric {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
    min-height: 66px;
    padding: 12px 14px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: color-mix(in oklch, var(--surface) 76%, transparent);
  }

  .change-metric strong,
  .change-metric span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .change-metric strong {
    font-family: var(--mono);
    font-size: 12px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .change-metric span {
    margin-top: 4px;
    color: var(--ink-3);
    font-size: 12px;
  }

  .change-metric b {
    font-family: var(--mono);
    font-size: 24px;
    font-weight: 600;
  }

  .change-metric[data-empty="true"] b {
    color: var(--ink-3);
  }

  :global(.versions-card-header) {
    display: flex;
    align-items: center;
    min-height: 44px;
    padding: 13px 16px;
    border-bottom: 1px solid var(--line);
  }

  :global(.versions-card-header h3) {
    margin: 0;
    font-family: var(--mono);
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  :global(.versions-card-body) {
    display: grid;
    gap: 13px;
    padding: 16px;
  }

  .side-copy {
    margin: 0;
    color: var(--ink-2);
    font-size: 12px;
    line-height: 1.6;
  }

  .field {
    display: grid;
    gap: 6px;
  }

  .field span {
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .version-input {
    width: 100%;
    min-width: 0;
    height: 34px;
    padding: 0 10px;
    border: 1px solid var(--line-2);
    border-radius: 8px;
    background: var(--surface);
    color: var(--ink);
    font-family: var(--mono);
    font-size: 12px;
  }

  .version-input:read-only {
    color: var(--ink-2);
    background: var(--paper-2);
  }

  :global(.full-action) {
    width: 100%;
  }

  :global(.clean-card) {
    background: color-mix(in oklch, var(--surface) 64%, transparent);
  }

  :global(.clean-body) {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    gap: 8px;
    align-items: center;
    padding: 12px 14px;
    color: var(--ink-2);
    font-family: var(--mono);
    font-size: 12px;
  }

  .history-grid {
    align-items: stretch;
  }

  :global(.timeline-card) {
    min-height: 540px;
  }

  :global(.timeline-title) {
    justify-content: space-between;
  }

  :global(.timeline-title p) {
    margin-top: 4px;
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 11px;
  }

  :global(.timeline-body) {
    padding: 18px 16px 22px;
  }

  .timeline-empty,
  .side-empty {
    display: grid;
    place-items: center;
    gap: 8px;
    min-height: 180px;
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 12px;
    text-align: center;
  }

  .timeline-tracks {
    display: grid;
    grid-template-columns: repeat(3, minmax(180px, 1fr));
    gap: 18px;
    align-items: start;
  }

  .timeline-track {
    min-width: 0;
  }

  .track-head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-family: var(--mono);
    font-size: 12px;
  }

  .track-head strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .track-swatch {
    width: 10px;
    height: 10px;
    flex: none;
    border-radius: 999px;
  }

  :global(.track-chip) {
    min-height: 20px;
    padding-inline: 7px;
  }

  .track-note {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    margin-top: 10px;
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 10px;
  }

  .track-note span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .track-line {
    position: relative;
    display: grid;
    gap: 8px;
    margin-top: 12px;
    padding-left: 18px;
  }

  .track-line::before {
    content: "";
    position: absolute;
    top: 4px;
    bottom: 4px;
    left: 5px;
    width: 2px;
    border-radius: 999px;
    background: var(--track-color, var(--ink));
    opacity: 0.8;
  }

  .track-empty {
    min-height: 38px;
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 11px;
  }

  .savepoint-row {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    width: 100%;
    min-width: 0;
    padding: 8px 8px 8px 10px;
    border: 1px solid transparent;
    border-radius: 8px;
    text-align: left;
  }

  .savepoint-row:hover,
  .savepoint-row.selected {
    border-color: var(--line);
    background: var(--paper-2);
  }

  .savepoint-dot {
    position: absolute;
    top: 14px;
    left: -17px;
    width: 10px;
    height: 10px;
    border: 2px solid var(--paper);
    border-radius: 999px;
    background: var(--track-color, var(--ink));
    box-shadow: 0 0 0 1px var(--track-color, var(--ink));
  }

  .savepoint-copy {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .savepoint-copy span {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
  }

  .savepoint-copy strong,
  .savepoint-copy small {
    overflow: hidden;
    font-family: var(--mono);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .savepoint-copy strong {
    font-size: 12px;
    font-weight: 600;
  }

  .savepoint-copy small {
    color: var(--ink-3);
    font-size: 10px;
  }

  .savepoint-copy em {
    flex: none;
    padding: 3px 7px;
    border-radius: 999px;
    background: var(--coral);
    color: #1c0a04;
    font-family: var(--mono);
    font-size: 9px;
    font-style: normal;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .history-sidebar {
    align-content: start;
  }

  .savepoint-hero {
    display: grid;
    grid-template-columns: 54px minmax(0, 1fr);
    gap: 12px;
    align-items: center;
    padding: 12px;
    border-radius: 8px;
    background: var(--paper-2);
  }

  .savepoint-cap {
    display: grid;
    width: 54px;
    height: 54px;
    place-items: center;
    overflow: hidden;
    border-radius: 9px;
    color: var(--paper);
    font-family: var(--mono);
    font-size: 11px;
    text-transform: uppercase;
  }

  .savepoint-hero span,
  .savepoint-hero h2 {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .savepoint-hero span {
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .savepoint-hero h2 {
    margin: 4px 0 0;
    font-size: 15px;
    line-height: 1.2;
  }

  .savepoint-meta {
    display: grid;
    gap: 0;
    margin: 0;
    font-family: var(--mono);
    font-size: 11px;
  }

  .savepoint-meta div {
    display: grid;
    grid-template-columns: 74px minmax(0, 1fr);
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid var(--line);
  }

  .savepoint-meta div:last-child {
    border-bottom: 0;
  }

  .savepoint-meta dt,
  .savepoint-meta dd {
    min-width: 0;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .savepoint-meta dt {
    color: var(--ink-3);
  }

  .action-row {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }

  @media (max-width: 1180px) {
    .versions-grid,
    .history-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .versions-sidebar {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .history-sidebar {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  @media (max-width: 820px) {
    .versions-page {
      padding: 14px;
    }

    .versions-toolbar {
      flex-wrap: wrap;
    }

    .toolbar-spacer {
      display: none;
    }

    .change-metrics,
    .timeline-tracks,
    .versions-sidebar {
      grid-template-columns: minmax(0, 1fr);
    }

    :global(.timeline-card) {
      min-height: 0;
    }
  }
</style>
