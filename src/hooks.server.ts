import { dev } from "$app/environment";
import type { Handle } from "@sveltejs/kit";
import { Effect, Schema } from "effect";

import { platformError } from "$lib/effect/errors";
import { tryMaybePromise } from "$lib/effect/maybe-promise";
import { selfHeal } from "$lib/effect/self-healing";
import { runWorkerEffect } from "$lib/effect/worker-runtime";
import { canonicalLoopbackUrl } from "$lib/server/canonical-origin";
import { cacheControlFor } from "$lib/server/http-cache";
import { readSessionFromCookieCache } from "$lib/server/session-cookie";

const authAgentName = "global-auth";
const crossOriginIsolationHeaders = {
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Opener-Policy": "same-origin",
} as const;

const sessionPayloadSchema = Schema.NullOr(
  Schema.Struct({
    session: Schema.optionalKey(Schema.Unknown),
    user: Schema.optionalKey(Schema.Unknown),
  }),
);

export const handle: Handle = ({ event, resolve }) =>
  runWorkerEffect(
    "hooks.handle",
    Effect.gen(function* () {
      const pathname = event.url.pathname;

      const canonicalUrl = canonicalLoopbackUrl(event.url, event.platform?.env.BETTER_AUTH_URL);
      if (canonicalUrl) {
        // Response.redirect() returns immutable headers; rebuild it so we can
        // stamp no-store. A 307 isn't heuristically cacheable per the Workers
        // Cache list, but be explicit rather than rely on that.
        const redirect = Response.redirect(canonicalUrl, 307);
        const headers = new Headers(redirect.headers);
        headers.set("Cache-Control", "no-store");
        return new Response(null, {
          status: redirect.status,
          statusText: redirect.statusText,
          headers,
        });
      }

      event.locals.session = null;
      event.locals.user = null;

      let authSetCookie: string | null = null;

      if (!dev && !pathname.startsWith("/api/auth") && event.platform?.env.AuthAgent) {
        const env = event.platform.env;

        // Fast path: verify better-auth's signed session_data cookie in-Worker.
        // A hit populates locals and skips the AuthAgent Durable Object round
        // trip entirely (authSetCookie stays null). Any failure is a cache miss.
        const cached = yield* readSessionFromCookieCache(event.request, env);

        if (cached) {
          event.locals.session = cached.session ?? null;
          event.locals.user = cached.user ?? null;
        } else {
          const id = env.AuthAgent.idFromName(authAgentName);
          const agent = env.AuthAgent.get(id);
          const sessionUrl = new URL("/api/auth/get-session", event.url);

          // Only forward headers that auth actually needs (cookies + a few
          // identifying ones). Carrying the original request's
          // content-type / content-length over to this synthetic GET makes
          // better-auth's body parser try to read a body that isn't there
          // -> 500 -> null user -> bogus 401s on legitimately-signed-in
          // requests. The repro: any POST to /api/agent/* would mis-401.
          const authHeaders = new Headers();
          const passthrough = [
            "cookie",
            "authorization",
            "user-agent",
            "accept-language",
            "x-forwarded-for",
            "x-real-ip",
          ];
          for (const name of passthrough) {
            const value = event.request.headers.get(name);
            if (value) authHeaders.set(name, value);
          }

          const sessionResult = yield* selfHeal(
            Effect.tryPromise({
              try: () =>
                agent.fetch(sessionUrl.toString(), {
                  headers: authHeaders,
                  method: "GET",
                }),
              catch: (cause) => platformError("hooks.auth-session", cause),
            }),
            "500 millis",
          );

          authSetCookie = sessionResult.headers.get("set-cookie") ?? null;

          if (sessionResult.ok) {
            const rawData = yield* Effect.tryPromise({
              try: () => sessionResult.json(),
              catch: (cause) => platformError("hooks.decode-auth-session-json", cause),
            });
            const data = yield* Schema.decodeUnknownEffect(sessionPayloadSchema)(rawData);
            event.locals.session = (data?.session as App.Locals["session"] | undefined) ?? null;
            event.locals.user = (data?.user as App.Locals["user"] | undefined) ?? null;
          }
        }
      }

      const response = yield* tryMaybePromise(
        () => resolve(event),
        (cause) => platformError("hooks.resolve", cause),
      );
      // Cloudflare's WebSocket upgrade response cannot be reconstructed with
      // the standard Response constructor used by the normal header wrapper.
      if (response.status === 101) return response;
      return withAppHeaders(response, authSetCookie, pathname);
    }),
  );

function withAppHeaders(response: Response, authSetCookie: string | null, pathname: string) {
  const headers = new Headers(response.headers);
  headers.set(
    "Cross-Origin-Opener-Policy",
    crossOriginIsolationHeaders["Cross-Origin-Opener-Policy"],
  );
  headers.set(
    "Cross-Origin-Embedder-Policy",
    crossOriginIsolationHeaders["Cross-Origin-Embedder-Policy"],
  );

  // Default-deny cache policy: promote the anonymous catalog queries to a public
  // edge cache, leave any explicit Cache-Control alone, and stamp
  // "private, no-store" on everything else so Workers Cache heuristic freshness
  // can never cache a personalized response (the Cookie header isn't in the key).
  const cacheControl = cacheControlFor(pathname, response);
  if (cacheControl) headers.set("Cache-Control", cacheControl);

  // A publicly cacheable response must not carry the auth-refresh Set-Cookie: a
  // Set-Cookie forces an edge-cache bypass, and refreshing the session belongs
  // on non-cacheable responses anyway. Response-originated Set-Cookies are still
  // preserved (they bypass the cache, which is the safe direction).
  const finalCacheControl = cacheControl ?? headers.get("Cache-Control");
  const isPubliclyCacheable = finalCacheControl?.includes("public") ?? false;
  const authCookieToAppend = isPubliclyCacheable ? null : authSetCookie;

  // Workers gives us immutable headers on responses bubbled up from a DO
  // fetch, so copy via `getSetCookie()` where available. This preserves
  // each cookie instead of merging them into a comma-joined value.
  const existingSetCookies = response.headers.getSetCookie?.() ?? [];
  if (existingSetCookies.length > 0 || authCookieToAppend) {
    headers.delete("set-cookie");
    for (const cookie of existingSetCookies) headers.append("set-cookie", cookie);
    if (existingSetCookies.length === 0) {
      const fallbackCookie = response.headers.get("set-cookie");
      if (fallbackCookie) headers.append("set-cookie", fallbackCookie);
    }
    if (authCookieToAppend) headers.append("set-cookie", authCookieToAppend);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
