// Cache-policy helpers for the Workers Cache edge (enabled in wrangler.jsonc).
//
// Workers Cache gives any response WITHOUT an explicit Cache-Control RFC 9111
// "heuristic freshness": an unheadered 200 is cached for 2h. The edge cache key
// does NOT include the Cookie header — only Authorization auto-bypasses — so a
// personalized-but-unheadered response would be cached and replayed to OTHER
// users. The defense is default-deny: hooks.server.ts stamps "private, no-store"
// on everything that doesn't opt in, and only the four anonymous, deterministic
// catalog queries below are promoted to a public policy.

/**
 * The anonymous, deterministic catalog queries in
 * src/routes/keyboards.remote.ts. Each is a pure function of its input (or of
 * user-invariant platform bindings) and never reads event.locals or cookies,
 * so its 200 response is identical for every visitor and safe to cache at the
 * edge. Verified locals/cookie-free: getViaKeyboardIndex, getViaKeyboardDetail,
 * resolveZmkTarget, and resolveKeyboardIdentity (the last reads only
 * platform.env for a Durable Object binding, which is the same for all users).
 */
export const publicCatalogRemoteQueries = new Set([
  "getViaKeyboardIndex",
  "getViaKeyboardDetail",
  "resolveZmkTarget",
  "resolveKeyboardIdentity",
]);

const remoteMarker = "/_app/remote/";

/**
 * True when `pathname` targets one of the allowlisted catalog remote queries.
 *
 * SvelteKit serves remote functions from `/_app/remote/<hash>/<name>` where the
 * `<hash>` segment is build-specific (do not hardcode it) and `<name>` is the
 * final segment. A base path may prefix the whole thing, so we anchor on the
 * `/_app/remote/` marker wherever it appears rather than at the string start.
 */
export function isPublicCatalogRequest(pathname: string): boolean {
  const markerIndex = pathname.indexOf(remoteMarker);
  if (markerIndex === -1) return false;

  const rest = pathname.slice(markerIndex + remoteMarker.length);
  const segments = rest.split("/").filter(Boolean);
  // Require at least a <hash>/<name> shape so a bare `/_app/remote/<name>`
  // (no build hash) can never be mistaken for a catalog query.
  if (segments.length < 2) return false;

  const name = segments[segments.length - 1];
  return publicCatalogRemoteQueries.has(name);
}

/**
 * The Cache-Control value hooks.server.ts should SET on `response`, or
 * `undefined` to leave the response's existing header untouched.
 *
 * - Allowlisted catalog query + 200 -> public policy. s-maxage=900 aligns with
 *   the 15-min server-side catalog TTL in via-source.ts.
 * - Response already carries a Cache-Control -> undefined (respect it).
 * - Otherwise -> "private, no-store" (default-deny; kills heuristic freshness).
 */
export function cacheControlFor(pathname: string, response: Response): string | undefined {
  if (isPublicCatalogRequest(pathname) && response.status === 200) {
    return "public, max-age=60, s-maxage=900, stale-while-revalidate=3600";
  }

  if (response.headers.has("Cache-Control")) return undefined;

  return "private, no-store";
}
