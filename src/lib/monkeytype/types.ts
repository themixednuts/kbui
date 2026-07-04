export const DEFAULT_MONKEYTYPE_MODE = "time";
export const DEFAULT_MONKEYTYPE_MODE2 = "60";
export const MONKEYTYPE_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
export const MONKEYTYPE_RESULTS_LIMIT = 50;

export interface MonkeytypeRateLimit {
  limit: number | null;
  remaining: number | null;
  resetAt: string | null;
  resetEpochSeconds: number | null;
  rawReset: string | null;
}

export interface MonkeytypeStatusError {
  code: string;
  message: string;
  status?: number;
  retryAt?: string | null;
  rateLimit?: MonkeytypeRateLimit | null;
}

export interface MonkeytypeSummary {
  wpm: number | null;
  accuracy: number | null;
  consistency: number | null;
  tests: number | null;
  pb: number | null;
  mode: string;
  mode2: string;
  resultCount: number;
  generatedAt: string | null;
  stale: boolean;
  error: MonkeytypeStatusError | null;
}

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
