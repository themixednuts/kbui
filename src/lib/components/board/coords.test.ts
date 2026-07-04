import { describe, expect, it } from "vite-plus/test";

import { sampleKeyboard, type KeyboardKey } from "$lib/keyboard/schema";

import {
  coordForKey,
  coordForKeyId,
  coordFromRowCol,
  coordsForKeyIds,
  createCoordinateAdapter,
  isDesignCoord,
  keyForCoord,
  keyIdForCoord,
  keyIdsForCoords,
  parseDesignCoord,
} from "./coords";

describe("board coordinate adapter", () => {
  it("formats and parses handoff coordinates", () => {
    expect(coordFromRowCol(2, 4)).toBe("2,4");
    expect(parseDesignCoord("2,4")).toEqual({ row: 2, col: 4 });
    expect(parseDesignCoord(" 2,4 ")).toEqual({ row: 2, col: 4 });
    expect(isDesignCoord("2,4")).toBe(true);
  });

  it("rejects malformed coordinates", () => {
    expect(parseDesignCoord("k2-4")).toBeUndefined();
    expect(parseDesignCoord("2:4")).toBeUndefined();
    expect(parseDesignCoord("-1,4")).toBeUndefined();
    expect(isDesignCoord("2,4,6")).toBe(false);
    expect(() => coordFromRowCol(1.5, 0)).toThrow("Invalid keyboard coordinate");
  });

  it("maps design coordinates to stable engine key ids", () => {
    expect(keyIdForCoord(sampleKeyboard.keys, "2,4")).toBe("k2-4");
    expect(keyForCoord(sampleKeyboard.keys, "4,3")?.label).toBe("Space");
  });

  it("maps stable engine key ids back to design coordinates", () => {
    expect(coordForKeyId(sampleKeyboard.keys, "k2-4")).toBe("2,4");
    expect(coordForKey(sampleKeyboard.keys.find((key) => key.id === "k4-3")!)).toBe("4,3");
  });

  it("converts coordinate and id batches while skipping unknown entries", () => {
    expect(keyIdsForCoords(sampleKeyboard.keys, ["0,0", "nope", "4,3"])).toEqual(["k0-0", "k4-3"]);
    expect(coordsForKeyIds(sampleKeyboard.keys, ["k0-0", "missing", "k4-3"])).toEqual([
      "0,0",
      "4,3",
    ]);
  });

  it("keeps the first key for duplicate matrix coordinates but preserves all id lookups", () => {
    const duplicateKeys: KeyboardKey[] = [
      { id: "stable-a", label: "A", row: 1, col: 2 },
      { id: "stable-b", label: "B", row: 1, col: 2 },
    ];
    const adapter = createCoordinateAdapter(duplicateKeys);

    expect(adapter.keyIdForCoord("1,2")).toBe("stable-a");
    expect(adapter.coordForKeyId("stable-a")).toBe("1,2");
    expect(adapter.coordForKeyId("stable-b")).toBe("1,2");
  });
});
