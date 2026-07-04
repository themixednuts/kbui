import { describe, expect, it } from "vite-plus/test";

import {
  adoptCommunityKeymapFromEnvironment,
  COMMUNITY_MUTATION_REQUIRES_WORKER,
  likeCommunityKeymapFromEnvironment,
  reportCommunityKeymapFromEnvironment,
  unlikeCommunityKeymapFromEnvironment,
} from "$lib/community/service";
import {
  COMMUNITY_PAYLOAD_FORMAT,
  normalizeCommunityAdoptInput,
  type CommunityKeymapDetail,
  type CommunityMutationUser,
  type CommunityReportInput,
} from "$lib/community/types";
import { sampleBoards } from "$lib/keyboard/sample-boards";
import {
  decodeDeviceProfileFromStorage,
  encodeDeviceProfileForStorage,
} from "$lib/keyboard/schema";

import { createCommunityAdoptionVersioning } from "./adoption";
import { applyMutationCountDelta, mutationCountDelta } from "./mutations";

const viewer: CommunityMutationUser = {
  id: "user:123",
  name: "Ada Layout",
  email: "ada@users.noreply.github.com",
  image: "https://example.test/avatar.png",
};

describe("community mutation count helpers", () => {
  it("only changes counts when an insert or delete actually changed a row", () => {
    expect(applyMutationCountDelta(8, mutationCountDelta(false, 1))).toBe(8);
    expect(applyMutationCountDelta(8, mutationCountDelta(true, 1))).toBe(9);
    expect(applyMutationCountDelta(8, mutationCountDelta(false, -1))).toBe(8);
    expect(applyMutationCountDelta(8, mutationCountDelta(true, -1))).toBe(7);
    expect(applyMutationCountDelta(0, mutationCountDelta(true, -1))).toBe(0);
  });
});

describe("community mutation services", () => {
  it("maintains like counts for first, repeat, and unlike operations", async () => {
    const agent = new FakeCommunityAgent();
    const env = envFor(agent);

    await likeCommunityKeymapFromEnvironment(env, "cm-test", viewer);
    await likeCommunityKeymapFromEnvironment(env, "cm-test", viewer);

    expect(agent.detail.likesCount).toBe(1);
    expect(agent.likes.size).toBe(1);

    await unlikeCommunityKeymapFromEnvironment(env, "cm-test", viewer);
    await unlikeCommunityKeymapFromEnvironment(env, "cm-test", viewer);

    expect(agent.detail.likesCount).toBe(0);
    expect(agent.likes.size).toBe(0);
  });

  it("counts only first adoption while repeat adoption updates the local fork id", async () => {
    const agent = new FakeCommunityAgent();
    const env = envFor(agent);

    const first = await adoptCommunityKeymapFromEnvironment(
      env,
      { keymapId: "cm-test", localForkId: "fork-1" },
      viewer,
    );
    const second = await adoptCommunityKeymapFromEnvironment(
      env,
      { keymapId: "cm-test", localForkId: "fork-2" },
      viewer,
    );

    expect(first.adoptionsCount).toBe(1);
    expect(second.adoptionsCount).toBe(1);
    expect(second.adoptedByViewer).toBe(true);
    expect(agent.adoptions.get("cm-test:user:123")?.localForkId).toBe("fork-2");
  });

  it("counts only first report and keeps the keymap pending review", async () => {
    const agent = new FakeCommunityAgent();
    const env = envFor(agent);

    await reportCommunityKeymapFromEnvironment(
      env,
      { keymapId: "cm-test", reason: "spam", detail: "duplicate" },
      viewer,
    );
    await reportCommunityKeymapFromEnvironment(
      env,
      { keymapId: "cm-test", reason: "other", detail: "updated detail" },
      viewer,
    );

    expect(agent.detail.reportsCount).toBe(1);
    expect(agent.detail.moderationState).toBe("review_pending");
    expect(agent.reports.get("cm-test:user:123")).toMatchObject({
      reason: "other",
      detail: "updated detail",
    });
  });

  it("rejects anonymous mutations before calling the agent", async () => {
    const agent = new FakeCommunityAgent();

    await expect(
      likeCommunityKeymapFromEnvironment(envFor(agent), "cm-test", null),
    ).rejects.toThrow(/signed-in user/);
    expect(agent.likes.size).toBe(0);
  });

  it("returns a clear error when the CommunityAgent binding is absent", async () => {
    await expect(likeCommunityKeymapFromEnvironment(undefined, "cm-test", viewer)).rejects.toThrow(
      COMMUNITY_MUTATION_REQUIRES_WORKER,
    );
  });
});

describe("community adoption provenance", () => {
  it("shapes a WorkspaceFork and first save point from an adopted detail", () => {
    const detail = testDetail();
    const profile = decodeDeviceProfileFromStorage(detail.profile);

    const { fork, savePoint } = createCommunityAdoptionVersioning({
      detail,
      profile,
      localForkId: "fork-community",
      savePointId: "sp-community",
      adoptedAt: "2026-07-04T12:00:00.000Z",
    });

    expect(fork).toMatchObject({
      id: "fork-community",
      name: "test-community-layout",
      baseProfileId: profile.id,
      source: {
        kind: "community",
        communityKeymapId: "cm-test",
        title: "Test Community Layout",
        authorUserId: "author-1",
        authorHandle: "quante",
        adoptedAt: "2026-07-04T12:00:00.000Z",
        payloadHash: "sha256:test",
      },
    });
    expect(savePoint).toMatchObject({
      id: "sp-community",
      variantId: "fork-community",
      message: 'Adopted "Test Community Layout"',
      authorMeta: {
        name: "Quante",
        handle: "quante",
        source: "community:cm-test",
      },
    });
    expect(savePoint.snapshot.id).toBe(profile.id);
  });
});

class FakeCommunityAgent {
  detail = testDetail();
  likes = new Set<string>();
  adoptions = new Map<string, { localForkId: string }>();
  reports = new Map<string, Pick<CommunityReportInput, "detail" | "reason">>();

  async like(keymapId: string, user: CommunityMutationUser): Promise<void> {
    this.assertKeymap(keymapId);
    const key = `${keymapId}:${user.id}`;
    if (this.likes.has(key)) return;
    this.likes.add(key);
    this.detail.likesCount += 1;
  }

  async unlike(keymapId: string, user: CommunityMutationUser): Promise<void> {
    this.assertKeymap(keymapId);
    const key = `${keymapId}:${user.id}`;
    if (!this.likes.delete(key)) return;
    this.detail.likesCount = Math.max(0, this.detail.likesCount - 1);
  }

  async adopt(rawInput: unknown, user: CommunityMutationUser): Promise<CommunityKeymapDetail> {
    const input = normalizeCommunityAdoptInput(rawInput);
    this.assertKeymap(input.keymapId);
    const key = `${input.keymapId}:${user.id}`;
    const first = !this.adoptions.has(key);
    this.adoptions.set(key, { localForkId: input.localForkId });
    if (first) this.detail.adoptionsCount += 1;
    return {
      ...this.detail,
      adoptedByViewer: true,
    };
  }

  async report(input: CommunityReportInput, user: CommunityMutationUser): Promise<void> {
    this.assertKeymap(input.keymapId);
    const key = `${input.keymapId}:${user.id}`;
    const first = !this.reports.has(key);
    this.reports.set(key, { reason: input.reason, detail: input.detail ?? "" });
    if (first) this.detail.reportsCount += 1;
    this.detail.moderationState = "review_pending";
  }

  private assertKeymap(keymapId: string) {
    if (keymapId !== this.detail.id) throw new Error("Community keymap is not available.");
  }
}

function envFor(agent: FakeCommunityAgent): Cloudflare.Env {
  return {
    CommunityAgent: {
      idFromName: () => "community-agent-id",
      get: () => agent,
    },
  } as unknown as Cloudflare.Env;
}

function testDetail(): CommunityKeymapDetail & {
  reportsCount: number;
  moderationState: "ok" | "review_pending";
} {
  const profile = sampleBoards.default;
  return {
    id: "cm-test",
    title: "Test Community Layout",
    source: "community",
    author: {
      id: "author-1",
      handle: "quante",
      displayName: "Quante",
      image: "https://example.test/quante.png",
    },
    catalogId: profile.id,
    vendorId: profile.vendorId,
    productId: profile.productId,
    matrixRows: profile.matrix.rows,
    matrixCols: profile.matrix.cols,
    keyCount: profile.keys.length,
    boardName: profile.name,
    tags: ["test"],
    layersCount: profile.layers.length,
    likesCount: 0,
    adoptionsCount: 0,
    reportsCount: 0,
    note: "A test keymap.",
    highlights: {},
    createdAt: "2026-07-04T00:00:00.000Z",
    updatedAt: "2026-07-04T00:00:00.000Z",
    likedByViewer: false,
    adoptedByViewer: false,
    moderationState: "ok",
    payloadFormat: COMMUNITY_PAYLOAD_FORMAT,
    profile: encodeDeviceProfileForStorage(profile),
    payloadHash: "sha256:test",
  };
}
