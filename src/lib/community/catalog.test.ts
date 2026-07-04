import { describe, expect, it } from "vite-plus/test";

import { getSeedCommunityKeymap, listSeedCommunityKeymaps } from "$lib/community/catalog";
import { COMMUNITY_SEED_VERSION, communitySeedKeymaps } from "$lib/community/seed-maps";
import {
  getCommunityKeymapFromEnvironment,
  listCommunityKeymapsFromEnvironment,
} from "$lib/community/service";
import { defaultSampleKeyboard as sampleKeyboard } from "$lib/keyboard/sample-boards";

describe("community seed catalog", () => {
  it("shapes the six prototype maps as deterministic stored profiles", () => {
    expect(COMMUNITY_SEED_VERSION).toBe("wave-4a-i-2026-07-04");
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
      expect(keymap.createdAt).toMatch(/^2026-/);
      expect(keymap.updatedAt).toMatch(/^2026-/);
      expect(keymap.profile.updatedAt).toBe(keymap.updatedAt);
      expect(keymap.profile.layers).toHaveLength(keymap.layersCount);
      expect(keymap.payloadHash).toMatch(/^fnv1a:[a-f0-9]{8}$/);
      expect(keymap.compileStatus).toBe("verified");
      expect(keymap.compileTarget).toBe("demo-seed-wave-4a");
    }
  });

  it("sorts by likes by default", () => {
    const cards = listSeedCommunityKeymaps();
    expect(cards.map((card) => card.id)).toEqual(["cm6", "cm1", "cm2", "cm3", "cm4", "cm5"]);
  });

  it("filters by tag and search text", () => {
    expect(listSeedCommunityKeymaps({ tag: "ergo" }).map((card) => card.id)).toEqual([
      "cm1",
      "cm4",
    ]);
    expect(listSeedCommunityKeymaps({ search: "Rust" }).map((card) => card.id)).toEqual(["cm2"]);
  });

  it("filters compatibility by exact catalog id", () => {
    const cards = listSeedCommunityKeymaps({
      compatibleWithCatalogId: sampleKeyboard.id,
      sort: "likes",
    });

    expect(cards.map((card) => card.id)).toEqual(["cm2", "cm3", "cm5"]);
  });

  it("supports the adoptions and new sorts", () => {
    expect(
      listSeedCommunityKeymaps({ sort: "adoptions" })
        .map((card) => card.id)
        .slice(0, 3),
    ).toEqual(["cm6", "cm3", "cm1"]);
    expect(
      listSeedCommunityKeymaps({ sort: "new" })
        .map((card) => card.id)
        .slice(0, 3),
    ).toEqual(["cm5", "cm2", "cm6"]);
  });

  it("loads details from the static catalog", () => {
    const detail = getSeedCommunityKeymap("cm1");
    expect(detail?.payloadFormat).toBe("stored-device-profile-v1");
    expect(detail?.profile.layers).toHaveLength(5);
  });
});

describe("community DO-absent fallback", () => {
  it("returns seeded cards when the CommunityAgent binding is absent", async () => {
    const cards = await listCommunityKeymapsFromEnvironment(undefined, { sort: "likes" });
    expect(cards).toHaveLength(6);
    expect(cards[0].id).toBe("cm6");
  });

  it("returns seeded detail when the CommunityAgent binding is absent", async () => {
    const detail = await getCommunityKeymapFromEnvironment(undefined, "cm6");
    expect(detail?.official).toBe(true);
    expect(detail?.profile.name).toBe("Minimal starter 34");
  });
});
