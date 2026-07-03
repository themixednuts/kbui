import { Effect } from "effect";

/**
 * Preferences — an Effect-style facade over the browser's localStorage.
 *
 * Every operation returns an `Effect` so callers compose with the rest of
 * the app's Effect pipelines and get uniform error handling. localStorage
 * can throw (quota exceeded, privacy mode, server-side) so we trap those
 * here and surface them as typed failures or successful no-ops depending
 * on the operation.
 *
 * All keys live under the `klakson.` namespace by convention; the helpers
 * below DO NOT prefix automatically — callers pass the full key. This is
 * intentional: it keeps grepping for usages easy and avoids accidental
 * key collisions when refactoring.
 */

const noBrowser = (): boolean => typeof localStorage === "undefined";

/** Read a string value. Returns `null` when missing OR when localStorage
 *  is unreachable (SSR / disabled). Never fails. */
export const get = (key: string): Effect.Effect<string | null> =>
  Effect.sync(() => {
    if (noBrowser()) return null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  });

/** Write a string value. Quota / disabled-storage errors are swallowed
 *  so we don't crash the UI when the user has disabled storage. */
export const set = (key: string, value: string): Effect.Effect<void> =>
  Effect.sync(() => {
    if (noBrowser()) return;
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore — storage is best-effort
    }
  });

/** Delete a key. */
export const remove = (key: string): Effect.Effect<void> =>
  Effect.sync(() => {
    if (noBrowser()) return;
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  });

/** Read & JSON-parse a value with a validator. Returns `undefined` if the
 *  key is missing, the JSON is malformed, or the value fails validation.
 *  Never fails — callers fall back to defaults at the call site. */
export const getJson = <T>(key: string, validate: (raw: unknown) => raw is T) =>
  Effect.gen(function* () {
    const raw = yield* get(key);
    if (raw === null) return undefined as T | undefined;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return undefined as T | undefined;
    }
    return validate(parsed) ? parsed : (undefined as T | undefined);
  });

/** Write a value as JSON. */
export const setJson = <T>(key: string, value: T): Effect.Effect<void> =>
  Effect.sync(() => {
    if (noBrowser()) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore
    }
  });
