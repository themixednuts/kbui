import { Cause, Effect, Fiber, Layer, ManagedRuntime, Scope } from "effect";
import { FetchHttpClient } from "effect/unstable/http";

import * as Preferences from "$lib/app/services/preferences";
import * as Theme from "$lib/app/services/theme";
import { localStoreLayer } from "$lib/keyboard/local-store";

const applicationLayer = Layer.mergeAll(
  FetchHttpClient.layer,
  Preferences.layer,
  Theme.layer.pipe(Layer.provide(Preferences.layer)),
  localStoreLayer,
);

export const appRuntime = ManagedRuntime.make(applicationLayer);
export type AppServices = ManagedRuntime.ManagedRuntime.Services<typeof appRuntime>;

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    void appRuntime.dispose();
  });
}

/**
 * `runApp` — fire-and-forget an Effect from imperative call sites (event
 * handlers, mount lifecycle). Failures are funneled to the provided
 * `onError` reporter so we never leave an Effect's error channel
 * unobserved; callers don't have to worry about `runPromise` rejections.
 *
 * This is the browser Promise boundary for the application ManagedRuntime.
 * Svelte callbacks may return this Promise, while all application work and
 * service requirements remain in the Effect program.
 */
export function runApp<A, E>(
  label: string,
  effect: Effect.Effect<A, E, AppServices>,
  onError?: (label: string, message: string) => void,
): Promise<A> {
  return appRuntime.runPromise(
    effect.pipe(
      Effect.tapCause((cause) =>
        Effect.sync(() => {
          const message = Cause.pretty(cause);
          if (onError) {
            onError(label, message);
          } else if (typeof console !== "undefined") {
            console.error(`[${label}]`, message);
          }
        }),
      ),
      Effect.withSpan(label),
    ),
  );
}

export function forkApp<A, E>(
  label: string,
  effect: Effect.Effect<A, E, AppServices>,
  onError?: (label: string, message: string) => void,
): Fiber.Fiber<A, E> {
  return appRuntime.runFork(
    effect.pipe(
      Effect.tapCause((cause) =>
        Effect.sync(() => {
          const message = Cause.pretty(cause);
          if (onError) onError(label, message);
          else console.error(`[${label}]`, message);
        }),
      ),
      Effect.withSpan(label),
    ),
  );
}

/** Run an Effect synchronously. Use only for Effects whose error type is never. */
export function runAppSync<A>(effect: Effect.Effect<A, never, AppServices>): A {
  return appRuntime.runSync(effect);
}

/**
 * Starts one scoped browser program and returns its synchronous lifecycle
 * finalizer. Svelte attachments use this bridge so listeners, sockets, and
 * child fibers are released by Effect's Scope instead of bespoke cleanup code.
 */
export function startScopedApp<A, E>(
  label: string,
  effect: Effect.Effect<A, E, AppServices | Scope.Scope>,
  onError?: (label: string, message: string) => void,
): () => void {
  const fiber = appRuntime.runFork(
    Effect.scoped(effect).pipe(
      Effect.tapCause((cause) =>
        Effect.sync(() => {
          const message = Cause.pretty(cause);
          if (onError) onError(label, message);
          else console.error(`[${label}]`, message);
        }),
      ),
      Effect.withSpan(label),
    ),
  );

  return () => {
    appRuntime.runFork(Fiber.interrupt(fiber));
  };
}
