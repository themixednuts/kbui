import { Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vitest";

import { checkForUpdateEffect, deleteAppCacheEffect, isChunkLoadFailure } from "./app-update";

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

  it("bounds update checks to the initial attempt plus three retries", async () => {
    let attempts = 0;

    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.flip(
          checkForUpdateEffect(() => {
            attempts += 1;
            return Promise.reject(new Error("offline"));
          }),
        ).pipe(Effect.forkChild);

        while (attempts === 0) yield* Effect.yieldNow;
        yield* TestClock.adjust("1 minute");
        return yield* Fiber.join(fiber);
      }).pipe(Effect.provide(TestClock.layer())),
    );

    expect(attempts).toBe(4);
    expect(error.operation).toBe("app-update.check");
  });

  it("models a false Cache.delete result as a bounded typed failure", async () => {
    let attempts = 0;

    const error = await Effect.runPromise(
      Effect.gen(function* () {
        const fiber = yield* Effect.flip(
          deleteAppCacheEffect("klakson-cache-test", () => {
            attempts += 1;
            return Promise.resolve(false);
          }),
        ).pipe(Effect.forkChild);

        while (attempts === 0) yield* Effect.yieldNow;
        yield* TestClock.adjust("1 minute");
        return yield* Fiber.join(fiber);
      }).pipe(Effect.provide(TestClock.layer())),
    );

    expect(attempts).toBe(4);
    expect(error.operation).toBe("app-update.cache.delete");
    expect(error.message).toContain("was not deleted");
  });
});
