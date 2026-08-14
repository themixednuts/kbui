import { Effect } from "effect";
import { describe, expect, it } from "@effect/vitest";

import { isPracticeArmKey, prepareDrill } from "./prepare";

describe("prepareDrill + auto-arm keys", () => {
  it.effect("prepares an UntilComplete idle session by default", () =>
    Effect.gen(function* () {
      const prepared = yield* prepareDrill({
        mode: "rust-text",
        adaptive: false,
        sessions: [],
        goalKind: "until-complete",
        seed: 1,
      });
      expect(prepared.script.goal._tag).toBe("UntilComplete");
      expect(prepared.session.finished).toBe(false);
      expect(prepared.session.atomIndex).toBe(0);
      expect(prepared.script.actions).toEqual([]);
    }),
  );

  it.effect("arms on printable / Tab / Enter / Space", () =>
    Effect.gen(function* () {
      expect(
        yield* isPracticeArmKey({
          key: "a",
          metaKey: false,
          altKey: false,
          ctrlKey: false,
          target: null,
        } as KeyboardEvent),
      ).toBe(true);
      expect(
        yield* isPracticeArmKey({
          key: "Tab",
          metaKey: false,
          altKey: false,
          ctrlKey: false,
          target: null,
        } as KeyboardEvent),
      ).toBe(true);
      expect(
        yield* isPracticeArmKey({
          key: "Escape",
          metaKey: false,
          altKey: false,
          ctrlKey: false,
          target: null,
        } as KeyboardEvent),
      ).toBe(false);
      expect(
        yield* isPracticeArmKey({
          key: "Backspace",
          metaKey: false,
          altKey: false,
          ctrlKey: false,
          target: null,
        } as KeyboardEvent),
      ).toBe(false);
      expect(
        yield* isPracticeArmKey({
          key: "a",
          metaKey: true,
          altKey: false,
          ctrlKey: false,
          target: null,
        } as KeyboardEvent),
      ).toBe(false);
    }),
  );
});
