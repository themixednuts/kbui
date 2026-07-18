import { describe, expect, it } from "vite-plus/test";

import { sampleKeyboard } from "$lib/keyboard/schema";

import { createBoardFlowGraph, scaleComboPath } from "./board-flow";
import { createBoardViewModel } from "./board-view-model";

describe("board flow graph", () => {
  it("turns every rendered key into a fixed custom node and every combo segment into an edge", () => {
    const model = createBoardViewModel({
      profile: sampleKeyboard,
      activeLayer: "base",
      lens: "keys",
    });
    const graph = createBoardFlowGraph({
      model,
      unit: 40,
      hoveredKeyId: "k1-1",
    });

    expect(graph.nodes).toHaveLength(model.keys.length);
    expect(graph.nodes.find((node) => node.id === "k4-3")).toMatchObject({
      type: "board-key",
      position: { x: 120, y: 160 },
      width: 235,
      height: 35,
      draggable: false,
      connectable: false,
      handles: [
        { id: "combo-source", type: "source" },
        { id: "combo-target", type: "target" },
      ],
    });

    const segmentCount = model.comboConnectors.reduce(
      (count, connector) => count + connector.segments.length,
      0,
    );
    expect(graph.edges).toHaveLength(segmentCount);
    expect(graph.edges[0]).toMatchObject({
      type: "board-combo",
      sourceHandle: "combo-source",
      targetHandle: "combo-target",
      class: expect.stringContaining("combo-connector-active"),
    });
    expect(graph.edges[0].source).not.toBe(graph.edges[0].target);
  });

  it("scales routed key-unit paths into Svelte Flow pixel coordinates", () => {
    expect(scaleComboPath("M 1.25 2 L -0.5 3.125", 40)).toBe("M 50 80 L -20 125");
  });
});
