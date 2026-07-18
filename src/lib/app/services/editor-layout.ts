import { Effect } from "effect";

import * as Preferences from "./preferences.ts";

/**
 * Editor layout preference.
 *
 * The redesign (Klakson v2) ships two spatial arrangements of the same editor:
 *   - "inspector" (Layout A): board hero with a calm right-hand inspector rail.
 *   - "dock"      (Layout B): board centered with a full-width bottom inspector dock.
 *
 * "auto" preserves the historical behaviour — split boards get the dock, single
 * blocks get the right inspector — so users who never open the setting keep the
 * layout tuned to their board.
 */
export type EditorLayoutId = "auto" | "inspector" | "dock";

export interface EditorLayoutOption {
  id: EditorLayoutId;
  label: string;
  /** Material Symbols glyph used by the toolbar toggle / settings control. */
  icon: string;
  hint: string;
}

export const STORAGE_KEY = "klakson.editor-layout.v1";
export const DEFAULT_EDITOR_LAYOUT: EditorLayoutId = "auto";

export const editorLayoutOptions: readonly EditorLayoutOption[] = [
  {
    id: "auto",
    label: "Auto",
    icon: "auto_awesome",
    hint: "Match the board — dock for splits, panel otherwise",
  },
  {
    id: "inspector",
    label: "Panel",
    icon: "splitscreen_right",
    hint: "Board hero with a right-hand inspector",
  },
  {
    id: "dock",
    label: "Dock",
    icon: "bottom_panel_open",
    hint: "Board centered with a bottom inspector dock",
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
  const stored = yield* Preferences.get(STORAGE_KEY);
  return isEditorLayoutId(stored) ? stored : DEFAULT_EDITOR_LAYOUT;
});

export const save = (id: EditorLayoutId) => Preferences.set(STORAGE_KEY, id);

export const reset = Preferences.remove(STORAGE_KEY);
