import { Context, Effect, Layer, Schema } from "effect";

import { platformError, PlatformError } from "$lib/effect/errors";

/**
 * Preferences — an Effect-style facade over the browser's localStorage.
 *
 * Every operation returns an `Effect` so callers compose with the rest of
 * the app's Effect pipelines and get uniform error handling. localStorage
 * can throw (quota exceeded, privacy mode, server-side), so every failure is
 * preserved in the typed error channel. UI adapters may report it, but no
 * persistence failure is silently converted into success.
 *
 * All keys live under the `kbui.` namespace by convention; the helpers
 * below DO NOT prefix automatically — callers pass the full key. This is
 * intentional: it keeps grepping for usages easy and avoids accidental
 * key collisions when refactoring.
 */

export class StorageUnavailable extends Schema.TaggedErrorClass<StorageUnavailable>()(
  "Preferences.StorageUnavailable",
  { operation: Schema.String },
) {}

export type PreferencesError = PlatformError | StorageUnavailable;

export interface Interface {
  readonly get: (key: string) => Effect.Effect<string | null, PreferencesError>;
  readonly set: (key: string, value: string) => Effect.Effect<void, PreferencesError>;
  readonly remove: (key: string) => Effect.Effect<void, PreferencesError>;
}

export class Service extends Context.Service<Service, Interface>()("@kbui/Preferences") {}

function storage(operation: string): Effect.Effect<Storage, StorageUnavailable> {
  return typeof localStorage === "undefined"
    ? Effect.fail(new StorageUnavailable({ operation }))
    : Effect.succeed(localStorage);
}

export const layer = Layer.succeed(
  Service,
  Service.of({
    get: Effect.fn("Preferences.get")(function* (key: string) {
      const target = yield* storage("Preferences.get");
      return yield* Effect.try({
        try: () => target.getItem(key),
        catch: (cause) => platformError("Preferences.get", cause),
      });
    }),
    set: Effect.fn("Preferences.set")(function* (key: string, value: string) {
      const target = yield* storage("Preferences.set");
      yield* Effect.try({
        try: () => target.setItem(key, value),
        catch: (cause) => platformError("Preferences.set", cause),
      });
    }),
    remove: Effect.fn("Preferences.remove")(function* (key: string) {
      const target = yield* storage("Preferences.remove");
      yield* Effect.try({
        try: () => target.removeItem(key),
        catch: (cause) => platformError("Preferences.remove", cause),
      });
    }),
  }),
);

/** Read a string value. `null` means missing; unavailable storage is a failure. */
export const get = (key: string): Effect.Effect<string | null, PreferencesError, Service> =>
  Effect.flatMap(Service, (preferences) => preferences.get(key));

/** Read `key`, then a legacy key so renamed namespaces keep existing prefs. */
export const getWithLegacy = (
  key: string,
  legacyKey: string,
): Effect.Effect<string | null, PreferencesError, Service> =>
  Effect.gen(function* () {
    const value = yield* get(key);
    if (value !== null) return value;
    return yield* get(legacyKey);
  });

/** Write a string value, preserving quota and disabled-storage failures. */
export const set = (key: string, value: string): Effect.Effect<void, PreferencesError, Service> =>
  Effect.flatMap(Service, (preferences) => preferences.set(key, value));

/** Delete a key. */
export const remove = (key: string): Effect.Effect<void, PreferencesError, Service> =>
  Effect.flatMap(Service, (preferences) => preferences.remove(key));

/** Read and decode a JSON value at the persistence boundary. */
export const getJson = <S extends Schema.Constraint>(key: string, schema: S) =>
  Effect.gen(function* () {
    const raw = yield* get(key);
    if (raw === null) return undefined;
    return yield* Schema.decodeUnknownEffect(Schema.fromJsonString(schema))(raw);
  });

/** Write a value as JSON. */
export const setJson = <S extends Schema.Constraint>(key: string, schema: S, value: S["Type"]) =>
  Effect.gen(function* () {
    const json = yield* Schema.encodeEffect(Schema.fromJsonString(schema))(value);
    yield* set(key, json);
  });
