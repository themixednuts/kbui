import type { CommunityKeymapDetail } from "$lib/community/types";
import {
  cloneDevice,
  type DeviceProfile,
  type SavePoint,
  type WorkspaceFork,
} from "$lib/keyboard/schema";

export interface CreateCommunityAdoptionVersioningInput {
  detail: CommunityKeymapDetail;
  profile: DeviceProfile;
  localForkId: string;
  savePointId: string;
  adoptedAt: string;
}

export interface CommunityAdoptionVersioning {
  fork: WorkspaceFork;
  savePoint: SavePoint;
}

export function createCommunityAdoptionVersioning(
  input: CreateCommunityAdoptionVersioningInput,
): CommunityAdoptionVersioning {
  const snapshot = cloneDevice(input.profile);
  const fork: WorkspaceFork = {
    id: input.localForkId,
    name: variantNameFromTitle(input.detail.title),
    baseProfileId: snapshot.id,
    createdAt: input.adoptedAt,
    device: cloneDevice(snapshot),
    source: {
      kind: "community",
      communityKeymapId: input.detail.id,
      title: input.detail.title,
      authorUserId: input.detail.author.id,
      authorHandle: input.detail.author.handle,
      adoptedAt: input.adoptedAt,
      payloadHash: input.detail.payloadHash,
    },
  };

  return {
    fork,
    savePoint: {
      id: input.savePointId,
      variantId: input.localForkId,
      message: `Adopted "${input.detail.title}"`,
      createdAt: input.adoptedAt,
      authorMeta: {
        name: input.detail.author.displayName,
        handle: input.detail.author.handle,
        avatarUrl: input.detail.author.image,
        source: `community:${input.detail.id}`,
      },
      snapshot,
      diffFromParent: [],
    },
  };
}

function variantNameFromTitle(title: string): string {
  return (
    title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 40) || "community-map"
  );
}
