import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import {
  ReleaseFlagDisabled,
  ReleaseFlagEvaluationError,
  requireBooleanReleaseFlag,
} from "./release-flags";

describe("release flags", () => {
  it("requires an explicit enabled Flagship evaluation", async () => {
    const contexts: FlagshipEvaluationContext[] = [];
    const binding = {
      getBooleanDetails: async (
        flagKey: string,
        _defaultValue: boolean,
        context?: FlagshipEvaluationContext,
      ) => {
        contexts.push(context ?? {});
        return { flagKey, value: true, variant: "on" };
      },
    };

    await Effect.runPromise(
      requireBooleanReleaseFlag(binding, "github-firmware-builds", { userId: "user-1" }),
    );

    expect(contexts).toEqual([{ userId: "user-1" }]);
  });

  it("fails closed when the binding is absent", async () => {
    const error = await Effect.runPromise(
      Effect.flip(requireBooleanReleaseFlag(undefined, "github-firmware-builds")),
    );

    expect(error).toBeInstanceOf(ReleaseFlagEvaluationError);
    if (error._tag !== "ReleaseFlagEvaluationError") throw error;
    expect(error.retryable).toBe(false);
  });

  it("keeps an explicit off variation distinct from evaluation failure", async () => {
    const binding = {
      getBooleanDetails: async (flagKey: string) => ({
        flagKey,
        value: false,
        variant: "off",
      }),
    };
    const error = await Effect.runPromise(
      Effect.flip(requireBooleanReleaseFlag(binding, "github-firmware-builds")),
    );

    expect(error).toBeInstanceOf(ReleaseFlagDisabled);
  });
});
