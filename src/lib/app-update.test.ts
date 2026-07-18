import { describe, expect, it } from "vitest";

import { isChunkLoadFailure } from "./app-update";

describe("app update detection", () => {
  it.each([
    "Failed to fetch dynamically imported module: /_app/immutable/nodes/5.js",
    "Importing a module script failed.",
    "error loading dynamically imported module",
    "Failed to load module script: Expected a JavaScript-or-Wasm module script",
    "ChunkLoadError: Loading chunk 12 failed",
  ])("recognizes stale module failures", (message) => {
    expect(isChunkLoadFailure(new Error(message))).toBe(true);
  });

  it("does not turn unrelated application failures into update prompts", () => {
    expect(isChunkLoadFailure(new Error("WebHID device disconnected"))).toBe(false);
  });
});
