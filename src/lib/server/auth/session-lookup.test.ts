import { describe, expect, it } from "vite-plus/test";
import { Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";

import { PlatformError } from "$lib/effect/errors";
import { fetchAuthSessionResponse } from "./session-lookup";

function runWithTestClock<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(effect);
      yield* TestClock.adjust("5 minutes");
      return yield* Fiber.join(fiber);
    }).pipe(Effect.provide(TestClock.layer())),
  );
}

describe("fetchAuthSessionResponse", () => {
  it("retries rejected requests and transient HTTP statuses", async () => {
    let attempts = 0;
    const response = await runWithTestClock(
      fetchAuthSessionResponse(async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("Durable Object unavailable");
        return new Response(null, { status: attempts === 2 ? 503 : 200 });
      }),
    );

    expect(attempts).toBe(3);
    expect(response.status).toBe(200);
  });

  it("does not retry a permanent HTTP response", async () => {
    let attempts = 0;
    const response = await Effect.runPromise(
      fetchAuthSessionResponse(async () => {
        attempts += 1;
        return new Response(null, { status: 401 });
      }),
    );

    expect(attempts).toBe(1);
    expect(response.status).toBe(401);
  });

  it("stops after the configured retry bound", async () => {
    let attempts = 0;
    const error = await runWithTestClock(
      Effect.flip(
        fetchAuthSessionResponse(async () => {
          attempts += 1;
          return new Response(null, { status: 503 });
        }),
      ),
    );

    expect(attempts).toBe(3);
    expect(error).toBeInstanceOf(PlatformError);
    expect(error.operation).toBe("hooks.auth-session-status");
  });

  it("interrupts timed-out attempts through their AbortSignal", async () => {
    let attempts = 0;
    let aborts = 0;
    const error = await runWithTestClock(
      Effect.flip(
        fetchAuthSessionResponse(
          (signal) => {
            attempts += 1;
            return new Promise<Response>((_resolve, reject) => {
              signal.addEventListener(
                "abort",
                () => {
                  aborts += 1;
                  reject(new DOMException("Aborted", "AbortError"));
                },
                { once: true },
              );
            });
          },
          { attemptTimeout: "100 millis", baseDelay: "10 millis", maxRetries: 1 },
        ),
      ),
    );

    expect(attempts).toBe(2);
    expect(aborts).toBe(2);
    expect(error).toBeInstanceOf(PlatformError);
    expect(error.operation).toBe("hooks.auth-session-timeout");
  });
});
