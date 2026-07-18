import { Position, type Edge, type Node } from "@xyflow/svelte";
import { createContext, type Snippet } from "svelte";

import { cn } from "$lib/utils.js";

import type { BoardKeyViewModel, BoardLens, BoardViewModel } from "./board-view-model";

export type BoardKeyNodeData = {
  cap: BoardKeyViewModel;
} & Record<string, unknown>;

export type BoardKeyNode = Node<BoardKeyNodeData, "board-key">;

export type BoardComboEdgeData = {
  comboId: string;
  keyIds: string[];
  path: string;
  title: string;
} & Record<string, unknown>;

export type BoardComboEdge = Edge<BoardComboEdgeData, "board-combo">;

export interface BoardFlowRuntime {
  compact: boolean;
  lens: BoardLens;
  comboMarker?: Snippet<[BoardKeyViewModel]>;
  layerMarker?: Snippet<[BoardKeyViewModel]>;
  onSelectKey?: (keyId: string, event: MouseEvent) => void;
  onToggleKey?: (keyId: string, event: MouseEvent) => void;
  onKeyPointerEnter?: (keyId: string, event: PointerEvent) => void;
  onKeyPointerLeave?: (keyId: string, event: PointerEvent) => void;
}

export const [getBoardFlowRuntime, setBoardFlowRuntime] = createContext<BoardFlowRuntime>();

export function createBoardFlowGraph(input: {
  model: Pick<BoardViewModel, "comboConnectors" | "keys">;
  unit: number;
  hoveredKeyId?: string | null;
}): { nodes: BoardKeyNode[]; edges: BoardComboEdge[] } {
  const nodes = input.model.keys.map((cap) => {
    const width = Math.max(1, cap.width * input.unit - 5);
    const height = Math.max(1, cap.height * input.unit - 5);

    return {
      id: cap.id,
      type: "board-key",
      position: { x: cap.x * input.unit, y: cap.y * input.unit },
      width,
      height,
      draggable: false,
      selectable: false,
      connectable: false,
      deletable: false,
      focusable: false,
      zIndex: cap.selected ? 5 : 4,
      ariaLabel: `${cap.legend}: ${cap.display}`,
      class: "keyboard-flow-key-node",
      handles: [
        {
          id: "combo-source",
          type: "source",
          position: Position.Bottom,
          x: width / 2,
          y: height / 2,
          width: 1,
          height: 1,
        },
        {
          id: "combo-target",
          type: "target",
          position: Position.Top,
          x: width / 2,
          y: height / 2,
          width: 1,
          height: 1,
        },
      ],
      data: { cap },
    } satisfies BoardKeyNode;
  });

  const edges = input.model.comboConnectors.flatMap((connector) => {
    const active = input.hoveredKeyId ? connector.keyIds.includes(input.hoveredKeyId) : false;

    return connector.segments.map(
      (segment) =>
        ({
          id: segment.id,
          type: "board-combo",
          source: segment.keyIds[0],
          target: segment.keyIds[1],
          sourceHandle: "combo-source",
          targetHandle: "combo-target",
          selectable: false,
          deletable: false,
          focusable: false,
          zIndex: 3,
          interactionWidth: 14,
          ariaLabel: connector.title,
          class: cn("combo-connector", active && "combo-connector-active"),
          data: {
            comboId: connector.id,
            keyIds: connector.keyIds,
            path: scaleComboPath(segment.path, input.unit),
            title: connector.title,
          },
        }) satisfies BoardComboEdge,
    );
  });

  return { nodes, edges };
}

export function scaleComboPath(path: string, unit: number): string {
  return path.replace(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi, (value) => {
    const scaled = Number(value) * unit;
    return String(Math.round(scaled * 1000) / 1000);
  });
}
