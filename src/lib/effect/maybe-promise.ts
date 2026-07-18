import { Effect } from "effect";

export type MaybePromise<A> = A | PromiseLike<A>;

function isPromiseLike<A>(value: MaybePromise<A>): value is PromiseLike<A> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof value.then === "function"
  );
}

/**
 * Lifts host APIs whose signatures permit either a value or a PromiseLike.
 * Synchronous throws and asynchronous failures share the same typed error path.
 */
export function tryMaybePromise<A, E>(
  evaluate: () => MaybePromise<A>,
  onError: (cause: unknown) => E,
): Effect.Effect<A, E> {
  return Effect.suspend(() =>
    Effect.try({
      try: evaluate,
      catch: onError,
    }).pipe(
      Effect.flatMap((value) =>
        isPromiseLike(value)
          ? Effect.tryPromise({
              try: () => value,
              catch: onError,
            })
          : Effect.succeed(value),
      ),
    ),
  );
}
