import { createAuthClient, type BetterFetchResponse } from "better-auth/svelte";
import type { BetterAuthClientPlugin, ClientFetchOption } from "better-auth";

import type {
  MonkeytypeConnectInput,
  MonkeytypeConnectionStatus,
  MonkeytypeRefreshInput,
} from "$lib/monkeytype/types";
import type {
  GitHubFirmwareAppConnectResponse,
  GitHubFirmwareArtifactDownloadInput,
  GitHubFirmwareArtifactDownloadResponse,
  GitHubFirmwareBuildResponse,
  GitHubFirmwareCleanupInput,
  GitHubFirmwareCleanupResponse,
  GitHubFirmwareAppStatus,
  GitHubFirmwareSyncInput,
  GitHubFirmwareSyncResponse,
} from "$lib/github-app/types";

type AuthFetch = Parameters<NonNullable<BetterAuthClientPlugin["getActions"]>>[0];
type AuthFetchResult<T> = Promise<BetterFetchResponse<T>>;

function monkeytypeClient() {
  return {
    id: "monkeytype-client",
    $InferServerPlugin: {},
    pathMethods: {
      "/monkeytype/status": "GET",
      "/monkeytype/connect": "POST",
      "/monkeytype/disconnect": "POST",
      "/monkeytype/refresh": "POST",
    },
    getActions: ($fetch: AuthFetch) => ({
      monkeytype: {
        status(fetchOptions?: ClientFetchOption): AuthFetchResult<MonkeytypeConnectionStatus> {
          return $fetch<MonkeytypeConnectionStatus>("/monkeytype/status", {
            method: "GET",
            ...fetchOptions,
          });
        },
        connect(
          input: MonkeytypeConnectInput,
          fetchOptions?: ClientFetchOption,
        ): AuthFetchResult<MonkeytypeConnectionStatus> {
          return $fetch<MonkeytypeConnectionStatus>("/monkeytype/connect", {
            method: "POST",
            body: input,
            ...fetchOptions,
          });
        },
        disconnect(fetchOptions?: ClientFetchOption): AuthFetchResult<MonkeytypeConnectionStatus> {
          return $fetch<MonkeytypeConnectionStatus>("/monkeytype/disconnect", {
            method: "POST",
            body: {},
            ...fetchOptions,
          });
        },
        refresh(
          input: MonkeytypeRefreshInput = {},
          fetchOptions?: ClientFetchOption,
        ): AuthFetchResult<MonkeytypeConnectionStatus> {
          return $fetch<MonkeytypeConnectionStatus>("/monkeytype/refresh", {
            method: "POST",
            body: input,
            ...fetchOptions,
          });
        },
      },
    }),
  } satisfies BetterAuthClientPlugin;
}

function githubFirmwareAppClient() {
  return {
    id: "github-firmware-app-client",
    $InferServerPlugin: {},
    pathMethods: {
      "/firmware/github/status": "GET",
      "/firmware/github/connect": "POST",
      "/firmware/github/disconnect": "POST",
      "/firmware/github/sync": "POST",
      "/firmware/github/build": "POST",
      "/firmware/github/cleanup": "POST",
      "/firmware/github/artifact/download": "POST",
    },
    getActions: ($fetch: AuthFetch) => ({
      firmwareGithub: {
        status(fetchOptions?: ClientFetchOption): AuthFetchResult<GitHubFirmwareAppStatus> {
          return $fetch<GitHubFirmwareAppStatus>("/firmware/github/status", {
            method: "GET",
            ...fetchOptions,
          });
        },
        connect(
          fetchOptions?: ClientFetchOption,
        ): AuthFetchResult<GitHubFirmwareAppConnectResponse> {
          return $fetch<GitHubFirmwareAppConnectResponse>("/firmware/github/connect", {
            method: "POST",
            body: {},
            ...fetchOptions,
          });
        },
        disconnect(fetchOptions?: ClientFetchOption): AuthFetchResult<GitHubFirmwareAppStatus> {
          return $fetch<GitHubFirmwareAppStatus>("/firmware/github/disconnect", {
            method: "POST",
            body: {},
            ...fetchOptions,
          });
        },
        sync(
          input: GitHubFirmwareSyncInput,
          fetchOptions?: ClientFetchOption,
        ): AuthFetchResult<GitHubFirmwareSyncResponse> {
          return $fetch<GitHubFirmwareSyncResponse>("/firmware/github/sync", {
            method: "POST",
            body: input,
            ...fetchOptions,
          });
        },
        build(
          input: GitHubFirmwareSyncInput,
          fetchOptions?: ClientFetchOption,
        ): AuthFetchResult<GitHubFirmwareBuildResponse> {
          return $fetch<GitHubFirmwareBuildResponse>("/firmware/github/build", {
            method: "POST",
            body: input,
            ...fetchOptions,
          });
        },
        cleanup(
          input: GitHubFirmwareCleanupInput,
          fetchOptions?: ClientFetchOption,
        ): AuthFetchResult<GitHubFirmwareCleanupResponse> {
          return $fetch<GitHubFirmwareCleanupResponse>("/firmware/github/cleanup", {
            method: "POST",
            body: input,
            ...fetchOptions,
          });
        },
        downloadArtifact(
          input: GitHubFirmwareArtifactDownloadInput,
          fetchOptions?: ClientFetchOption,
        ): AuthFetchResult<GitHubFirmwareArtifactDownloadResponse> {
          return $fetch<GitHubFirmwareArtifactDownloadResponse>(
            "/firmware/github/artifact/download",
            {
              method: "POST",
              body: input,
              ...fetchOptions,
            },
          );
        },
      },
    }),
  } satisfies BetterAuthClientPlugin;
}

export const authClient = createAuthClient({
  plugins: [githubFirmwareAppClient(), monkeytypeClient()],
});
