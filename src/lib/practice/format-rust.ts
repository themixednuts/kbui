import { Effect, Schema } from "effect";
import prettier from "prettier";
import rustPlugin from "prettier-plugin-rust";

export class RustFormatError extends Schema.TaggedErrorClass<RustFormatError>()(
  "Practice.RustFormatError",
  { message: Schema.String },
) {}

const PRETTIER_OPTS = {
  parser: "jinx-rust" as const,
  plugins: [rustPlugin],
  printWidth: 80,
  tabWidth: 4,
  useTabs: false,
};

const runPrettier = async (source: string): Promise<string> => {
  const result = prettier.format(source, PRETTIER_OPTS);
  return await Promise.resolve(result);
};

/**
 * Format Rust source with prettier-plugin-rust (jinx-rust / rustfmt-adjacent).
 * Incomplete snippets are wrapped in a synthetic fn so formatting still applies,
 * then the wrapper is stripped. Unparseable input falls back to the original.
 */
export const formatRustSource = Effect.fn("Practice.formatRustSource")(function* (source: string) {
  const trimmed = source.trim();
  if (trimmed.length === 0) return source;

  return yield* Effect.tryPromise({
    try: async () => {
      try {
        return await runPrettier(source);
      } catch {
        const wrapped = `fn __kbgui_fmt() {\n${source}\n}\n`;
        const formatted = await runPrettier(wrapped);
        const lines = formatted.replace(/\r\n/g, "\n").split("\n");
        // Drop `fn __kbgui_fmt() {` and trailing `}`
        const body = lines.slice(1, -1);
        // Un-indent one level (4 spaces) when present
        const unindented = body.map((line) =>
          line.startsWith("    ") ? line.slice(4) : line,
        );
        while (unindented.length > 0 && unindented[0] === "") unindented.shift();
        while (unindented.length > 0 && unindented[unindented.length - 1] === "") {
          unindented.pop();
        }
        return unindented.join("\n") + (formatted.endsWith("\n") ? "\n" : "");
      }
    },
    catch: (error) =>
      new RustFormatError({
        message: error instanceof Error ? error.message : String(error),
      }),
  }).pipe(Effect.catchTag("Practice.RustFormatError", () => Effect.succeed(source)));
});

/** Format a multi-line drill: join → rustfmt → split lines. */
export const formatRustLines = Effect.fn("Practice.formatRustLines")(function* (
  lines: readonly string[],
) {
  const joined = lines.join("\n");
  const formatted = yield* formatRustSource(joined);
  const next = formatted.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  return next.length > 0 ? next : [...lines];
});

/** Format PracticeScript lines when mode is rust-text (symbols stay as authored). */
export const formatPracticeScript = Effect.fn("Practice.formatPracticeScript")(function* <
  T extends { readonly mode: string; readonly lines: readonly string[] },
>(script: T) {
  if (script.mode !== "rust-text") return script;
  const lines = yield* formatRustLines(script.lines);
  return { ...script, lines };
});
