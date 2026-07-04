import { browser } from "$app/environment";
import { getContext, setContext } from "svelte";

import { EditorStore, type EditorStoreOptions } from "$lib/app/editor-store.svelte";
import {
  createCommunityAdoptionVersioning,
  type CreateCommunityAdoptionVersioningInput,
} from "$lib/community/adoption";
import {
  createLocalSavePoint,
  listLocalSavePointsByVariant,
  loadForks,
  saveForks,
} from "$lib/keyboard/local-store";
import { sampleBoards, type SampleBoardId } from "$lib/keyboard/sample-boards";
import {
  changesForSavePoint,
  createSavePointFromProfile,
  latestSavePointForVariant,
  listOrderedSavePointsForVariant,
  localAuthorMeta,
  resolveProfileAtSavePoint,
} from "$lib/keyboard/save-points";
import {
  cloneDevice,
  type SavePoint,
  type SavePointAuthorMeta,
  type WorkspaceFork,
} from "$lib/keyboard/schema";
import { newId } from "$lib/util/id";

export interface WorkbenchStoreOptions extends EditorStoreOptions {
  boardId?: SampleBoardId;
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

export interface FlashSavePointIntent {
  savePointId: string;
  requestedAt: string;
  status: "stubbed";
  target: "flash-overlay";
}

const WORKBENCH_CONTEXT = Symbol("kbgui.workbench");
const MAIN_VARIANT_ID = "main";
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
  flashIntent = $state<FlashSavePointIntent | null>(null);
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

  constructor(options: WorkbenchStoreOptions = {}) {
    const boardId = options.boardId ?? "default";
    super({
      ...options,
      baseProfile: options.baseProfile ?? sampleBoards[boardId],
    });
    this.activeBoardId = boardId;
    this.persistVersioning = options.persist ?? true;

    if (browser) {
      void this.hydrateVersioning();
    } else {
      this.versioningHydrated = true;
    }
  }

  async switchSampleBoard(boardId: SampleBoardId) {
    if (boardId === this.activeBoardId) return;
    this.activeBoardId = boardId;
    this.activeVariantId = MAIN_VARIANT_ID;
    await this.replaceProfile(sampleBoards[boardId]);
  }

  async createSavePoint(message = "", options: SavePointActionOptions = {}) {
    if (this.changes.length === 0) return undefined;

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

    try {
      if (this.persistVersioning && browser) await createLocalSavePoint(savePoint);
      await this.commitCurrentDraftAsBase();
      this.versioningError = null;
    } catch (error) {
      this.versioningError = error instanceof Error ? error.message : "Could not create save point";
      throw error;
    }

    return savePoint;
  }

  selectSavePoint(id: string) {
    if (!this.savePoints.some((savePoint) => savePoint.id === id)) return;
    this.selectedSavePointId = id;
  }

  async restoreSavePoint(savePointId = this.selectedSavePoint?.id) {
    if (!savePointId) return undefined;

    const profile = resolveProfileAtSavePoint(this.savePoints, savePointId);
    if (!profile) return undefined;

    this.selectedSavePointId = savePointId;
    await this.loadProfileAsDraft(profile);
    return profile;
  }

  async branchFromSavePoint(name = "", options: BranchFromSavePointOptions = {}) {
    const savePointId = options.savePointId ?? this.selectedSavePoint?.id;
    const savePoint = savePointId
      ? this.savePoints.find((candidate) => candidate.id === savePointId)
      : undefined;
    if (!savePoint) return undefined;

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

    try {
      if (this.persistVersioning && browser) await saveForks(this.forks);
      await this.replaceProfile(fork.device, fork.device);
      this.baseProfile = cloneDevice(fork.device);
      this.profile = cloneDevice(fork.device);
      await this.commitCurrentDraftAsBase();
      this.versioningError = null;
    } catch (error) {
      this.versioningError =
        error instanceof Error ? error.message : "Could not branch from save point";
      throw error;
    }

    return fork;
  }

  async adoptCommunityVariant(input: AdoptCommunityVariantInput) {
    const { fork, savePoint } = createCommunityAdoptionVersioning(input);

    this.forks = [fork, ...this.forks.filter((candidate) => candidate.id !== fork.id)];
    this.savePoints = upsertSavePoint(this.savePoints, savePoint);
    this.activeVariantId = fork.id;
    this.selectedSavePointId = savePoint.id;

    try {
      if (this.persistVersioning && browser) {
        await saveForks(this.forks);
        await createLocalSavePoint(savePoint);
      }
      await this.replaceProfile(fork.device, fork.device);
      this.baseProfile = cloneDevice(fork.device);
      this.profile = cloneDevice(fork.device);
      await this.commitCurrentDraftAsBase();
      this.versioningError = null;
    } catch (error) {
      this.versioningError =
        error instanceof Error ? error.message : "Could not adopt community keymap";
      throw error;
    }

    return { fork, savePoint };
  }

  flashSavePoint(savePointId = this.selectedSavePoint?.id, options: SavePointActionOptions = {}) {
    if (!savePointId || !this.savePoints.some((savePoint) => savePoint.id === savePointId)) {
      return undefined;
    }

    this.selectedSavePointId = savePointId;
    this.flashIntent = {
      savePointId,
      requestedAt: timestampFor(options),
      status: "stubbed",
      target: "flash-overlay",
    };
    return this.flashIntent;
  }

  private async hydrateVersioning() {
    if (!this.persistVersioning) {
      this.versioningHydrated = true;
      return;
    }

    try {
      const forks = await loadForks();
      const variantIds = [MAIN_VARIANT_ID, ...forks.map((fork) => fork.id)];
      const savePointsByVariant = await Promise.all(
        variantIds.map((variantId) => listLocalSavePointsByVariant(variantId)),
      );

      this.forks = forks;
      this.savePoints = savePointsByVariant.flat();
      this.selectedSavePointId =
        this.activeSavePoints[0]?.id ?? newestSavePoint(this.savePoints)?.id ?? null;
      this.versioningError = null;
    } catch (error) {
      this.versioningError =
        error instanceof Error ? error.message : "Could not load version history";
    } finally {
      this.versioningHydrated = true;
    }
  }
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

function normalizedVariantName(name: string, index: number): string {
  return name.trim() || `variant-${index}`;
}
