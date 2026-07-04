import { describe, expect, it } from "vite-plus/test";

import { diffProfiles } from "$lib/keyboard/changes";
import { macroBindingCode, tapDanceBindingCode } from "$lib/keyboard/logic-bindings";
import { splitDemoKeyboard, starterBoardProfile } from "$lib/keyboard/sample-boards";
import { cloneDevice, profileDisplayName } from "$lib/keyboard/schema";

import { ShellStore } from "./shell-store.svelte";
import { resolveWorkbenchHydration, WorkbenchStore } from "./workbench-store.svelte";

describe("workbench store profile provenance", () => {
  it("resolves active profile priority as connected device, then draft, then starter", () => {
    const starter = starterBoardProfile();
    const draft = cloneDevice(starter);
    draft.id = "draft:real-work";
    draft.name = "Saved Local Draft";
    const draftBase = cloneDevice(draft);
    const device = cloneDevice(starter);
    device.id = "keyboard:1209:0001:connected";
    device.name = "Connected Keyboard";

    expect(
      resolveWorkbenchHydration({
        connectedProfile: device,
        draftBaseProfile: draftBase,
        draftProfile: draft,
        starterProfile: starter,
      }),
    ).toMatchObject({
      origin: "device",
      profile: { id: "keyboard:1209:0001:connected", origin: "device" },
    });

    expect(
      resolveWorkbenchHydration({
        draftBaseProfile: draftBase,
        draftProfile: draft,
        starterProfile: starter,
      }),
    ).toMatchObject({
      origin: "draft",
      baseProfile: { id: "draft:real-work", origin: "draft" },
      profile: { id: "draft:real-work", origin: "draft" },
    });

    expect(resolveWorkbenchHydration({ starterProfile: starter })).toMatchObject({
      origin: "starter",
      profile: { id: starter.id, origin: "starter" },
    });
  });

  it("hydrates a saved local draft before the starter fallback", async () => {
    const draft = cloneDevice(starterBoardProfile());
    draft.id = "draft:local-real-board";
    draft.name = "Saved Real Board";
    const base = cloneDevice(draft);
    base.layers[0].bindings["k2-4"] = { code: "KC_A" };
    draft.layers[0].bindings["k2-4"] = { code: "KC_B" };

    const workbench = new WorkbenchStore({
      loadDevice: async () => base,
      loadDraft: async () => draft,
      persist: false,
    });

    await workbench.hydrateActiveProfile({ force: true });

    expect(workbench.profile).toMatchObject({
      id: "draft:local-real-board",
      name: "Saved Real Board",
      origin: "draft",
    });
    expect(workbench.baseProfile.origin).toBe("draft");
    expect(workbench.changes).toEqual([expect.objectContaining({ before: "KC_A", after: "KC_B" })]);
  });

  it("selects starter boards explicitly and labels starter display names", async () => {
    const workbench = new WorkbenchStore({ persist: false });

    await workbench.selectStarterBoard("split");

    expect(workbench.activeBoardId).toBe("split");
    expect(workbench.profile.id).toBe(splitDemoKeyboard.id);
    expect(workbench.profile.origin).toBe("starter");
    expect(profileDisplayName(workbench.profile)).toBe("Corney Split 34 Starter");
  });
});

describe("workbench store library placement", () => {
  it("creates honest empty logic drafts", () => {
    const workbench = new WorkbenchStore({ persist: false });

    const macro = workbench.addMacro();
    const combo = workbench.addCombo();
    const dance = workbench.addTapDance();

    expect(macro).toMatchObject({
      name: "",
      sequence: [],
      trigger: "Unassigned",
    });
    expect(combo).toMatchObject({
      name: "",
      keys: [],
      binding: "",
    });
    expect(dance).toMatchObject({
      keyId: "",
      tap: "",
      hold: "",
      doubleTap: "",
    });

    workbench.updateMacro(macro.id, { sequence: ["kc_a"] });
    workbench.updateCombo(combo.id, { binding: "kc_esc", keys: ["k2-4"] });
    workbench.updateTapDance(dance!.id, { keyId: "k2-0", tap: "kc_esc" });

    expect(
      workbench.profile.macros.find((candidate) => candidate.id === macro.id)?.sequence,
    ).toEqual(["KC_A"]);
    expect(workbench.profile.combos.find((candidate) => candidate.id === combo.id)).toMatchObject({
      binding: "KC_ESC",
      keys: ["k2-4"],
    });
    expect(
      workbench.profile.tapDances.find((candidate) => candidate.id === dance!.id),
    ).toMatchObject({
      keyId: "k2-0",
      tap: "KC_ESC",
      hold: "",
      doubleTap: "",
    });
  });

  it("updates device-scoped keyboard settings through the shared draft profile", () => {
    const workbench = new WorkbenchStore({ persist: false });

    workbench.updateSettings({
      tappingTerm: 210,
      debounce: 7,
      nkro: false,
    });

    expect(workbench.profile.settings).toMatchObject({
      tappingTerm: 210,
      debounce: 7,
      nkro: false,
    });
    expect(workbench.baseProfile.settings).toMatchObject({
      tappingTerm: 185,
      debounce: 5,
      nkro: true,
    });
    expect(diffProfiles(workbench.baseProfile, workbench.profile)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "setting",
          path: "settings/tappingTerm",
          before: "185",
          after: "210",
        }),
        expect.objectContaining({
          kind: "setting",
          path: "settings/debounce",
          before: "5",
          after: "7",
        }),
        expect.objectContaining({
          kind: "setting",
          path: "settings/nkro",
          before: "true",
          after: "false",
        }),
      ]),
    );
  });

  it("places macros and tap dances on the shared draft profile", () => {
    const workbench = new WorkbenchStore({ persist: false });
    const macro = workbench.addMacro();
    const dance = workbench.addTapDance();
    const macroName = "Test macro";

    workbench.updateMacro(macro.id, { name: macroName, sequence: ["KC_A"] });
    workbench.updateTapDance(dance!.id, {
      keyId: "k2-0",
      tap: "KC_ESC",
      hold: "KC_LCTL",
      doubleTap: "KC_TAB",
    });

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
        expect.objectContaining({ kind: "macro", path: `macros/${macroName}` }),
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
