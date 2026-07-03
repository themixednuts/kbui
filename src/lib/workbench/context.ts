import type { Snippet } from "svelte";
import { getContext, setContext } from "svelte";
import type { WorkbenchRoute } from "./routes";

export type WorkbenchPages = Record<WorkbenchRoute, Snippet>;

const WORKBENCH_PAGES_KEY = Symbol("workbench-pages");

export function registerWorkbenchPages(pages: WorkbenchPages): WorkbenchPages {
  setContext(WORKBENCH_PAGES_KEY, pages);
  return pages;
}

export function getWorkbenchPages(): WorkbenchPages {
  return getContext<WorkbenchPages>(WORKBENCH_PAGES_KEY);
}
