import { describe, expect, it } from "vite-plus/test";
import { Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";

import { platformError } from "$lib/effect/errors";
import { GitHubRestApiError } from "$lib/server/github/client";
import {
  collectFirmwareMaintenanceResults,
  firmwareMaintenanceError,
  retryFirmwareMaintenance,
} from "./firmware-maintenance";

function runWithTestClock<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(effect);
      yield* TestClock.adjust("5 minutes");
      return yield* Fiber.join(fiber);
    }).pipe(Effect.provide(TestClock.layer())),
  );
}

function gitHubError(code: GitHubRestApiError["code"], status: number) {
  return new GitHubRestApiError({
    code,
    status,
    message: code,
    documentationUrl: null,
    requestId: null,
    retryAt: null,
    errors: null,
    body: null,
  });
}

describe("firmware maintenance retry policy", () => {
  it("retries transient idempotent GitHub work and then succeeds", async () => {
    let attempts = 0;
    const operation = Effect.suspend(() => {
      attempts += 1;
      return attempts < 3
        ? Effect.fail(
            firmwareMaintenanceError("test.reconcile", gitHubError("GITHUB_API_ERROR", 503)),
          )
        : Effect.succeed(undefined);
    });

    await runWithTestClock(retryFirmwareMaintenance(operation, { branchId: "branch-1" }));

    expect(attempts).toBe(3);
  });

  it("does not retry permanent GitHub or OAuth failures", async () => {
    let githubAttempts = 0;
    const githubFailure = Effect.suspend(() => {
      githubAttempts += 1;
      return Effect.fail(
        firmwareMaintenanceError("test.reconcile", gitHubError("GITHUB_UNAUTHORIZED", 401)),
      );
    });

    const githubErrorResult = await Effect.runPromise(
      Effect.flip(retryFirmwareMaintenance(githubFailure, { branchId: "branch-1" })),
    );
    const oauthError = firmwareMaintenanceError(
      "test.refresh-token",
      platformError("github-app.user-token-request", "bad refresh token"),
    );

    expect(githubAttempts).toBe(1);
    expect(githubErrorResult.retryable).toBe(false);
    expect(oauthError.retryable).toBe(false);
  });

  it("stops after three retries when a transient failure persists", async () => {
    let attempts = 0;
    const operation = Effect.suspend(() => {
      attempts += 1;
      return Effect.fail(
        firmwareMaintenanceError("test.reconcile", gitHubError("GITHUB_RATE_LIMITED", 429)),
      );
    });

    const error = await runWithTestClock(
      Effect.flip(retryFirmwareMaintenance(operation, { branchId: "branch-1" })),
    );

    expect(attempts).toBe(4);
    expect(error.retryable).toBe(true);
  });

  it("isolates row failures and reports truthful counts", async () => {
    const failedRows: number[] = [];
    const summary = await Effect.runPromise(
      collectFirmwareMaintenanceResults(
        [1, 2, 3],
        (row) =>
          row === 2
            ? Effect.fail(firmwareMaintenanceError("test.row", new Error("expired token")))
            : Effect.succeed(undefined),
        (row) =>
          Effect.sync(() => {
            failedRows.push(row);
          }),
      ),
    );

    expect(failedRows).toEqual([2]);
    expect(summary).toEqual({ checked: 3, failed: 1, repaired: 2 });
  });
});
