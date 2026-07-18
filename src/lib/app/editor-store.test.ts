import { describe, expect, it } from "vite-plus/test";

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
