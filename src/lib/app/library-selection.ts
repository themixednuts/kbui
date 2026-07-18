export type LibraryTab = "macros" | "combos" | "tapDance";

export type LibrarySelectionIds = Record<LibraryTab, string>;

export function normalizeLibrarySelection(
  selectedIds: LibrarySelectionIds,
  tab: LibraryTab,
  ids: readonly string[],
): LibrarySelectionIds {
  const currentId = selectedIds[tab] ?? "";
  if (currentId && ids.includes(currentId)) return selectedIds;

  const nextId = ids[0] ?? "";
  if (currentId === nextId) return selectedIds;

  return {
    ...selectedIds,
    [tab]: nextId,
  };
}
