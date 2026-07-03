import type { WorkbenchRoute } from "./routes";
import { WORKBENCH_ROUTES } from "./routes";

export type KeymapMode = "bind" | "rgb";
export type InspectorTab = "binding" | "behavior" | "source";
export type LogicTab = "macros" | "combos" | "tapDance";

const LOGIC_TABS = new Set<string>(["macros", "combos", "tapDance"]);
const INSPECTOR_TABS = new Set<string>(["binding", "behavior", "source"]);
const KEYMAP_MODES = new Set<string>(["bind", "rgb"]);

export type WorkbenchSearch = {
  layerId: string;
  /** Empty when no key is selected for editing. */
  keyId: string;
  keymapMode: KeymapMode;
  logicTab: LogicTab;
  inspectorTab: InspectorTab;
};

export function parseWorkbenchSearch(url: URL): WorkbenchSearch {
  const params = url.searchParams;
  const logic = params.get("logic");
  const bind = params.get("bind");
  const mode = params.get("mode");

  const keymapMode: KeymapMode =
    mode === "rgb" || bind === "rgb" ? "rgb" : mode === "bind" ? "bind" : "bind";

  return {
    layerId: params.get("layer") ?? "base",
    keyId: params.get("key") ?? "",
    keymapMode,
    logicTab: logic && LOGIC_TABS.has(logic) ? (logic as LogicTab) : "macros",
    inspectorTab:
      bind && INSPECTOR_TABS.has(bind) ? (bind as InspectorTab) : "binding",
  };
}

export type WorkbenchSearchPatch = {
  layer?: string;
  key?: string | null;
  mode?: KeymapMode;
  logic?: LogicTab;
  bind?: InspectorTab;
};

function resolveKeyParam(
  current: URL,
  patch: WorkbenchSearchPatch,
): string | null {
  if (patch.key === null) return null;
  if (patch.key !== undefined) return patch.key || null;
  return current.searchParams.get("key");
}

/** Build a shareable path + query for workbench navigation (prefer over `goto`). */
export function workbenchHref(
  current: URL,
  route: WorkbenchRoute,
  patch: WorkbenchSearchPatch = {},
): string {
  const next = new URL(current);
  next.pathname = WORKBENCH_ROUTES[route];

  if (route === "keymap") {
    const layer = patch.layer ?? current.searchParams.get("layer") ?? "base";
    const key = resolveKeyParam(current, patch);
    const mode =
      patch.mode ??
      (current.searchParams.get("mode") as KeymapMode | null) ??
      (current.searchParams.get("bind") === "rgb" ? "rgb" : "bind");

    next.searchParams.set("layer", layer);
    if (key) next.searchParams.set("key", key);
    else next.searchParams.delete("key");

    if (mode === "rgb") {
      next.searchParams.set("mode", "rgb");
      next.searchParams.delete("bind");
    } else {
      next.searchParams.delete("mode");
      const bind =
        patch.bind ?? (current.searchParams.get("bind") as InspectorTab | null) ?? "binding";
      next.searchParams.set("bind", bind);
    }
    next.searchParams.delete("logic");
  } else if (route === "logic") {
    const logic = patch.logic ?? (current.searchParams.get("logic") as LogicTab | null) ?? "macros";
    next.search = "";
    next.searchParams.set("logic", logic);
  } else {
    next.search = "";
  }

  return `${next.pathname}${next.search}`;
}
