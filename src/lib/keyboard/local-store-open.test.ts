import { describe, expect, it } from "vite-plus/test";
import { Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";

import { PlatformError, platformError } from "$lib/effect/errors";
import {
  LocalStoreUnavailable,
  openOpfsDatabaseEffect,
  type OpenOpfsDatabaseOptions,
} from "./local-store-open";

interface FakeDatabase {
  readonly storageType: string;
  destroyed: boolean;
}

function makeAdapter(
  storageTypes: string[],
  overrides?: Partial<OpenOpfsDatabaseOptions<FakeDatabase>>,
) {
  const created: FakeDatabase[] = [];
  const options: OpenOpfsDatabaseOptions<FakeDatabase> = {
    open: Effect.sync(() => {
      const db: FakeDatabase = {
        storageType: storageTypes[Math.min(created.length, storageTypes.length - 1)],
        destroyed: false,
      };
      created.push(db);
      return db;
    }),
    storageType: (db) => Effect.succeed(db.storageType),
    close: (db) =>
      Effect.sync(() => {
        db.destroyed = true;
      }),
    crossOriginIsolated: Effect.succeed(true),
    ...overrides,
  };
  return { created, options };
}

/**
 * Drives the backoff sleeps deterministically: fork the program, advance the
 * TestClock far past the worst-case jittered backoff total, then join.
 */
function runWithTestClock<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(effect);
      yield* TestClock.adjust("5 minutes");
      return yield* Fiber.join(fiber);
    }).pipe(Effect.provide(TestClock.layer())),
  );
}

describe("openOpfsDatabaseEffect", () => {
  it("returns the database when the first attempt lands on OPFS", async () => {
    const { created, options } = makeAdapter(["opfs"]);

    const db = await runWithTestClock(openOpfsDatabaseEffect(options));

    expect(created).toHaveLength(1);
    expect(db).toBe(created[0]);
    expect(db.destroyed).toBe(false);
  });

  it("retries transient lock contention with a fresh client and succeeds", async () => {
    const { created, options } = makeAdapter(["memory", "memory", "opfs"]);

    const db = await runWithTestClock(openOpfsDatabaseEffect(options));

    expect(created).toHaveLength(3);
    expect(db).toBe(created[2]);
    expect(created[0].destroyed).toBe(true);
    expect(created[1].destroyed).toBe(true);
    expect(created[2].destroyed).toBe(false);
  });

  it("reports a storage lock once retries are exhausted, without blaming isolation", async () => {
    const { created, options } = makeAdapter(["memory"], { maxRetries: 2 });

    const error = await runWithTestClock(Effect.flip(openOpfsDatabaseEffect(options)));

    expect(created).toHaveLength(3);
    expect(created.every((db) => db.destroyed)).toBe(true);
    expect(error).toBeInstanceOf(LocalStoreUnavailable);
    expect(error).toMatchObject({ reason: "storage-lock" });
    expect(error.message).not.toMatch(/isolat/i);
    expect(error.message).toMatch(/locked/i);
  });

  it("fails immediately when the page is not cross-origin isolated", async () => {
    const { created, options } = makeAdapter(["memory"], {
      crossOriginIsolated: Effect.succeed(false),
    });

    const error = await Effect.runPromise(Effect.flip(openOpfsDatabaseEffect(options)));

    expect(created).toHaveLength(1);
    expect(error).toBeInstanceOf(LocalStoreUnavailable);
    expect(error).toMatchObject({ reason: "missing-isolation" });
    expect(error.message).toMatch(/cross-origin isolated/i);
  });

  it("does not retry unexpected open failures", async () => {
    let attempts = 0;
    const { options } = makeAdapter(["opfs"], {
      open: Effect.suspend(() => {
        attempts += 1;
        return Effect.fail(platformError("local-store.open", new Error("worker exploded")));
      }),
    });

    const error = await Effect.runPromise(Effect.flip(openOpfsDatabaseEffect(options)));

    expect(attempts).toBe(1);
    expect(error).toBeInstanceOf(PlatformError);
    expect(error).toMatchObject({ operation: "local-store.open", message: "worker exploded" });
  });
});
