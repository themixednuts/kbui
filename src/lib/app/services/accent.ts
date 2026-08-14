import { Effect } from "effect";

import * as Preferences from "./preferences.ts";

export type AccentId = "coral" | "teal" | "lilac" | "mustard";

export interface AccentOption {
  id: AccentId;
  label: string;
  value: string;
}

export const STORAGE_KEY = "kbui.accent.v1";
export const LEGACY_STORAGE_KEY = "klakson.accent.v1";
export const DEFAULT_ACCENT_ID: AccentId = "coral";

export const accentOptions: readonly AccentOption[] = [
  { id: "coral", label: "Coral", value: "oklch(0.72 0.17 32)" },
  { id: "teal", label: "Teal", value: "oklch(0.72 0.13 195)" },
  { id: "lilac", label: "Lilac", value: "oklch(0.76 0.11 305)" },
  { id: "mustard", label: "Mustard", value: "oklch(0.82 0.12 90)" },
];

const accentIds = new Set<AccentId>(accentOptions.map((option) => option.id));

export function isAccentId(value: unknown): value is AccentId {
  return typeof value === "string" && accentIds.has(value as AccentId);
}

export function accentById(id: AccentId): AccentOption {
  return accentOptions.find((option) => option.id === id) ?? accentOptions[0];
}

export const load = Effect.gen(function* () {
  const stored = yield* Preferences.getWithLegacy(STORAGE_KEY, LEGACY_STORAGE_KEY);
  return isAccentId(stored) ? stored : DEFAULT_ACCENT_ID;
});

export const save = (id: AccentId) => Preferences.set(STORAGE_KEY, id);

export const reset = Preferences.remove(STORAGE_KEY);

export const apply = (id: AccentId): Effect.Effect<void> =>
  Effect.sync(() => {
    if (typeof document === "undefined") return;
    document.documentElement.style.setProperty("--coral", accentById(id).value);
  });

export const loadAndApply = Effect.gen(function* () {
  const id = yield* load;
  yield* apply(id);
  return id;
});

export const saveAndApply = (id: AccentId) =>
  Effect.gen(function* () {
    yield* save(id);
    yield* apply(id);
  });
