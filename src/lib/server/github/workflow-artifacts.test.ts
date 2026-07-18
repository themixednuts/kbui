import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import type { GitHubFirmwareBuildEvent } from "$lib/github-app/types";

import { attachWorkflowArtifactsEffect } from "./workflow-artifacts";

function buildEvent(run: Partial<GitHubFirmwareBuildEvent["run"]> = {}): GitHubFirmwareBuildEvent {
  return {
    branch: {
      branchName: "kbui/test",
      lastCommitSha: null,
      lastRunId: null,
      lastSourceHash: null,
      lastStatus: null,
      sourceSavePointId: null,
      updatedAt: null,
      variantId: "test",
      variantName: "Test",
    },
    deliveryId: "delivery-1",
    receivedAt: "2026-07-18T12:00:00.000Z",
    repository: {
      defaultBranch: "main",
      firmwareFamily: "qmk",
      fullName: "kbui/firmware",
      htmlUrl: null,
      owner: "kbui",
      private: true,
      repo: "firmware",
      repositoryKind: "qmk-userspace",
      workflowPath: ".github/workflows/build.yml",
    },
    run: {
      artifact: null,
      artifacts: [],
      conclusion: null,
      headBranch: null,
      headSha: null,
      htmlUrl: null,
      label: "Waiting",
      requestId: "request-1",
      runId: "123",
      runNumber: 1,
      sourceHash: null,
      state: "waiting",
      status: "queued",
      successful: false,
      terminal: false,
      updatedAt: null,
      ...run,
    },
  };
}

describe("GitHub workflow artifact Effects", () => {
  it("composes without entering a Worker runtime for non-terminal events", async () => {
    const event = buildEvent();

    const result = await Effect.runPromise(
      attachWorkflowArtifactsEffect(event, "installation-1", "repository-1", {}),
    );

    expect(result).toBe(event);
  });

  it("keeps configuration failures in the typed error channel", async () => {
    const event = buildEvent({ successful: true, terminal: true });

    const result = await Effect.runPromise(
      attachWorkflowArtifactsEffect(event, "installation-1", "repository-1", {}).pipe(
        Effect.match({
          onFailure: (error) => ({ error }),
          onSuccess: (value) => ({ value }),
        }),
      ),
    );

    expect(result).toMatchObject({
      error: {
        _tag: "PlatformError",
        operation: "github.attach-workflow-artifacts",
      },
    });
  });
});
