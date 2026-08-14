import { Effect } from "effect";
import { describe, expect, it } from "@effect/vitest";

import { IndentPolicy, IndentStyle } from "./contracts";
import { bufferCells, compileBufferDocument, indentDisplayWidth } from "./buffer";
import { formatRustLines, formatRustSource } from "./format-rust";
import { PracticeScript, SESSION_GOAL_UNTIL_COMPLETE } from "./contracts";

describe("rust format + stable indent width", () => {
  it.effect("formats rust snippets with prettier-plugin-rust", () =>
    Effect.gen(function* () {
      const formatted = yield* formatRustSource("fn main(){let x=1;}");
      expect(formatted.includes("fn main()")).toBe(true);
      expect(formatted.includes("let x")).toBe(true);
      // rustfmt-style: body on its own indented line
      expect(formatted).toMatch(/\n\s+let x/);
    }),
  );

  it.effect("formatRustLines splits formatted output into lines", () =>
    Effect.gen(function* () {
      const lines = yield* formatRustLines(["fn main(){", "let x=1;", "}"]);
      expect(lines.length).toBeGreaterThan(1);
      expect(lines.some((l: string) => l.includes("fn main"))).toBe(true);
    }),
  );

  it.effect("formats dense one-liner corpus into multi-line rustfmt style", () =>
    Effect.gen(function* () {
      const lines = yield* formatRustLines([
        "fn main(){let path=Path::new(\"./src\");println!(\"{:?}\",path);}",
      ]);
      expect(lines.length).toBeGreaterThan(1);
      expect(lines.some((l: string) => /^\s+let path/.test(l))).toBe(true);
    }),
  );

  it.effect("indent visual width stays 4 columns when Tabs lock", () =>
    Effect.gen(function* () {
      const spaces = yield* indentDisplayWidth(1, IndentStyle.cases.Spaces.make({ width: 4 }), 4);
      const tabs = yield* indentDisplayWidth(1, IndentStyle.cases.Tabs.make({}), 4);
      expect(spaces).toBe(4);
      expect(tabs).toBe(4);
    }),
  );

  it.effect("buffer indent cells keep space glyphs of stable width", () =>
    Effect.gen(function* () {
      const script = PracticeScript.make({
        id: "fmt-indent",
        mode: "rust-text",
        title: "t",
        goal: SESSION_GOAL_UNTIL_COMPLETE,
        lines: ["fn main() {", "    let x = 1;", "}"],
        indentUnitWidth: 4,
        indentPolicy: IndentPolicy.cases.Detect.make({ candidateWidth: 4 }),
        actions: [],
      });
      const doc = yield* compileBufferDocument(script);
      const unlocked = yield* bufferCells(doc, undefined);
      const lockedTabs = yield* bufferCells(doc, IndentStyle.cases.Tabs.make({}));
      const indentUnlocked = unlocked.filter((c) => c.kind === "indent");
      const indentTabs = lockedTabs.filter((c) => c.kind === "indent");
      expect(indentUnlocked.length).toBe(indentTabs.length);
      expect(indentUnlocked.every((c) => c.display === " ")).toBe(true);
      expect(indentTabs.every((c) => c.display === " ")).toBe(true);
    }),
  );
});
