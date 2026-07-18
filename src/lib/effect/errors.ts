import { Schema } from "effect";

/**
 * Failures produced while adapting a browser, Worker, or third-party API to
 * Effect. Domain modules should translate this error into a narrower error
 * when they can add a truthful recovery policy.
 */
export class PlatformError extends Schema.TaggedErrorClass<PlatformError>()("PlatformError", {
  operation: Schema.String,
  message: Schema.String,
  cause: Schema.Defect(),
}) {}

/** A persisted or wire value did not satisfy its declared contract. */
export class BoundaryDecodeError extends Schema.TaggedErrorClass<BoundaryDecodeError>()(
  "BoundaryDecodeError",
  {
    operation: Schema.String,
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export function platformError(operation: string, cause: unknown): PlatformError {
  return new PlatformError({
    operation,
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}
