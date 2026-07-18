import { Effect } from "effect";
import * as Preferences from "./preferences.ts";

/**
 * TargetOS — the OS whose conventions shortcut labels follow.
 *
 * Auto-detected on first load from `navigator.userAgentData.platform` (or
 * the older `navigator.platform`/userAgent strings), then optionally
 * overridden by the user through the keymap toolbar / settings drawer. Persisted
 * to localStorage so a Mac user editing a Windows layout (or vice versa)
 * keeps their choice across reloads.
 *
 * Modeled as Effect-producing functions rather than a Svelte store so the
 * service can be composed with other Effects (e.g. settings save, auth)
 * uniformly. The UI layer reads the value into $state on mount and writes
 * back via `save`.
 */

export type TargetOS = "mac" | "win" | "linux";

const STORAGE_KEY = "klakson.target-os.v1";
const VALID: ReadonlySet<TargetOS> = new Set(["mac", "win", "linux"] as const);

const isTargetOS = (value: unknown): value is TargetOS =>
  typeof value === "string" && VALID.has(value as TargetOS);

/** Inspect the navigator to guess the host OS. Pure & synchronous so we
 *  expose it as Effect.sync rather than a tryPromise; the read never
 *  throws on any platform we support (returns "win" on SSR). */
export const detect: Effect.Effect<TargetOS> = Effect.sync(() => {
  if (typeof navigator === "undefined") return "win";
  const platform =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).userAgentData?.platform ?? navigator.platform ?? navigator.userAgent ?? "";
  if (/mac|darwin|iphone|ipad/i.test(platform)) return "mac";
  if (/linux|x11/i.test(platform) && !/android/i.test(platform)) return "linux";
  return "win";
});

/** Load the user's stored override, falling back to detection. The two-
 *  step lookup is wrapped in a single Effect so callers don't have to
 *  thread the fallback themselves. */
export const load = Effect.gen(function* () {
  const stored = yield* Preferences.get(STORAGE_KEY);
  if (stored !== null && isTargetOS(stored)) return stored;
  return yield* detect;
});

/** Persist a target OS choice. */
export const save = (target: TargetOS) => Preferences.set(STORAGE_KEY, target);

/** Clear the override; next `load` will fall back to auto-detection. */
export const reset = Preferences.remove(STORAGE_KEY);

/** Compute the next OS in the cycle mac → win → linux → mac. Pure. */
export const next = (current: TargetOS): TargetOS => {
  switch (current) {
    case "mac":
      return "win";
    case "win":
      return "linux";
    case "linux":
      return "mac";
  }
};

/** Display labels for UI surfaces. */
export const labels: Readonly<Record<TargetOS, string>> = {
  mac: "macOS",
  win: "Windows",
  linux: "Linux",
};
