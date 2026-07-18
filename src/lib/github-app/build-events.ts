import type {
  GitHubFirmwareBuildEvent,
  GitHubFirmwareBuildResponse,
  GitHubFirmwareSyncResponse,
} from "$lib/github-app/types";

export function firmwareBuildEventFromSync(
  response: GitHubFirmwareSyncResponse,
  receivedAt = new Date().toISOString(),
): GitHubFirmwareBuildEvent {
  const requestId = `sync:${response.branch.variantId}:${response.sourceHash}`;
  return {
    branch: response.branch,
    deliveryId: requestId,
    receivedAt,
    repository: response.repository,
    run: {
      artifact: null,
      artifacts: [],
      conclusion: "success",
      headBranch: response.branch.branchName,
      headSha: response.commit?.sha ?? null,
      htmlUrl: response.commit?.htmlUrl ?? response.repository.htmlUrl,
      label: "Source synchronized",
      requestId,
      runId: null,
      runNumber: null,
      sourceHash: response.sourceHash,
      state: "synced",
      status: "synced",
      successful: true,
      terminal: true,
      updatedAt: receivedAt,
    },
  };
}

export function firmwareBuildEventFromDispatch(
  response: GitHubFirmwareBuildResponse,
  receivedAt = new Date().toISOString(),
): GitHubFirmwareBuildEvent {
  return {
    branch: {
      ...response.branch,
      lastRunId: response.build.requestId,
      lastStatus: response.build.status,
      updatedAt: receivedAt,
    },
    deliveryId: `dispatch:${response.build.requestId}`,
    receivedAt,
    repository: response.repository,
    run: {
      artifact: null,
      artifacts: [],
      conclusion: null,
      headBranch: response.branch.branchName,
      headSha: response.commit?.sha ?? null,
      htmlUrl: response.build.htmlUrl,
      label: "Queued",
      requestId: response.build.requestId,
      runId: response.build.runId,
      runNumber: null,
      sourceHash: response.sourceHash,
      state: "queued",
      status: response.build.status,
      successful: false,
      terminal: false,
      updatedAt: receivedAt,
    },
  };
}
