import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { profileFromConnectedZmkStudioEffect } from "$lib/app/connect-flow";

import { cloneDevice } from "./schema";
import { createMockZmkStudioTransport } from "./transport-mock-zmk";
import { classifyZmkProfileChanges } from "./zmk-live";

async function connectedZmkProfile() {
  const connection = await createMockZmkStudioTransport().connect();
  const profile = await Effect.runPromise(profileFromConnectedZmkStudioEffect(connection));
  return { connection, profile };
}

describe("ZMK live change classification", () => {
  it("classifies encodable key code edits as ZMK Studio writes using key positions", async () => {
    const { connection, profile } = await connectedZmkProfile();
    const draft = cloneDevice(profile);
    draft.layers[0].bindings["k2-4"] = { code: "KC_B" };

    const changes = classifyZmkProfileChanges(profile, draft, connection);
    const binding = changes.find((change) => change.id === "binding:zmk-layer-100.k2-4");

    expect(binding).toMatchObject({
      classification: "liveZmkWritable",
      live: true,
      outcome: {
        live: true,
        status: "live",
      },
      liveWrite: {
        code: "KC_B",
        encodedBinding: { behaviorId: 1, param1: 0x0005, param2: 0 },
        keyId: "k2-4",
        keyPosition: 32,
        laneKey: "zmk:100:32",
        studioLayerId: 100,
      },
    });
  });

  it("keeps unsupported and unknown behavior edits source-only", async () => {
    const { connection, profile } = await connectedZmkProfile();
    const unsupported = cloneDevice(profile);
    unsupported.layers[0].bindings["k2-4"] = { code: "CUSTOM_SAFE_RANGE" };
    const unknown = cloneDevice(profile);
    unknown.layers[0].bindings["k2-4"] = { code: "ZMK_BEHAVIOR(77,1,2)" };

    expect(
      classifyZmkProfileChanges(profile, unsupported, connection).find(
        (change) => change.id === "binding:zmk-layer-100.k2-4",
      ),
    ).toMatchObject({
      classification: "localOnly",
      live: false,
      localOnlyCategory: "behaviors",
      outcome: {
        category: "behaviors",
        live: false,
        status: "local-only",
      },
      reason: "ZMK binding CUSTOM_SAFE_RANGE is not supported by the live-edit codec yet.",
    });
    expect(
      classifyZmkProfileChanges(profile, unknown, connection).find(
        (change) => change.id === "binding:zmk-layer-100.k2-4",
      ),
    ).toMatchObject({
      classification: "localOnly",
      live: false,
      localOnlyCategory: "behaviors",
      outcome: {
        category: "behaviors",
        live: false,
        status: "local-only",
      },
      reason: "ZMK behavior 77 is not live-editable yet.",
    });
  });

  it("treats source-supported ZMK behaviors as rebuildable with or without Studio", async () => {
    const { connection, profile } = await connectedZmkProfile();
    const draft = cloneDevice(profile);
    draft.layers[0].bindings["k2-4"] = { code: "ZMK_BT_SEL(2)" };

    for (const activeConnection of [connection, undefined]) {
      expect(
        classifyZmkProfileChanges(profile, draft, activeConnection).find(
          (change) => change.id === "binding:zmk-layer-100.k2-4",
        ),
      ).toMatchObject({
        classification: "firmwareRebuildRequired",
        live: false,
        outcome: {
          live: false,
          status: "rebuild-required",
        },
      });
    }
  });

  it("marks ZMK lighting edits as local-only and not written live", async () => {
    const { connection, profile } = await connectedZmkProfile();
    const draft = cloneDevice(profile);
    draft.lighting.speed = 22;

    const lighting = classifyZmkProfileChanges(profile, draft, connection).find(
      (change) => change.id === "lighting:speed",
    );

    expect(lighting).toMatchObject({
      classification: "localOnly",
      live: false,
      localOnlyCategory: "lighting",
      outcome: {
        category: "lighting",
        live: false,
        reason: "ZMK lighting is not written live.",
        status: "local-only",
      },
      reason: "ZMK lighting is not written live.",
    });
    expect(lighting?.liveWrite).toBeUndefined();
  });

  it("flags combos, macros, tap dances, settings, and layer-count edits for rebuild", async () => {
    const { connection, profile } = await connectedZmkProfile();
    const draft = cloneDevice(profile);

    draft.combos.push({
      id: "combo-test",
      name: "Test Combo",
      keys: ["k1-1", "k1-2"],
      binding: "KC_ESC",
    });
    draft.macros.push({
      id: "macro-test",
      name: "Test Macro",
      sequence: ["KC_A"],
      trigger: "Unassigned",
    });
    draft.tapDances.push({
      id: "td-test",
      keyId: "k2-4",
      tap: "KC_A",
      hold: "KC_LCTL",
      doubleTap: "KC_ESC",
    });
    draft.settings.tappingTerm = 210;
    draft.layers.push({
      id: "extra",
      name: "Extra",
      color: "#39945f",
      bindings: Object.fromEntries(draft.keys.map((key) => [key.id, { code: "KC_TRNS" }])),
    });

    const changes = classifyZmkProfileChanges(profile, draft, connection);

    expect(changes.filter((change) => change.classification === "firmwareRebuildRequired")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "combo" }),
        expect.objectContaining({ kind: "macro" }),
        expect.objectContaining({ kind: "tapDance" }),
        expect.objectContaining({ kind: "setting" }),
        expect.objectContaining({ kind: "metadata", path: "layers/Extra" }),
      ]),
    );
  });
});
