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
  type CommunityCompileStatus,
  type CommunityKeymapCard,
  type CommunityKeymapDetail,
  type CommunityModerationState,
  type CommunityVisibility,
} from "./types";

export const COMMUNITY_AGENT_NAME = "global-community";
export const COMMUNITY_SEED_ID = "prototype-community-keymaps";
export const COMMUNITY_SEED_VERSION = "wave-4a-i-2026-07-04";
export const COMMUNITY_SEED_APPLIED_AT = "2026-07-04T00:00:00.000Z";

type SeedBoardId = "65" | "3x5+2";

export interface CommunitySeedKeymap {
  id: string;
  title: string;
  slug: string;
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
  compileStatus: CommunityCompileStatus;
  compileVerifiedAt: string;
  compileTarget: string;
  official: boolean;
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
  authorHandle: string;
  board: SeedBoardId;
  tags: string[];
  layersCount: number;
  likesCount: number;
  adoptionsCount: number;
  official?: boolean;
  note: string;
  highlights: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

const authorDisplayNames: Record<string, string> = {
  quante: "Quante",
  dvorak_dan: "Dvorak Dan",
  frags: "Frags",
  mikroko: "Mikroko",
  aria: "Aria",
  klakson: "Klakson Labs",
};

const prototypeCommunityMaps = [
  {
    id: "cm1",
    title: "Miryoku-ish 34",
    authorHandle: "quante",
    board: "3x5+2",
    tags: ["ergo", "homerow-mods"],
    layersCount: 5,
    likesCount: 1284,
    adoptionsCount: 412,
    createdAt: "2026-05-18T14:10:00.000Z",
    updatedAt: "2026-06-20T14:10:00.000Z",
    note: "Layer-per-thumb, GACS home row. My daily driver for two years.",
    highlights: {
      "1,3": "var(--teal)",
      "1,6": "var(--teal)",
      "3,4": "var(--mustard)",
      "3,5": "var(--mustard)",
    },
  },
  {
    id: "cm2",
    title: "Workbench Programmer",
    authorHandle: "dvorak_dan",
    board: "65",
    tags: ["programmer", "symbols"],
    layersCount: 4,
    likesCount: 903,
    adoptionsCount: 356,
    createdAt: "2026-05-28T09:20:00.000Z",
    updatedAt: "2026-06-29T09:20:00.000Z",
    note: "SYM layer tuned for Rust & TS. Brackets on the home row.",
    highlights: {
      "2,1": "var(--lilac)",
      "2,2": "var(--lilac)",
      "2,3": "var(--lilac)",
    },
  },
  {
    id: "cm3",
    title: "Gaming 65 (no HRM)",
    authorHandle: "frags",
    board: "65",
    tags: ["gaming"],
    layersCount: 3,
    likesCount: 671,
    adoptionsCount: 512,
    createdAt: "2026-04-22T19:40:00.000Z",
    updatedAt: "2026-06-04T19:40:00.000Z",
    note: "No home-row mods so WASD never mis-fires mid-fight.",
    highlights: {
      "3,1": "var(--mustard)",
      "3,2": "var(--mustard)",
      "3,3": "var(--mustard)",
      "2,4": "var(--mustard)",
    },
  },
  {
    id: "cm4",
    title: "Corney Colemak-DH",
    authorHandle: "mikroko",
    board: "3x5+2",
    tags: ["colemak", "ergo"],
    layersCount: 4,
    likesCount: 588,
    adoptionsCount: 190,
    createdAt: "2026-05-14T11:05:00.000Z",
    updatedAt: "2026-06-13T11:05:00.000Z",
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
    authorHandle: "aria",
    board: "65",
    tags: ["accessibility", "nav"],
    layersCount: 4,
    likesCount: 442,
    adoptionsCount: 98,
    createdAt: "2026-05-31T16:35:00.000Z",
    updatedAt: "2026-06-28T16:35:00.000Z",
    note: "Sticky mods + big NAV cluster for low-effort one-handed use.",
    highlights: {
      "2,6": "var(--mint)",
      "2,7": "var(--mint)",
      "2,8": "var(--mint)",
      "2,9": "var(--mint)",
    },
  },
  {
    id: "cm6",
    title: "Minimal starter 34",
    authorHandle: "klakson",
    board: "3x5+2",
    tags: ["beginner"],
    layersCount: 3,
    likesCount: 2050,
    adoptionsCount: 1340,
    official: true,
    createdAt: "2026-05-21T08:30:00.000Z",
    updatedAt: "2026-06-27T08:30:00.000Z",
    note: "A clean, well-commented base to learn split layers. Official.",
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
    compileVerified: seed.compileStatus === "verified",
    official: seed.official,
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
  const author = seedAuthor(map.authorHandle);

  return {
    id: map.id,
    title: map.title,
    slug: slugFor(map.title, map.id),
    author,
    catalogId: baseProfileForBoard(map.board).id,
    vendorId: profile.vendorId,
    productId: profile.productId,
    boardName: baseProfileForBoard(map.board).name,
    matrixRows: profile.matrix.rows,
    matrixCols: profile.matrix.cols,
    keyCount: profile.keys.length,
    tags: [...map.tags],
    layersCount: map.layersCount,
    likesCount: map.likesCount,
    adoptionsCount: map.adoptionsCount,
    reportsCount: 0,
    compileStatus: "verified",
    compileVerifiedAt: map.updatedAt,
    compileTarget: "demo-seed-wave-4a",
    official: map.official ?? false,
    visibility: "public",
    moderationState: "ok",
    note: map.note,
    highlights: { ...map.highlights },
    payloadFormat: COMMUNITY_PAYLOAD_FORMAT,
    profile: payload,
    payloadHash: payloadHash(payload),
    createdAt: map.createdAt,
    updatedAt: map.updatedAt,
  };
}

function seedAuthor(handle: string): CommunityAuthor {
  return {
    id: `seed:${handle}`,
    handle,
    displayName: authorDisplayNames[handle] ?? titleCase(handle),
  };
}

function createSeedProfile(map: PrototypeCommunityMap): DeviceProfile {
  const base = baseProfileForBoard(map.board);
  const profile = cloneDevice(base);

  profile.id = `community-${map.id}`;
  profile.name = map.title;
  profile.updatedAt = map.updatedAt;
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

function titleCase(value: string): string {
  return value
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
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
