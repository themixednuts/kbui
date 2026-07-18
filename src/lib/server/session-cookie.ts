import { getCookieCache } from "better-auth/cookies";
import { Effect } from "effect";

import { platformError } from "$lib/effect/errors";

type SessionCookieEnv = {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL?: string | undefined;
};

export type CookieCachedSession = {
  session: App.Locals["session"];
  user: App.Locals["user"];
};

/**
 * Verifies better-auth's `better-auth.session_data` cookie cache in-Worker so a
 * signed-in request can populate `event.locals` WITHOUT the round-trip to the
 * AuthAgent Durable Object.
 *
 * The cookie is HMAC-SHA256-signed with BETTER_AUTH_SECRET and carries an
 * embedded expiry; `getCookieCache` rejects a forged signature or an expired
 * snapshot by returning null. We ALWAYS pass `isSecure` explicitly — otherwise
 * getCookieCache guesses the `__Secure-` prefix from NODE_ENV, which is
 * unreliable in Workers — deriving it from whether the auth base URL is https.
 *
 * Any thrown error (missing secret, malformed cookie) is treated as a cache
 * miss: this never fails the request, it just falls through to the AuthAgent.
 */
export function readSessionFromCookieCache(
  request: Request,
  env: SessionCookieEnv,
): Effect.Effect<CookieCachedSession | null> {
  const isSecure = env.BETTER_AUTH_URL?.startsWith("https") ?? true;

  return Effect.tryPromise({
    try: () =>
      getCookieCache(request, {
        secret: env.BETTER_AUTH_SECRET,
        isSecure,
      }) as Promise<CookieCachedSession | null>,
    catch: (cause) => platformError("hooks.cookie-cache", cause),
  }).pipe(Effect.catch(() => Effect.succeed(null)));
}
