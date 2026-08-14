import { Effect } from "effect";

import * as Preferences from "./preferences.ts";

/**
 * Editor layout preference.
 *
 * Two arrangements of the same editor:
 *   - "inspector": board on the left, inspector on the right.
 *   - "dock": board in the middle, inspector along the bottom.
 *
 * "auto" picks dock for split boards and the side inspector for everything else.
 */
export type EditorLayoutId = "auto" | "inspector" | "dock";

export interface EditorLayoutOption {
  id: EditorLayoutId;
  label: string;
  /** Material Symbols glyph used by the toolbar toggle / settings control. */
  icon: string;
  hint: string;
}

export const STORAGE_KEY = "kbui.editor-layout.v1";
export const LEGACY_STORAGE_KEY = "klakson.editor-layout.v1";
export const DEFAULT_EDITOR_LAYOUT: EditorLayoutId = "auto";

export const editorLayoutOptions: readonly EditorLayoutOption[] = [
  {
    id: "auto",
    label: "Auto",
    icon: "auto_awesome",
    hint: "Splits use the dock. Other boards use the side panel.",
  },
  {
    id: "inspector",
    label: "Panel",
    icon: "splitscreen_right",
    hint: "Board on the left, inspector on the right.",
  },
  {
    id: "dock",
    label: "Dock",
    icon: "bottom_panel_open",
    hint: "Board in the middle, inspector along the bottom.",
  },
];

const editorLayoutIds = new Set<EditorLayoutId>(editorLayoutOptions.map((option) => option.id));

export function isEditorLayoutId(value: unknown): value is EditorLayoutId {
  return typeof value === "string" && editorLayoutIds.has(value as EditorLayoutId);
}

export function editorLayoutById(id: EditorLayoutId): EditorLayoutOption {
  return editorLayoutOptions.find((option) => option.id === id) ?? editorLayoutOptions[0];
}

/**
 * Resolve the preference to the concrete arrangement the editor should render.
 * `split` is whether the active board is a split layout.
 */
export function resolveEditorLayout(id: EditorLayoutId, split: boolean): "inspector" | "dock" {
  if (id === "inspector" || id === "dock") return id;
  return split ? "dock" : "inspector";
}

export const load = Effect.gen(function* () {
  const stored = yield* Preferences.getWithLegacy(STORAGE_KEY, LEGACY_STORAGE_KEY);
  return isEditorLayoutId(stored) ? stored : DEFAULT_EDITOR_LAYOUT;
});

export const save = (id: EditorLayoutId) => Preferences.set(STORAGE_KEY, id);

export const reset = Preferences.remove(STORAGE_KEY);
