import { describe, expect, it } from "vite-plus/test";

import { runApp } from "$lib/app/runtime";
import { starterBoardProfile } from "$lib/keyboard/sample-boards";

import { EditorStore } from "./editor-store.svelte";

describe("editor selection", () => {
  it("starts without an arbitrary selected key and preserves an intentional empty selection", async () => {
    const editor = new EditorStore({ autoHydrate: false, persist: false });

    expect(editor.selectionIds).toEqual([]);
    expect(editor.primarySelectedKeyId).toBeNull();

    editor.selectKey("k2-4");
    editor.clearSelection();
    await editor.replaceProfile(starterBoardProfile(), undefined, { hydrateDraft: false });

    expect(editor.selectionIds).toEqual([]);
    expect(editor.primarySelectedKeyId).toBeNull();
  });
});

describe("editor Effect API", () => {
  it("advances a synced binding through the composable Effect API", async () => {
    const editor = new EditorStore({ autoHydrate: false, persist: false });
    editor.selectKey("k2-4");
    editor.applyKeycode("KC_G");

    const advanced = await runApp(
      "test.editor.mark-binding-synced",
      editor.markBindingSyncedToBaseEffect("base", "k2-4"),
    );

    expect(advanced).toBe(true);
    expect(editor.baseProfile.layers[0].bindings["k2-4"].code).toBe("KC_G");
  });
});
