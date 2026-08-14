import { Cause, Effect } from "effect";

/**
 * Client-safe Promise bridge for the browser service worker.
 * Must not import `$lib/server` — SvelteKit treats that as a client leak.
 * Also avoid ManagedRuntime/HMR here: Vite's hot client cannot evaluate in a SW.
 */
export function runServiceWorkerEffect<A, E>(
  operation: string,
  effect: Effect.Effect<A, E>,
): Promise<A> {
  return Effect.runPromise(
    effect.pipe(
      Effect.tapCause((cause) =>
        Effect.sync(() => {
          console.error(
            JSON.stringify({
              event: "effect.service-worker.failure",
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
