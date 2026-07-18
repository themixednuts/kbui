import { browser } from "$app/environment";
import { Deferred, Effect } from "effect";
import { getContext, setContext } from "svelte";

import {
  EditorStore,
  type EditorStoreOptions,
  type ReplaceProfileOptions,
} from "$lib/app/editor-store.svelte";
import {
  createCommunityAdoptionVersioning,
  type CreateCommunityAdoptionVersioningInput,
} from "$lib/community/adoption";
import {
  loadLocalDevice,
  loadLocalDraft,
  loadLocalVersionGraphEffect,
  replaceLocalVersionGraphEffect,
  saveLocalDeviceEffect,
} from "$lib/keyboard/local-store";
import { forkApp, runApp } from "$lib/app/runtime";
import { platformError } from "$lib/effect/errors";
import {
  MAIN_WORKBENCH_VARIANT_ID,
  mergeWorkbenchVersionGraphs,
  normalizeWorkbenchVersionGraph,
  type WorkbenchVersionGraph,
} from "$lib/app/workbench-version-graph";
import { starterBoardProfile, type SampleBoardId } from "$lib/keyboard/sample-boards";
import {
  changesForSavePoint,
  createSavePointFromProfile,
  latestSavePointForVariant,
  listOrderedSavePointsForVariant,
  localAuthorMeta,
  materializeSavePointProfile,
  resolveProfileAtSavePoint,
} from "$lib/keyboard/save-points";
import {
  cloneDevice,
  withDeviceProfileOrigin,
  type DeviceProfile,
  type DeviceProfileOrigin,
  type SavePoint,
  type SavePointAuthorMeta,
  type WorkspaceFork,
} from "$lib/keyboard/schema";
import { newId } from "$lib/util/id";

export interface WorkbenchStoreOptions extends EditorStoreOptions {
  boardId?: SampleBoardId;
  loadDevice?: typeof loadLocalDevice;
  loadDraft?: typeof loadLocalDraft;
}

export interface WorkbenchVariant {
  id: string;
  name: string;
  color: string;
  note?: string;
}

export interface WorkbenchSavePointTrack extends WorkbenchVariant {
  points: SavePoint[];
}

export interface SavePointActionOptions {
  id?: string;
  createdAt?: string;
  nowMs?: number;
  authorMeta?: SavePointAuthorMeta;
}

export interface BranchFromSavePointOptions extends SavePointActionOptions {
  savePointId?: string;
}

export type AdoptCommunityVariantInput = CreateCommunityAdoptionVersioningInput;

export interface WorkbenchHydrationSelection {
  baseProfile: DeviceProfile;
  origin: DeviceProfileOrigin;
  profile: DeviceProfile;
}

export interface WorkbenchHydrationInput {
  connectedProfile?: DeviceProfile;
  draftBaseProfile?: DeviceProfile;
  draftProfile?: DeviceProfile;
  starterProfile: DeviceProfile;
}

export interface HydrateActiveProfileOptions {
  connectedProfile?: DeviceProfile;
  force?: boolean;
}

const WORKBENCH_CONTEXT = Symbol("kbgui.workbench");
const MAIN_VARIANT_ID = MAIN_WORKBENCH_VARIANT_ID;
const forkLaneColors = [
  "var(--coral)",
  "var(--mustard)",
  "var(--lilac)",
  "var(--mint)",
  "var(--teal)",
];
const mainVariant = {
  id: MAIN_VARIANT_ID,
  name: "main",
  color: "var(--ink)",
  note: "local base profile",
} satisfies WorkbenchVariant;

export class WorkbenchStore extends EditorStore {
  activeBoardId = $state<SampleBoardId>("default");
  activeVariantId = $state(MAIN_VARIANT_ID);
  forks = $state<WorkspaceFork[]>([]);
  savePoints = $state<SavePoint[]>([]);
  selectedSavePointId = $state<string | null>(null);
  deletedForkIds = $state<string[]>([]);
  deletedSavePointIds = $state<string[]>([]);
  versionGraphRevision = $state(0);
  versionGraphUpdatedAt = $state(new Date(0).toISOString());
  versioningHydrated = $state(false);
  versioningError = $state<string | null>(null);

  readonly variants = $derived.by((): WorkbenchVariant[] => [
    mainVariant,
    ...this.forks.map((fork, index) => ({
      id: fork.id,
      name: fork.name,
      color: forkLaneColors[index % forkLaneColors.length],
      note:
        fork.source?.kind === "community"
          ? `adopted from ${fork.source.title}`
          : fork.parentSavePointId
            ? `branched from ${fork.sourceVariantId ?? MAIN_VARIANT_ID} @ ${fork.parentSavePointId}`
            : `branched from ${fork.baseProfileId}`,
    })),
  ]);

  readonly activeVariant = $derived.by(
    () => this.variants.find((variant) => variant.id === this.activeVariantId) ?? mainVariant,
  );

  readonly activeSavePoints = $derived.by(() =>
    listOrderedSavePointsForVariant(this.savePoints, this.activeVariantId),
  );

  readonly selectedSavePoint = $derived.by(() => {
    const selected = this.selectedSavePointId
      ? this.savePoints.find((savePoint) => savePoint.id === this.selectedSavePointId)
      : undefined;
    return selected ?? this.activeSavePoints[0] ?? newestSavePoint(this.savePoints);
  });

  readonly selectedSavePointChanges = $derived.by(() =>
    this.selectedSavePoint ? changesForSavePoint(this.selectedSavePoint, this.savePoints) : [],
  );

  readonly savePointTracks = $derived.by((): WorkbenchSavePointTrack[] =>
    this.variants.map((variant) => ({
      ...variant,
      points: listOrderedSavePointsForVariant(this.savePoints, variant.id),
    })),
  );

  private readonly persistVersioning: boolean;
  private readonly loadDevice: typeof loadLocalDevice;
  private readonly loadDraft: typeof loadLocalDraft;
  private readonly loadPersistedDrafts: boolean;
  private activeProfileHydrationLocked = false;
  private graphSynchronizer: ((graph: WorkbenchVersionGraph) => Effect.Effect<void, Error>) | null =
    null;
  private readonly versioningReady = Deferred.makeUnsafe<void>();

  constructor(options: WorkbenchStoreOptions = {}) {
    const boardId = options.boardId ?? "default";
    super({
      ...options,
      autoHydrate: false,
      baseProfile: options.baseProfile ?? starterBoardProfile(boardId),
    });
    this.activeBoardId = boardId;
    this.activeProfileHydrationLocked = Boolean(options.baseProfile || options.profile);
    this.loadDevice = options.loadDevice ?? loadLocalDevice;
    this.loadDraft = options.loadDraft ?? loadLocalDraft;
    this.persistVersioning = options.persist ?? true;
    this.loadPersistedDrafts = this.persistVersioning || options.loadDraft !== undefined;
    if (browser) {
      this.hydrated = false;
      forkApp("workbench.hydrate-profile", this.hydrateActiveProfileEffect(), (_label, message) => {
        this.persistenceError = message;
      });
      forkApp("workbench.hydrate-versioning", this.hydrateVersioningEffect(), (_label, message) => {
        this.versioningError = message;
      });
    } else {
      this.versioningHydrated = true;
      forkApp("workbench.versioning-ready", Deferred.succeed(this.versioningReady, undefined));
    }
  }

  override replaceProfile(
    baseProfile: DeviceProfile,
    profile?: DeviceProfile,
    options: ReplaceProfileOptions = {},
  ) {
    this.activeProfileHydrationLocked = true;
    return super.replaceProfile(baseProfile, profile, options);
  }

  selectStarterBoard(boardId: SampleBoardId) {
    if (boardId === this.activeBoardId && this.profile.origin === "starter") {
      return runApp("workbench.select-starter-board", Effect.void);
    }
    this.activeBoardId = boardId;
    this.activeVariantId = MAIN_VARIANT_ID;
    this.activeProfileHydrationLocked = true;
    return super.replaceProfile(starterBoardProfile(boardId), undefined, {
      hydrateDraft: false,
      origin: "starter",
    });
  }

  createSavePoint(message = "", options: SavePointActionOptions = {}) {
    if (this.changes.length === 0) {
      return runApp("workbench.create-save-point", Effect.succeed(undefined));
    }

    const parent = latestSavePointForVariant(this.savePoints, this.activeVariantId);
    const savePoint = createSavePointFromProfile({
      id: options.id ?? randomId("sp"),
      variantId: this.activeVariantId,
      message,
      createdAt: timestampFor(options),
      authorMeta: options.authorMeta ?? localAuthorMeta,
      profile: this.profile,
      baseProfile: this.baseProfile,
      parentSavePointId: parent?.id,
    });

    this.savePoints = upsertSavePoint(this.savePoints, savePoint);
    this.selectedSavePointId = savePoint.id;

    return runApp(
      "workbench.create-save-point",
      Effect.gen({ self: this }, function* () {
        yield* this.persistVersionGraphEffect();
        yield* this.commitCurrentDraftAsBaseEffect();
        this.versioningError = null;
        return savePoint;
      }).pipe(
        Effect.tapError((error) =>
          Effect.sync(() => {
            this.versioningError = errorMessage(error, "Could not create save point");
          }),
        ),
      ),
    );
  }

  selectSavePoint(id: string) {
    if (!this.savePoints.some((savePoint) => savePoint.id === id)) return;
    this.selectedSavePointId = id;
    forkApp(
      "workbench.persist-version-graph",
      this.persistVersionGraphEffect(),
      (_label, message) => {
        this.versioningError = message;
      },
    );
  }

  restoreSavePoint(savePointId = this.selectedSavePoint?.id) {
    if (!savePointId) {
      return runApp("workbench.restore-save-point", Effect.succeed(undefined));
    }

    const profile = resolveProfileAtSavePoint(this.savePoints, savePointId);
    if (!profile) return runApp("workbench.restore-save-point", Effect.succeed(undefined));

    this.selectedSavePointId = savePointId;
    return runApp(
      "workbench.restore-save-point",
      this.loadProfileAsDraftEffect(profile, { origin: "draft" }).pipe(
        Effect.andThen(this.persistVersionGraphEffect()),
        Effect.as(profile),
      ),
    );
  }

  branchFromSavePoint(name = "", options: BranchFromSavePointOptions = {}) {
    const savePointId = options.savePointId ?? this.selectedSavePoint?.id;
    const savePoint = savePointId
      ? this.savePoints.find((candidate) => candidate.id === savePointId)
      : undefined;
    if (!savePoint) {
      return runApp("workbench.branch-from-save-point", Effect.succeed(undefined));
    }

    const fork: WorkspaceFork = {
      id: options.id ?? randomId("variant"),
      name: normalizedVariantName(name, this.forks.length + 1),
      baseProfileId: savePoint.snapshot.id,
      createdAt: timestampFor(options),
      device: cloneDevice(savePoint.snapshot),
      parentSavePointId: savePoint.id,
      sourceVariantId: savePoint.variantId,
    };

    this.forks = [fork, ...this.forks];
    this.activeVariantId = fork.id;
    this.selectedSavePointId = savePoint.id;

    return runApp(
      "workbench.branch-from-save-point",
      Effect.gen({ self: this }, function* () {
        yield* this.persistVersionGraphEffect();
        yield* this.replaceProfileEffect(fork.device, fork.device);
        this.baseProfile = cloneDevice(fork.device);
        this.profile = cloneDevice(fork.device);
        yield* this.commitCurrentDraftAsBaseEffect();
        this.versioningError = null;
        return fork;
      }).pipe(
        Effect.tapError((error) =>
          Effect.sync(() => {
            this.versioningError = errorMessage(error, "Could not branch from save point");
          }),
        ),
      ),
    );
  }

  adoptCommunityVariant(input: AdoptCommunityVariantInput) {
    const { fork, savePoint } = createCommunityAdoptionVersioning(input);

    this.forks = [fork, ...this.forks.filter((candidate) => candidate.id !== fork.id)];
    this.savePoints = upsertSavePoint(this.savePoints, savePoint);
    this.activeVariantId = fork.id;
    this.selectedSavePointId = savePoint.id;

    return runApp(
      "workbench.adopt-community-variant",
      Effect.gen({ self: this }, function* () {
        yield* this.persistVersionGraphEffect();
        yield* this.replaceProfileEffect(fork.device, fork.device);
        this.baseProfile = cloneDevice(fork.device);
        this.profile = cloneDevice(fork.device);
        yield* this.commitCurrentDraftAsBaseEffect();
        this.versioningError = null;
        return { fork, savePoint };
      }).pipe(
        Effect.tapError((error) =>
          Effect.sync(() => {
            this.versioningError = errorMessage(error, "Could not adopt community keymap");
          }),
        ),
      ),
    );
  }

  materializeSavePointProfile(savePointId = this.selectedSavePoint?.id) {
    if (!savePointId) return undefined;
    const profile = materializeSavePointProfile(this.savePoints, savePointId);
    if (!profile) return undefined;

    this.selectedSavePointId = savePointId;
    forkApp(
      "workbench.persist-version-graph",
      this.persistVersionGraphEffect(),
      (_label, message) => {
        this.versioningError = message;
      },
    );
    return profile;
  }

  setVersionGraphSynchronizer(
    synchronizer: ((graph: WorkbenchVersionGraph) => Effect.Effect<void, Error>) | null,
  ) {
    this.graphSynchronizer = synchronizer;
  }

  whenVersioningReady() {
    return runApp("workbench.versioning-ready", Deferred.await(this.versioningReady));
  }

  versionGraphSnapshot(): WorkbenchVersionGraph {
    return normalizeWorkbenchVersionGraph({
      activeVariantId: this.activeVariantId,
      deletedForkIds: this.deletedForkIds,
      deletedSavePointIds: this.deletedSavePointIds,
      forks: this.forks,
      revision: this.versionGraphRevision,
      savePoints: this.savePoints,
      selectedSavePointId: this.selectedSavePointId,
      updatedAt: this.versionGraphUpdatedAt,
    });
  }

  reconcileVersionGraph(remote: WorkbenchVersionGraph): Promise<WorkbenchVersionGraph> {
    return runApp(
      "workbench.reconcile-version-graph",
      Effect.gen({ self: this }, function* () {
        yield* Deferred.await(this.versioningReady);
        const merged = mergeWorkbenchVersionGraphs(this.versionGraphSnapshot(), remote);
        this.applyVersionGraphState(merged);
        if (this.persistVersioning && browser) yield* replaceLocalVersionGraphEffect(merged);
        return merged;
      }),
    );
  }

  canDeleteSavePoint(savePointId: string) {
    return (
      !this.savePoints.some((savePoint) => savePoint.parentSavePointId === savePointId) &&
      !this.forks.some((fork) => fork.parentSavePointId === savePointId)
    );
  }

  deleteSavePoint(savePointId: string) {
    if (!this.savePoints.some((savePoint) => savePoint.id === savePointId)) {
      return runApp("workbench.delete-save-point", Effect.succeed(false));
    }
    if (!this.canDeleteSavePoint(savePointId)) {
      return runApp(
        "workbench.delete-save-point",
        Effect.fail(
          new Error("Delete child history or dependent variants before removing this save point."),
        ),
      );
    }
    this.savePoints = this.savePoints.filter((savePoint) => savePoint.id !== savePointId);
    this.deletedSavePointIds = unionIds(this.deletedSavePointIds, [savePointId]);
    if (this.selectedSavePointId === savePointId) {
      this.selectedSavePointId =
        newestSavePoint(
          this.savePoints.filter((savePoint) => savePoint.variantId === this.activeVariantId),
        )?.id ?? null;
    }
    return runApp(
      "workbench.delete-save-point",
      this.persistVersionGraphEffect().pipe(Effect.as(true)),
    );
  }

  canDeleteVariant(variantId: string) {
    return (
      variantId !== MAIN_VARIANT_ID &&
      this.forks.some((fork) => fork.id === variantId) &&
      !this.forks.some((fork) => fork.sourceVariantId === variantId)
    );
  }

  deleteVariant(variantId: string) {
    if (!this.canDeleteVariant(variantId)) {
      return runApp(
        "workbench.delete-variant",
        Effect.fail(new Error("Delete child variants before removing this variant.")),
      );
    }
    const removedSavePointIds = this.savePoints
      .filter((savePoint) => savePoint.variantId === variantId)
      .map((savePoint) => savePoint.id);
    this.forks = this.forks.filter((fork) => fork.id !== variantId);
    this.savePoints = this.savePoints.filter((savePoint) => savePoint.variantId !== variantId);
    this.deletedForkIds = unionIds(this.deletedForkIds, [variantId]);
    this.deletedSavePointIds = unionIds(this.deletedSavePointIds, removedSavePointIds);
    const activateMain = this.activeVariantId === variantId;
    let mainPoint: SavePoint | undefined;
    if (activateMain) {
      this.activeVariantId = MAIN_VARIANT_ID;
      mainPoint = newestSavePoint(
        this.savePoints.filter((savePoint) => savePoint.variantId === MAIN_VARIANT_ID),
      );
      this.selectedSavePointId = mainPoint?.id ?? null;
    }
    return runApp(
      "workbench.delete-variant",
      Effect.gen({ self: this }, function* () {
        if (mainPoint) {
          yield* this.replaceProfileEffect(mainPoint.snapshot, mainPoint.snapshot, {
            hydrateDraft: false,
            origin: "draft",
          });
        }
        yield* this.persistVersionGraphEffect();
        return true;
      }),
    );
  }

  private hydrateVersioningEffect() {
    if (!this.persistVersioning) {
      return Effect.sync(() => (this.versioningHydrated = true)).pipe(
        Effect.andThen(Deferred.succeed(this.versioningReady, undefined)),
        Effect.map(() => undefined),
      );
    }

    return Effect.gen({ self: this }, function* () {
      this.applyVersionGraphState(yield* loadLocalVersionGraphEffect());
      this.versioningError = null;
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => (this.versioningHydrated = true)).pipe(
          Effect.andThen(Deferred.succeed(this.versioningReady, undefined)),
        ),
      ),
    );
  }

  private applyVersionGraphState(graph: WorkbenchVersionGraph) {
    const normalized = normalizeWorkbenchVersionGraph(graph);
    this.activeVariantId = normalized.activeVariantId;
    this.deletedForkIds = normalized.deletedForkIds;
    this.deletedSavePointIds = normalized.deletedSavePointIds;
    this.forks = normalized.forks;
    this.savePoints = normalized.savePoints;
    this.selectedSavePointId = normalized.selectedSavePointId;
    this.versionGraphRevision = normalized.revision;
    this.versionGraphUpdatedAt = normalized.updatedAt;
  }

  private persistVersionGraphEffect() {
    return Effect.gen({ self: this }, function* () {
      this.versionGraphUpdatedAt = new Date().toISOString();
      const graph = this.versionGraphSnapshot();
      if (this.persistVersioning && browser) yield* replaceLocalVersionGraphEffect(graph);
      if (this.graphSynchronizer) yield* this.graphSynchronizer(graph);
    });
  }

  private hydrateActiveProfileEffect(options: HydrateActiveProfileOptions = {}) {
    if (!this.persistVersioning && !options.force && !options.connectedProfile) {
      this.hydrated = true;
      return Effect.succeed<WorkbenchHydrationSelection | undefined>(undefined);
    }
    if (this.activeProfileHydrationLocked && !options.force && !options.connectedProfile) {
      this.hydrated = true;
      return Effect.succeed<WorkbenchHydrationSelection | undefined>(undefined);
    }

    return Effect.gen({ self: this }, function* () {
      const draft = this.loadPersistedDrafts
        ? yield* Effect.tryPromise({
            try: () => this.loadDraft(options.connectedProfile?.id),
            catch: (cause) => platformError("workbench.load-draft", cause),
          })
        : undefined;
      const draftBase =
        draft && !options.connectedProfile
          ? yield* Effect.tryPromise({
              try: () => this.loadDevice(draft.id),
              catch: (cause) => platformError("workbench.load-device", cause),
            })
          : undefined;
      if (this.activeProfileHydrationLocked && !options.force && !options.connectedProfile) {
        this.hydrated = true;
        return undefined;
      }

      const selection = resolveWorkbenchHydration({
        connectedProfile: options.connectedProfile,
        draftBaseProfile: draftBase,
        draftProfile: draft,
        starterProfile: starterBoardProfile(this.activeBoardId),
      });

      yield* this.replaceProfileEffect(selection.baseProfile, selection.profile, {
        flushPersistence: false,
        hydrateDraft: false,
        origin: selection.origin,
      });
      this.persistenceError = null;
      return selection;
    }).pipe(Effect.ensuring(Effect.sync(() => (this.hydrated = true))));
  }

  hydrateActiveProfile(options: HydrateActiveProfileOptions = {}) {
    return runApp(
      "workbench.hydrate-profile",
      this.hydrateActiveProfileEffect(options),
      (_label, message) => {
        this.persistenceError = message;
      },
    );
  }

  activateConnectedProfile(connectedProfile: DeviceProfile) {
    return runApp(
      "workbench.activate-connected-profile",
      Effect.gen({ self: this }, function* () {
        yield* this.flushPersistenceEffect();
        const selection = yield* this.hydrateActiveProfileEffect({ connectedProfile });
        if (!selection) return undefined;

        if (this.persistVersioning && browser) {
          yield* saveLocalDeviceEffect(selection.baseProfile);
        }
        yield* Effect.tryPromise({
          try: () => this.flushPersistence(),
          catch: (cause) => platformError("workbench.flush-connected-profile", cause),
        });
        this.persistenceError = null;
        return selection;
      }),
      (_label, message) => (this.persistenceError = message),
    );
  }
}

export function resolveWorkbenchHydration(
  input: WorkbenchHydrationInput,
): WorkbenchHydrationSelection {
  if (input.connectedProfile) {
    const matchingDraft =
      input.draftProfile?.id === input.connectedProfile.id ? input.draftProfile : undefined;
    const baseProfile = withDeviceProfileOrigin(input.connectedProfile, "device");
    const profile = withDeviceProfileOrigin(
      {
        ...input.connectedProfile,
        firmwareMetadata:
          matchingDraft?.firmwareMetadata ?? input.connectedProfile.firmwareMetadata,
        settings: matchingDraft?.settings ?? input.connectedProfile.settings,
      },
      "device",
    );
    return {
      baseProfile,
      origin: "device",
      profile,
    };
  }

  if (input.draftProfile) {
    const profile = withDeviceProfileOrigin(input.draftProfile, "draft");
    const baseProfile = withDeviceProfileOrigin(
      input.draftBaseProfile ?? input.draftProfile,
      "draft",
    );
    return {
      baseProfile,
      origin: "draft",
      profile,
    };
  }

  const profile = withDeviceProfileOrigin(input.starterProfile, "starter");
  return {
    baseProfile: cloneDevice(profile),
    origin: "starter",
    profile,
  };
}

export function setWorkbenchContext(workbench: WorkbenchStore) {
  setContext(WORKBENCH_CONTEXT, workbench);
}

export function getWorkbenchContext(): WorkbenchStore {
  return getContext<WorkbenchStore>(WORKBENCH_CONTEXT);
}

export function protocolLabel(protocol: string) {
  if (protocol === "via-v3") return "VIA v3";
  if (protocol === "zmk-studio") return "ZMK Studio";
  return protocol.toUpperCase();
}

function timestampFor(options: SavePointActionOptions): string {
  if (options.createdAt) return options.createdAt;
  if (options.nowMs !== undefined) return new Date(options.nowMs).toISOString();
  return new Date().toISOString();
}

function randomId(prefix: string): string {
  return `${prefix}-${newId()}`;
}

function upsertSavePoint(savePoints: readonly SavePoint[], savePoint: SavePoint): SavePoint[] {
  return [savePoint, ...savePoints.filter((candidate) => candidate.id !== savePoint.id)];
}

function newestSavePoint(savePoints: readonly SavePoint[]): SavePoint | undefined {
  return savePoints.slice().sort((left, right) => {
    if (left.createdAt < right.createdAt) return 1;
    if (left.createdAt > right.createdAt) return -1;
    return right.id.localeCompare(left.id);
  })[0];
}

function unionIds(...collections: string[][]): string[] {
  return [...new Set(collections.flat())].sort();
}

function normalizedVariantName(name: string, index: number): string {
  return name.trim() || `variant-${index}`;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
