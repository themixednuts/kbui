import { diffProfiles } from "./changes";
import {
  cloneDevice,
  type ChangeRecord,
  type DeviceProfile,
  type SavePoint,
  type SavePointAuthorMeta,
} from "./schema";

export type SavePointOrder = "newest-first" | "oldest-first";

export interface CreateSavePointInput {
  id: string;
  variantId: string;
  message?: string;
  createdAt: string;
  authorMeta?: SavePointAuthorMeta;
  profile: DeviceProfile;
  baseProfile?: DeviceProfile;
  parentSavePointId?: string;
}

export const localAuthorMeta: SavePointAuthorMeta = {
  name: "you",
  source: "local",
};

export function createSavePointFromProfile(input: CreateSavePointInput): SavePoint {
  const diffFromParent = input.baseProfile
    ? diffProfiles(input.baseProfile, input.profile)
    : ([] satisfies ChangeRecord[]);

  return {
    id: input.id,
    variantId: input.variantId,
    message: normalizedMessage(input.message, diffFromParent.length),
    createdAt: input.createdAt,
    authorMeta: input.authorMeta ?? localAuthorMeta,
    snapshot: cloneDevice(input.profile),
    diffFromParent,
    parentSavePointId: input.parentSavePointId,
  };
}

export function listOrderedSavePointsForVariant(
  savePoints: readonly SavePoint[],
  variantId: string,
  order: SavePointOrder = "newest-first",
): SavePoint[] {
  const direction = order === "newest-first" ? -1 : 1;
  return savePoints
    .filter((savePoint) => savePoint.variantId === variantId)
    .slice()
    .sort((left, right) => compareSavePoints(left, right) * direction);
}

export function latestSavePointForVariant(
  savePoints: readonly SavePoint[],
  variantId: string,
): SavePoint | undefined {
  return listOrderedSavePointsForVariant(savePoints, variantId)[0];
}

export function resolveProfileAtSavePoint(
  savePoints: readonly SavePoint[],
  savePointId: string,
): DeviceProfile | undefined {
  const savePoint = savePoints.find((candidate) => candidate.id === savePointId);
  return savePoint ? cloneDevice(savePoint.snapshot) : undefined;
}

export function computeSavePointDiff(from: SavePoint, to: SavePoint): ChangeRecord[] {
  return diffProfiles(from.snapshot, to.snapshot);
}

export function changesForSavePoint(
  savePoint: SavePoint,
  savePoints: readonly SavePoint[],
): ChangeRecord[] {
  const parent = savePoint.parentSavePointId
    ? savePoints.find((candidate) => candidate.id === savePoint.parentSavePointId)
    : undefined;

  return parent ? computeSavePointDiff(parent, savePoint) : [...(savePoint.diffFromParent ?? [])];
}

function normalizedMessage(message: string | undefined, changeCount: number): string {
  const trimmed = message?.trim();
  if (trimmed) return trimmed;
  if (changeCount === 1) return "1 change";
  if (changeCount > 1) return `${changeCount} changes`;
  return "Save point";
}

function compareSavePoints(left: SavePoint, right: SavePoint): number {
  if (left.createdAt < right.createdAt) return -1;
  if (left.createdAt > right.createdAt) return 1;
  return left.id.localeCompare(right.id);
}
