import { Effect, Schedule, Schema } from "effect";

import { PlatformError, platformError } from "$lib/effect/errors";
import {
  MonkeytypeRateLimitSchema,
  type MonkeytypeRateLimit,
  type MonkeytypeStatusError,
} from "$lib/monkeytype/types";

export const MONKEYTYPE_API_BASE_URL = "https://api.monkeytype.com";

export type MonkeytypeFetch = typeof fetch;

const defaultMonkeytypeFetch: MonkeytypeFetch = (input, init) => globalThis.fetch(input, init);

const monkeytypeFetchRetrySchedule = Schedule.exponential("250 millis").pipe(
  Schedule.jittered,
  Schedule.upTo({ times: 3 }),
);

export interface MonkeytypeResponse<T> {
  data: T;
  rateLimit: MonkeytypeRateLimit;
}

export class MonkeytypeApiError extends Schema.TaggedErrorClass<MonkeytypeApiError>()(
  "MonkeytypeApiError",
  {
    code: Schema.String,
    message: Schema.String,
    status: Schema.Finite,
    rateLimit: MonkeytypeRateLimitSchema,
  },
) {
  toStatusError(): MonkeytypeStatusError {
    return {
      code: this.code,
      message: this.message,
      status: this.status,
      retryAt: this.rateLimit.resetAt,
      rateLimit: this.rateLimit,
    };
  }
}

export interface MonkeytypeApiClientOptions {
  fetchImpl?: MonkeytypeFetch;
  nowMs?: () => number;
}

export class MonkeytypeApiClient {
  readonly #fetchImpl: MonkeytypeFetch;
  readonly #nowMs: () => number;

  readonly statsEffect = Effect.fn("MonkeytypeApiClient.stats")((apeKey: string) =>
    this.#requestEffect("/users/stats", { apeKey }),
  );

  readonly personalBestsEffect = Effect.fn("MonkeytypeApiClient.personalBests")(
    (apeKey: string, mode: string, mode2: string) => {
      const params = new URLSearchParams({ mode, mode2 });
      return this.#requestEffect(`/users/personalBests?${params}`, { apeKey });
    },
  );

  readonly resultsEffect = Effect.fn("MonkeytypeApiClient.results")(
    (apeKey: string, limit: number) => {
      const params = new URLSearchParams({ limit: String(limit), offset: "0" });
      return this.#requestEffect(`/results?${params}`, { apeKey });
    },
  );

  readonly publicProfileEffect = Effect.fn("MonkeytypeApiClient.publicProfile")(
    (username: string) => {
      const params = new URLSearchParams({ isUid: "false" });
      return this.#requestEffect(`/users/${encodeURIComponent(username)}/profile?${params}`);
    },
  );

  constructor(options: MonkeytypeApiClientOptions = {}) {
    this.#fetchImpl = options.fetchImpl ?? defaultMonkeytypeFetch;
    this.#nowMs = options.nowMs ?? (() => new Date().getTime());
  }

  #requestEffect(
    path: string,
    options: {
      apeKey?: string;
    } = {},
  ) {
    return Effect.gen({ self: this }, function* () {
      const headers = new Headers({ accept: "application/json" });
      if (options.apeKey) headers.set("authorization", `ApeKey ${options.apeKey}`);

      const fetchAttempt = Effect.tryPromise({
        try: (signal) =>
          this.#fetchImpl(`${MONKEYTYPE_API_BASE_URL}${path}`, {
            headers,
            method: "GET",
            signal,
          }),
        catch: (cause) => platformError("monkeytype.fetch", cause),
      }).pipe(
        Effect.timeout("10 seconds"),
        Effect.mapError((error) =>
          error instanceof PlatformError ? error : platformError("monkeytype.fetch-timeout", error),
        ),
      );
      const response = yield* Effect.retry(fetchAttempt, {
        schedule: monkeytypeFetchRetrySchedule,
      });
      const rateLimit = readMonkeytypeRateLimit(response.headers, this.#nowMs());
      const body = yield* readResponseBodyEffect(response);
      if (!response.ok) {
        return yield* Effect.fail(monkeytypeErrorFromResponse(response.status, body, rateLimit));
      }
      return { data: unwrapMonkeytypeData(body), rateLimit } satisfies MonkeytypeResponse<unknown>;
    });
  }
}

export function readMonkeytypeRateLimit(headers: Headers, nowMs: number): MonkeytypeRateLimit {
  const rawReset = headers.get("x-ratelimit-reset");
  const resetEpochSeconds = parseResetEpochSeconds(rawReset, nowMs);

  return {
    limit: parseHeaderNumber(headers.get("x-ratelimit-limit")),
    remaining: parseHeaderNumber(headers.get("x-ratelimit-remaining")),
    resetAt: resetEpochSeconds === null ? null : new Date(resetEpochSeconds * 1000).toISOString(),
    resetEpochSeconds,
    rawReset,
  };
}

export function monkeytypeErrorFromResponse(
  status: number,
  body: unknown,
  rateLimit: MonkeytypeRateLimit,
): MonkeytypeApiError {
  const fallbackMessage = messageFromBody(body) ?? "Monkeytype request failed.";
  const mapped = monkeytypeErrorCode(status, fallbackMessage);
  return new MonkeytypeApiError({
    ...mapped,
    status,
    rateLimit,
  });
}

function monkeytypeErrorCode(status: number, fallbackMessage: string) {
  switch (status) {
    case 470:
      return { code: "MONKEYTYPE_INVALID_APE_KEY", message: "Monkeytype rejected this ApeKey." };
    case 471:
      return {
        code: "MONKEYTYPE_INACTIVE_APE_KEY",
        message: "This Monkeytype ApeKey is inactive.",
      };
    case 472:
      return {
        code: "MONKEYTYPE_MALFORMED_APE_KEY",
        message: "This Monkeytype ApeKey is malformed.",
      };
    case 479:
      return {
        code: "MONKEYTYPE_APE_KEY_RATE_LIMITED",
        message: "Monkeytype ApeKey quota is temporarily exhausted.",
      };
    case 401:
    case 403:
      return { code: "MONKEYTYPE_UNAUTHORIZED", message: fallbackMessage };
    case 404:
      return { code: "MONKEYTYPE_NOT_FOUND", message: fallbackMessage };
    default:
      return { code: "MONKEYTYPE_API_ERROR", message: fallbackMessage };
  }
}

function readResponseBodyEffect(response: Response) {
  return Effect.gen(function* () {
    const text = yield* Effect.tryPromise({
      try: () => response.text(),
      catch: (cause) => platformError("monkeytype.read-response", cause),
    });
    if (!text) return null;
    const decoded = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(text).pipe(
      Effect.result,
    );
    if (decoded._tag === "Success") return decoded.success;
    if (!response.ok) return text;
    return yield* Effect.fail(
      platformError("monkeytype.decode-response", "Monkeytype returned malformed JSON."),
    );
  });
}

function unwrapMonkeytypeData(body: unknown): unknown {
  if (body && typeof body === "object" && "data" in body) return body.data;
  return body;
}

function messageFromBody(body: unknown) {
  if (typeof body === "string") return body;
  if (!body || typeof body !== "object") return null;
  const value = "message" in body ? body.message : "error" in body ? body.error : undefined;
  const fallback = value ?? ("errorMessage" in body ? body.errorMessage : undefined);
  return typeof fallback === "string" && fallback.trim() ? fallback : null;
}

function parseHeaderNumber(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseResetEpochSeconds(value: string | null, nowMs: number) {
  const parsed = parseHeaderNumber(value);
  if (parsed === null) return null;
  if (parsed > 1_000_000_000) return Math.floor(parsed);
  return Math.floor(nowMs / 1000 + parsed);
}
