export type BoxEdges = {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
};

/** Padding kept between the caret and the scroller's visible edge. */
export const PRACTICE_CARET_PAD_PX = 32;

/**
 * Delta to add to a scroller's scrollLeft/scrollTop so `caret` stays inside
 * `scroller` with `pad` px of inset. Does not clamp to scroll extents.
 */
export function scrollDeltaToKeepInView(
  scroller: BoxEdges,
  caret: BoxEdges,
  pad = PRACTICE_CARET_PAD_PX,
): { dx: number; dy: number } {
  let dx = 0;
  let dy = 0;
  if (caret.right > scroller.right - pad) dx = caret.right - (scroller.right - pad);
  else if (caret.left < scroller.left + pad) dx = caret.left - (scroller.left + pad);
  if (caret.bottom > scroller.bottom - pad) dy = caret.bottom - (scroller.bottom - pad);
  else if (caret.top < scroller.top + pad) dy = caret.top - (scroller.top + pad);
  return { dx, dy };
}

export type ScrollableBox = {
  scrollLeft: number;
  scrollTop: number;
  readonly scrollWidth: number;
  readonly scrollHeight: number;
  readonly clientWidth: number;
  readonly clientHeight: number;
};

export function applyScrollDelta(scroller: ScrollableBox, delta: { dx: number; dy: number }): void {
  if (delta.dx !== 0) {
    const maxX = Math.max(0, scroller.scrollWidth - scroller.clientWidth);
    scroller.scrollLeft = Math.min(maxX, Math.max(0, scroller.scrollLeft + delta.dx));
  }
  if (delta.dy !== 0) {
    const maxY = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
    scroller.scrollTop = Math.min(maxY, Math.max(0, scroller.scrollTop + delta.dy));
  }
}
