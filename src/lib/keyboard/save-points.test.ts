import { describe, expect, it } from "vite-plus/test";

import {
  changesForSavePoint,
  computeSavePointDiff,
  createSavePointFromProfile,
  listOrderedSavePointsForVariant,
  materializeSavePointProfile,
  resolveProfileAtSavePoint,
} from "./save-points";
import { cloneDevice, sampleKeyboard } from "./schema";

describe("save point helpers", () => {
  it("creates a snapshot save point with a bundled diff from the provided base", () => {
    const draft = cloneDevice(sampleKeyboard);
    draft.layers[0].bindings["k2-4"] = { code: "KC_G" };

    const savePoint = createSavePointFromProfile({
      id: "sp-1",
      variantId: "main",
      createdAt: "2026-07-04T12:00:00.000Z",
      profile: draft,
      baseProfile: sampleKeyboard,
    });

    expect(savePoint).toMatchObject({
      id: "sp-1",
      variantId: "main",
      message: "1 change",
      createdAt: "2026-07-04T12:00:00.000Z",
      parentSavePointId: undefined,
    });
    expect(savePoint.diffFromParent).toEqual([
      expect.objectContaining({
        kind: "binding",
        path: "layers/Base/k2-4",
        before: "KC_F",
        after: "KC_G",
      }),
    ]);

    draft.layers[0].bindings["k2-4"] = { code: "KC_H" };
    expect(savePoint.snapshot.layers[0].bindings["k2-4"].code).toBe("KC_G");
  });

  it("orders save points per variant and resolves cloned profiles", () => {
    const draftA = cloneDevice(sampleKeyboard);
    const draftB = cloneDevice(sampleKeyboard);
    draftA.layers[0].bindings["k2-4"] = { code: "KC_G" };
    draftB.layers[0].bindings["k2-4"] = { code: "KC_H" };

    const older = createSavePointFromProfile({
      id: "sp-old",
      variantId: "main",
      message: "older",
      createdAt: "2026-07-04T11:00:00.000Z",
      profile: draftA,
      baseProfile: sampleKeyboard,
    });
    const newer = createSavePointFromProfile({
      id: "sp-new",
      variantId: "main",
      message: "newer",
      createdAt: "2026-07-04T12:00:00.000Z",
      profile: draftB,
      baseProfile: draftA,
      parentSavePointId: older.id,
    });
    const otherVariant = createSavePointFromProfile({
      id: "sp-other",
      variantId: "branch",
      createdAt: "2026-07-04T13:00:00.000Z",
      profile: draftB,
    });

    expect(listOrderedSavePointsForVariant([older, newer, otherVariant], "main")).toEqual([
      newer,
      older,
    ]);

    const resolved = resolveProfileAtSavePoint([older, newer], newer.id);
    expect(resolved?.layers[0].bindings["k2-4"].code).toBe("KC_H");
    resolved!.layers[0].bindings["k2-4"] = { code: "KC_A" };
    expect(newer.snapshot.layers[0].bindings["k2-4"].code).toBe("KC_H");

    const materialized = materializeSavePointProfile([older, newer], newer.id);
    expect(materialized?.layers[0].bindings["k2-4"].code).toBe("KC_H");
    materialized!.layers[0].bindings["k2-4"] = { code: "KC_B" };
    expect(newer.snapshot.layers[0].bindings["k2-4"].code).toBe("KC_H");
  });

  it("computes save point changes from parent snapshots or first-point bundled diffs", () => {
    const draftA = cloneDevice(sampleKeyboard);
    const draftB = cloneDevice(sampleKeyboard);
    draftA.layers[0].bindings["k2-4"] = { code: "KC_G" };
    draftB.layers[0].bindings["k2-4"] = { code: "KC_H" };

    const first = createSavePointFromProfile({
      id: "sp-1",
      variantId: "main",
      createdAt: "2026-07-04T11:00:00.000Z",
      profile: draftA,
      baseProfile: sampleKeyboard,
    });
    const second = createSavePointFromProfile({
      id: "sp-2",
      variantId: "main",
      createdAt: "2026-07-04T12:00:00.000Z",
      profile: draftB,
      baseProfile: draftA,
      parentSavePointId: first.id,
    });

    expect(changesForSavePoint(first, [first, second])).toEqual([
      expect.objectContaining({ before: "KC_F", after: "KC_G" }),
    ]);
    expect(computeSavePointDiff(first, second)).toEqual([
      expect.objectContaining({ before: "KC_G", after: "KC_H" }),
    ]);
    expect(changesForSavePoint(second, [first, second])).toEqual([
      expect.objectContaining({ before: "KC_G", after: "KC_H" }),
    ]);
  });
});
