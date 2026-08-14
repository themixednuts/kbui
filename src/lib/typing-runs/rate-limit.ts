export interface RateLimitBucket {
  windowStartedAt: number;
  count: number;
}

export interface RateLimitSpec {
  limit: number;
  windowMs: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  retryAfterSeconds: number;
  bucket: RateLimitBucket;
}

export const EXTENSION_PAIR_INSTALL_LIMIT: RateLimitSpec = {
  limit: 8,
  windowMs: 10 * 60_000,
};
export const EXTENSION_PAIR_CODE_LIMIT: RateLimitSpec = {
  limit: 5,
  windowMs: 10 * 60_000,
};
export const EXTENSION_RUN_DEVICE_LIMIT: RateLimitSpec = {
  limit: 40,
  windowMs: 60_000,
};
export const EXTENSION_RUN_PARSER_LIMIT: RateLimitSpec = {
  limit: 80,
  windowMs: 60_000,
};

export function consumeRateLimitBucket(
  current: RateLimitBucket | null,
  nowMs: number,
  spec: RateLimitSpec,
): RateLimitDecision {
  const bucket =
    current === null || nowMs - current.windowStartedAt >= spec.windowMs
      ? { windowStartedAt: nowMs, count: 0 }
      : current;

  if (bucket.count >= spec.limit) {
    const retryAfterMs = bucket.windowStartedAt + spec.windowMs - nowMs;
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
      bucket,
    };
  }

  return {
    allowed: true,
    retryAfterSeconds: 0,
    bucket: { windowStartedAt: bucket.windowStartedAt, count: bucket.count + 1 },
  };
}

export function pairInstallRateLimitKey(installId: string): string {
  return `pair:install:${installId.trim()}`;
}

export function pairCodeRateLimitKey(codeHash: string): string {
  return `pair:code:${codeHash}`;
}

export function runDeviceRateLimitKey(userId: string, deviceKey: string): string {
  return `runs:user:${userId}:device:${deviceKey}`;
}

export function runParserRateLimitKey(userId: string, parserVersion: string): string {
  return `runs:user:${userId}:parser:${parserVersion.trim()}`;
}
