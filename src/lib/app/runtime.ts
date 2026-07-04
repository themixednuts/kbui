import { Cause, Effect } from "effect";

/**
 * `runApp` — fire-and-forget an Effect from imperative call sites (event
 * handlers, mount lifecycle). Failures are funneled to the provided
 * `onError` reporter so we never leave an Effect's error channel
 * unobserved; callers don't have to worry about `runPromise` rejections.
 *
 * This is intentionally a thin wrapper — the eventual goal is a managed
 * runtime via `ManagedRuntime.make(Layer.merge(...))` once we have enough
 * services (Auth, Sync, Preferences) to make the wiring worthwhile. For
 * now everything is pure Effects with no Context requirements, so a
 * direct `runPromise` is sufficient and avoids premature abstraction.
 */
export function runApp<A>(
  label: string,
  effect: Effect.Effect<A, unknown>,
  onError?: (label: string, message: string) => void,
): Promise<A | undefined> {
  return Effect.runPromise(
    effect.pipe(
      Effect.catchCause((cause) =>
        Effect.sync(() => {
          const message = Cause.pretty(cause);
          if (onError) {
            onError(label, message);
          } else if (typeof console !== "undefined") {
            console.error(`[${label}]`, message);
          }
          return undefined as A | undefined;
        }),
      ),
    ),
  );
}

/** Run an Effect synchronously, returning its success value or a fallback.
 *  Use only for Effects guaranteed not to fail (Effect.sync wrappers). */
export function runAppSync<A>(effect: Effect.Effect<A, never>): A {
  return Effect.runSync(effect);
}
