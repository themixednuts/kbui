import { getContext, setContext } from "svelte";
import type { WorkbenchStore } from "./workbench-store.svelte";

const WORKBENCH_STORE_KEY = Symbol("workbench-store");

export function setWorkbenchStore(store: WorkbenchStore): WorkbenchStore {
  setContext(WORKBENCH_STORE_KEY, store);
  return store;
}

export function getWorkbenchStore(): WorkbenchStore {
  return getContext<WorkbenchStore>(WORKBENCH_STORE_KEY);
}
