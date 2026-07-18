import { Cause, Effect } from "effect";

/**
 * The only Promise bridge used by Cloudflare/SvelteKit entry points. Framework
 * handlers must return Promises, while application code remains in Effect.
 * Failures are logged with their full Cause and then propagated unchanged so
 * Cloudflare retries, Workflows, and Queues can self-heal.
 */
export function runWorkerEffect<A, E>(operation: string, effect: Effect.Effect<A, E>): Promise<A> {
  return Effect.runPromise(
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
