import { Duration, Effect, Schedule } from "effect";

export interface RetryableError {
  readonly retryable: boolean;
}

/**
 * Keeps an infrastructure operation alive until it succeeds or its owning
 * Scope is interrupted. Only use this for dependencies where every failure is
 * transient (Agent RPC, Queue delivery, cache storage, and equivalent links).
 */
export function selfHeal<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  spacing: Duration.Input = "3 seconds",
) {
  return Effect.retry(effect, Schedule.jittered(Schedule.spaced(spacing)));
}

/**
 * Repeats transient work indefinitely with jitter. Permanent failures remain
 * failures; transient infrastructure failures keep healing until the owning
 * Scope is cancelled. There is deliberately no alternate/polling fallback.
 */
export function retryTransient<A, E extends RetryableError, R>(
  effect: Effect.Effect<A, E, R>,
  spacing: Duration.Input = "3 seconds",
) {
  return Effect.retry(effect, {
    schedule: Schedule.jittered(Schedule.spaced(spacing)),
    while: (error) => error.retryable,
  });
}
