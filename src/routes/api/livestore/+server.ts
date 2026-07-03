import { Effect } from "effect";
import { jwtVerify, createRemoteJWKSet } from "jose";

import type { RequestHandler } from "./$types";

/**
 * LiveStore sync entrypoint.
 *
 * Clients connect here via WebSocket; the request is forwarded to the
 * `LiveStoreSyncDO` Durable Object. The DO module imports
 * `cloudflare:workers` (and friends) which Workerd resolves at runtime
 * but the Vite SSR-build step cannot — so we dynamic-import
 * `@livestore/sync-cf/cf-worker` lazily, with `@vite-ignore`, so Vite
 * leaves the spec alone and Workerd handles it.
 *
 * Auth: client sends `{ authToken: <jwt> }` in `syncPayload`. We verify
 * the JWT against AuthAgent's JWKS, plus check the `sub` claim matches
 * the storeId's user namespace. JWKS is cached lazily inside `jose`.
 */

const STORE_ID_PREFIX = "user:";

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwksFor(origin: string) {
  let cached = jwksCache.get(origin);
  if (!cached) {
    cached = createRemoteJWKSet(new URL(`${origin}/api/auth/jwks`));
    jwksCache.set(origin, cached);
  }
  return cached;
}

const cfWorkerModuleName = "@livestore/sync-cf/cf-worker";

const handle: RequestHandler = async ({ request, platform, url }) => {
  if (!platform?.env.LiveStoreSyncDO) {
    return new Response("LiveStore sync binding unavailable", { status: 503 });
  }

  const searchParams = {
    storeId: url.searchParams.get("storeId") ?? "",
    payload: url.searchParams.get("payload") ?? undefined,
    transport: (url.searchParams.get("transport") ?? "ws") as "ws" | "http",
  };

  if (!searchParams.storeId.startsWith(STORE_ID_PREFIX)) {
    return new Response("storeId must be namespaced under user:", { status: 400 });
  }
  const requestedUserId = searchParams.storeId.slice(STORE_ID_PREFIX.length);

  const validatePayload = async (payload: unknown): Promise<void> => {
    await Effect.runPromise(
      Effect.tryPromise({
        try: async () => {
          const token =
            payload && typeof payload === "object" && "authToken" in payload
              ? (payload as { authToken?: unknown }).authToken
              : undefined;
          if (typeof token !== "string" || token.length === 0) {
            throw new Error("Missing authToken in syncPayload");
          }
          const jwks = jwksFor(url.origin);
          const { payload: claims } = await jwtVerify(token, jwks, {
            issuer: url.origin,
          });
          const subject = typeof claims.sub === "string" ? claims.sub : undefined;
          if (!subject) {
            throw new Error("JWT missing sub claim");
          }
          if (subject !== requestedUserId) {
            throw new Error(
              `Auth subject (${subject}) does not own store ${requestedUserId}`,
            );
          }
        },
        catch: (error) => (error instanceof Error ? error : new Error(String(error))),
      }),
    );
  };

  // Dynamic import + @vite-ignore so the SSR bundler doesn't try to
  // statically resolve `cloudflare:*` URLs that live inside this module.
  // Workerd resolves them at runtime in the deployed worker.
  const { handleSyncRequest } = (await import(
    /* @vite-ignore */ cfWorkerModuleName
  )) as typeof import("@livestore/sync-cf/cf-worker");

  return handleSyncRequest({
    request: request as unknown as Parameters<typeof handleSyncRequest>[0]["request"],
    searchParams: searchParams as unknown as Parameters<
      typeof handleSyncRequest
    >[0]["searchParams"],
    syncBackendBinding: "LiveStoreSyncDO",
    ctx: platform.context as unknown as Parameters<typeof handleSyncRequest>[0]["ctx"],
    env: platform.env as unknown as Parameters<typeof handleSyncRequest>[0]["env"],
    validatePayload,
  }) as unknown as Response;
};

export const GET = handle;
export const POST = handle;
