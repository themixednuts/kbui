import { Schema } from "effect";

export const DEFAULT_MONKEYTYPE_MODE = "time";
export const DEFAULT_MONKEYTYPE_MODE2 = "60";
export const MONKEYTYPE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const MONKEYTYPE_RESULTS_LIMIT = 50;

export const MonkeytypeRateLimitSchema = Schema.Struct({
  limit: Schema.NullOr(Schema.Finite),
  remaining: Schema.NullOr(Schema.Finite),
  resetAt: Schema.NullOr(Schema.String),
  resetEpochSeconds: Schema.NullOr(Schema.Finite),
  rawReset: Schema.NullOr(Schema.String),
});

export interface MonkeytypeRateLimit extends Schema.Schema.Type<typeof MonkeytypeRateLimitSchema> {}

export const MonkeytypeStatusErrorSchema = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
  status: Schema.optionalKey(Schema.Finite),
  retryAt: Schema.optionalKey(Schema.NullOr(Schema.String)),
  rateLimit: Schema.optionalKey(Schema.NullOr(MonkeytypeRateLimitSchema)),
});

export interface MonkeytypeStatusError extends Schema.Schema.Type<
  typeof MonkeytypeStatusErrorSchema
> {}

export const MonkeytypeSummarySchema = Schema.Struct({
  wpm: Schema.NullOr(Schema.Finite),
  accuracy: Schema.NullOr(Schema.Finite),
  consistency: Schema.NullOr(Schema.Finite),
  tests: Schema.NullOr(Schema.Finite),
  pb: Schema.NullOr(Schema.Finite),
  mode: Schema.String,
  mode2: Schema.String,
  resultCount: Schema.Finite,
  generatedAt: Schema.NullOr(Schema.String),
  stale: Schema.Boolean,
  error: Schema.NullOr(MonkeytypeStatusErrorSchema),
});

export interface MonkeytypeSummary extends Schema.Schema.Type<typeof MonkeytypeSummarySchema> {}

export interface MonkeytypeConnectionStatus {
  connected: boolean;
  username: string | null;
  mode: string;
  mode2: string;
  summary: MonkeytypeSummary | null;
  lastSyncedAt: string | null;
  stale: boolean;
  error: MonkeytypeStatusError | null;
}

export interface MonkeytypeConnectInput {
  apeKey?: string;
  username?: string;
  mode?: string;
  mode2?: string;
}

export interface MonkeytypeRefreshInput {
  force?: boolean;
}
