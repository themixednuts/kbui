import { describe, expect, it } from "vite-plus/test";

import { normalizeLibrarySelection, type LibrarySelectionIds } from "./library-selection";

describe("library selection normalization", () => {
  it("keeps an existing valid selection", () => {
    const selected: LibrarySelectionIds = { macros: "macro-1", combos: "", tapDance: "" };

    expect(normalizeLibrarySelection(selected, "macros", ["macro-1", "macro-2"])).toBe(selected);
  });

  it("moves invalid selection to the first available id", () => {
    const selected: LibrarySelectionIds = { macros: "removed", combos: "", tapDance: "" };

    expect(normalizeLibrarySelection(selected, "macros", ["macro-2"])).toEqual({
      macros: "macro-2",
      combos: "",
      tapDance: "",
    });
  });

  it("does not allocate another selection object when an empty tab is already normalized", () => {
    const selected: LibrarySelectionIds = { macros: "", combos: "", tapDance: "" };

    expect(normalizeLibrarySelection(selected, "macros", [])).toBe(selected);
  });

  it("normalizes a removed last item once, then stabilizes on the empty selection", () => {
    const selected: LibrarySelectionIds = { macros: "removed", combos: "", tapDance: "" };
    const next = normalizeLibrarySelection(selected, "macros", []);

    expect(next).toEqual({ macros: "", combos: "", tapDance: "" });
    expect(normalizeLibrarySelection(next, "macros", [])).toBe(next);
  });
});
