import { describe, expect, it } from "vite-plus/test";
import { profileFromCatalog } from "./catalog";
import { routeComboConnectors } from "./combo-routing";
import type { Combo, KeyboardKey } from "./schema";
import { parseViaDefinition } from "./via-definition";
import { localKeyboardDefinitions } from "../server/keyboards/local-defs";

function key(id: string, x: number, y = 0): KeyboardKey {
  return { id, label: id.toUpperCase(), row: y, col: x, x, y };
}

function segmentPairs(combo: Combo, keys: KeyboardKey[]) {
  return routeComboConnectors({ combos: [combo], keys })[0].segments.map((segment) =>
    [...segment.keyIds].sort().join(":"),
  );
}

function pathPoints(path: string) {
  return [...path.matchAll(/[ML]\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)].map(([, x, y]) => ({
    x: Number(x),
    y: Number(y),
  }));
}

describe("combo routing", () => {
  it("uses a minimum spanning tree for multi-key combo topology", () => {
    const keys = [key("a", 0), key("b", 1), key("c", 2)];
    const combo = { id: "triad", name: "Triad", keys: ["a", "c", "b"], binding: "KC_ESC" };

    expect(segmentPairs(combo, keys)).toEqual(["a:b", "b:c"]);
  });

  it("anchors adjacent combos on key-edge ports instead of key centers", () => {
    const keys = [key("a", 0), key("b", 1)];
    const combo = { id: "edge", name: "Edge", keys: ["a", "b"], binding: "KC_ESC" };

    const points = pathPoints(routeComboConnectors({ combos: [combo], keys })[0].segments[0].path);

    expect(points[0].x).toBeGreaterThan(0.5);
    expect(points[0].x).toBeLessThan(1);
    expect(points.at(-1)?.x).toBeGreaterThan(1);
    expect(points.at(-1)?.x).toBeLessThan(1.5);
  });

  it("routes across the keyboard grid without crossing non-endpoint keys", () => {
    const keys = [key("a", 0), key("blocker", 1), key("c", 2)];
    const combo = { id: "long", name: "Long", keys: ["a", "c"], binding: "KC_ESC" };

    const route = routeComboConnectors({ combos: [combo], keys })[0];
    const points = pathPoints(route.segments[0].path);
    const yValues = points.map((point) => point.y);

    expect(route.segments[0].path).not.toBe("M 0.5 0.5 L 2.5 0.5");
    expect(points.length).toBeGreaterThan(2);
    expect(Math.min(...yValues) < 0.12 || Math.max(...yValues) > 0.88).toBe(true);
  });

  it("assigns lanes to overlapping combo edges", () => {
    const keys = [key("a", 0), key("b", 1)];
    const combos: Combo[] = [
      { id: "one", name: "One", keys: ["a", "b"], binding: "KC_ESC" },
      { id: "two", name: "Two", keys: ["a", "b"], binding: "KC_TAB" },
    ];

    const routes = routeComboConnectors({ combos, keys });

    expect(routes[0].segments[0].path).not.toBe(routes[1].segments[0].path);
  });

  it("routes the local Dilemma combo set within a render budget", () => {
    const definition = localKeyboardDefinitions.find((item) =>
      item.sourcePath.includes("dilemma/3x5_2"),
    );
    const entry = parseViaDefinition(
      definition!.sourcePath,
      definition!.json,
      definition!.priority,
    );
    const profile = profileFromCatalog(entry!);
    const baseCombos = profile.combos.filter((combo) => combo.layerIds?.includes("base"));

    const startedAt = performance.now();
    const routes = routeComboConnectors({ combos: baseCombos, keys: profile.keys });
    const elapsed = performance.now() - startedAt;

    expect(routes).toHaveLength(15);
    expect(routes.flatMap((route) => route.segments)).toHaveLength(17);
    expect(
      Math.min(
        ...routes.flatMap((route) =>
          route.segments.flatMap((segment) => pathPoints(segment.path).map((point) => point.y)),
        ),
      ),
    ).toBeGreaterThanOrEqual(0);
    // Smoke tripwire for a catastrophic algorithmic regression only. This routes in a
    // few ms normally; the generous ceiling tolerates CPU contention (parallel builds)
    // so the assertion is not flaky, while still catching an orders-of-magnitude blowup.
    expect(elapsed).toBeLessThan(5000);
  });
});
