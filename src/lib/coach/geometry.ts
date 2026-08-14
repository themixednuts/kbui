import { Effect } from "effect";

export type Finger = "pinky" | "ring" | "middle" | "index" | "thumb";
export type Hand = "left" | "right";
export type RowClass = "home" | "up" | "down" | "thumb" | "number";

export interface KeyGeometry {
  readonly hand: Hand;
  readonly finger: Finger;
  readonly rowClass: RowClass;
  readonly stretch: number;
}

/** Charybdis 10×6 columnar finger map (issue 06). keyId = "row,col". */
export const geometryForKey = Effect.fn("Coach.geometryForKey")(function* (keyId: string) {
  const [rs, cs] = keyId.split(",");
  const row = Number(rs);
  const col = Number(cs);
  if (!Number.isFinite(row) || !Number.isFinite(col)) return undefined as KeyGeometry | undefined;

  if (row === 4) {
    return { hand: "left", finger: "thumb", rowClass: "thumb", stretch: 0.2 } satisfies KeyGeometry;
  }
  if (row === 9) {
    return { hand: "right", finger: "thumb", rowClass: "thumb", stretch: 0.2 } satisfies KeyGeometry;
  }

  const hand: Hand = row <= 3 ? "left" : "right";
  const physicalCol = hand === "left" ? col : 5 - col;
  let finger: Finger;
  let stretch = 0;
  if (physicalCol <= 0) finger = "pinky";
  else if (physicalCol === 1) finger = "ring";
  else if (physicalCol === 2) finger = "middle";
  else if (physicalCol <= 4) finger = "index";
  else {
    finger = "index";
    stretch = 0.6;
  }

  const localRow = hand === "left" ? row : row - 5;
  let rowClass: RowClass = "home";
  if (localRow === 0) rowClass = "number";
  else if (localRow === 1) rowClass = "up";
  else if (localRow === 2) rowClass = "home";
  else rowClass = "down";

  return { hand, finger, rowClass, stretch } satisfies KeyGeometry;
});

export const effortForGeometry = Effect.fn("Coach.effortForGeometry")(function* (geo: KeyGeometry) {
  const rowCost =
    geo.rowClass === "home"
      ? 0
      : geo.rowClass === "up"
        ? 0.4
        : geo.rowClass === "down"
          ? 0.5
          : geo.rowClass === "number"
            ? 0.7
            : 0.3;
  const fingerCost =
    geo.finger === "index"
      ? 0.1
      : geo.finger === "middle"
        ? 0.15
        : geo.finger === "ring"
          ? 0.25
          : geo.finger === "pinky"
            ? 0.45
            : 0.2;
  return rowCost + fingerCost + geo.stretch;
});
