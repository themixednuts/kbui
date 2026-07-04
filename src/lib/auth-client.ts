import { createAuthClient, type BetterFetchResponse } from "better-auth/svelte";
import type { BetterAuthClientPlugin, ClientFetchOption } from "better-auth";

import type {
  MonkeytypeConnectInput,
  MonkeytypeConnectionStatus,
  MonkeytypeRefreshInput,
} from "$lib/monkeytype/types";

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

export const authClient = createAuthClient({
  plugins: [monkeytypeClient()],
});
