import { type Duration, Effect, Schedule } from "effect";

import { PlatformError, platformError } from "$lib/effect/errors";

export interface AuthSessionFetchOptions {
  attemptTimeout?: Duration.Input;
  baseDelay?: Duration.Input;
  maxRetries?: number;
}

const defaultOptions = {
  attemptTimeout: "1 second",
  baseDelay: "50 millis",
  maxRetries: 2,
} as const satisfies Required<AuthSessionFetchOptions>;

/**
 * Fetches the idempotent better-auth session endpoint with a deadline on every
 * attempt. Only rejected requests, timeouts, and transient HTTP statuses retry.
 */
export function fetchAuthSessionResponse(
  fetchSession: (signal: AbortSignal) => Promise<Response>,
  options: AuthSessionFetchOptions = {},
) {
  const attemptTimeout = options.attemptTimeout ?? defaultOptions.attemptTimeout;
  const baseDelay = options.baseDelay ?? defaultOptions.baseDelay;
  const maxRetries = options.maxRetries ?? defaultOptions.maxRetries;

  const attempt = Effect.tryPromise({
    try: fetchSession,
    catch: (cause) => platformError("hooks.auth-session", cause),
  }).pipe(
    Effect.timeout(attemptTimeout),
    Effect.mapError((error) =>
      error instanceof PlatformError
        ? error
        : new PlatformError({
            operation: "hooks.auth-session-timeout",
            message: "Auth session lookup timed out.",
            cause: error,
          }),
    ),
    Effect.flatMap((response) =>
      isTransientHttpStatus(response.status)
        ? Effect.fail(
            platformError(
              "hooks.auth-session-status",
              new Error(`Auth session lookup returned ${response.status}.`),
            ),
          )
        : Effect.succeed(response),
    ),
  );

  const schedule = Schedule.exponential(baseDelay).pipe(
    Schedule.jittered,
    Schedule.upTo({ times: maxRetries }),
  );
  const observed = attempt.pipe(
    Effect.tapError((error) =>
      Effect.logWarning("AuthAgent session lookup attempt failed").pipe(
        Effect.annotateLogs({ operation: error.operation }),
      ),
    ),
  );

  return Effect.retry(observed, schedule);
}

function isTransientHttpStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}
