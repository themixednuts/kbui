import type { GitHubFirmwareBuildEvent, GitHubFirmwareRunArtifactDto } from "$lib/github-app/types";
import { GitHubRestClient, type GitHubWorkflowRunArtifact } from "$lib/server/github/client";
import {
  GitHubAppInstallationTokenClient,
  githubAppInstallationAuthConfigFromEnv,
  type GitHubAppInstallationAuthEnv,
} from "$lib/server/github-app/installation-token";

export interface GitHubWorkflowArtifactEnvironment extends GitHubAppInstallationAuthEnv {}

export function attachWorkflowArtifacts(
  event: GitHubFirmwareBuildEvent,
  installationId: string,
  repositoryId: string,
  env: GitHubWorkflowArtifactEnvironment,
): Promise<GitHubFirmwareBuildEvent> {
  return runWorkerEffect(
    "github.attach-workflow-artifacts",
    Effect.gen(function* () {
      if (!event.run.terminal || !event.run.successful) return event;

      const auth = githubAppInstallationAuthConfigFromEnv(env);
      if (!auth.configured) {
        return yield* Effect.fail(
          platformError("github.attach-workflow-artifacts", "GitHub App auth is not configured."),
        );
      }

      const repositoryNumericId = Number(repositoryId);
      const runNumericId = Number(event.run.runId);
      if (!Number.isSafeInteger(repositoryNumericId) || !Number.isSafeInteger(runNumericId)) {
        return yield* Effect.fail(
          platformError(
            "github.attach-workflow-artifacts",
            "GitHub repository and workflow run ids must be safe integers.",
          ),
        );
      }

      const installationToken = yield* Effect.tryPromise({
        try: () =>
          new GitHubAppInstallationTokenClient().createInstallationAccessToken(auth, {
            installationId,
            permissions: { actions: "read", metadata: "read" },
            repositoryIds: [repositoryNumericId],
          }),
        catch: (cause) => platformError("github.create-installation-token", cause),
      });
      const response = yield* Effect.tryPromise({
        try: () =>
          new GitHubRestClient({ token: installationToken.token }).listWorkflowRunArtifacts(
            event.repository.owner,
            event.repository.repo,
            runNumericId,
            { per_page: 25 },
          ),
        catch: (cause) => platformError("github.list-workflow-artifacts", cause),
      });
      const artifacts = response.artifacts.map(artifactToDto);
      const artifact = artifacts.find((candidate) => !candidate.expired);
      if (!artifact) {
        return yield* Effect.fail(
          platformError(
            "github.attach-workflow-artifacts",
            "Successful workflow did not expose a non-expired firmware artifact.",
          ),
        );
      }
      return {
        ...event,
        run: { ...event.run, artifact, artifacts },
      };
    }),
  );
}

function artifactToDto(artifact: GitHubWorkflowRunArtifact): GitHubFirmwareRunArtifactDto {
  return {
    createdAt: artifact.created_at,
    digest: artifact.digest ?? null,
    expired: artifact.expired,
    expiresAt: artifact.expires_at,
    id: String(artifact.id),
    name: artifact.name,
    sizeBytes: artifact.size_in_bytes,
    updatedAt: artifact.updated_at,
  };
}
import { Effect } from "effect";

import { platformError } from "$lib/effect/errors";
import { runWorkerEffect } from "$lib/effect/worker-runtime";
