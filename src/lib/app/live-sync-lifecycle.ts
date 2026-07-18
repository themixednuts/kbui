import { Cause, Deferred, Effect, FiberMap, Queue, type Scope } from "effect";

interface PendingLane<Pending> {
  pending: Pending;
}

type LaneCommand<Pending> =
  | { readonly _tag: "Write"; readonly pending: Pending }
  | { readonly _tag: "Flush"; readonly completed: Deferred.Deferred<void> };

export interface LiveSyncLaneQueue<Pending> {
  cancel: (laneKey: string) => void;
  clear: () => void;
  flushEffect: () => Effect.Effect<void>;
  schedule: (laneKey: string, pending: Pending) => void;
}

export function makeLiveSyncLaneQueue<Pending, R>(options: {
  debounceMs: number;
  processBatch: (batch: readonly Pending[]) => Effect.Effect<void, never, R>;
}): Effect.Effect<LiveSyncLaneQueue<Pending>, never, R | Scope.Scope> {
  return Effect.gen(function* () {
    const queue = yield* Effect.acquireRelease(
      Queue.unbounded<LaneCommand<Pending>>(),
      Queue.shutdown,
    );
    const lanes = yield* FiberMap.make<string>();
    const runLane = yield* FiberMap.runtime(lanes)<never>();
    const pendingByLane = new Map<string, PendingLane<Pending>>();

    const processBatch = (batch: readonly Pending[]) =>
      options.processBatch(batch).pipe(
        Effect.catchCauseIf(
          (cause) => !Cause.hasInterrupts(cause),
          (cause) => Effect.logError("Live sync batch worker failed", cause),
        ),
      );

    const processCommands = Effect.fn("LiveSyncLaneQueue.processCommands")(function* (
      commands: readonly LaneCommand<Pending>[],
    ) {
      let batch: Pending[] = [];

      for (const command of commands) {
        if (command._tag === "Write") {
          batch.push(command.pending);
          continue;
        }

        if (batch.length > 0) {
          yield* processBatch(batch);
          batch = [];
        }
        yield* Deferred.succeed(command.completed, undefined);
      }

      if (batch.length > 0) yield* processBatch(batch);
    });

    yield* Queue.takeAll(queue).pipe(
      Effect.flatMap(processCommands),
      Effect.forever,
      Effect.forkScoped,
    );

    const enqueuePending = (laneKey: string) =>
      Effect.suspend(() => {
        const lane = pendingByLane.get(laneKey);
        if (!lane) return Effect.void;

        pendingByLane.delete(laneKey);
        return Queue.offer(queue, { _tag: "Write", pending: lane.pending }).pipe(Effect.asVoid);
      });

    const schedule = (laneKey: string, pending: Pending) => {
      pendingByLane.set(laneKey, { pending });
      runLane(
        laneKey,
        Effect.sleep(`${options.debounceMs} millis`).pipe(Effect.andThen(enqueuePending(laneKey))),
      );
    };

    const cancel = (laneKey: string) => {
      pendingByLane.delete(laneKey);
      runLane(laneKey, Effect.void);
    };

    const clear = () => {
      const laneKeys = [...pendingByLane.keys()];
      pendingByLane.clear();
      for (const laneKey of laneKeys) runLane(laneKey, Effect.void);
    };

    const flushEffect = () =>
      Effect.gen(function* () {
        yield* FiberMap.clear(lanes);

        const batch = [...pendingByLane.values()].map((lane) => ({
          _tag: "Write" as const,
          pending: lane.pending,
        }));
        pendingByLane.clear();
        if (batch.length > 0) yield* Queue.offerAll(queue, batch);

        const completed = yield* Deferred.make<void>();
        yield* Queue.offer(queue, { _tag: "Flush", completed });
        yield* Deferred.await(completed);
      });

    return { cancel, clear, flushEffect, schedule };
  });
}
