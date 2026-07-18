import { Deferred, Effect, Ref } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vite-plus/test";

import { makeLiveSyncLaneQueue } from "./live-sync-lifecycle";

describe("live sync lane lifecycle", () => {
  it("debounces each lane with the Effect clock and keeps only the latest value", async () => {
    const observed = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const batches = yield* Ref.make<readonly (readonly string[])[]>([]);
          const lanes = yield* makeLiveSyncLaneQueue({
            debounceMs: 100,
            processBatch: (batch: readonly string[]) =>
              Ref.update(batches, (current) => [...current, batch]),
          });

          lanes.schedule("key-1", "KC_A");
          lanes.schedule("key-1", "KC_B");
          yield* Effect.yieldNow;
          yield* TestClock.adjust("99 millis");
          expect(yield* Ref.get(batches)).toEqual([]);

          yield* TestClock.adjust("1 millis");
          yield* lanes.flushEffect();
          return yield* Ref.get(batches);
        }),
      ).pipe(Effect.provide(TestClock.layer())),
    );

    expect(observed).toEqual([["KC_B"]]);
  });

  it("flushes pending lanes immediately without advancing the clock", async () => {
    const observed = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const batches = yield* Ref.make<readonly (readonly string[])[]>([]);
          const lanes = yield* makeLiveSyncLaneQueue({
            debounceMs: 60_000,
            processBatch: (batch: readonly string[]) =>
              Ref.update(batches, (current) => [...current, batch]),
          });

          lanes.schedule("key-1", "KC_A");
          lanes.schedule("key-2", "KC_B");
          yield* lanes.flushEffect();
          return yield* Ref.get(batches);
        }),
      ).pipe(Effect.provide(TestClock.layer())),
    );

    expect(observed).toEqual([["KC_A", "KC_B"]]);
  });

  it("interrupts an in-flight batch when its owning scope closes", async () => {
    const completed = await Effect.runPromise(
      Effect.gen(function* () {
        const started = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const completed = yield* Ref.make(false);

        yield* Effect.scoped(
          Effect.gen(function* () {
            const lanes = yield* makeLiveSyncLaneQueue({
              debounceMs: 1,
              processBatch: () =>
                Effect.gen(function* () {
                  yield* Deferred.succeed(started, undefined);
                  yield* Deferred.await(release);
                  yield* Ref.set(completed, true);
                }),
            });

            lanes.schedule("key-1", "KC_A");
            yield* Effect.yieldNow;
            yield* TestClock.adjust("1 millis");
            yield* Deferred.await(started);
          }),
        );

        return yield* Ref.get(completed);
      }).pipe(Effect.provide(TestClock.layer())),
    );

    expect(completed).toBe(false);
  });
});
