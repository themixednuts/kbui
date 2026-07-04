import type { StoredDeviceProfile } from "$lib/keyboard/schema";

export const COMMUNITY_PAYLOAD_FORMAT = "stored-device-profile-v1";
export const COMMUNITY_DEFAULT_LIMIT = 24;
export const COMMUNITY_MAX_LIMIT = 50;

export type CommunityKeymapSort = "likes" | "new" | "adoptions";
export type CommunityCompileStatus = "unverified" | "pending" | "verified" | "failed";
export type CommunityVisibility = "public" | "unlisted" | "hidden";
export type CommunityModerationState = "ok" | "review_pending" | "hidden";

export interface CommunityAuthor {
  id: string;
  handle?: string;
  displayName: string;
  image?: string;
}

export interface CommunityKeymapListInput {
  tag?: string;
  compatibleWithCatalogId?: string;
  vendorId?: number;
  productId?: number;
  officialOnly?: boolean;
  search?: string;
  sort?: CommunityKeymapSort;
  limit?: number;
}

export interface CommunityCatalogIdentity {
  catalogId: string;
  vendorId: number;
  productId: number;
  matrixRows: number;
  matrixCols: number;
  keyCount: number;
}

export interface CommunityKeymapCard extends CommunityCatalogIdentity {
  id: string;
  title: string;
  author: CommunityAuthor;
  boardName: string;
  tags: string[];
  layersCount: number;
  likesCount: number;
  adoptionsCount: number;
  compileVerified: boolean;
  official: boolean;
  note: string;
  highlights: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  likedByViewer: boolean;
  adoptedByViewer: boolean;
}

export type CommunityKeymapDetail = CommunityKeymapCard & {
  payloadFormat: typeof COMMUNITY_PAYLOAD_FORMAT;
  profile: StoredDeviceProfile;
  payloadHash: string;
};

export function normalizeCommunityListInput(raw: unknown = {}): CommunityKeymapListInput {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Community keymap filters must be an object.");
  }

  const input = raw as Record<string, unknown>;
  return {
    tag: optionalTag(input.tag),
    compatibleWithCatalogId: optionalText(input.compatibleWithCatalogId, {
      field: "compatibleWithCatalogId",
      max: 140,
      pattern: /^[A-Za-z0-9._:/+-]+$/,
    }),
    vendorId: optionalInteger(input.vendorId, "vendorId"),
    productId: optionalInteger(input.productId, "productId"),
    officialOnly: optionalBoolean(input.officialOnly, "officialOnly"),
    search: optionalSearch(input.search),
    sort: optionalSort(input.sort),
    limit: optionalLimit(input.limit),
  };
}

export function normalizeCommunityKeymapId(raw: unknown): string {
  if (typeof raw !== "string") throw new Error("Community keymap id must be a string.");
  const id = raw.trim();
  if (!/^[A-Za-z0-9:_-]{1,80}$/.test(id)) {
    throw new Error("Community keymap id is invalid.");
  }
  return id;
}

export function communityListLimit(input: CommunityKeymapListInput): number {
  return input.limit ?? COMMUNITY_DEFAULT_LIMIT;
}

export function communityListSort(input: CommunityKeymapListInput): CommunityKeymapSort {
  return input.sort ?? "likes";
}

function optionalText(
  value: unknown,
  options: { field: string; max: number; pattern?: RegExp },
): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error(`${options.field} must be a string.`);
  const text = value.trim();
  if (!text) return undefined;
  if (text.length > options.max) throw new Error(`${options.field} is too long.`);
  if (options.pattern && !options.pattern.test(text)) {
    throw new Error(`${options.field} contains unsupported characters.`);
  }
  return text;
}

function optionalTag(value: unknown): string | undefined {
  const tag = optionalText(value, {
    field: "tag",
    max: 32,
    pattern: /^[A-Za-z0-9-]+$/,
  });
  return tag?.toLowerCase();
}

function optionalSearch(value: unknown): string | undefined {
  const search = optionalText(value, { field: "search", max: 80 });
  if (!search) return undefined;
  if (hasControlCharacter(search)) throw new Error("search contains control characters.");
  return search.replace(/\s+/g, " ");
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function optionalInteger(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 0xffff) {
    throw new Error(`${field} must be a USB id integer.`);
  }
  return value;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean.`);
  return value;
}

function optionalSort(value: unknown): CommunityKeymapSort | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === "likes" || value === "new" || value === "adoptions") return value;
  throw new Error("sort must be likes, new, or adoptions.");
}

function optionalLimit(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("limit must be an integer.");
  }
  if (value < 1 || value > COMMUNITY_MAX_LIMIT) {
    throw new Error(`limit must be between 1 and ${COMMUNITY_MAX_LIMIT}.`);
  }
  return value;
}
