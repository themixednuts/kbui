import { dev } from "$app/environment";
import type { Handle } from "@sveltejs/kit";
import { Effect, Schema } from "effect";

import { platformError } from "$lib/effect/errors";
import { tryMaybePromise } from "$lib/effect/maybe-promise";
import { selfHeal } from "$lib/effect/self-healing";
import { runWorkerEffect } from "$lib/effect/worker-runtime";
import { canonicalLoopbackUrl } from "$lib/server/canonical-origin";

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
      const canonicalUrl = canonicalLoopbackUrl(event.url, event.platform?.env.BETTER_AUTH_URL);
      if (canonicalUrl) return Response.redirect(canonicalUrl, 307);

      event.locals.session = null;
      event.locals.user = null;

      let authSetCookie: string | null = null;

      if (!dev && !event.url.pathname.startsWith("/api/auth") && event.platform?.env.AuthAgent) {
        const id = event.platform.env.AuthAgent.idFromName(authAgentName);
        const agent = event.platform.env.AuthAgent.get(id);
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

      const response = yield* tryMaybePromise(
        () => resolve(event),
        (cause) => platformError("hooks.resolve", cause),
      );
      // Cloudflare's WebSocket upgrade response cannot be reconstructed with
      // the standard Response constructor used by the normal header wrapper.
      if (response.status === 101) return response;
      return withAppHeaders(response, authSetCookie);
    }),
  );

function withAppHeaders(response: Response, authSetCookie: string | null) {
  const headers = new Headers(response.headers);
  headers.set(
    "Cross-Origin-Opener-Policy",
    crossOriginIsolationHeaders["Cross-Origin-Opener-Policy"],
  );
  headers.set(
    "Cross-Origin-Embedder-Policy",
    crossOriginIsolationHeaders["Cross-Origin-Embedder-Policy"],
  );

  if (headers.get("content-type")?.toLowerCase().startsWith("text/html")) {
    headers.set("Cache-Control", "no-store");
  }

  // Workers gives us immutable headers on responses bubbled up from a DO
  // fetch, so copy via `getSetCookie()` where available. This preserves
  // each cookie instead of merging them into a comma-joined value.
  const existingSetCookies = response.headers.getSetCookie?.() ?? [];
  if (existingSetCookies.length > 0 || authSetCookie) {
    headers.delete("set-cookie");
    for (const cookie of existingSetCookies) headers.append("set-cookie", cookie);
    if (existingSetCookies.length === 0) {
      const fallbackCookie = response.headers.get("set-cookie");
      if (fallbackCookie) headers.append("set-cookie", fallbackCookie);
    }
    if (authSetCookie) headers.append("set-cookie", authSetCookie);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
