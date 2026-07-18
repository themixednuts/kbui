import { Effect, Schema } from "effect";

import { BoundaryDecodeError } from "$lib/effect/errors";
import {
  decodeSavePointFromStorageEffect,
  decodeWorkspaceForkFromStorageEffect,
  type SavePoint,
  type WorkspaceFork,
} from "$lib/keyboard/schema";

export const MAIN_WORKBENCH_VARIANT_ID = "main";

export interface WorkbenchVersionGraph {
  activeVariantId: string;
  deletedForkIds: string[];
  deletedSavePointIds: string[];
  forks: WorkspaceFork[];
  revision: number;
  savePoints: SavePoint[];
  selectedSavePointId: string | null;
  updatedAt: string;
}

const nonEmptyString = Schema.String.check(
  Schema.makeFilter((value) =>
    value.trim().length > 0 ? undefined : "must be a non-empty string",
  ),
);
const isoTimestamp = nonEmptyString.check(
  Schema.makeFilter((value) =>
    Number.isFinite(Date.parse(value)) ? undefined : "must be an ISO timestamp",
  ),
);
const workbenchVersionGraphBoundarySchema = Schema.Struct({
  activeVariantId: nonEmptyString,
  deletedForkIds: Schema.mutable(Schema.Array(Schema.String)),
  deletedSavePointIds: Schema.mutable(Schema.Array(Schema.String)),
  forks: Schema.mutable(Schema.Array(Schema.Unknown)),
  revision: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  savePoints: Schema.mutable(Schema.Array(Schema.Unknown)),
  selectedSavePointId: Schema.NullOr(nonEmptyString),
  updatedAt: isoTimestamp,
});

export function emptyWorkbenchVersionGraph(): WorkbenchVersionGraph {
  return {
    activeVariantId: MAIN_WORKBENCH_VARIANT_ID,
    deletedForkIds: [],
    deletedSavePointIds: [],
    forks: [],
    revision: 0,
    savePoints: [],
    selectedSavePointId: null,
    updatedAt: new Date(0).toISOString(),
  };
}

export const decodeWorkbenchVersionGraphEffect = Effect.fn("WorkbenchVersionGraph.decode")(
  function* (value: unknown) {
    const input = yield* Schema.decodeUnknownEffect(workbenchVersionGraphBoundarySchema)(
      value,
    ).pipe(
      Effect.mapError(
        (cause) =>
          new BoundaryDecodeError({
            operation: "workbench.decode-version-graph",
            message: `Version graph did not match its contract: ${String(cause)}`,
            cause,
          }),
      ),
    );
    const forks = yield* Effect.all(
      input.forks.map((fork) => decodeWorkspaceForkFromStorageEffect(fork)),
      { concurrency: "unbounded" },
    );
    const savePoints = yield* Effect.all(
      input.savePoints.map((savePoint) => decodeSavePointFromStorageEffect(savePoint)),
      { concurrency: "unbounded" },
    );

    return normalizeWorkbenchVersionGraph({
      ...input,
      deletedForkIds: unionStrings(input.deletedForkIds),
      deletedSavePointIds: unionStrings(input.deletedSavePointIds),
      forks,
      savePoints,
      updatedAt: new Date(input.updatedAt).toISOString(),
    });
  },
);

export function mergeWorkbenchVersionGraphs(
  left: WorkbenchVersionGraph,
  right: WorkbenchVersionGraph,
): WorkbenchVersionGraph {
  const deletedForkIds = unionStrings(left.deletedForkIds, right.deletedForkIds);
  const deletedSavePointIds = unionStrings(left.deletedSavePointIds, right.deletedSavePointIds);
  const newest = left.updatedAt >= right.updatedAt ? left : right;

  return normalizeWorkbenchVersionGraph({
    activeVariantId: newest.activeVariantId,
    deletedForkIds,
    deletedSavePointIds,
    forks: mergeById(left.forks, right.forks).filter((fork) => !deletedForkIds.includes(fork.id)),
    revision: Math.max(left.revision, right.revision),
    savePoints: mergeById(left.savePoints, right.savePoints).filter(
      (savePoint) => !deletedSavePointIds.includes(savePoint.id),
    ),
    selectedSavePointId: newest.selectedSavePointId,
    updatedAt: newest.updatedAt,
  });
}

export function normalizeWorkbenchVersionGraph(
  graph: WorkbenchVersionGraph,
): WorkbenchVersionGraph {
  const deletedForkIds = unionStrings(graph.deletedForkIds);
  const deletedSavePointIds = unionStrings(graph.deletedSavePointIds);
  const forks = mergeById(graph.forks).filter((fork) => !deletedForkIds.includes(fork.id));
  const validVariantIds = new Set([MAIN_WORKBENCH_VARIANT_ID, ...forks.map((fork) => fork.id)]);
  const savePoints = mergeById(graph.savePoints).filter(
    (savePoint) =>
      validVariantIds.has(savePoint.variantId) && !deletedSavePointIds.includes(savePoint.id),
  );
  const activeVariantId = validVariantIds.has(graph.activeVariantId)
    ? graph.activeVariantId
    : MAIN_WORKBENCH_VARIANT_ID;
  const selectedSavePointId = savePoints.some(
    (savePoint) => savePoint.id === graph.selectedSavePointId,
  )
    ? graph.selectedSavePointId
    : (newestForVariant(savePoints, activeVariantId)?.id ?? null);

  return {
    activeVariantId,
    deletedForkIds,
    deletedSavePointIds,
    forks: sortNewestFirst(forks),
    revision: Math.max(0, Math.trunc(graph.revision)),
    savePoints: sortNewestFirst(savePoints),
    selectedSavePointId,
    updatedAt: graph.updatedAt,
  };
}

export function workbenchVersionGraphFingerprint(graph: WorkbenchVersionGraph): string {
  const normalized = normalizeWorkbenchVersionGraph(graph);
  return JSON.stringify({
    ...normalized,
    deletedForkIds: [...normalized.deletedForkIds].sort(),
    deletedSavePointIds: [...normalized.deletedSavePointIds].sort(),
    forks: [...normalized.forks].sort((left, right) => left.id.localeCompare(right.id)),
    revision: 0,
    savePoints: [...normalized.savePoints].sort((left, right) => left.id.localeCompare(right.id)),
  });
}

function mergeById<T extends { createdAt: string; id: string }>(...collections: T[][]): T[] {
  const merged = new Map<string, T>();
  for (const item of collections.flat()) {
    const current = merged.get(item.id);
    if (!current || item.createdAt >= current.createdAt) merged.set(item.id, item);
  }
  return [...merged.values()];
}

function sortNewestFirst<T extends { createdAt: string; id: string }>(items: T[]): T[] {
  return [...items].sort(
    (left, right) =>
      right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
  );
}

function newestForVariant(savePoints: SavePoint[], variantId: string) {
  return sortNewestFirst(savePoints.filter((savePoint) => savePoint.variantId === variantId))[0];
}

function unionStrings(...collections: string[][]): string[] {
  return [...new Set(collections.flat())].sort();
}
