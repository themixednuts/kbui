import {
  communityListLimit,
  communityListSort,
  normalizeCommunityKeymapId,
  normalizeCommunityListInput,
  type CommunityKeymapCard,
  type CommunityKeymapDetail,
  type CommunityKeymapListInput,
} from "./types";
import { communitySeedCards, communitySeedDetails } from "./seed-maps";

export function listSeedCommunityKeymaps(rawInput: unknown = {}): CommunityKeymapCard[] {
  return filterAndSortCommunityCards(communitySeedCards, normalizeCommunityListInput(rawInput));
}

export function getSeedCommunityKeymap(rawId: unknown): CommunityKeymapDetail | null {
  const id = normalizeCommunityKeymapId(rawId);
  return communitySeedDetails.find((keymap) => keymap.id === id) ?? null;
}

export function filterAndSortCommunityCards<TCard extends CommunityKeymapCard>(
  cards: readonly TCard[],
  input: CommunityKeymapListInput,
): TCard[] {
  const search = input.search?.toLowerCase();
  const tag = input.tag?.toLowerCase();
  const limit = communityListLimit(input);

  return cards
    .filter((card) => {
      if (tag && !card.tags.some((candidate) => candidate.toLowerCase() === tag)) return false;
      if (input.officialOnly && !card.official) return false;
      if (input.compatibleWithCatalogId && card.catalogId !== input.compatibleWithCatalogId) {
        return false;
      }
      if (
        !input.compatibleWithCatalogId &&
        input.vendorId !== undefined &&
        card.vendorId !== input.vendorId
      ) {
        return false;
      }
      if (
        !input.compatibleWithCatalogId &&
        input.productId !== undefined &&
        card.productId !== input.productId
      ) {
        return false;
      }
      if (search && !cardMatchesSearch(card, search)) return false;
      return true;
    })
    .slice()
    .sort((left, right) => compareCommunityCards(left, right, input))
    .slice(0, limit);
}

export function compareCommunityCards(
  left: CommunityKeymapCard,
  right: CommunityKeymapCard,
  input: Pick<CommunityKeymapListInput, "sort">,
): number {
  const sort = communityListSort(input);
  if (sort === "new") {
    return (
      compareTextDesc(left.createdAt, right.createdAt) ||
      compareNumberDesc(left.likesCount, right.likesCount) ||
      left.title.localeCompare(right.title)
    );
  }
  if (sort === "adoptions") {
    return (
      compareNumberDesc(left.adoptionsCount, right.adoptionsCount) ||
      compareNumberDesc(left.likesCount, right.likesCount) ||
      compareTextDesc(left.updatedAt, right.updatedAt) ||
      left.title.localeCompare(right.title)
    );
  }
  return (
    compareNumberDesc(left.likesCount, right.likesCount) ||
    compareNumberDesc(left.adoptionsCount, right.adoptionsCount) ||
    compareTextDesc(left.updatedAt, right.updatedAt) ||
    left.title.localeCompare(right.title)
  );
}

function cardMatchesSearch(card: CommunityKeymapCard, search: string): boolean {
  const haystack = [
    card.title,
    card.note,
    card.boardName,
    card.author.handle ?? "",
    card.author.displayName,
    ...card.tags,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(search);
}

function compareNumberDesc(left: number, right: number): number {
  return right - left;
}

function compareTextDesc(left: string, right: string): number {
  if (left < right) return 1;
  if (left > right) return -1;
  return 0;
}
