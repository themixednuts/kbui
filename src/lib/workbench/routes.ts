import type { EditorView } from "$lib/keyboard/schema";

/** Workbench editor routes (filesystem paths under `(workbench)/`). */
export type WorkbenchRoute = EditorView | "versioning" | "lighting";

export const WORKBENCH_ROUTES: Record<WorkbenchRoute, `/${WorkbenchRoute}`> = {
  keymap: "/keymap",
  logic: "/logic",
  lighting: "/lighting",
  versioning: "/versioning",
  firmware: "/firmware",
};

const ROUTE_SET = new Set<string>(Object.keys(WORKBENCH_ROUTES));

export function workbenchRouteFromPath(pathname: string): WorkbenchRoute {
  const segment = pathname.split("/").filter(Boolean)[0];
  if (segment && ROUTE_SET.has(segment)) {
    return segment as WorkbenchRoute;
  }
  return "keymap";
}
