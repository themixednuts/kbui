import { Context, Effect, FiberMap, Layer } from "effect";

import * as Preferences from "./preferences.ts";

/** User-facing appearance preference. Warm and graphite remain the concrete
 * Klakson skins, but they now resolve from familiar light/dark/system choices. */
export type ThemeId = "light" | "dark" | "system";
export type ResolvedThemeId = "warm" | "graphite";

export interface ThemeOption {
  id: ThemeId;
  label: string;
  icon: string;
}

export const STORAGE_KEY = "klakson.theme.v1";
export const DEFAULT_THEME: ThemeId = "system";

export const themeOptions: readonly ThemeOption[] = [
  { id: "light", label: "Light", icon: "light_mode" },
  { id: "dark", label: "Dark", icon: "dark_mode" },
  { id: "system", label: "System", icon: "contrast" },
];

const themeIds = new Set<ThemeId>(themeOptions.map((option) => option.id));

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && themeIds.has(value as ThemeId);
}

export function themeById(id: ThemeId): ThemeOption {
  return themeOptions.find((option) => option.id === id) ?? themeOptions[0];
}

function storedTheme(value: string | null): ThemeId {
  if (isThemeId(value)) return value;
  // Preserve the intent of preferences saved before light/dark/system shipped.
  if (value === "warm") return "light";
  if (value === "graphite") return "dark";
  return DEFAULT_THEME;
}

function resolvedTheme(id: ThemeId, prefersDark: boolean): ResolvedThemeId {
  return id === "dark" || (id === "system" && prefersDark) ? "graphite" : "warm";
}

function stampTheme(id: ThemeId, prefersDark: boolean) {
  const root = document.documentElement;
  const resolved = resolvedTheme(id, prefersDark);
  root.dataset.themePreference = id;
  root.dataset.theme = resolved;
  root.classList.toggle("dark", resolved === "graphite");
  root.style.colorScheme = resolved === "graphite" ? "dark" : "light";
}

export interface Interface {
  readonly load: Effect.Effect<ThemeId, Preferences.PreferencesError>;
  readonly save: (id: ThemeId) => Effect.Effect<void, Preferences.PreferencesError>;
  readonly reset: Effect.Effect<void, Preferences.PreferencesError>;
  readonly apply: (id: ThemeId) => Effect.Effect<void>;
}

export class Service extends Context.Service<Service, Interface>()("@kbui/Theme") {}

function watchTheme(id: ThemeId) {
  return Effect.gen(function* () {
    if (typeof document === "undefined") return;
    const media = globalThis.matchMedia?.("(prefers-color-scheme: dark)");
    stampTheme(id, media?.matches ?? false);
    if (id !== "system" || !media) return;

    yield* Effect.callback<void>(() => {
      const handleChange = (event: MediaQueryListEvent) => stampTheme("system", event.matches);
      media.addEventListener("change", handleChange);
      return Effect.sync(() => media.removeEventListener("change", handleChange));
    });
  });
}

export const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const preferences = yield* Preferences.Service;
    const watchers = yield* FiberMap.make<string>();
    const apply = Effect.fn("Theme.apply")(function* (id: ThemeId) {
      yield* FiberMap.run(watchers, "active-theme", watchTheme(id));
    });

    return Service.of({
      load: Effect.map(preferences.get(STORAGE_KEY), storedTheme),
      save: Effect.fn("Theme.save")((id: ThemeId) => preferences.set(STORAGE_KEY, id)),
      reset: preferences.remove(STORAGE_KEY),
      apply,
    });
  }),
);

export const load = Effect.flatMap(Service, (theme) => theme.load);

export const save = (id: ThemeId) => Effect.flatMap(Service, (theme) => theme.save(id));

export const reset = Effect.flatMap(Service, (theme) => theme.reset);

export const apply = (id: ThemeId) => Effect.flatMap(Service, (theme) => theme.apply(id));

export const loadAndApply = Effect.gen(function* () {
  const id = yield* load;
  yield* apply(id);
  return id;
});

export const saveAndApply = (id: ThemeId) =>
  Effect.gen(function* () {
    yield* save(id);
    yield* apply(id);
  });
