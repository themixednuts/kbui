import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { BoundaryDecodeError } from "$lib/effect/errors";
import { starterBoardProfile } from "$lib/keyboard/sample-boards";
import type { SavePoint, WorkspaceFork } from "$lib/keyboard/schema";
import {
  decodeWorkbenchVersionGraphEffect,
  emptyWorkbenchVersionGraph,
  mergeWorkbenchVersionGraphs,
  normalizeWorkbenchVersionGraph,
} from "./workbench-version-graph";

function savePoint(id: string, variantId: string, createdAt: string): SavePoint {
  return {
    id,
    variantId,
    message: id,
    createdAt,
    authorMeta: { name: "Test" },
    snapshot: starterBoardProfile(),
  };
}

function fork(id: string, sourceVariantId: string | undefined, createdAt: string): WorkspaceFork {
  const device = starterBoardProfile();
  return {
    id,
    name: id,
    baseProfileId: device.id,
    createdAt,
    device,
    sourceVariantId,
  };
}

describe("workbench version graph", () => {
  it("keeps tombstones authoritative over stale offline history", () => {
    const stale = {
      ...emptyWorkbenchVersionGraph(),
      activeVariantId: "fork-1",
      forks: [fork("fork-1", "main", "2026-07-01T10:00:00.000Z")],
      savePoints: [savePoint("sp-1", "fork-1", "2026-07-01T11:00:00.000Z")],
      updatedAt: "2026-07-01T11:00:00.000Z",
    };
    const deleted = {
      ...emptyWorkbenchVersionGraph(),
      deletedForkIds: ["fork-1"],
      deletedSavePointIds: ["sp-1"],
      revision: 4,
      updatedAt: "2026-07-02T11:00:00.000Z",
    };

    expect(mergeWorkbenchVersionGraphs(stale, deleted)).toMatchObject({
      activeVariantId: "main",
      deletedForkIds: ["fork-1"],
      deletedSavePointIds: ["sp-1"],
      forks: [],
      revision: 4,
      savePoints: [],
      selectedSavePointId: null,
    });
  });

  it("drops orphaned save points and selects the newest valid point", () => {
    const graph = normalizeWorkbenchVersionGraph({
      ...emptyWorkbenchVersionGraph(),
      activeVariantId: "missing",
      forks: [fork("fork-1", "main", "2026-07-01T10:00:00.000Z")],
      savePoints: [
        savePoint("sp-old", "main", "2026-07-01T11:00:00.000Z"),
        savePoint("sp-new", "main", "2026-07-01T12:00:00.000Z"),
        savePoint("sp-orphan", "missing", "2026-07-01T13:00:00.000Z"),
      ],
      selectedSavePointId: "sp-orphan",
      updatedAt: "2026-07-01T13:00:00.000Z",
    });

    expect(graph.activeVariantId).toBe("main");
    expect(graph.savePoints.map((point) => point.id)).toEqual(["sp-new", "sp-old"]);
    expect(graph.selectedSavePointId).toBe("sp-new");
  });

  it("decodes persisted graph metadata and nested variants", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const graph = yield* decodeWorkbenchVersionGraphEffect({
          ...emptyWorkbenchVersionGraph(),
          forks: [fork("fork-1", "main", "2026-07-01T10:00:00.000Z")],
          savePoints: [savePoint("sp-1", "fork-1", "2026-07-01T11:00:00.000Z")],
          updatedAt: "2026-07-01T11:00:00Z",
        });

        expect(graph.forks[0]?.device.id).toBeTruthy();
        expect(graph.updatedAt).toBe("2026-07-01T11:00:00.000Z");
      }),
    ));

  it("rejects malformed graph metadata with a tagged boundary error", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          decodeWorkbenchVersionGraphEffect({
            ...emptyWorkbenchVersionGraph(),
            revision: -1,
          }),
        );

        expect(error).toBeInstanceOf(BoundaryDecodeError);
        expect(error).toMatchObject({
          _tag: "BoundaryDecodeError",
          operation: "workbench.decode-version-graph",
        });
      }),
    ));
});
