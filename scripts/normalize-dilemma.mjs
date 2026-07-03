// Normalize the trace tool's detected KLE-space values into a clean
// keymap[] for `src/lib/server/keyboards/local-defs.ts`.
//
// User-chosen normalization:
//   1. Right half ~38° photo tilt is STRIPPED — both halves sit flat
//      side-by-side. Per-column splay (small rotations within the half)
//      is preserved.
//   2. Column x positions and y stagger are forced to CANONICAL
//      Bastardkb Dilemma 3x5 spacing (the photo had ~1.3u column gaps
//      and ~1.27u row gaps from perspective distortion — way too wide).
//        - Each column's row 0 center sits at (c+0.5, 0.5+stagger[c])
//          on the left and (12.5-c, 0.5+stagger[c]) on the right.
//        - Stagger = [0.93, 0.31, 0, 0.28, 0.42] (pinky→inner).
//        - Rows within a column step 1u along the column's y-axis.
//   3. Per-column rotation forced to 0 (the real PCB has no per-column
//      splay — the small ±0.25°–2° detected angles were photo wobble).
//   4. Anchor `0,2` is at center (2.5, 0.5); right anchor `4,2` is at
//      (10.5, 0.5) — matches the existing 3u inter-half gap convention.
//   5. Thumb positions are rescaled from the detected (1.30u/col,
//      1.27u/row) frame into canonical (1u/col, 1u/row) around the
//      same col-2 anchor. Thumb rotations come from detection (post
//      un-tilt for the right half) snapped to 0.25°.

// Detected values from the trace tool with snap enabled.
const detected = [
  { label: "0,0", cx: -0.129, cy: 1.715, rot: 0.25 },
  { label: "0,1", cx: 1.191, cy: 0.902, rot: -0.75 },
  { label: "0,3", cx: 3.791, cy: 0.809, rot: -1.5 },
  { label: "0,4", cx: 5.076, cy: 0.979, rot: -1.5 },
  { label: "1,0", cx: -0.133, cy: 3.007, rot: 0.25 },
  { label: "1,1", cx: 1.186, cy: 2.184, rot: -0.75 },
  { label: "1,2", cx: 2.496, cy: 1.773, rot: 0 },
  { label: "1,3", cx: 3.792, cy: 2.072, rot: -1.5 },
  { label: "1,4", cx: 5.08, cy: 2.232, rot: -1.5 },
  { label: "2,0", cx: -0.137, cy: 4.285, rot: 0.25 },
  { label: "2,1", cx: 1.182, cy: 3.463, rot: -0.75 },
  { label: "2,2", cx: 2.491, cy: 3.051, rot: 0 },
  { label: "2,3", cx: 3.793, cy: 3.344, rot: -1.5 },
  { label: "2,4", cx: 5.083, cy: 3.504, rot: -1.5 },
  { label: "3,0", cx: 4.424, cy: 4.877, rot: 16.75 },
  { label: "3,2", cx: 5.77, cy: 5.418, rot: 29.25 },
  { label: "4,1", cx: 19.649, cy: 7.612, rot: 37 },
  { label: "4,2", cx: 18.893, cy: 6.51, rot: 40 },
  { label: "4,3", cx: 17.737, cy: 5.945, rot: 39.25 },
  { label: "4,4", cx: 16.674, cy: 5.301, rot: 39 },
  { label: "5,0", cx: 19.391, cy: 10.047, rot: 38.5 },
  { label: "5,1", cx: 18.88, cy: 8.608, rot: 37 },
  { label: "5,2", cx: 18.135, cy: 7.494, rot: 40 },
  { label: "5,3", cx: 16.97, cy: 6.93, rot: 39.25 },
  { label: "5,4", cx: 15.914, cy: 6.273, rot: 39 },
  { label: "6,0", cx: 18.649, cy: 11.043, rot: 38.5 },
  { label: "6,1", cx: 18.118, cy: 9.595, rot: 37 },
  { label: "6,2", cx: 17.372, cy: 8.484, rot: 40 },
  { label: "6,3", cx: 16.202, cy: 7.915, rot: 39.25 },
  { label: "6,4", cx: 15.14, cy: 7.263, rot: 39 },
  { label: "7,0", cx: 14.82, cy: 8.736, rot: 22 },
  { label: "7,2", cx: 13.442, cy: 8.339, rot: 8.75 },
];

const snap = (v, g) => Math.round(v / g) * g;
const r3 = (v) => Math.round(v * 1000) / 1000;
const r2 = (v) => Math.round(v * 100) / 100;

const parse = (label) => {
  const [r, c] = label.split(",").map(Number);
  return { row: r, col: c };
};

// KLE pivot (rx, ry) for a key whose center sits at (cx, cy) with
// rotation r — rotates the (-0.5, -0.5) center-offset back to the
// top-left.
const toRxRy = (cx, cy, r) => {
  const rad = (r * Math.PI) / 180;
  const ox = 0.5 * Math.cos(rad) - 0.5 * Math.sin(rad);
  const oy = 0.5 * Math.sin(rad) + 0.5 * Math.cos(rad);
  return { rx: r3(cx - ox), ry: r3(cy - oy) };
};

// Column-y unit vector (one row down) given rotation in degrees.
const colY = (rotDeg) => {
  const rad = (rotDeg * Math.PI) / 180;
  return { dx: -Math.sin(rad), dy: Math.cos(rad) };
};

// Group detected MAIN-GRID keys by half + matrix-col.
const grids = { left: new Map(), right: new Map() };
for (const k of detected) {
  const { row, col } = parse(k.label);
  if (row === 3 || row === 7) continue; // thumbs handled separately
  const half = row < 4 ? "left" : "right";
  if (!grids[half].has(col)) grids[half].set(col, []);
  grids[half].get(col).push({ ...k, row, col });
}

// ---- Right half un-tilt ----
// The detected right-half columns are all rotated ~38° clockwise in the
// photo (the half is held tilted on the desk). Compute the median to
// estimate the half-wide tilt and subtract it from every right-side
// key so the canonical local-def renders both halves flat.
const rightAllRots = [];
for (const arr of grids.right.values()) {
  for (const k of arr) rightAllRots.push(k.rot);
}
rightAllRots.sort((a, b) => a - b);
const rightTilt = snap(
  rightAllRots[Math.floor(rightAllRots.length / 2)],
  0.25,
);

// Pivot: the detected position of 4,2 — un-rotate every right key
// around that point, then translate so 4,2 lands at the canonical
// center (10.5, 0.5) which mirrors the existing `x:7` between 0,2
// and 4,2 in the original local-def.
const pivotRight = detected.find((d) => d.label === "4,2");
const LEFT_ANCHOR = { cx: 2.5, cy: 0.5 };
const RIGHT_CANONICAL_42 = { cx: 10.5, cy: 0.5 };

// --- Canonical Bastardkb Dilemma 3x5 column stagger ---------------
// y offset of each column's row-0 center from y=0.5 (pinky→inner).
const STAGGER = [0.93, 0.31, 0, 0.28, 0.42];

// --- Per-axis scale factors (detected → canonical) ---------------
// Measured from the detected col-2 keys (1.276u/row) and col-0↔col-4
// span (5.220u over 4 column gaps = 1.305u/col). Scaling brings the
// thumbs back in line with the now-tighter main grid.
const xScale = 4.0 / (5.083 - -0.137); // ≈ 0.766
const yScale = 1.0 / ((3.051 - 0.5) / 2); // ≈ 0.784

function untiltRightPoint(cx, cy) {
  const rad = (-rightTilt * Math.PI) / 180;
  const dx = cx - pivotRight.cx;
  const dy = cy - pivotRight.cy;
  const ux = dx * Math.cos(rad) - dy * Math.sin(rad);
  const uy = dx * Math.sin(rad) + dy * Math.cos(rad);
  return {
    cx: ux + RIGHT_CANONICAL_42.cx,
    cy: uy + RIGHT_CANONICAL_42.cy,
  };
}

// Build the keymap in matrix-row order so the source file reads
// top-to-bottom of the keyboard.
const out = [];

// Anchor.
out.push({ label: "0,2", r: 0, rx: 2, ry: 0 });

for (const half of ["left", "right"]) {
  const cols = grids[half];
  const rowOffset = half === "left" ? 0 : 4;
  for (let c = 0; c < 5; c++) {
    const keys = (cols.get(c) || []).slice().sort((a, b) => a.row - b.row);
    if (keys.length === 0) continue;

    // 1) Per-column rotation. The detected photo had small splay rotations
    //    on each column (±0.25° to ±2°) but the real PCB is flat — no
    //    column splay — so we force colRot=0 for every main-grid column.
    //    Thumbs still carry their detected rotation below.
    const colRot = 0;

    // 2) Row 0 position of this column — forced to canonical Bastardkb
    //    coordinates so the rendered layout matches the real PCB
    //    (compact 1u column spacing + standard stagger) instead of the
    //    photo's perspective-distorted ~1.3u spacing.
    const canonicalX = half === "left" ? c + 0.5 : 12.5 - c;
    const canonicalY = 0.5 + STAGGER[c];
    const row0 = { cx: r2(canonicalX), cy: r2(canonicalY) };

    // 3) Emit each of the three rows in this column, forcing 1u spacing
    //    along the (rotated) column-y axis.
    const ax = colY(colRot);
    for (let r = 0; r < 3; r++) {
      const cx = r3(row0.cx + r * ax.dx);
      const cy = r3(row0.cy + r * ax.dy);
      const matrixRow = rowOffset + r;
      const label = `${matrixRow},${c}`;
      if (label === "0,2") continue; // anchor already emitted
      const { rx, ry } = toRxRy(cx, cy, colRot);
      out.push({ label, r: colRot, rx, ry });
    }
  }
}

// ---- Thumbs ----
// Left thumbs: rescale detected positions around the left col-2 anchor
//   using xScale/yScale so they sit tight against the new compact grid.
// Right thumbs: un-tilt first (placing 4,2 at canonical 10.5/0.5),
//   then rescale around the right anchor and subtract half tilt.
const thumbs = detected.filter((k) => {
  const { row } = parse(k.label);
  return row === 3 || row === 7;
});
for (const t of thumbs) {
  const { row } = parse(t.label);
  const half = row === 3 ? "left" : "right";
  let cx = t.cx;
  let cy = t.cy;
  let rot = t.rot;
  if (half === "right") {
    const u = untiltRightPoint(cx, cy);
    cx = u.cx;
    cy = u.cy;
    rot = rot - rightTilt;
  }
  // Rescale into the canonical (1u/col, 1u/row) frame about the half's
  // col-2 row-0 anchor.
  const anchor = half === "left" ? LEFT_ANCHOR : RIGHT_CANONICAL_42;
  cx = anchor.cx + (cx - anchor.cx) * xScale;
  cy = anchor.cy + (cy - anchor.cy) * yScale;
  rot = snap(rot, 0.25);
  cx = r2(cx);
  cy = r2(cy);
  const { rx, ry } = toRxRy(cx, cy, rot);
  out.push({ label: t.label, r: rot, rx, ry });
}

// Sort by matrix label so the keymap reads row-major.
out.sort((a, b) => {
  const [ar, ac] = a.label.split(",").map(Number);
  const [br, bc] = b.label.split(",").map(Number);
  if (ar !== br) return ar - br;
  return ac - bc;
});

console.log("// rightTilt (stripped) =", rightTilt.toFixed(2), "°");
console.log("keymap: [");
for (const e of out) {
  const r = e.r.toFixed(2);
  const rx = e.rx.toFixed(3);
  const ry = e.ry.toFixed(3);
  console.log(
    `        [{ r: ${r}, rx: ${rx}, ry: ${ry}, x: 0, y: 0 }, "${e.label}"],`,
  );
}
console.log("],");
