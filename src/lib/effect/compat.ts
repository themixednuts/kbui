import { Effect } from "effect";

const effectApis = Effect as Record<string, unknown>;

/**
 * Browser/Vite uses Effect v4; Wrangler rebundles the worker with `effect` →
 * effect-v3 (see `scripts/generate-wrangler-effect-aliases.mjs`). v4 renamed
 * `catchAll`/`catchAllCause` to `catch`/`catchCause` — call these helpers so
 * the same source works in both bundles.
 */
export const catchCauseCompat: typeof Effect.catchCause = (
  typeof Effect.catchCause === "function" ? Effect.catchCause : effectApis["catchAllCause"]
) as typeof Effect.catchCause;

export const catchCompat: typeof Effect.catch = (
  typeof Effect.catch === "function" ? Effect.catch : effectApis["catchAll"]
) as typeof Effect.catch;
