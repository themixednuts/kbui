import { describe, expect, it } from "vite-plus/test";

import { diffProfiles } from "$lib/keyboard/changes";
import { macroBindingCode, tapDanceBindingCode } from "$lib/keyboard/logic-bindings";

import { ShellStore } from "./shell-store.svelte";
import { WorkbenchStore } from "./workbench-store.svelte";

describe("workbench store library placement", () => {
  it("places macros and tap dances on the shared draft profile", () => {
    const workbench = new WorkbenchStore({ persist: false });
    const macro = workbench.addMacro();
    const dance = workbench.addTapDance();

    expect(dance).toBeDefined();
    expect(workbench.placeLogicBindingOnKey({ kind: "macro", id: macro.id }, "k2-4")).toBe(true);
    expect(workbench.placeLogicBindingOnKey({ kind: "tapDance", id: dance!.id }, "k2-5")).toBe(
      true,
    );

    const macroIndex = workbench.profile.macros.findIndex((candidate) => candidate.id === macro.id);
    const danceIndex = workbench.profile.tapDances.findIndex(
      (candidate) => candidate.id === dance!.id,
    );

    expect(workbench.profile.layers[0].bindings["k2-4"]).toMatchObject({
      code: macroBindingCode(macroIndex),
      macroId: macro.id,
    });
    expect(workbench.profile.layers[0].bindings["k2-5"].code).toBe(tapDanceBindingCode(danceIndex));
    expect(diffProfiles(workbench.baseProfile, workbench.profile)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "macro", path: `macros/${macro.name}` }),
        expect.objectContaining({ kind: "tapDance" }),
        expect.objectContaining({ kind: "binding", path: "layers/Base/k2-4" }),
        expect.objectContaining({ kind: "binding", path: "layers/Base/k2-5" }),
      ]),
    );
  });

  it("updates combo member keys with de-duped valid key ids", () => {
    const workbench = new WorkbenchStore({ persist: false });
    const combo = workbench.addCombo();

    workbench.updateComboKeys(combo.id, ["k2-4", "missing", "k2-5", "k2-4"]);

    expect(workbench.profile.combos.find((candidate) => candidate.id === combo.id)?.keys).toEqual([
      "k2-4",
      "k2-5",
    ]);
    expect(diffProfiles(workbench.baseProfile, workbench.profile)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "combo",
          path: `combos/${combo.name}`,
        }),
      ]),
    );
  });
});

describe("workbench store save points", () => {
  it("creates a save point and advances the clean base profile", async () => {
    const workbench = new WorkbenchStore({ persist: false });
    workbench.selectKey("k2-4");
    workbench.applyKeycode("KC_G");

    const savePoint = await workbench.createSavePoint("Home row tweak", {
      id: "sp-1",
      createdAt: "2026-07-04T12:00:00.000Z",
    });

    expect(savePoint).toMatchObject({
      id: "sp-1",
      variantId: "main",
      message: "Home row tweak",
    });
    expect(savePoint?.diffFromParent).toEqual([
      expect.objectContaining({ before: "KC_F", after: "KC_G" }),
    ]);
    expect(workbench.selectedSavePointId).toBe("sp-1");
    expect(workbench.baseProfile.layers[0].bindings["k2-4"].code).toBe("KC_G");
    expect(workbench.profile.layers[0].bindings["k2-4"].code).toBe("KC_G");
    expect(workbench.dirty).toBe(0);
  });

  it("restores an older save point as a draft against the current base", async () => {
    const workbench = new WorkbenchStore({ persist: false });
    workbench.selectKey("k2-4");

    workbench.applyKeycode("KC_G");
    const first = await workbench.createSavePoint("First", {
      id: "sp-1",
      createdAt: "2026-07-04T12:00:00.000Z",
    });

    workbench.applyKeycode("KC_H");
    await workbench.createSavePoint("Second", {
      id: "sp-2",
      createdAt: "2026-07-04T13:00:00.000Z",
    });

    await workbench.restoreSavePoint(first?.id);

    expect(workbench.baseProfile.layers[0].bindings["k2-4"].code).toBe("KC_H");
    expect(workbench.profile.layers[0].bindings["k2-4"].code).toBe("KC_G");
    expect(workbench.dirty).toBe(1);
  });

  it("branches a new variant from a selected save point snapshot", async () => {
    const workbench = new WorkbenchStore({ persist: false });
    workbench.selectKey("k2-4");
    workbench.applyKeycode("KC_G");
    const savePoint = await workbench.createSavePoint("Branch base", {
      id: "sp-1",
      createdAt: "2026-07-04T12:00:00.000Z",
    });

    const fork = await workbench.branchFromSavePoint("experiment-thumbcluster", {
      id: "variant-1",
      savePointId: savePoint?.id,
      createdAt: "2026-07-04T14:00:00.000Z",
    });

    expect(fork).toMatchObject({
      id: "variant-1",
      name: "experiment-thumbcluster",
      parentSavePointId: "sp-1",
      sourceVariantId: "main",
    });
    expect(workbench.activeVariantId).toBe("variant-1");
    expect(workbench.activeVariant.name).toBe("experiment-thumbcluster");
    expect(workbench.profile.layers[0].bindings["k2-4"].code).toBe("KC_G");
    expect(workbench.dirty).toBe(0);
  });
});

describe("shell placement state", () => {
  it("tracks combo key picks and clears placement", () => {
    const shell = new ShellStore();

    shell.startPlacement({ kind: "combo", id: "combo-1", label: "Test combo" });

    expect(shell.placeMode).toMatchObject({ kind: "combo", picks: [] });
    expect(shell.toggleComboPlacementKey("k1-1")).toEqual(["k1-1"]);
    expect(shell.toggleComboPlacementKey("k1-2")).toEqual(["k1-1", "k1-2"]);
    expect(shell.toggleComboPlacementKey("k1-1")).toEqual(["k1-2"]);

    shell.clearPlacement();

    expect(shell.placeMode).toBeNull();
  });
});
