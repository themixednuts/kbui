import type { Combo, KeyboardKey } from "./schema";

type Point = { x: number; y: number };
type Rect = { keyId: string; minX: number; minY: number; maxX: number; maxY: number };
type RouteBounds = { minX: number; minY: number; maxX: number; maxY: number };
type RawComboEdge = {
  comboId: string;
  index: number;
  sourceId: string;
  targetId: string;
  start: Point;
  end: Point;
  pairId: string;
  span: number;
};
type RouteResult = {
  points: Point[];
  cost: number;
};

export type ComboRouteSegment = {
  id: string;
  keyIds: [string, string];
  path: string;
};

export type ComboConnectorRoute = {
  id: string;
  keyIds: string[];
  segments: ComboRouteSegment[];
};

const GRID_CELL = 0.16;
const KEY_OBSTACLE_INSET = 0.12;
const ROUTE_MARGIN = 0.3;
const LANE_STEP = 0.1;
const TRAFFIC_PENALTY = 1.8;
const CLEARANCE_DISTANCE = 0.16;
const CLEARANCE_PENALTY = 1.4;
const COLLINEAR_EPSILON = 0.035;
const EPSILON = 0.000001;

export function keyVisualCenter(
  key: Pick<KeyboardKey, "col" | "height" | "row" | "rotation" | "width" | "x" | "y">,
) {
  const x = key.x ?? key.col;
  const y = key.y ?? key.row;
  const width = key.width ?? 1;
  const height = key.height ?? 1;
  const rotation = key.rotation ?? 0;
  if (!rotation) return { x: x + width / 2, y: y + height / 2 };

  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = width / 2;
  const dy = height / 2;
  return {
    x: x + dx * cos - dy * sin,
    y: y + dx * sin + dy * cos,
  };
}

export function routeComboConnectors(input: {
  combos: Combo[];
  keys: KeyboardKey[];
}): ComboConnectorRoute[] {
  const keyById = new Map(input.keys.map((key) => [key.id, key]));
  const obstacles = input.keys.map(keyObstacleRect).filter((rect): rect is Rect => Boolean(rect));
  const obstacleByKey = new Map(obstacles.map((rect) => [rect.keyId, rect]));
  const bounds = routeBounds(obstacles);
  const grid = createGrid(bounds);
  const edges = input.combos.flatMap((combo) => comboEdges(combo, keyById));
  const lanes = assignEdgeLanes(edges);
  const traffic = new Map<string, number>();
  const routeByCombo = new Map<string, ComboConnectorRoute>(
    input.combos.map((combo) => [
      combo.id,
      {
        id: combo.id,
        keyIds: combo.keys,
        segments: [],
      },
    ]),
  );

  for (const edge of routingOrder(edges)) {
    const blockedKeys = new Set([edge.sourceId, edge.targetId]);
    const blockers = obstacles.filter((rect) => !blockedKeys.has(rect.keyId));
    const lane = lanes.get(edge.index) ?? 0;
    const routedPoints = routeEdge({
      edge,
      sourceRect: obstacleByKey.get(edge.sourceId),
      targetRect: obstacleByKey.get(edge.targetId),
      blockers,
      grid,
      traffic,
    });
    markTraffic(routedPoints, grid, traffic);
    const offsetPoints = offsetRoute(routedPoints, edge.start, edge.end, lane);
    const route = routeByCombo.get(edge.comboId);
    route?.segments.push({
      id: `${edge.comboId}-${edge.sourceId}-${edge.targetId}`,
      keyIds: [edge.sourceId, edge.targetId],
      path: pathFromPoints(offsetPoints),
    });
  }

  return input.combos
    .map((combo) => routeByCombo.get(combo.id))
    .filter((route): route is ComboConnectorRoute => Boolean(route?.segments.length));
}

function comboEdges(combo: Combo, keyById: Map<string, KeyboardKey>): RawComboEdge[] {
  const seenKeyIds = new Set<string>();
  const points = combo.keys
    .filter((keyId) => {
      if (seenKeyIds.has(keyId)) return false;
      seenKeyIds.add(keyId);
      return true;
    })
    .map((keyId) => {
      const key = keyById.get(keyId);
      return key ? { keyId, point: keyVisualCenter(key) } : undefined;
    })
    .filter((item): item is { keyId: string; point: Point } => Boolean(item));

  if (points.length < 2) return [];

  return minimumSpanningTree(points).map(([sourceIndex, targetIndex]) => {
    const source = points[sourceIndex];
    const target = points[targetIndex];
    const [leftId, rightId] = [source.keyId, target.keyId].sort();
    const span = distance(source.point, target.point);
    return {
      comboId: combo.id,
      index: -1,
      sourceId: source.keyId,
      targetId: target.keyId,
      start: source.point,
      end: target.point,
      pairId: `${leftId}:${rightId}`,
      span,
    };
  });
}

function routingOrder(edges: RawComboEdge[]) {
  return [...edges].sort((left, right) => right.span - left.span || left.index - right.index);
}

function minimumSpanningTree(points: { keyId: string; point: Point }[]) {
  const parent = points.map((_, index) => index);
  const rank = points.map(() => 0);
  const candidates: { source: number; target: number; distance: number }[] = [];

  for (let source = 0; source < points.length; source += 1) {
    for (let target = source + 1; target < points.length; target += 1) {
      candidates.push({
        source,
        target,
        distance: distance(points[source].point, points[target].point),
      });
    }
  }

  candidates.sort((a, b) => a.distance - b.distance || a.source - b.source || a.target - b.target);

  const result: [number, number][] = [];
  for (const candidate of candidates) {
    if (union(parent, rank, candidate.source, candidate.target)) {
      result.push([candidate.source, candidate.target]);
      if (result.length === points.length - 1) break;
    }
  }

  return result;
}

function find(parent: number[], node: number): number {
  if (parent[node] !== node) parent[node] = find(parent, parent[node]);
  return parent[node];
}

function union(parent: number[], rank: number[], left: number, right: number) {
  const leftRoot = find(parent, left);
  const rightRoot = find(parent, right);
  if (leftRoot === rightRoot) return false;

  if (rank[leftRoot] < rank[rightRoot]) {
    parent[leftRoot] = rightRoot;
  } else if (rank[leftRoot] > rank[rightRoot]) {
    parent[rightRoot] = leftRoot;
  } else {
    parent[rightRoot] = leftRoot;
    rank[leftRoot] += 1;
  }

  return true;
}

function assignEdgeLanes(edges: RawComboEdge[]) {
  const edgesWithIndex = edges.map((edge, index) => ({ ...edge, index }));
  for (let index = 0; index < edges.length; index += 1) edges[index].index = index;

  const groups = new Map<string, RawComboEdge[]>();
  for (const edge of edgesWithIndex) {
    groups.set(edge.pairId, [...(groups.get(edge.pairId) ?? []), edge]);
  }

  const lanes = new Map<number, number>();
  for (const group of groups.values()) {
    if (group.length === 1) {
      lanes.set(group[0].index, 0);
      continue;
    }

    group.forEach((edge, groupIndex) => {
      lanes.set(edge.index, groupIndex - (group.length - 1) / 2);
    });
  }

  return lanes;
}

function routeEdge(input: {
  edge: RawComboEdge;
  sourceRect?: Rect;
  targetRect?: Rect;
  blockers: Rect[];
  grid: Grid;
  traffic: Map<string, number>;
}) {
  const sourcePorts = endpointPorts(input.edge.start, input.sourceRect, input.edge.end);
  const targetPorts = endpointPorts(input.edge.end, input.targetRect, input.edge.start);
  const clearanceCache = new Map<string, number>();
  let best: RouteResult | undefined;

  for (const sourcePort of sourcePorts) {
    for (const targetPort of targetPorts) {
      const routed = routeBetweenPorts(
        sourcePort,
        targetPort,
        input.blockers,
        input.grid,
        input.traffic,
        clearanceCache,
      );
      const cost =
        routed.cost +
        distance(input.edge.start, sourcePort) * 0.35 +
        distance(input.edge.end, targetPort) * 0.35;

      if (!best || cost < best.cost) best = { points: routed.points, cost };
    }
  }

  return best?.points ?? [input.edge.start, input.edge.end];
}

function endpointPorts(center: Point, rect: Rect | undefined, toward: Point) {
  if (!rect) return [center];

  const projectedX = clamp(toward.x, rect.minX, rect.maxX);
  const projectedY = clamp(toward.y, rect.minY, rect.maxY);
  const ports = uniquePoints([
    { x: rect.maxX, y: projectedY },
    { x: rect.minX, y: projectedY },
    { x: projectedX, y: rect.minY },
    { x: projectedX, y: rect.maxY },
  ]);

  return ports.sort((left, right) => distance(left, toward) - distance(right, toward)).slice(0, 3);
}

function routeBetweenPorts(
  start: Point,
  end: Point,
  blockers: Rect[],
  grid: Grid,
  traffic: Map<string, number>,
  clearanceCache: Map<string, number>,
): RouteResult {
  if (
    hasLineOfSight(start, end, blockers) &&
    lineTrafficCost(start, end, grid, traffic) === 0 &&
    lineClearanceCost(start, end, grid, blockers, clearanceCache) === 0
  ) {
    return { points: [start, end], cost: distance(start, end) };
  }

  const routed = astarRoute(start, end, blockers, grid, traffic, clearanceCache);
  if (routed) {
    const points = smoothRoute(routed.points, blockers, grid, traffic, clearanceCache);
    return { points, cost: routed.cost + routeLength(points) * 0.05 };
  }

  if (hasLineOfSight(start, end, blockers)) {
    return {
      points: [start, end],
      cost:
        distance(start, end) +
        lineTrafficCost(start, end, grid, traffic) * TRAFFIC_PENALTY +
        lineClearanceCost(start, end, grid, blockers, clearanceCache),
    };
  }

  return { points: [start, end], cost: Number.POSITIVE_INFINITY };
}

function astarRoute(
  start: Point,
  end: Point,
  blockers: Rect[],
  grid: Grid,
  traffic: Map<string, number>,
  clearanceCache: Map<string, number>,
): RouteResult | undefined {
  const startCell = cellForPoint(start, grid);
  const endCell = cellForPoint(end, grid);
  const startKey = cellKey(startCell);
  const endKey = cellKey(endCell);
  const open = new MinHeap<{ key: string; priority: number }>(
    (left, right) => left.priority - right.priority,
  );
  const cameFrom = new Map<string, string>();
  const cost = new Map<string, number>([[startKey, 0]]);
  const closed = new Set<string>();

  open.push({ key: startKey, priority: 0 });

  while (open.size > 0) {
    const current = open.pop();
    if (!current || closed.has(current.key)) continue;
    if (current.key === endKey) {
      return {
        points: reconstructRoute(cameFrom, current.key, grid, start, end),
        cost: cost.get(current.key) ?? distance(start, end),
      };
    }
    closed.add(current.key);

    const cell = parseCellKey(current.key);
    for (const neighbor of neighbors(cell, grid)) {
      const neighborKey = cellKey(neighbor);
      const neighborPoint = pointForCell(neighbor, grid);
      if (
        neighborKey !== endKey &&
        neighborKey !== startKey &&
        (pointBlocked(neighborPoint, blockers) ||
          diagonalCutsCorner(cell, neighbor, blockers, grid))
      ) {
        continue;
      }

      const nextCost =
        (cost.get(current.key) ?? Number.POSITIVE_INFINITY) +
        neighbor.stepCost +
        routeCellPenalty(neighborPoint, neighborKey, blockers, traffic, clearanceCache);
      if (nextCost >= (cost.get(neighborKey) ?? Number.POSITIVE_INFINITY)) continue;

      cost.set(neighborKey, nextCost);
      cameFrom.set(neighborKey, current.key);
      open.push({
        key: neighborKey,
        priority: nextCost + distance(neighborPoint, end),
      });
    }
  }

  return undefined;
}

function reconstructRoute(
  cameFrom: Map<string, string>,
  currentKey: string,
  grid: Grid,
  start: Point,
  end: Point,
) {
  const keys = [currentKey];
  while (cameFrom.has(currentKey)) {
    currentKey = cameFrom.get(currentKey) as string;
    keys.push(currentKey);
  }
  keys.reverse();

  return keys.map((key, index) => {
    if (index === 0) return start;
    if (index === keys.length - 1) return end;
    return pointForCell(parseCellKey(key), grid);
  });
}

function smoothRoute(
  points: Point[],
  blockers: Rect[],
  grid: Grid,
  traffic: Map<string, number>,
  clearanceCache: Map<string, number>,
) {
  if (points.length <= 2) return points;

  const result = [points[0]];
  let anchor = 0;
  while (anchor < points.length - 1) {
    let next = points.length - 1;
    while (
      next > anchor + 1 &&
      (!hasLineOfSight(points[anchor], points[next], blockers) ||
        lineTrafficCost(points[anchor], points[next], grid, traffic) > 0 ||
        lineClearanceCost(points[anchor], points[next], grid, blockers, clearanceCache) > 0)
    ) {
      next -= 1;
    }
    result.push(points[next]);
    anchor = next;
  }

  return removeNearCollinearPoints(removeDuplicatePoints(result));
}

function routeCellPenalty(
  point: Point,
  key: string,
  blockers: Rect[],
  traffic: Map<string, number>,
  clearanceCache: Map<string, number>,
) {
  const congestion = (traffic.get(key) ?? 0) * TRAFFIC_PENALTY;
  return congestion + clearancePenalty(point, key, blockers, clearanceCache);
}

function markTraffic(points: Point[], grid: Grid, traffic: Map<string, number>) {
  for (const key of lineCellKeys(points, grid)) {
    traffic.set(key, (traffic.get(key) ?? 0) + 1);
  }
}

function lineTrafficCost(start: Point, end: Point, grid: Grid, traffic: Map<string, number>) {
  let cost = 0;
  for (const key of segmentCellKeys(start, end, grid)) {
    cost += traffic.get(key) ?? 0;
  }
  return cost;
}

function lineClearanceCost(
  start: Point,
  end: Point,
  grid: Grid,
  blockers: Rect[],
  clearanceCache: Map<string, number>,
) {
  let cost = 0;
  for (const point of segmentSamplePoints(start, end)) {
    const key = cellKey(cellForPoint(point, grid));
    cost += clearancePenalty(point, key, blockers, clearanceCache);
  }
  return round(cost);
}

function lineCellKeys(points: Point[], grid: Grid) {
  const keys = new Set<string>();
  for (let index = 1; index < points.length; index += 1) {
    for (const key of segmentCellKeys(points[index - 1], points[index], grid)) keys.add(key);
  }
  return keys;
}

function segmentCellKeys(start: Point, end: Point, grid: Grid) {
  const keys = new Set<string>();
  for (const point of segmentSamplePoints(start, end)) keys.add(cellKey(cellForPoint(point, grid)));
  return keys;
}

function segmentSamplePoints(start: Point, end: Point) {
  const points: Point[] = [];
  const steps = Math.max(1, Math.ceil(distance(start, end) / GRID_CELL));

  for (let step = 0; step <= steps; step += 1) {
    const ratio = step / steps;
    points.push({
      x: start.x + (end.x - start.x) * ratio,
      y: start.y + (end.y - start.y) * ratio,
    });
  }

  return points;
}

function offsetRoute(points: Point[], start: Point, end: Point, lane: number) {
  if (!lane) return points;

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length < EPSILON) return points;

  const offset = lane * LANE_STEP;
  const normal = { x: -dy / length, y: dx / length };
  return points.map((point) => ({
    x: point.x + normal.x * offset,
    y: point.y + normal.y * offset,
  }));
}

function pathFromPoints(points: Point[]) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${round(point.x)} ${round(point.y)}`)
    .join(" ");
}

function removeDuplicatePoints(points: Point[]) {
  return points.filter(
    (point, index) => index === 0 || distance(point, points[index - 1]) > GRID_CELL / 2,
  );
}

function removeNearCollinearPoints(points: Point[]) {
  if (points.length <= 2) return points;

  const result = [points[0]];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = result[result.length - 1];
    const current = points[index];
    const next = points[index + 1];
    if (pointLineDistance(current, previous, next) <= COLLINEAR_EPSILON) continue;
    result.push(current);
  }
  result.push(points[points.length - 1]);
  return result;
}

function pointLineDistance(point: Point, start: Point, end: Point) {
  const length = distance(start, end);
  if (length < EPSILON) return distance(point, start);
  return (
    Math.abs(
      (end.y - start.y) * point.x - (end.x - start.x) * point.y + end.x * start.y - end.y * start.x,
    ) / length
  );
}

function hasLineOfSight(start: Point, end: Point, blockers: Rect[]) {
  return !blockers.some((blocker) => segmentIntersectsRect(start, end, blocker));
}

function segmentIntersectsRect(start: Point, end: Point, rect: Rect) {
  const inner = {
    ...rect,
    minX: rect.minX + EPSILON,
    minY: rect.minY + EPSILON,
    maxX: rect.maxX - EPSILON,
    maxY: rect.maxY - EPSILON,
  };

  if (pointInsideRect(start, inner) || pointInsideRect(end, inner)) return true;

  const corners = [
    { x: inner.minX, y: inner.minY },
    { x: inner.maxX, y: inner.minY },
    { x: inner.maxX, y: inner.maxY },
    { x: inner.minX, y: inner.maxY },
  ];

  return corners.some((corner, index) =>
    segmentsIntersect(start, end, corner, corners[(index + 1) % corners.length]),
  );
}

function segmentsIntersect(a: Point, b: Point, c: Point, d: Point) {
  const direction1 = orientation(a, b, c);
  const direction2 = orientation(a, b, d);
  const direction3 = orientation(c, d, a);
  const direction4 = orientation(c, d, b);

  if (direction1 === 0 && onSegment(a, c, b)) return true;
  if (direction2 === 0 && onSegment(a, d, b)) return true;
  if (direction3 === 0 && onSegment(c, a, d)) return true;
  if (direction4 === 0 && onSegment(c, b, d)) return true;

  return direction1 !== direction2 && direction3 !== direction4;
}

function orientation(a: Point, b: Point, c: Point) {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < EPSILON) return 0;
  return value > 0 ? 1 : 2;
}

function onSegment(a: Point, b: Point, c: Point) {
  return (
    b.x <= Math.max(a.x, c.x) + EPSILON &&
    b.x >= Math.min(a.x, c.x) - EPSILON &&
    b.y <= Math.max(a.y, c.y) + EPSILON &&
    b.y >= Math.min(a.y, c.y) - EPSILON
  );
}

function pointInsideRect(point: Point, rect: Rect) {
  return point.x > rect.minX && point.x < rect.maxX && point.y > rect.minY && point.y < rect.maxY;
}

function pointBlocked(point: Point, blockers: Rect[]) {
  return blockers.some((blocker) => pointInsideRect(point, blocker));
}

function diagonalCutsCorner(cell: GridCell, neighbor: NeighborCell, blockers: Rect[], grid: Grid) {
  if (cell.x === neighbor.x || cell.y === neighbor.y) return false;

  return (
    pointBlocked(pointForCell({ x: cell.x, y: neighbor.y }, grid), blockers) ||
    pointBlocked(pointForCell({ x: neighbor.x, y: cell.y }, grid), blockers)
  );
}

function keyObstacleRect(key: KeyboardKey): Rect | undefined {
  const x = key.x ?? key.col;
  const y = key.y ?? key.row;
  const width = key.width ?? 1;
  const height = key.height ?? 1;
  const rotation = key.rotation ?? 0;
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const corners = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height },
  ].map((corner) => ({
    x: x + corner.x * cos - corner.y * sin,
    y: y + corner.x * sin + corner.y * cos,
  }));
  const minX = Math.min(...corners.map((corner) => corner.x)) + KEY_OBSTACLE_INSET;
  const minY = Math.min(...corners.map((corner) => corner.y)) + KEY_OBSTACLE_INSET;
  const maxX = Math.max(...corners.map((corner) => corner.x)) - KEY_OBSTACLE_INSET;
  const maxY = Math.max(...corners.map((corner) => corner.y)) - KEY_OBSTACLE_INSET;

  if (maxX <= minX || maxY <= minY) return undefined;
  return { keyId: key.id, minX, minY, maxX, maxY };
}

function routeBounds(obstacles: Rect[]): RouteBounds {
  return {
    minX: Math.min(0, ...obstacles.map((rect) => rect.minX)),
    minY: Math.min(0, ...obstacles.map((rect) => rect.minY)),
    maxX: Math.max(1, ...obstacles.map((rect) => rect.maxX)) + ROUTE_MARGIN,
    maxY: Math.max(1, ...obstacles.map((rect) => rect.maxY)) + ROUTE_MARGIN,
  };
}

function nearestRectDistance(point: Point, rects: Rect[]) {
  if (rects.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...rects.map((rect) => rectDistance(point, rect)));
}

function clearancePenalty(
  point: Point,
  key: string,
  blockers: Rect[],
  clearanceCache: Map<string, number>,
) {
  if (clearanceCache.has(key)) return clearanceCache.get(key) as number;

  const clearance = nearestRectDistance(point, blockers);
  const penalty =
    clearance < CLEARANCE_DISTANCE ? (CLEARANCE_DISTANCE - clearance) * CLEARANCE_PENALTY : 0;
  clearanceCache.set(key, penalty);
  return penalty;
}

function rectDistance(point: Point, rect: Rect) {
  const dx = Math.max(rect.minX - point.x, 0, point.x - rect.maxX);
  const dy = Math.max(rect.minY - point.y, 0, point.y - rect.maxY);
  return Math.hypot(dx, dy);
}

function uniquePoints(points: Point[]) {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = `${round(point.x)}:${round(point.y)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function routeLength(points: Point[]) {
  return points.reduce(
    (total, point, index) => total + (index === 0 ? 0 : distance(points[index - 1], point)),
    0,
  );
}

type Grid = {
  minX: number;
  minY: number;
  cell: number;
  cols: number;
  rows: number;
};
type GridCell = { x: number; y: number };
type NeighborCell = GridCell & { stepCost: number };

function createGrid(bounds: RouteBounds): Grid {
  return {
    minX: bounds.minX,
    minY: bounds.minY,
    cell: GRID_CELL,
    cols: Math.max(2, Math.ceil((bounds.maxX - bounds.minX) / GRID_CELL) + 1),
    rows: Math.max(2, Math.ceil((bounds.maxY - bounds.minY) / GRID_CELL) + 1),
  };
}

function cellForPoint(point: Point, grid: Grid): GridCell {
  return {
    x: clamp(Math.round((point.x - grid.minX) / grid.cell), 0, grid.cols - 1),
    y: clamp(Math.round((point.y - grid.minY) / grid.cell), 0, grid.rows - 1),
  };
}

function pointForCell(cell: GridCell, grid: Grid): Point {
  return {
    x: grid.minX + cell.x * grid.cell,
    y: grid.minY + cell.y * grid.cell,
  };
}

function neighbors(cell: GridCell, grid: Grid): NeighborCell[] {
  const result: NeighborCell[] = [];

  for (let y = -1; y <= 1; y += 1) {
    for (let x = -1; x <= 1; x += 1) {
      if (x === 0 && y === 0) continue;
      const nextX = cell.x + x;
      const nextY = cell.y + y;
      if (nextX < 0 || nextX >= grid.cols || nextY < 0 || nextY >= grid.rows) continue;
      result.push({
        x: nextX,
        y: nextY,
        stepCost: x !== 0 && y !== 0 ? Math.SQRT2 : 1,
      });
    }
  }

  return result;
}

function cellKey(cell: GridCell) {
  return `${cell.x}:${cell.y}`;
}

function parseCellKey(key: string): GridCell {
  const [x, y] = key.split(":").map(Number);
  return { x, y };
}

function distance(left: Point, right: Point) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

class MinHeap<T> {
  #items: T[] = [];
  #compare: (left: T, right: T) => number;

  constructor(compare: (left: T, right: T) => number) {
    this.#compare = compare;
  }

  get size() {
    return this.#items.length;
  }

  push(item: T) {
    this.#items.push(item);
    this.#bubbleUp(this.#items.length - 1);
  }

  pop() {
    if (this.#items.length === 0) return undefined;
    const item = this.#items[0];
    const last = this.#items.pop();
    if (last && this.#items.length > 0) {
      this.#items[0] = last;
      this.#sinkDown(0);
    }
    return item;
  }

  #bubbleUp(index: number) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.#compare(this.#items[index], this.#items[parent]) >= 0) break;
      [this.#items[index], this.#items[parent]] = [this.#items[parent], this.#items[index]];
      index = parent;
    }
  }

  #sinkDown(index: number) {
    while (true) {
      const left = index * 2 + 1;
      const right = index * 2 + 2;
      let smallest = index;

      if (
        left < this.#items.length &&
        this.#compare(this.#items[left], this.#items[smallest]) < 0
      ) {
        smallest = left;
      }
      if (
        right < this.#items.length &&
        this.#compare(this.#items[right], this.#items[smallest]) < 0
      ) {
        smallest = right;
      }
      if (smallest === index) break;

      [this.#items[index], this.#items[smallest]] = [this.#items[smallest], this.#items[index]];
      index = smallest;
    }
  }
}
