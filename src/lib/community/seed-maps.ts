import {
  defaultSampleKeyboard as sampleKeyboard,
  splitDemoKeyboard,
} from "$lib/keyboard/sample-boards";
import {
  cloneDevice,
  emptyBindingsForKeys,
  encodeDeviceProfileForStorage,
  type DeviceProfile,
  type Layer,
  type StoredDeviceProfile,
} from "$lib/keyboard/schema";

import {
  COMMUNITY_PAYLOAD_FORMAT,
  type CommunityAuthor,
  type CommunityKeymapCard,
  type CommunityKeymapDetail,
  type CommunityKeymapSource,
  type CommunityModerationState,
  type CommunityVisibility,
} from "./types";

export const COMMUNITY_AGENT_NAME = "global-community";
export const COMMUNITY_SEED_ID = "prototype-community-keymaps";
export const COMMUNITY_SEED_VERSION = "wave-4a-demock-1f-2026-07-14";
export const COMMUNITY_SEED_APPLIED_AT = "2026-07-04T00:00:00.000Z";

type SeedBoardId = "65" | "3x5+2";
const OFFICIAL_SEED_AUTHOR: CommunityAuthor = {
  id: "official:kbui",
  handle: "kbui",
  displayName: "kbui",
};

export interface CommunitySeedKeymap {
  id: string;
  title: string;
  slug: string;
  source: CommunityKeymapSource;
  author: CommunityAuthor;
  catalogId: string;
  vendorId: number;
  productId: number;
  boardName: string;
  matrixRows: number;
  matrixCols: number;
  keyCount: number;
  tags: string[];
  layersCount: number;
  likesCount: number;
  adoptionsCount: number;
  reportsCount: number;
  visibility: CommunityVisibility;
  moderationState: CommunityModerationState;
  note: string;
  highlights: Record<string, string>;
  payloadFormat: typeof COMMUNITY_PAYLOAD_FORMAT;
  profile: StoredDeviceProfile;
  payloadHash: string;
  createdAt: string;
  updatedAt: string;
}

interface PrototypeCommunityMap {
  id: string;
  title: string;
  board: SeedBoardId;
  tags: string[];
  layersCount: number;
  note: string;
  highlights: Record<string, string>;
}

const prototypeCommunityMaps = [
  {
    id: "cm1",
    title: "Miryoku-ish 34",
    board: "3x5+2",
    tags: ["ergo", "homerow-mods"],
    layersCount: 5,
    note: "Layer-per-thumb, GACS home row. Curated as a compact ergonomic baseline.",
    highlights: {
      "1,3": "var(--teal)",
      "1,6": "var(--teal)",
      "3,4": "var(--mustard)",
      "3,5": "var(--mustard)",
    },
  },
  {
    id: "cm2",
    title: "Programmer 65",
    board: "65",
    tags: ["programmer", "symbols"],
    layersCount: 4,
    note: "SYM layer tuned for Rust and TypeScript, with bracket access near the home row.",
    highlights: {
      "2,1": "var(--lilac)",
      "2,2": "var(--lilac)",
      "2,3": "var(--lilac)",
    },
  },
  {
    id: "cm3",
    title: "Gaming 65 (no HRM)",
    board: "65",
    tags: ["gaming"],
    layersCount: 3,
    note: "No home-row mods, keeping WASD and nearby game keys direct.",
    highlights: {
      "3,1": "var(--mustard)",
      "3,2": "var(--mustard)",
      "3,3": "var(--mustard)",
      "2,4": "var(--mustard)",
    },
  },
  {
    id: "cm4",
    title: "Compact Colemak-DH",
    board: "3x5+2",
    tags: ["colemak", "ergo"],
    layersCount: 4,
    note: "Colemak-DH with a tidy number row on the right thumb layer.",
    highlights: {
      "0,0": "var(--teal)",
      "0,1": "var(--teal)",
      "1,2": "var(--teal)",
    },
  },
  {
    id: "cm5",
    title: "One-hand NAV 65",
    board: "65",
    tags: ["accessibility", "nav"],
    layersCount: 4,
    note: "Sticky mods and a larger NAV cluster for lower-effort one-handed use.",
    highlights: {
      "2,6": "var(--mint)",
      "2,7": "var(--mint)",
      "2,8": "var(--mint)",
      "2,9": "var(--mint)",
    },
  },
  {
    id: "cm6",
    title: "Minimal split 34",
    board: "3x5+2",
    tags: ["beginner"],
    layersCount: 3,
    note: "A clean, first-party base for learning split keyboard layers.",
    highlights: {},
  },
] as const satisfies readonly PrototypeCommunityMap[];

const generatedLayerNames = ["Symbols", "Numbers", "Media", "Adjust", "Game", "Mouse"];
const generatedLayerColors = [
  "var(--coral)",
  "var(--mustard)",
  "var(--lilac)",
  "var(--mint)",
  "var(--teal)",
  "var(--ink)",
];

export const communitySeedKeymaps: CommunitySeedKeymap[] = prototypeCommunityMaps.map((map) =>
  buildSeedKeymap(map),
);

export const communitySeedCards: CommunityKeymapCard[] = communitySeedKeymaps.map(seedToCard);
export const communitySeedDetails: CommunityKeymapDetail[] = communitySeedKeymaps.map(seedToDetail);
export const communitySeedAuthors: CommunityAuthor[] = Array.from(
  new Map(communitySeedKeymaps.map((keymap) => [keymap.author.id, keymap.author])).values(),
);
export const communitySeedTags: string[] = Array.from(
  new Set(communitySeedKeymaps.flatMap((keymap) => keymap.tags)),
).sort((left, right) => left.localeCompare(right));

export function seedToCard(seed: CommunitySeedKeymap): CommunityKeymapCard {
  return {
    id: seed.id,
    title: seed.title,
    source: seed.source,
    author: seed.author,
    catalogId: seed.catalogId,
    vendorId: seed.vendorId,
    productId: seed.productId,
    matrixRows: seed.matrixRows,
    matrixCols: seed.matrixCols,
    keyCount: seed.keyCount,
    boardName: seed.boardName,
    tags: [...seed.tags],
    layersCount: seed.layersCount,
    likesCount: seed.likesCount,
    adoptionsCount: seed.adoptionsCount,
    note: seed.note,
    highlights: { ...seed.highlights },
    createdAt: seed.createdAt,
    updatedAt: seed.updatedAt,
    likedByViewer: false,
    adoptedByViewer: false,
  };
}

export function seedToDetail(seed: CommunitySeedKeymap): CommunityKeymapDetail {
  return {
    ...seedToCard(seed),
    payloadFormat: seed.payloadFormat,
    profile: seed.profile,
    payloadHash: seed.payloadHash,
  };
}

function buildSeedKeymap(map: PrototypeCommunityMap): CommunitySeedKeymap {
  const profile = createSeedProfile(map);
  const payload = encodeDeviceProfileForStorage(profile);

  return {
    id: map.id,
    title: map.title,
    slug: slugFor(map.title, map.id),
    source: "official",
    author: OFFICIAL_SEED_AUTHOR,
    catalogId: baseProfileForBoard(map.board).id,
    vendorId: profile.vendorId,
    productId: profile.productId,
    boardName: baseProfileForBoard(map.board).name,
    matrixRows: profile.matrix.rows,
    matrixCols: profile.matrix.cols,
    keyCount: profile.keys.length,
    tags: [...map.tags],
    layersCount: map.layersCount,
    likesCount: 0,
    adoptionsCount: 0,
    reportsCount: 0,
    visibility: "public",
    moderationState: "ok",
    note: map.note,
    highlights: { ...map.highlights },
    payloadFormat: COMMUNITY_PAYLOAD_FORMAT,
    profile: payload,
    payloadHash: payloadHash(payload),
    createdAt: COMMUNITY_SEED_APPLIED_AT,
    updatedAt: COMMUNITY_SEED_APPLIED_AT,
  };
}

function createSeedProfile(map: PrototypeCommunityMap): DeviceProfile {
  const base = baseProfileForBoard(map.board);
  const profile = cloneDevice(base);

  profile.id = `community-${map.id}`;
  profile.name = map.title;
  profile.updatedAt = COMMUNITY_SEED_APPLIED_AT;
  profile.layers = layersForCount(profile, map.layersCount);

  return profile;
}

function baseProfileForBoard(board: SeedBoardId): DeviceProfile {
  return board === "65" ? sampleKeyboard : splitDemoKeyboard;
}

function layersForCount(profile: DeviceProfile, count: number): Layer[] {
  const layers = profile.layers.slice(0, count).map((layer) => ({
    ...layer,
    bindings: { ...layer.bindings },
  }));

  while (layers.length < count) {
    const index = layers.length;
    layers.push({
      id: `community-layer-${index + 1}`,
      name: generatedLayerNames[index - profile.layers.length] ?? `Layer ${index + 1}`,
      color: generatedLayerColors[index % generatedLayerColors.length],
      bindings: emptyBindingsForKeys(profile.keys, "KC_TRNS"),
    });
  }

  return layers;
}

function slugFor(title: string, id: string): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || id;
  return `${slug}-${id}`;
}

function payloadHash(payload: StoredDeviceProfile): string {
  const input = JSON.stringify(payload);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}
