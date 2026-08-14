import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";

import { BoundaryDecodeError } from "$lib/effect/errors";
import { consumeRateLimitBucket, decodeRateLimitSpecEffect } from "./rate-limit";

describe("consumeRateLimitBucket", () => {
  it("allows traffic under the window limit", () => {
    let bucket = null;
    for (let i = 0; i < 3; i += 1) {
      const decision = consumeRateLimitBucket(bucket, 1_000, { limit: 3, windowMs: 60_000 });
      expect(decision.allowed).toBe(true);
      bucket = decision.bucket;
    }
    expect(bucket?.count).toBe(3);
  });

  it("rejects the next hit and reports retry-after", () => {
    const limited = consumeRateLimitBucket({ windowStartedAt: 1_000, count: 3 }, 2_000, {
      limit: 3,
      windowMs: 60_000,
    });
    expect(limited.allowed).toBe(false);
    expect(limited.retryAfterSeconds).toBe(59);
    expect(limited.bucket.count).toBe(3);
  });

  it("resets after the window elapses", () => {
    const decision = consumeRateLimitBucket({ windowStartedAt: 1_000, count: 8 }, 61_001, {
      limit: 3,
      windowMs: 60_000,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.bucket).toEqual({ windowStartedAt: 61_001, count: 1 });
  });
});

describe("decodeRateLimitSpecEffect", () => {
  it.effect("accepts a positive integer window", () =>
    Effect.gen(function* () {
      expect(yield* decodeRateLimitSpecEffect({ limit: 8, windowMs: 600_000 })).toEqual({
        limit: 8,
        windowMs: 600_000,
      });
    }),
  );

  it.effect("rejects a zero limit at the schema boundary", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(decodeRateLimitSpecEffect({ limit: 0, windowMs: 1_000 }));
      expect(error).toBeInstanceOf(BoundaryDecodeError);
    }),
  );
});
