import { describe, expect, it } from "vite-plus/test";

import { getSeedCommunityKeymap, listSeedCommunityKeymaps } from "$lib/community/catalog";
import { COMMUNITY_SEED_VERSION, communitySeedKeymaps } from "$lib/community/seed-maps";
import {
  getCommunityKeymapFromEnvironment,
  listCommunityKeymapsFromEnvironment,
} from "$lib/community/service";
import { defaultSampleKeyboard as sampleKeyboard } from "$lib/keyboard/sample-boards";

describe("community seed catalog", () => {
  it("shapes the six official starter maps as deterministic stored profiles", () => {
    expect(COMMUNITY_SEED_VERSION).toBe("wave-4a-demock-1f-2026-07-14");
    expect(communitySeedKeymaps).toHaveLength(6);
    expect(communitySeedKeymaps.map((keymap) => keymap.id)).toEqual([
      "cm1",
      "cm2",
      "cm3",
      "cm4",
      "cm5",
      "cm6",
    ]);

    for (const keymap of communitySeedKeymaps) {
      expect(keymap.source).toBe("official");
      expect(keymap.author).toEqual({
        id: "official:kbui",
        handle: "kbui",
        displayName: "kbui",
      });
      expect(keymap.likesCount).toBe(0);
      expect(keymap.adoptionsCount).toBe(0);
      expect(keymap.createdAt).toBe("2026-07-04T00:00:00.000Z");
      expect(keymap.updatedAt).toBe("2026-07-04T00:00:00.000Z");
      expect(keymap.profile.updatedAt).toBe(keymap.updatedAt);
      expect(keymap.profile.layers).toHaveLength(keymap.layersCount);
      expect(keymap.payloadHash).toMatch(/^fnv1a:[a-f0-9]{8}$/);
      expect(hasCompileClaimField(keymap)).toBe(false);
    }
  });

  it("does not rank official seed maps with fabricated engagement", () => {
    const cards = listSeedCommunityKeymaps();
    expect(cards.every((card) => card.source === "official")).toBe(true);
    expect(cards.every((card) => card.likesCount === 0 && card.adoptionsCount === 0)).toBe(true);
    expect(cards.map((card) => card.id)).toEqual(["cm4", "cm3", "cm6", "cm1", "cm5", "cm2"]);
    expect(hasCompileClaimField(cards[0])).toBe(false);
  });

  it("filters by tag and search text", () => {
    expect(listSeedCommunityKeymaps({ tag: "ergo" }).map((card) => card.id)).toEqual([
      "cm4",
      "cm1",
    ]);
    expect(listSeedCommunityKeymaps({ search: "Rust" }).map((card) => card.id)).toEqual(["cm2"]);
  });

  it("filters compatibility by exact catalog id", () => {
    const cards = listSeedCommunityKeymaps({
      compatibleWithCatalogId: sampleKeyboard.id,
      sort: "likes",
    });

    expect(cards.map((card) => card.id)).toEqual(["cm3", "cm5", "cm2"]);
  });

  it("keeps adoptions and new sorts deterministic without fabricated counts or recency", () => {
    expect(
      listSeedCommunityKeymaps({ sort: "adoptions" })
        .map((card) => card.id)
        .slice(0, 3),
    ).toEqual(["cm4", "cm3", "cm6"]);
    expect(
      listSeedCommunityKeymaps({ sort: "new" })
        .map((card) => card.id)
        .slice(0, 3),
    ).toEqual(["cm4", "cm3", "cm6"]);
  });

  it("loads details from the static catalog", () => {
    const detail = getSeedCommunityKeymap("cm1");
    expect(detail?.payloadFormat).toBe("stored-device-profile-v1");
    expect(detail?.profile.layers).toHaveLength(5);
  });
});

function hasCompileClaimField(record: object): boolean {
  return Object.keys(record).some((key) => key.toLowerCase().startsWith("compile"));
}

describe("community durable store requirement", () => {
  it("blocks list reads when the CommunityAgent binding is absent", async () => {
    await expect(listCommunityKeymapsFromEnvironment(undefined, { sort: "likes" })).rejects.toThrow(
      "every result comes from durable SQLite",
    );
  });

  it("blocks detail reads when the CommunityAgent binding is absent", async () => {
    await expect(getCommunityKeymapFromEnvironment(undefined, "cm6")).rejects.toThrow(
      "every result comes from durable SQLite",
    );
  });
});
