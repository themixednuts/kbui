/**
 * Shim for `effect/RuntimeFlags` (v3-only path that LiveStore depends on).
 *
 * Effect v4 collapsed RuntimeFlags into the broader runtime config.
 * LiveStore's `@livestore/utils/dist/effect/Debug.js` uses one specific
 * helper:
 *
 *     RuntimeFlags.interruptible(fiber.currentRuntimeFlags)
 *
 * Returns whether the fiber is currently interruptible. In v3 this is
 * a bit-flag check on a packed integer. For our purposes (LiveStore's
 * debug path, never hit in production user flows) returning `true` is
 * a safe approximation — assumes the fiber IS interruptible, which is
 * the common case. If we ever debug a stuck fiber we'll have to revisit.
 *
 * Aliased into LiveStore's imports via vite.config.ts's `resolve.alias`.
 */

export const interruptible = (_runtimeFlags: unknown): boolean => true;

// Other no-op v3-style exports, included so a future LiveStore import
// of `RuntimeFlags.something` fails loudly with TypeScript instead of
// silently returning undefined.
export const enabled = (_flag: unknown): boolean => false;
export const disabled = (_flag: unknown): boolean => true;
