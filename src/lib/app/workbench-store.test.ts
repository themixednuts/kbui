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
