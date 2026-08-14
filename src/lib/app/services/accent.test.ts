import { Effect } from "effect";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_ACCENT_ID,
  LEGACY_STORAGE_KEY,
  STORAGE_KEY,
  accentById,
  load,
  saveAndApply,
} from "./accent";
import * as Preferences from "./preferences";

type MutableGlobal = typeof globalThis & {
  document?: Document;
  localStorage?: Storage;
};

const mutableGlobal = globalThis as MutableGlobal;
const originalDocument = mutableGlobal.document;
const originalLocalStorage = mutableGlobal.localStorage;

let styleWrites: Record<string, string>;

beforeEach(() => {
  const values = new Map<string, string>();

  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };

  styleWrites = {};
  const document = {
    documentElement: {
      style: {
        setProperty(key: string, value: string) {
          styleWrites[key] = value;
        },
      },
    },
  } as unknown as Document;

  Object.defineProperty(mutableGlobal, "localStorage", {
    configurable: true,
    value: storage,
  });
  Object.defineProperty(mutableGlobal, "document", {
    configurable: true,
    value: document,
  });
});

afterEach(() => {
  restoreGlobal("localStorage", originalLocalStorage);
  restoreGlobal("document", originalDocument);
});

describe("accent preferences", () => {
  it("falls back to the default accent when storage is missing or invalid", async () => {
    expect(await Effect.runPromise(load.pipe(Effect.provide(Preferences.layer)))).toBe(
      DEFAULT_ACCENT_ID,
    );

    localStorage.setItem(STORAGE_KEY, "unknown");

    expect(await Effect.runPromise(load.pipe(Effect.provide(Preferences.layer)))).toBe(
      DEFAULT_ACCENT_ID,
    );
  });

  it("reads a legacy accent storage key when the current key is empty", async () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, "lilac");

    expect(await Effect.runPromise(load.pipe(Effect.provide(Preferences.layer)))).toBe("lilac");
  });

  it("persists and applies the selected accent to the app theme variable", async () => {
    await Effect.runPromise(saveAndApply("teal").pipe(Effect.provide(Preferences.layer)));

    expect(localStorage.getItem(STORAGE_KEY)).toBe("teal");
    expect(styleWrites["--coral"]).toBe(accentById("teal").value);
    expect(await Effect.runPromise(load.pipe(Effect.provide(Preferences.layer)))).toBe("teal");
  });
});

function restoreGlobal(key: "document" | "localStorage", value: Document | Storage | undefined) {
  if (value) {
    Object.defineProperty(mutableGlobal, key, {
      configurable: true,
      value,
    });
    return;
  }

  Reflect.deleteProperty(mutableGlobal, key);
}
