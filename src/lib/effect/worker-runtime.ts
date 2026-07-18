import { Cause, Effect, ManagedRuntime } from "effect";

import { qmkTargetCacheLayer } from "$lib/server/keyboards/qmk-target";

const workerRuntime = ManagedRuntime.make(qmkTargetCacheLayer);
export type WorkerServices = ManagedRuntime.ManagedRuntime.Services<typeof workerRuntime>;

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    void workerRuntime.dispose();
  });
}

/**
 * The only Promise bridge used by Cloudflare/SvelteKit entry points. Framework
 * handlers must return Promises, while application code remains in Effect.
 * Failures are logged with their full Cause and then propagated unchanged so
 * Cloudflare retries, Workflows, and Queues can self-heal.
 */
export function runWorkerEffect<A, E>(
  operation: string,
  effect: Effect.Effect<A, E, WorkerServices>,
): Promise<A> {
  return workerRuntime.runPromise(
    effect.pipe(
      Effect.tapCause((cause) =>
        Effect.sync(() => {
          console.error(
            JSON.stringify({
              event: "effect.worker.failure",
              operation,
              cause: Cause.pretty(cause),
            }),
          );
        }),
      ),
      Effect.withSpan(operation),
    ),
  );
}
