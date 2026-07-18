import { Effect, Result, Schedule, Schema } from "effect";

import { PlatformError } from "$lib/effect/errors";
import { GitHubRestApiError } from "$lib/server/github/client";

export interface FirmwareMaintenanceSummary {
  checked: number;
  failed: number;
  repaired: number;
}

export class FirmwareMaintenanceError extends Schema.TaggedErrorClass<FirmwareMaintenanceError>()(
  "FirmwareMaintenanceError",
  {
    operation: Schema.String,
    message: Schema.String,
    retryable: Schema.Boolean,
    cause: Schema.Defect(),
  },
) {}

export function firmwareMaintenanceError(
  operation: string,
  cause: unknown,
  retryable = isTransientFirmwareMaintenanceFailure(cause),
) {
  return new FirmwareMaintenanceError({
    operation,
    message: cause instanceof Error ? cause.message : String(cause),
    retryable,
    cause,
  });
}

export function retryFirmwareMaintenance<A, R>(
  effect: Effect.Effect<A, FirmwareMaintenanceError, R>,
  annotations: Record<string, unknown>,
) {
  const schedule = Schedule.exponential("250 millis").pipe(
    Schedule.jittered,
    Schedule.upTo({ times: 3 }),
  );
  const observed = effect.pipe(
    Effect.tapError((error) =>
      Effect.logWarning("GitHub firmware maintenance attempt failed").pipe(
        Effect.annotateLogs({
          ...annotations,
          operation: error.operation,
          retryable: error.retryable,
        }),
      ),
    ),
  );

  return Effect.retry(observed, {
    schedule,
    while: (error) => error.retryable,
  });
}

export function collectFirmwareMaintenanceResults<Row, E, R>(
  rows: readonly Row[],
  reconcile: (row: Row) => Effect.Effect<void, E, R>,
  onFailure: (row: Row, error: E) => Effect.Effect<void>,
) {
  return Effect.map(
    Effect.forEach(
      rows,
      (row) =>
        reconcile(row).pipe(
          Effect.tapError((error) => onFailure(row, error)),
          Effect.result,
        ),
      { concurrency: 2 },
    ),
    (results): FirmwareMaintenanceSummary => {
      const failed = results.filter(Result.isFailure).length;
      return {
        checked: rows.length,
        failed,
        repaired: rows.length - failed,
      };
    },
  );
}

function isTransientFirmwareMaintenanceFailure(cause: unknown) {
  if (cause instanceof GitHubRestApiError) {
    return (
      cause.code === "GITHUB_RATE_LIMITED" ||
      (cause.code === "GITHUB_API_ERROR" &&
        (cause.status === 0 ||
          cause.status === 408 ||
          cause.status === 425 ||
          cause.status === 429 ||
          cause.status >= 500))
    );
  }

  // The current OAuth adapter uses PlatformError for both transport failures
  // and rejected refresh tokens. Its transport branch preserves the thrown
  // Error as cause; an HTTP OAuth rejection stores the provider message string.
  return (
    cause instanceof PlatformError &&
    cause.operation === "github-app.user-token-request" &&
    cause.cause instanceof Error
  );
}
