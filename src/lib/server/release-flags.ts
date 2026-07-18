import { Effect, Schema } from "effect";

import { retryTransient } from "$lib/effect/self-healing";

export const releaseFlagKeys = {
  githubFirmwareBuilds: "github-firmware-builds",
} as const;

export type BooleanReleaseFlagBinding = Pick<Flagship, "getBooleanDetails">;

export class ReleaseFlagEvaluationError extends Schema.TaggedErrorClass<ReleaseFlagEvaluationError>()(
  "ReleaseFlagEvaluationError",
  {
    key: Schema.String,
    message: Schema.String,
    retryable: Schema.Boolean,
    cause: Schema.Defect(),
  },
) {}

export class ReleaseFlagDisabled extends Schema.TaggedErrorClass<ReleaseFlagDisabled>()(
  "ReleaseFlagDisabled",
  {
    key: Schema.String,
  },
) {}

const evaluateBooleanReleaseFlag = Effect.fn("ReleaseFlags.evaluateBoolean")(function* (
  binding: BooleanReleaseFlagBinding,
  key: string,
  context: FlagshipEvaluationContext,
) {
  const details = yield* Effect.tryPromise({
    try: () => binding.getBooleanDetails(key, false, context),
    catch: (cause) =>
      new ReleaseFlagEvaluationError({
        key,
        message: cause instanceof Error ? cause.message : String(cause),
        retryable: true,
        cause,
      }),
  });

  if (details.errorCode) {
    const retryable = /INTERNAL|TIMEOUT|UNAVAILABLE|RATE_LIMIT/i.test(details.errorCode);
    return yield* Effect.fail(
      new ReleaseFlagEvaluationError({
        key,
        message: details.errorMessage ?? `Flagship evaluation failed with ${details.errorCode}.`,
        retryable,
        cause: new Error(details.errorCode),
      }),
    );
  }

  return details.value;
});

/**
 * Enforces a release control without treating Flagship's default value as an
 * operational fallback. Transport failures self-heal; invalid or missing
 * flags fail visibly, and an explicit off variation remains a domain result.
 */
export const requireBooleanReleaseFlag = Effect.fn("ReleaseFlags.requireBoolean")(function* (
  binding: BooleanReleaseFlagBinding | undefined,
  key: string,
  context: FlagshipEvaluationContext = {},
) {
  if (!binding) {
    return yield* Effect.fail(
      new ReleaseFlagEvaluationError({
        key,
        message: "The Flagship binding is not configured.",
        retryable: false,
        cause: new Error("Flagship binding missing"),
      }),
    );
  }

  const enabled = yield* retryTransient(
    evaluateBooleanReleaseFlag(binding, key, context),
    "250 millis",
  );
  if (!enabled) return yield* Effect.fail(new ReleaseFlagDisabled({ key }));
});
