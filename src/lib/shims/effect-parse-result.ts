/**
 * Shim for `effect/ParseResult` (v3-only path that LiveStore depends on).
 *
 * Effect v4 dropped the standalone `ParseResult` submodule and folded
 * its functionality into `SchemaParser` + the issue/error types. LiveStore
 * is currently pinned to v3's import path and calls
 * `TreeFormatter.formatErrorSync(parseError)` in a handful of error
 * paths (sql-queries.ts, db-query.ts).
 *
 * We don't need the full v3 surface — we just need `formatErrorSync` to
 * return a human-readable string when LiveStore hits a schema parse
 * error. v4's issues already serialize sensibly via JSON / .message, so
 * a thin coercion works.
 *
 * This file is wired into the build via vite.config.ts's `resolve.alias`
 * mapping `effect/ParseResult` → this shim.
 */

type AnyIssue = {
  readonly message?: string;
  readonly _tag?: string;
  readonly toString?: () => string;
};

export const TreeFormatter = {
  formatErrorSync(input: unknown): string {
    if (input == null) return "Schema parse error";
    if (typeof input === "string") return input;
    if (typeof input === "object" && input !== null) {
      const issue = input as AnyIssue;
      if (typeof issue.message === "string") return issue.message;
      if (typeof issue.toString === "function" && issue.toString !== Object.prototype.toString) {
        return issue.toString();
      }
      try {
        return JSON.stringify(issue, null, 2) ?? "Schema parse error";
      } catch {
        return "Schema parse error";
      }
    }
    if (
      typeof input === "number" ||
      typeof input === "boolean" ||
      typeof input === "bigint" ||
      typeof input === "symbol"
    ) {
      return String(input);
    }
    return "Schema parse error";
  },
};

// Other v3 ParseResult exports we might bump into. They're all currently
// unused by LiveStore beyond `TreeFormatter`, but adding type-safe
// no-op stubs makes future v3-API touchpoints fail loudly instead of
// silently returning `undefined`.
export const ParseError = class ParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ParseError";
  }
};
