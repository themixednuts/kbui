import { Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vite-plus/test";

import {
  MonkeytypeApiClient,
  monkeytypeErrorFromResponse,
  readMonkeytypeRateLimit,
} from "./client";

describe("Monkeytype API client", () => {
  it("sends ApeKey authorization only from the server client", async () => {
    let authorization: string | null = null;
    const client = new MonkeytypeApiClient({
      nowMs: () => 1_000,
      fetchImpl: async (_url, init) => {
        authorization = new Headers(init?.headers).get("authorization");
        return Response.json({ data: { completedTests: 1 } });
      },
    });

    await Effect.runPromise(client.statsEffect("test-ape-key"));

    expect(authorization).toBe("ApeKey test-ape-key");
  });

  it("keeps the Worker fetch receiver when using the default fetch implementation", async () => {
    const originalFetch = globalThis.fetch;
    const fetchReceivers: unknown[] = [];

    globalThis.fetch = function fakeWorkerFetch(this: unknown) {
      fetchReceivers.push(this);
      return Promise.resolve(Response.json({ data: { completedTests: 1 } }));
    } as typeof fetch;

    try {
      const client = new MonkeytypeApiClient({
        nowMs: () => 1_000,
      });

      await Effect.runPromise(client.statsEffect("test-ape-key"));

      expect(fetchReceivers).toEqual([globalThis]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("bounds rejected fetch retries", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        let attempts = 0;
        const client = new MonkeytypeApiClient({
          fetchImpl: async () => {
            attempts += 1;
            throw new Error("network unavailable");
          },
        });
        const fiber = yield* Effect.forkChild(Effect.flip(client.statsEffect("test-ape-key")));

        yield* TestClock.adjust("1 minute");
        const error = yield* Fiber.join(fiber);

        expect(attempts).toBe(4);
        expect(error._tag).toBe("PlatformError");
      }).pipe(Effect.provide(TestClock.layer())),
    ));

  it("normalizes ApeKey error codes and rate-limit reset headers", () => {
    const headers = new Headers({
      "x-ratelimit-limit": "60",
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": "60",
    });
    const rateLimit = readMonkeytypeRateLimit(headers, 1_000);
    const invalid = monkeytypeErrorFromResponse(470, { message: "invalid" }, rateLimit);
    const limited = monkeytypeErrorFromResponse(479, { message: "limited" }, rateLimit);

    expect(rateLimit).toMatchObject({
      limit: 60,
      remaining: 0,
      rawReset: "60",
    });
    expect(rateLimit.resetAt).toBe("1970-01-01T00:01:01.000Z");
    expect(invalid.code).toBe("MONKEYTYPE_INVALID_APE_KEY");
    expect(invalid.status).toBe(470);
    expect(limited.code).toBe("MONKEYTYPE_APE_KEY_RATE_LIMITED");
  });
});
