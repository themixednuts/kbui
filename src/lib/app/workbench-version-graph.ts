import { Effect } from "effect";

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

export function decodeWorkbenchVersionGraphEffect(value: unknown) {
  return Effect.gen(function* () {
    const input = yield* Effect.try({
      try: () => {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw new Error("Version graph must be an object.");
        }
        const graph = value as Record<string, unknown>;
        if (!Array.isArray(graph.forks) || !Array.isArray(graph.savePoints)) {
          throw new Error("Version graph forks and save points must be arrays.");
        }
        return {
          activeVariantId: requiredString(graph.activeVariantId, "activeVariantId"),
          deletedForkIds: stringArray(graph.deletedForkIds, "deletedForkIds"),
          deletedSavePointIds: stringArray(graph.deletedSavePointIds, "deletedSavePointIds"),
          forks: graph.forks,
          revision: finiteNonNegativeInteger(graph.revision, "revision"),
          savePoints: graph.savePoints,
          selectedSavePointId: optionalString(graph.selectedSavePointId, "selectedSavePointId"),
          updatedAt: isoString(graph.updatedAt, "updatedAt"),
        };
      },
      catch: (error) =>
        new Error(error instanceof Error ? error.message : "Version graph could not be decoded."),
    });
    const forks = yield* Effect.all(
      input.forks.map((fork) => decodeWorkspaceForkFromStorageEffect(fork)),
      { concurrency: "unbounded" },
    );
    const savePoints = yield* Effect.all(
      input.savePoints.map((savePoint) => decodeSavePointFromStorageEffect(savePoint)),
      { concurrency: "unbounded" },
    );

    return normalizeWorkbenchVersionGraph({ ...input, forks, savePoints });
  });
}

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

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value;
}

function optionalString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  return requiredString(value, field);
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${field} must be an array of strings.`);
  }
  return unionStrings(value);
}

function finiteNonNegativeInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer.`);
  }
  return value;
}

function isoString(value: unknown, field: string): string {
  const text = requiredString(value, field);
  if (!Number.isFinite(Date.parse(text))) throw new Error(`${field} must be an ISO timestamp.`);
  return new Date(text).toISOString();
}
