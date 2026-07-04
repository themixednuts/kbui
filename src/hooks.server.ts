import { dev } from "$app/environment";
import type { Handle } from "@sveltejs/kit";

const authAgentName = "global-auth";

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.session = null;
  event.locals.user = null;

  let authSetCookie: string | null = null;

  if (!dev && !event.url.pathname.startsWith("/api/auth") && event.platform?.env.AuthAgent) {
    let sessionResult: Response | undefined;

    try {
      const id = event.platform?.env.AuthAgent.idFromName(authAgentName);
      const agent = id ? event.platform?.env.AuthAgent.get(id) : undefined;
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

      sessionResult = await agent?.fetch(sessionUrl.toString(), {
        headers: authHeaders,
        method: "GET",
      });
    } catch {
      sessionResult = undefined;
    }

    authSetCookie = sessionResult?.headers.get("set-cookie") ?? null;

    if (sessionResult?.ok) {
      const data = (await sessionResult.json()) as {
        session?: App.Locals["session"];
        user?: App.Locals["user"];
      } | null;
      event.locals.session = data?.session ?? null;
      event.locals.user = data?.user ?? null;
    }
  }

  const response = await resolve(event);

  // Pass through unchanged on the hot path. The hook used to rebuild the
  // response to add COOP/COEP headers, but that path collapsed multi-
  // value Set-Cookie entries (Headers iteration merges them into one
  // comma-joined value) and ate better-auth's CSRF state cookie. COOP /
  // COEP now live in `vite.config.ts` (`server.headers` / `preview.
  // headers`) and the `_headers` file at the repo root — declarative,
  // no manual mutation, no risk of breaking Set-Cookie.
  if (!authSetCookie) return response;

  // Refresh path: the worker-side session fetch returned an updated
  // session cookie that needs to ride along with this response. Workers
  // gives us immutable headers on responses bubbled up from a DO fetch,
  // so we copy via `getSetCookie()` (which preserves each entry as a
  // distinct value instead of merging) and rebuild a mutable Headers.
  const headers = new Headers(response.headers);
  // Re-add each Set-Cookie individually if the original response had any
  // (the `new Headers(...)` copy above may have merged them).
  const existingSetCookies = response.headers.getSetCookie?.() ?? [];
  if (existingSetCookies.length > 0) {
    headers.delete("set-cookie");
    for (const cookie of existingSetCookies) headers.append("set-cookie", cookie);
  }
  headers.append("set-cookie", authSetCookie);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};
