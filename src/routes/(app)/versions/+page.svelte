<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import {
    BookmarkPlus,
    CheckCircle2,
    GitBranch,
    GitCommit,
    History,
    RotateCcw,
    Trash2,
    Undo2,
    UploadCloud,
    Workflow,
    Zap,
  } from "@lucide/svelte";
  import { Effect } from "effect";

  import { forkApp, startScopedApp } from "$lib/app/runtime";
  import { authClient } from "$lib/auth-client";
  import {
    decodeAuthClientErrorEffect,
    decodeGitHubFirmwareAppStatusEffect,
    decodeGitHubFirmwareBuildResponseEffect,
    decodeGitHubFirmwareSyncResponseEffect,
  } from "$lib/app/auth-client-boundary";
  import { getFirmwareBuildEventsContext } from "$lib/app/firmware-build-events.svelte";
  import {
    authClientErrorMessage,
    createFirmwareGithubSyncInput,
    firmwareGithubBranchLabel,
    firmwareGithubVariantInput,
  } from "$lib/app/firmware-github-actions";
  import { getShellContext } from "$lib/app/shell-store.svelte";
  import { planSavePointFlash } from "$lib/app/save-point-flash";
  import { getViaLiveSyncContext, type LiveSyncChangeNotice } from "$lib/app/via-live-sync.svelte";
  import { getWorkbenchContext } from "$lib/app/workbench-store.svelte";
  import FlashOverlay from "$lib/components/flash/FlashOverlay.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Chip from "$lib/components/ui/Chip.svelte";
  import { Input, Spinner } from "$lib/components/ui";
  import { Sheet } from "$lib/components/ui/sheet";
  import SegmentedNav from "$lib/components/ui/SegmentedNav.svelte";
  import type { SegmentItem } from "$lib/components/ui/types";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import * as Card from "$lib/components/ui/card/index.js";
  import * as Empty from "$lib/components/ui/empty/index.js";
  import VersionChangesPanel from "$lib/components/versioning/VersionChangesPanel.svelte";
  import type {
    GitHubFirmwareAppStatus,
    GitHubFirmwareSyncResponse,
    GitHubFirmwareVariantInput,
  } from "$lib/github-app/types";
  import {
    compactFirmwareDiagnostics,
    generateFirmwareArtifacts,
  } from "$lib/keyboard/firmware-source";
  import type { ChangeRecord, DeviceProfile, SavePoint } from "$lib/keyboard/schema";
  import { cn } from "$lib/utils.js";
  import { platformError } from "$lib/effect/errors";

  type VersionTab = "history" | "changes";
  type ChangeGroupId = "keymap" | "lighting" | "settings";

  const shell = getShellContext();
  const workbench = getWorkbenchContext();
  const liveSync = getViaLiveSyncContext();
  const firmwareBuildEvents = getFirmwareBuildEventsContext();

  const tab = $derived<VersionTab>(page.url.searchParams.get("tab") === "history" ? "history" : "changes");
  let savePointMessage = $state("");
  let branchName = $state("");
  let actionError = $state<string | null>(null);
  let flashStatus = $state<string | null>(null);
  let flashOverlayOpen = $state(false);
  let flashProfile = $state<DeviceProfile | null>(null);
  let flashGithubVariant = $state<GitHubFirmwareVariantInput | null>(null);
  let flashChanges = $state<LiveSyncChangeNotice[]>([]);
  let firmwareGithubStatus = $state<GitHubFirmwareAppStatus | null>(null);
  let firmwareGithubLoadedFor = $state<string | null>(null);
  let firmwareGithubBusy = $state(false);
  let firmwareGithubAction = $state<"build" | "sync" | null>(null);
  let firmwareGithubError = $state<string | null>(null);
  let firmwareGithubNotice = $state<string | null>(null);
  let firmwareGithubSyncResult = $state<GitHubFirmwareSyncResponse | null>(null);
  let firmwareGithubBuildRequestId = $state<string | null>(null);
  let firmwareRepositorySetupOpen = $state(false);
  let pendingFirmwareBuild = $state(false);
  let saving = $state(false);
  let restoring = $state(false);
  let discarding = $state(false);
  let flashing = $state(false);
  let branching = $state(false);
  let deleting = $state(false);

  const tabItems = $derived([
    { value: "history", label: "History", icon: History, href: "/versions?tab=history" },
    {
      value: "changes",
      label: workbench.changes.length ? `Changes - ${workbench.changes.length}` : "Changes",
      icon: GitCommit,
      href: "/versions?tab=changes",
    },
  ] satisfies SegmentItem<VersionTab>[]);
  const changeGroups = $derived(groupChanges(workbench.changes));
  const profile = $derived(workbench.profile);
  const liveSummary = $derived(liveSync.summary);
  const generatedFirmware = $derived(generateFirmwareArtifacts(profile));
  const activeFirmwareVariant = $derived(
    firmwareGithubVariantInput({
      id: workbench.activeVariant.id,
      name: workbench.activeVariant.name,
      sourceSavePointId: workbench.changes.length === 0 ? workbench.selectedSavePoint?.id : undefined,
    }),
  );
  const activeFirmwareBranch = $derived(firmwareGithubBranchLabel(profile, activeFirmwareVariant));
  const githubSignedIn = $derived(shell.account.status === "signed-in");
  const firmwareGithubReady = $derived(firmwareGithubStatus?.connected === true);
  const firmwareGithubTracking = $derived(
    firmwareGithubBuildRequestId
      ? firmwareBuildEvents.trackingForRequest(firmwareGithubBuildRequestId)
      : firmwareBuildEvents.trackingForBranch(activeFirmwareBranch),
  );
  const effectiveFirmwareGithubRequestId = $derived(
    firmwareGithubBuildRequestId ?? firmwareGithubTracking?.requestId ?? null,
  );
  const firmwareGithubEvent = $derived(
    firmwareBuildEvents.latestForRequest(effectiveFirmwareGithubRequestId),
  );
  const firmwareGithubRun = $derived(firmwareGithubEvent?.run ?? null);
  const firmwareGithubArtifact = $derived(firmwareGithubRun?.artifact ?? null);
  const blockingFirmwareDiagnostics = $derived(
    compactFirmwareDiagnostics(
      generatedFirmware.diagnostics.filter((item) => item.severity === "error"),
    ),
  );
  const needsAttentionCount = $derived(liveSummary.invalid + blockingFirmwareDiagnostics.length);
  const managedFirmwareRepository = $derived(
    firmwareGithubSyncResult?.repository ?? firmwareGithubEvent?.repository ?? null,
  );
  const displayedFirmwareBranch = $derived(
    firmwareGithubSyncResult?.branch.branchName ??
      firmwareGithubEvent?.branch.branchName ??
      firmwareGithubTracking?.branchName ??
      activeFirmwareBranch,
  );
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
    "change-metric grid min-h-[66px] grid-cols-[minmax(0,1fr)_auto] items-center gap-kb-10 rounded-lg border border-line bg-surface px-kb-14 py-kb-12 data-[empty=true]:[&_b]:text-ink-3";
  const changeMetricTitleClass =
    "block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12px] tracking-[0.04em] uppercase";
  const changeMetricDescriptionClass =
    "mt-kb-4 block overflow-hidden text-ellipsis whitespace-nowrap text-[12px] text-ink-3";
  const changeMetricCountClass = "font-mono text-[24px] font-strong";
  const versionsCardHeaderClass =
    "versions-card-header min-h-kb-44 border-line px-kb-16 py-kb-13";
  const versionsCardBodyClass = "versions-card-body grid gap-kb-13 p-kb-16";
  const sideCopyClass = "side-copy m-0 text-[12px] leading-[1.6] text-ink-2";
  const deliveryGridClass =
    "delivery-grid divide-y divide-line overflow-hidden rounded-lg border border-line bg-surface";
  const deliveryLaneClass =
    "delivery-lane grid min-h-kb-52 grid-cols-[minmax(0,1fr)_28px] items-center gap-kb-10 px-kb-12 py-kb-9";
  const deliveryLaneTextClass = "grid min-w-0 gap-kb-2";
  const deliveryLaneLabelClass =
    "overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-medium leading-[1.35] text-ink";
  const deliveryLaneCopyClass =
    "overflow-hidden text-ellipsis whitespace-nowrap text-[11px] leading-[1.35] text-ink-3";
  const deliveryLaneValueClass =
    "grid size-kb-28 place-items-center rounded-md bg-surface-2 font-mono text-[12px] font-medium leading-none text-ink-2 data-[attention=true]:text-danger-ink";
  const branchPanelClass =
    "branch-panel grid border-y border-line py-kb-6";
  const branchLineClass =
    "grid min-w-0 grid-cols-[68px_minmax(0,1fr)] gap-kb-8 py-kb-4 text-[11px] leading-[1.35]";
  const branchKeyClass = "text-ink-3";
  const branchValueClass =
    "m-0 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-ink-2";
  const deliveryActionsClass = "delivery-actions grid gap-kb-7";
  const fieldClass = "grid gap-kb-6";
  const fieldLabelClass =
    "text-ink-3 font-mono text-[10px] tracking-[0.08em] uppercase";
  const versionInputClass =
    "version-input h-kb-34 w-full min-w-0 rounded-keycap border-line-2 bg-surface px-kb-10 py-0 font-mono text-[12px] text-ink read-only:bg-paper-2 read-only:text-ink-2";
  const fullActionClass = "full-action w-full";
  const cleanCardClass = "clean-card bg-surface";
  const cleanBodyClass =
    "clean-body grid grid-cols-[20px_minmax(0,1fr)] items-center gap-kb-8 px-kb-14 py-kb-12 font-mono text-[12px] text-ink-2";
  const timelineCardClass = "timeline-card min-h-[540px] max-[820px]:min-h-0";
  const timelineTitleClass = "timeline-title justify-between";
  const timelineDescriptionClass = "mt-kb-4 font-mono text-[11px] text-ink-3";
  const timelineBodyClass = "timeline-body px-kb-16 pt-kb-18 pb-kb-22";
  const timelineTracksClass =
    "timeline-tracks grid grid-cols-[repeat(3,minmax(180px,1fr))] items-start gap-kb-18 max-[820px]:grid-cols-[minmax(0,1fr)]";
  const timelineTrackClass = "timeline-track min-w-0";
  const trackHeadClass = "track-head flex min-w-0 items-center gap-kb-8 font-mono text-[12px]";
  const trackNameClass = "min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap";
  const trackSwatchClass = "track-swatch size-kb-10 flex-none rounded-pill";
  const trackChipClass = "track-chip min-h-kb-20 px-kb-7";
  const trackNoteClass =
    "track-note mt-kb-10 flex min-w-0 items-center gap-kb-6 font-mono text-[10px] text-ink-3 [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap";
  const trackLineClass =
    "track-line relative mt-kb-12 grid gap-kb-8 pl-kb-18 before:absolute before:top-kb-4 before:bottom-kb-4 before:left-kb-5 before:w-kb-2 before:rounded-pill before:bg-[var(--track-color,var(--ink))] before:opacity-80 before:content-['']";
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
    "flex-none rounded-pill bg-coral px-kb-7 py-kb-3 font-mono text-kb-9 not-italic text-coral-ink uppercase";
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
  const firmwareReadinessClass =
    "grid gap-kb-6 rounded-lg border border-[var(--danger-border)] bg-danger-surface px-kb-11 py-kb-9 text-[11px] leading-[1.45] text-danger-ink";
  const firmwareDiagnosticListClass = "grid gap-kb-4 pl-kb-16";
  const repositorySetupListClass =
    "grid gap-kb-8 rounded-lg border border-line bg-surface p-kb-12 text-[12px] leading-[1.45]";
  const repositorySetupRowClass = "grid grid-cols-[82px_minmax(0,1fr)] gap-kb-8";
  const repositorySetupKeyClass = "font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3";
  const repositorySetupValueClass = "min-w-0 break-words font-mono text-ink";

  $effect(() => {
    if (!browser) return;
    const accountKey =
      shell.account.status === "signed-in"
        ? (shell.account.id ?? shell.account.login)
        : shell.account.status;
    if (firmwareGithubLoadedFor === accountKey) return;
    firmwareGithubLoadedFor = accountKey;

    if (shell.account.status !== "signed-in") {
      firmwareGithubStatus = null;
      firmwareGithubSyncResult = null;
      firmwareGithubBuildRequestId = null;
      return;
    }

    return startScopedApp("firmware-github.status", refreshFirmwareGithubStatusEffect(false));
  });

  function hostEffect<A>(operation: string, task: () => PromiseLike<A>) {
    return Effect.tryPromise({
      try: task,
      catch: (cause) => platformError(operation, cause),
    });
  }

  function createSavePoint() {
    if (workbench.changes.length === 0 || saving) return;

    actionError = null;
    saving = true;
    forkApp(
      "versions.create-save-point",
      Effect.gen(function* () {
        const savePoint = yield* workbench.createSavePointEffect(savePointMessage);
        if (!savePoint) return;
        savePointMessage = "";
        yield* hostEffect("versions.navigate-history", () => goto("/versions?tab=history"));
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(() => (actionError = messageFor(error, "Could not create save point"))),
        ),
        Effect.ensuring(Effect.sync(() => (saving = false))),
      ),
    );
  }

  function restoreSelectedSavePoint() {
    if (!selectedSavePoint || restoring) return;

    actionError = null;
    restoring = true;
    const savePointId = selectedSavePoint.id;
    forkApp(
      "versions.restore-save-point",
      Effect.gen(function* () {
        yield* workbench.restoreSavePointEffect(savePointId);
        yield* hostEffect("versions.navigate-changes", () => goto("/versions?tab=changes"));
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(() => (actionError = messageFor(error, "Could not restore save point"))),
        ),
        Effect.ensuring(Effect.sync(() => (restoring = false))),
      ),
    );
  }

  function discardUncommitted() {
    if (workbench.changes.length === 0 || discarding) return;

    actionError = null;
    discarding = true;
    forkApp(
      "versions.discard-uncommitted",
      workbench.discardUncommittedChangesEffect().pipe(
        Effect.catch((error) =>
          Effect.sync(() => (actionError = messageFor(error, "Could not discard edits"))),
        ),
        Effect.ensuring(Effect.sync(() => (discarding = false))),
      ),
    );
  }

  function branchFromSelectedSavePoint() {
    if (!selectedSavePoint || branching) return;

    actionError = null;
    branching = true;
    const savePointId = selectedSavePoint.id;
    forkApp(
      "versions.branch-save-point",
      workbench.branchFromSavePointEffect(branchName, { savePointId }).pipe(
        Effect.tap((fork) => Effect.sync(() => fork && (branchName = ""))),
        Effect.catch((error) =>
          Effect.sync(() => (actionError = messageFor(error, "Could not create variant"))),
        ),
        Effect.ensuring(Effect.sync(() => (branching = false))),
      ),
    );
  }

  function deleteSelectedSavePoint() {
    if (!selectedSavePoint || deleting) return;
    actionError = null;
    deleting = true;
    const savePointId = selectedSavePoint.id;
    forkApp(
      "versions.delete-save-point",
      workbench.deleteSavePointEffect(savePointId).pipe(
        Effect.catch((error) =>
          Effect.sync(() => (actionError = messageFor(error, "Could not delete save point"))),
        ),
        Effect.ensuring(Effect.sync(() => (deleting = false))),
      ),
    );
  }

  function deleteSelectedVariant() {
    if (!selectedVariant || selectedVariant.id === "main" || deleting) return;
    deleteVariantById(selectedVariant.id);
  }

  function deleteVariantById(variantId: string) {
    if (variantId === "main" || deleting) return;
    actionError = null;
    deleting = true;
    forkApp(
      "versions.delete-variant",
      workbench.deleteVariantEffect(variantId).pipe(
        Effect.catch((error) =>
          Effect.sync(() => (actionError = messageFor(error, "Could not delete variant"))),
        ),
        Effect.ensuring(Effect.sync(() => (deleting = false))),
      ),
    );
  }

  function flashSelectedSavePoint() {
    if (!selectedSavePoint || flashing) return;
    actionError = null;
    flashStatus = null;
    flashing = true;

    forkApp(
      "versions.flash-save-point",
      Effect.gen(function* () {
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
        yield* workbench.loadProfileAsDraftEffect(plan.profile, { origin: "draft" });
        liveSync.processChanges(shell.liveConnection);
        flashStatus = plan.message;
        return;
      }

      flashProfile = plan.profile;
      flashGithubVariant = firmwareGithubVariantInput({
        id: selectedSavePoint.variantId,
        name: selectedVariant?.name ?? selectedSavePoint.variantId,
        sourceSavePointId: selectedSavePoint.id,
      });
      flashChanges = plan.changes;
      flashOverlayOpen = true;
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(() => (actionError = messageFor(error, "Could not flash save point"))),
        ),
        Effect.ensuring(Effect.sync(() => (flashing = false))),
      ),
    );
  }

  function closeFlashOverlay() {
    flashOverlayOpen = false;
    flashProfile = null;
    flashGithubVariant = null;
    flashChanges = [];
  }

  function refreshFirmwareGithubStatusEffect(showBusy = true) {
    if (!githubSignedIn || (showBusy && firmwareGithubBusy)) return Effect.void;
    return Effect.gen(function* () {
      if (showBusy) firmwareGithubBusy = true;
      firmwareGithubError = null;
      const result = yield* hostEffect("firmware-github.status", () =>
        authClient.firmwareGithub.status(),
      );
      const error = yield* decodeAuthClientErrorEffect(result.error).pipe(
        Effect.mapError((cause) => platformError("firmware-github.decode-status-error", cause)),
      );
      if (error) {
        firmwareGithubError = authClientErrorMessage(error, "GitHub firmware status failed.");
        return;
      }
      firmwareGithubStatus = yield* decodeGitHubFirmwareAppStatusEffect(result.data).pipe(
        Effect.mapError((cause) => platformError("firmware-github.decode-status", cause)),
      );
    }).pipe(
      Effect.catch((error) =>
        Effect.sync(
          () =>
            (firmwareGithubError = authClientErrorMessage(
              error,
              "GitHub firmware status failed.",
            )),
        ),
      ),
      Effect.ensuring(
        Effect.sync(() => {
          if (showBusy) firmwareGithubBusy = false;
        }),
      ),
    );
  }

  function syncActiveFirmwareGithubEffect(build = false) {
    if (!githubSignedIn) {
      firmwareGithubError = "Sign in with GitHub first.";
      shell.profileOpen = true;
      return Effect.void;
    }
    if (!firmwareGithubReady) {
      firmwareGithubError = "Install the GitHub App in Settings before syncing firmware.";
      return Effect.void;
    }
    if (firmwareGithubBusy) return Effect.void;
    if (build && !generatedFirmware.buildReady) {
      firmwareGithubError = "Generated firmware has blocking diagnostics. Sync the branch or fix metadata before building.";
      return Effect.void;
    }

    firmwareGithubBusy = true;
    firmwareGithubAction = build ? "build" : "sync";
    firmwareGithubError = null;
    firmwareGithubNotice = null;
    return Effect.gen(function* () {
      const input = createFirmwareGithubSyncInput({
        generated: generatedFirmware,
        profile,
        variant: activeFirmwareVariant,
      });
      const result = yield* hostEffect("firmware-github.sync", () =>
        build ? authClient.firmwareGithub.build(input) : authClient.firmwareGithub.sync(input),
      );
      const error = yield* decodeAuthClientErrorEffect(result.error).pipe(
        Effect.mapError((cause) => platformError("firmware-github.decode-sync-error", cause)),
      );
      if (error) {
        firmwareGithubError = authClientErrorMessage(
          error,
          build ? "GitHub firmware build dispatch failed." : "GitHub firmware sync failed.",
        );
        return;
      }
      let synced: GitHubFirmwareSyncResponse;
      if (build) {
        const built = yield* decodeGitHubFirmwareBuildResponseEffect(result.data).pipe(
          Effect.mapError((cause) => platformError("firmware-github.decode-build", cause)),
        );
        firmwareGithubBuildRequestId = built.build.requestId;
        synced = built;
      } else {
        synced = yield* decodeGitHubFirmwareSyncResponseEffect(result.data).pipe(
          Effect.mapError((cause) => platformError("firmware-github.decode-sync", cause)),
        );
      }
      firmwareGithubSyncResult = synced;
      firmwareGithubNotice = build
        ? `Build dispatched on ${synced.branch.branchName}.`
        : `Synced ${synced.files} files to ${synced.branch.branchName}.`;
    }).pipe(
      Effect.catch((error) =>
        Effect.sync(
          () =>
            (firmwareGithubError = authClientErrorMessage(
              error,
              build ? "GitHub firmware build dispatch failed." : "GitHub firmware sync failed.",
            )),
        ),
      ),
      Effect.ensuring(
        Effect.sync(() => {
          firmwareGithubBusy = false;
          firmwareGithubAction = null;
        }),
      ),
    );
  }

  function syncActiveFirmwareGithub(build = false) {
    forkApp("firmware-github.sync", syncActiveFirmwareGithubEffect(build));
  }

  function requestFirmwareGithubSync(build = false) {
    firmwareGithubError = null;
    if (!githubSignedIn) {
      firmwareGithubError = "Sign in with GitHub first.";
      shell.profileOpen = true;
      return;
    }
    if (!firmwareGithubReady) {
      firmwareGithubError = "Install the GitHub App in Settings before syncing firmware.";
      return;
    }
    if (build && !generatedFirmware.buildReady) {
      firmwareGithubError = "Complete the firmware target before building.";
      return;
    }
    if (!managedFirmwareRepository) {
      pendingFirmwareBuild = build;
      firmwareRepositorySetupOpen = true;
      return;
    }
    syncActiveFirmwareGithub(build);
  }

  function confirmFirmwareRepositorySetup() {
    const build = pendingFirmwareBuild;
    firmwareRepositorySetupOpen = false;
    syncActiveFirmwareGithub(build);
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

  function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
      ariaLabel="Versions tabs"
    />

    <div class={toolbarSpacerClass}></div>

    <Chip dot={workbench.activeVariant.color} title="Active variant">
      {workbench.activeVariant.name}
    </Chip>
    <Chip title="Save point count">{workbench.savePoints.length} save points</Chip>
  </header>

  {#if actionError || workbench.versioningError}
    <Alert.Root variant="destructive">
      <Alert.Title>{actionError ?? workbench.versioningError}</Alert.Title>
    </Alert.Root>
  {/if}

  {#if flashStatus}
    <Alert.Root variant="success">
      <Alert.Title>{flashStatus}</Alert.Title>
    </Alert.Root>
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
        />
      </div>

      <aside class={versionsSidebarClass} aria-label="Save point actions">
        <Card.Root>
          <Card.Header class={versionsCardHeaderClass}>
            <Card.Title>Save point</Card.Title>
          </Card.Header>
          <Card.Content class={versionsCardBodyClass}>
            <p class={sideCopyClass}>
              Save {workbench.changes.length} edit{workbench.changes.length === 1 ? "" : "s"} on
              <strong>{workbench.activeVariant.name}</strong>.
            </p>

            <label class={fieldClass}>
              <span class={fieldLabelClass}>Message</span>
              <Input
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
            <Button
              variant="destructive"
              class={fullActionClass}
              disabled={workbench.changes.length === 0 || discarding}
              onclick={discardUncommitted}
            >
              <Undo2 size={15} />
              {discarding ? "Discarding" : "Discard edits"}
            </Button>
          </Card.Content>
        </Card.Root>

        <Card.Root class={cleanCardClass}>
          <Card.Content class={cleanBodyClass}>
            {#if workbench.changes.length === 0}
              <CheckCircle2 size={18} />
              <span>No uncommitted edits.</span>
            {:else}
              <GitCommit size={18} />
              <span>{workbench.changes.length} local edit{workbench.changes.length === 1 ? "" : "s"} waiting.</span>
            {/if}
          </Card.Content>
        </Card.Root>

        <Card.Root>
          <Card.Header class={versionsCardHeaderClass}>
            <Card.Title>Where edits go</Card.Title>
          </Card.Header>
          <Card.Content class={versionsCardBodyClass}>
            <div class={deliveryGridClass} aria-label="Where edits go">
              <div class={deliveryLaneClass}>
                <div class={deliveryLaneTextClass}>
                  <span class={deliveryLaneLabelClass}>Live write</span>
                  <small class={deliveryLaneCopyClass}>Written to the board now</small>
                </div>
                <strong class={deliveryLaneValueClass}>{liveSummary.liveWritable}</strong>
              </div>
              <div class={deliveryLaneClass}>
                <div class={deliveryLaneTextClass}>
                  <span class={deliveryLaneLabelClass}>Build required</span>
                  <small class={deliveryLaneCopyClass}>Needs a firmware build</small>
                </div>
                <strong class={deliveryLaneValueClass}>{liveSummary.rebuildRequired}</strong>
              </div>
              <div class={deliveryLaneClass}>
                <div class={deliveryLaneTextClass}>
                  <span class={deliveryLaneLabelClass}>Profile only</span>
                  <small class={deliveryLaneCopyClass}>Stays in this profile</small>
                </div>
                <strong class={deliveryLaneValueClass}>{liveSummary.localOnly}</strong>
              </div>
              <div class={deliveryLaneClass}>
                <div class={deliveryLaneTextClass}>
                  <span class={deliveryLaneLabelClass}>Needs attention</span>
                  <small class={deliveryLaneCopyClass}>Incomplete or unmapped edits</small>
                </div>
                <strong class={deliveryLaneValueClass} data-attention={needsAttentionCount > 0}>
                  {needsAttentionCount}
                </strong>
              </div>
            </div>

            <dl class={branchPanelClass} aria-label="Firmware branch status">
              <div class={branchLineClass}>
                <dt class={branchKeyClass}>Branch</dt>
                <dd class={branchValueClass}>{displayedFirmwareBranch}</dd>
              </div>
              <div class={branchLineClass}>
                <dt class={branchKeyClass}>Source</dt>
                <dd class={branchValueClass}>{generatedFirmware.sourceHash}</dd>
              </div>
              <div class={branchLineClass}>
                <dt class={branchKeyClass}>Status</dt>
                <dd class={branchValueClass}>
                  {!generatedFirmware.buildReady
                    ? "fix required"
                    : (firmwareGithubRun?.label ??
                      firmwareGithubTracking?.detail ??
                      firmwareGithubSyncResult?.branch.lastStatus ??
                      (firmwareGithubReady ? "ready" : "GitHub App needed"))}
                </dd>
              </div>
              <div class={branchLineClass}>
                <dt class={branchKeyClass}>Updates</dt>
                <dd class={branchValueClass}>
                  {firmwareBuildEvents.connected
                    ? "live"
                    : "reconnecting"}
                </dd>
              </div>
              <div class={branchLineClass}>
                <dt class={branchKeyClass}>Run</dt>
                <dd class={branchValueClass}>
                  {firmwareGithubRun?.runId
                    ? `#${firmwareGithubRun.runNumber ?? firmwareGithubRun.runId}`
                    : "not built"}
                </dd>
              </div>
              <div class={branchLineClass}>
                <dt class={branchKeyClass}>Artifact</dt>
                <dd class={branchValueClass}>
                  {firmwareGithubArtifact
                    ? `${firmwareGithubArtifact.name} · ${formatBytes(firmwareGithubArtifact.sizeBytes)}`
                    : firmwareGithubRun?.terminal
                      ? "none · build failed"
                      : firmwareGithubRun
                        ? "waiting"
                        : "not built"}
                </dd>
              </div>
            </dl>

            {#if !githubSignedIn || !firmwareGithubReady}
              <Button
                variant="outline"
                class={fullActionClass}
                href="/settings?section=integrations"
              >
                <GitBranch size={15} />
                GitHub firmware settings
              </Button>
            {:else}
              <div class={deliveryActionsClass}>
                {#if blockingFirmwareDiagnostics.length > 0}
                  <div id="firmware-build-readiness" class={firmwareReadinessClass} role="alert">
                    <strong>Complete the firmware target before building.</strong>
                    <ul class={firmwareDiagnosticListClass}>
                      {#each blockingFirmwareDiagnostics as item}
                        <li><span class="font-mono">{item.path ?? item.code}</span>. {item.message}</li>
                      {/each}
                    </ul>
                    <Button
                      variant="outline"
                      size="sm"
                      href="/settings?section=keyboard#firmware-target"
                    >
                      Edit firmware target
                    </Button>
                  </div>
                {/if}
                <Button
                  variant="coral"
                  class={fullActionClass}
                  disabled={firmwareGithubBusy || !generatedFirmware.buildReady}
                  aria-describedby={blockingFirmwareDiagnostics.length > 0
                    ? "firmware-build-readiness"
                    : undefined}
                  onclick={() => requestFirmwareGithubSync(true)}
                >
                  <Workflow size={15} />
                  {firmwareGithubAction === "build" ? "Dispatching" : "Build firmware"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class={fullActionClass}
                  disabled={firmwareGithubBusy}
                  onclick={() => requestFirmwareGithubSync(false)}
                >
                  <UploadCloud size={14} />
                  {firmwareGithubAction === "sync"
                    ? "Syncing"
                    : managedFirmwareRepository
                      ? "Sync branch"
                      : "Create repo & sync"}
                </Button>
                {#if firmwareGithubRun?.htmlUrl}
                  <Button
                    variant="ghost"
                    size="sm"
                    class={fullActionClass}
                    href={firmwareGithubRun.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open run on GitHub
                  </Button>
                {/if}
              </div>
            {/if}

            {#if firmwareGithubError}
              <Alert.Root variant="destructive">
                <Alert.Title>{firmwareGithubError}</Alert.Title>
              </Alert.Root>
            {:else if firmwareGithubNotice}
              <Alert.Root variant="success">
                <Alert.Title>{firmwareGithubNotice}</Alert.Title>
              </Alert.Root>
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
            <Card.Title>Version history</Card.Title>
            <Card.Description class={timelineDescriptionClass}>
              {workbench.variants.length}
              {workbench.variants.length === 1 ? "variant" : "variants"}
              /
              {workbench.savePoints.length}
              {workbench.savePoints.length === 1 ? "save point" : "save points"}
            </Card.Description>
          </div>
        </Card.Header>

        <Card.Content class={timelineBodyClass}>
          {#if workbench.savePoints.length === 0}
            <Empty.Root class="min-h-[180px] border-0">
              <Empty.Header>
                <Empty.Media variant="icon"><History size={24} /></Empty.Media>
                <Empty.Title>No save points yet</Empty.Title>
                <Empty.Description>Make one from Changes.</Empty.Description>
              </Empty.Header>
            </Empty.Root>
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
                    {#if track.id !== "main"}
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Delete ${track.name} variant`}
                        title={`Delete ${track.name} variant`}
                        disabled={deleting || !workbench.canDeleteVariant(track.id)}
                        onclick={() => deleteVariantById(track.id)}
                      >
                        <Trash2 size={14} />
                      </Button>
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
                      <Empty.Root class="min-h-kb-38 border-0 p-0">
                        <Empty.Title class="text-kb-12 font-medium">No save points</Empty.Title>
                      </Empty.Root>
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
            <Card.Title>Save point</Card.Title>
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
                <Button variant="coral" size="sm" disabled={flashing} onclick={flashSelectedSavePoint}>
                  {#if flashing}<Spinner />{:else}<Zap size={14} />{/if}
                  {flashing ? "Opening" : "Flash this"}
                </Button>
              </div>

              <div class={actionRowClass}>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={deleting || !workbench.canDeleteSavePoint(selectedSavePoint.id)}
                  onclick={deleteSelectedSavePoint}
                >
                  <Trash2 size={14} />
                  Delete save point
                </Button>
                {#if selectedVariant && selectedVariant.id !== "main"}
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={deleting || !workbench.canDeleteVariant(selectedVariant.id)}
                    onclick={deleteSelectedVariant}
                  >
                    <Trash2 size={14} />
                    Delete variant
                  </Button>
                {/if}
              </div>

            {:else}
              <Empty.Root class="min-h-[180px] border-0">
                <Empty.Title>Pick a save point</Empty.Title>
              </Empty.Root>
            {/if}
          </Card.Content>
        </Card.Root>

        {#if selectedSavePoint}
          <VersionChangesPanel
            changes={selectedChanges}
            total={selectedChanges.length}
            title="Save point changes"
          />
        {/if}

        <Card.Root>
          <Card.Header class={versionsCardHeaderClass}>
            <Card.Title>New variant</Card.Title>
          </Card.Header>
          <Card.Content class={versionsCardBodyClass}>
            <label class={fieldClass}>
              <span class={fieldLabelClass}>From</span>
              <Input
                class={versionInputClass}
                value={selectedSavePoint
                  ? `${selectedVariant?.name ?? selectedSavePoint.variantId} @ ${pointLabel(selectedSavePoint.id)}`
                  : "Pick a save point"}
                readonly
              />
            </label>

            <label class={fieldClass}>
              <span class={fieldLabelClass}>Name</span>
              <Input class={versionInputClass} bind:value={branchName} placeholder="new-variant" />
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

<Sheet
  bind:open={firmwareRepositorySetupOpen}
  title={pendingFirmwareBuild ? "Create repository and build" : "Create firmware repository"}
  description="The first sync creates GitHub resources. Review the effects before continuing."
  size="sm"
>
  {#snippet body()}
    <div class="grid gap-kb-12">
      <p class={sideCopyClass}>
        kbui will create and manage a private firmware repository for this GitHub account, then
        commit the generated source and workflow to the variant branch below.
      </p>
      <dl class={repositorySetupListClass}>
        <div class={repositorySetupRowClass}>
          <dt class={repositorySetupKeyClass}>Repository</dt>
          <dd class={repositorySetupValueClass}>
            {shell.account.status === "signed-in" ? shell.account.login : "GitHub account"}/kbui-userspace
          </dd>
        </div>
        <div class={repositorySetupRowClass}>
          <dt class={repositorySetupKeyClass}>Visibility</dt>
          <dd class={repositorySetupValueClass}>Private</dd>
        </div>
        <div class={repositorySetupRowClass}>
          <dt class={repositorySetupKeyClass}>Branch</dt>
          <dd class={repositorySetupValueClass}>{displayedFirmwareBranch}</dd>
        </div>
        <div class={repositorySetupRowClass}>
          <dt class={repositorySetupKeyClass}>Workflow</dt>
          <dd class={repositorySetupValueClass}>
            {profile.firmware === "qmk"
              ? ".github/workflows/build_binaries.yaml"
              : ".github/workflows/build.yml"}
          </dd>
        </div>
        <div class={repositorySetupRowClass}>
          <dt class={repositorySetupKeyClass}>Build</dt>
          <dd class={repositorySetupValueClass}>
            {pendingFirmwareBuild ? "Dispatch after sync" : "Do not dispatch"}
          </dd>
        </div>
      </dl>
    </div>
  {/snippet}
  {#snippet footer()}
    <Button variant="ghost" size="sm" onclick={() => (firmwareRepositorySetupOpen = false)}>
      Cancel
    </Button>
    <Button variant="coral" size="sm" onclick={confirmFirmwareRepositorySetup}>
      {pendingFirmwareBuild ? "Create repo & build" : "Create private repo & sync"}
    </Button>
  {/snippet}
</Sheet>

{#if flashProfile}
  <FlashOverlay
    bind:open={flashOverlayOpen}
    profile={flashProfile}
    changes={flashChanges}
    githubVariant={flashGithubVariant}
    onclose={closeFlashOverlay}
  />
{/if}
