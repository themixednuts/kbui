import { Effect, Option, Schema } from "effect";

import { BoundaryDecodeError } from "$lib/effect/errors";

export const NormalizedMonkeytypeResultSchema = Schema.Struct({
  id: Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(160)),
  timestampMs: Schema.Finite,
  wpm: Schema.Finite,
  rawWpm: Schema.NullOr(Schema.Finite),
  acc: Schema.Finite,
  consistency: Schema.NullOr(Schema.Finite),
  testDuration: Schema.NullOr(Schema.Finite),
  mode: Schema.NullOr(Schema.String),
  mode2: Schema.NullOr(Schema.String),
  syncedAtMs: Schema.Finite,
  payload: Schema.Unknown,
});

export interface NormalizedMonkeytypeResult extends Schema.Schema.Type<
  typeof NormalizedMonkeytypeResultSchema
> {}

const finiteMetric = Schema.Union([Schema.Finite, Schema.NumberFromString]);
const optionalMetric = Schema.optionalKey(finiteMetric);
const optionalText = Schema.optionalKey(Schema.String);

export const MonkeytypeResultWireSchema = Schema.Struct({
  _id: optionalText,
  id: optionalText,
  wpm: finiteMetric,
  rawWpm: optionalMetric,
  raw: optionalMetric,
  acc: optionalMetric,
  accuracy: optionalMetric,
  consistency: optionalMetric,
  testDuration: optionalMetric,
  time: optionalMetric,
  timestamp: optionalMetric,
  timestampMs: optionalMetric,
  mode: optionalText,
  mode2: optionalText,
});

const MonkeytypeResultListSchema = Schema.Array(Schema.Unknown);
const MonkeytypeResultsDataArraySchema = Schema.Struct({
  data: MonkeytypeResultListSchema,
});
const MonkeytypeResultsNamedArraySchema = Schema.Struct({
  results: MonkeytypeResultListSchema,
});
const MonkeytypeResultsNestedSchema = Schema.Struct({
  data: Schema.Struct({
    results: MonkeytypeResultListSchema,
  }),
});
const MonkeytypeResultsWrappedSchema = Schema.Struct({
  data: Schema.Unknown,
});
const MonkeytypeResultsObjectSchema = Schema.Record(Schema.String, Schema.Unknown);

export const decodeNormalizedMonkeytypeResultsEffect = Effect.fn(
  "TypingRuns.decodeNormalizedMonkeytypeResults",
)((raw: unknown) =>
  Schema.decodeUnknownEffect(Schema.Array(NormalizedMonkeytypeResultSchema))(raw).pipe(
    Effect.mapError(
      (cause) =>
        new BoundaryDecodeError({
          operation: "typing-runs.decode-normalized-monkeytype-results",
          message: `Stored Monkeytype results did not match their contract: ${String(cause)}`,
          cause,
        }),
    ),
  ),
);

export const decodeMonkeytypeResultsEffect = Effect.fn("TypingRuns.decodeMonkeytypeResults")(
  function* (payload: unknown, syncedAtMs: number) {
    const rows = yield* decodeMonkeytypeResultRowsEffect(payload);
    const decoded = yield* Effect.forEach(rows, (row) =>
      Schema.decodeUnknownEffect(MonkeytypeResultWireSchema)(row).pipe(
        Effect.map((wire) => normalizeWireResult(wire, row, syncedAtMs)),
        Effect.option,
      ),
    );

    const seen = new Set<string>();
    const normalized: NormalizedMonkeytypeResult[] = [];
    for (const candidate of decoded) {
      if (Option.isNone(candidate)) continue;
      const row = candidate.value;
      if (!row || seen.has(row.id)) continue;
      seen.add(row.id);
      normalized.push(row);
    }
    return normalized;
  },
);

const decodeMonkeytypeResultRowsEffect = Effect.fn("TypingRuns.decodeMonkeytypeResultRows")(
  (payload: unknown) =>
    Effect.firstSuccessOf([
      Schema.decodeUnknownEffect(MonkeytypeResultListSchema)(payload),
      Schema.decodeUnknownEffect(MonkeytypeResultsDataArraySchema)(payload).pipe(
        Effect.map((value) => value.data),
      ),
      Schema.decodeUnknownEffect(MonkeytypeResultsNamedArraySchema)(payload).pipe(
        Effect.map((value) => value.results),
      ),
      Schema.decodeUnknownEffect(MonkeytypeResultsNestedSchema)(payload).pipe(
        Effect.map((value) => value.data.results),
      ),
      Schema.decodeUnknownEffect(MonkeytypeResultsWrappedSchema)(payload).pipe(
        Effect.map((value) => (value.data && typeof value.data === "object" ? [value.data] : [])),
      ),
      Schema.decodeUnknownEffect(MonkeytypeResultsObjectSchema)(payload).pipe(
        Effect.map((value) => [value]),
      ),
    ]).pipe(
      Effect.mapError(
        (cause) =>
          new BoundaryDecodeError({
            operation: "typing-runs.decode-monkeytype-results-envelope",
            message: `Monkeytype results payload did not match its contract: ${String(cause)}`,
            cause,
          }),
      ),
    ),
);

function normalizeWireResult(
  wire: typeof MonkeytypeResultWireSchema.Type,
  payload: unknown,
  syncedAtMs: number,
): NormalizedMonkeytypeResult | null {
  const id = readText(wire._id) ?? readText(wire.id);
  const timestampMs = normalizeTimestampMs(wire.timestampMs ?? wire.timestamp);
  const acc = wire.acc ?? wire.accuracy;
  if (!id || timestampMs === null || acc === undefined) return null;

  return {
    id,
    timestampMs,
    wpm: wire.wpm,
    rawWpm: wire.rawWpm ?? wire.raw ?? null,
    acc,
    consistency: wire.consistency ?? null,
    testDuration: wire.testDuration ?? wire.time ?? null,
    mode: readText(wire.mode),
    mode2: readText(wire.mode2),
    syncedAtMs,
    payload,
  };
}

function readText(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeTimestampMs(value: number | undefined): number | null {
  if (value === undefined || !Number.isFinite(value)) return null;
  return value < 10_000_000_000 ? Math.round(value * 1000) : Math.round(value);
}
