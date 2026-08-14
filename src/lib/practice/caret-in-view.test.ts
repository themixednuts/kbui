import { describe, expect, it } from "vite-plus/test";

import { applyScrollDelta, PRACTICE_CARET_PAD_PX, scrollDeltaToKeepInView } from "./caret-in-view";

const scroller = { left: 100, right: 500, top: 40, bottom: 200 };

describe("scrollDeltaToKeepInView", () => {
  it("stays put when the caret is inside the padded viewport", () => {
    expect(
      scrollDeltaToKeepInView(scroller, {
        left: 180,
        right: 192,
        top: 80,
        bottom: 100,
      }),
    ).toEqual({ dx: 0, dy: 0 });
  });

  it("scrolls right when the caret crosses the right pad", () => {
    const caret = { left: 470, right: 482, top: 80, bottom: 100 };
    expect(scrollDeltaToKeepInView(scroller, caret)).toEqual({
      dx: caret.right - (scroller.right - PRACTICE_CARET_PAD_PX),
      dy: 0,
    });
  });

  it("scrolls left when the caret sits past the left pad", () => {
    const caret = { left: 108, right: 120, top: 80, bottom: 100 };
    expect(scrollDeltaToKeepInView(scroller, caret)).toEqual({
      dx: caret.left - (scroller.left + PRACTICE_CARET_PAD_PX),
      dy: 0,
    });
  });

  it("scrolls vertically when the caret leaves the padded band", () => {
    expect(
      scrollDeltaToKeepInView(scroller, {
        left: 180,
        right: 192,
        top: 188,
        bottom: 208,
      }),
    ).toEqual({
      dx: 0,
      dy: 208 - (scroller.bottom - PRACTICE_CARET_PAD_PX),
    });
    expect(
      scrollDeltaToKeepInView(scroller, {
        left: 180,
        right: 192,
        top: 42,
        bottom: 62,
      }),
    ).toEqual({
      dx: 0,
      dy: 42 - (scroller.top + PRACTICE_CARET_PAD_PX),
    });
  });
});

describe("applyScrollDelta", () => {
  it("clamps to the scroller's scroll extents", () => {
    const box = {
      scrollLeft: 10,
      scrollTop: 4,
      scrollWidth: 80,
      scrollHeight: 40,
      clientWidth: 40,
      clientHeight: 20,
    };
    applyScrollDelta(box, { dx: -80, dy: 400 });
    expect(box.scrollLeft).toBe(0);
    expect(box.scrollTop).toBe(20);
  });
});
