import type { KeyboardKey } from "$lib/keyboard/schema";

export type DesignCoord = `${number},${number}`;

export interface MatrixCoordinate {
  row: number;
  col: number;
}

export interface CoordinateAdapter {
  coordToId: ReadonlyMap<DesignCoord, string>;
  idToCoord: ReadonlyMap<string, DesignCoord>;
  keyByCoord: ReadonlyMap<DesignCoord, KeyboardKey>;
  keyIdForCoord: (coord: string) => string | undefined;
  coordForKeyId: (keyId: string) => DesignCoord | undefined;
  keyForCoord: (coord: string) => KeyboardKey | undefined;
}

const COORD_PATTERN = /^(\d+),(\d+)$/;

export function coordFromRowCol(row: number, col: number): DesignCoord {
  if (!Number.isInteger(row) || row < 0 || !Number.isInteger(col) || col < 0) {
    throw new Error(`Invalid keyboard coordinate row=${row} col=${col}`);
  }

  return `${row},${col}` as DesignCoord;
}

export function coordForKey(key: Pick<KeyboardKey, "col" | "row">): DesignCoord {
  return coordFromRowCol(key.row, key.col);
}

export function parseDesignCoord(coord: string): MatrixCoordinate | undefined {
  const match = COORD_PATTERN.exec(coord.trim());
  if (!match) return undefined;

  return {
    row: Number(match[1]),
    col: Number(match[2]),
  };
}

export function isDesignCoord(coord: string): coord is DesignCoord {
  return parseDesignCoord(coord) !== undefined;
}

export function keyForCoord(keys: readonly KeyboardKey[], coord: string): KeyboardKey | undefined {
  const parsed = parseDesignCoord(coord);
  if (!parsed) return undefined;

  return keys.find((key) => key.row === parsed.row && key.col === parsed.col);
}

export function keyIdForCoord(keys: readonly KeyboardKey[], coord: string): string | undefined {
  return keyForCoord(keys, coord)?.id;
}

export function coordForKeyId(
  keys: readonly KeyboardKey[],
  keyId: string,
): DesignCoord | undefined {
  const key = keys.find((candidate) => candidate.id === keyId);
  return key ? coordForKey(key) : undefined;
}

export function keyIdsForCoords(keys: readonly KeyboardKey[], coords: Iterable<string>): string[] {
  const adapter = createCoordinateAdapter(keys);
  return Array.from(coords)
    .map((coord) => adapter.keyIdForCoord(coord))
    .filter((keyId): keyId is string => Boolean(keyId));
}

export function coordsForKeyIds(
  keys: readonly KeyboardKey[],
  keyIds: Iterable<string>,
): DesignCoord[] {
  const adapter = createCoordinateAdapter(keys);
  return Array.from(keyIds)
    .map((keyId) => adapter.coordForKeyId(keyId))
    .filter((coord): coord is DesignCoord => Boolean(coord));
}

export function createCoordinateAdapter(keys: readonly KeyboardKey[]): CoordinateAdapter {
  const coordToId = new Map<DesignCoord, string>();
  const idToCoord = new Map<string, DesignCoord>();
  const keyByCoord = new Map<DesignCoord, KeyboardKey>();

  for (const key of keys) {
    const coord = coordForKey(key);
    if (!coordToId.has(coord)) {
      coordToId.set(coord, key.id);
      keyByCoord.set(coord, key);
    }
    idToCoord.set(key.id, coord);
  }

  return {
    coordToId,
    idToCoord,
    keyByCoord,
    keyIdForCoord: (coord) => {
      const parsed = parseDesignCoord(coord);
      return parsed ? coordToId.get(coordFromRowCol(parsed.row, parsed.col)) : undefined;
    },
    coordForKeyId: (keyId) => idToCoord.get(keyId),
    keyForCoord: (coord) => {
      const parsed = parseDesignCoord(coord);
      return parsed ? keyByCoord.get(coordFromRowCol(parsed.row, parsed.col)) : undefined;
    },
  };
}
