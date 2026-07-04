import { getContext, setContext } from "svelte";

import { EditorStore, type EditorStoreOptions } from "$lib/app/editor-store.svelte";
import { sampleBoards, type SampleBoardId } from "$lib/keyboard/sample-boards";

export interface WorkbenchStoreOptions extends EditorStoreOptions {
  boardId?: SampleBoardId;
}

const WORKBENCH_CONTEXT = Symbol("kbgui.workbench");

export class WorkbenchStore extends EditorStore {
  activeBoardId = $state<SampleBoardId>("default");

  constructor(options: WorkbenchStoreOptions = {}) {
    const boardId = options.boardId ?? "default";
    super({
      ...options,
      baseProfile: options.baseProfile ?? sampleBoards[boardId],
    });
    this.activeBoardId = boardId;
  }

  async switchSampleBoard(boardId: SampleBoardId) {
    if (boardId === this.activeBoardId) return;
    this.activeBoardId = boardId;
    await this.replaceProfile(sampleBoards[boardId]);
  }
}

export function setWorkbenchContext(workbench: WorkbenchStore) {
  setContext(WORKBENCH_CONTEXT, workbench);
}

export function getWorkbenchContext(): WorkbenchStore {
  return getContext<WorkbenchStore>(WORKBENCH_CONTEXT);
}

export function protocolLabel(protocol: string) {
  if (protocol === "via-v3") return "VIA v3";
  if (protocol === "zmk-studio") return "ZMK Studio";
  return protocol.toUpperCase();
}
