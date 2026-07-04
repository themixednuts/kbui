import type { MonkeytypeRateLimit, MonkeytypeStatusError } from "$lib/monkeytype/types";

export const MONKEYTYPE_API_BASE_URL = "https://api.monkeytype.com";

export type MonkeytypeFetch = typeof fetch;

export interface MonkeytypeResponse<T> {
  data: T;
  rateLimit: MonkeytypeRateLimit;
}

export class MonkeytypeApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly rateLimit: MonkeytypeRateLimit;

  constructor(error: MonkeytypeStatusError & { status: number; rateLimit: MonkeytypeRateLimit }) {
    super(error.message);
    this.name = "MonkeytypeApiError";
    this.code = error.code;
    this.status = error.status;
    this.rateLimit = error.rateLimit;
  }

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

  constructor(options: MonkeytypeApiClientOptions = {}) {
    this.#fetchImpl = options.fetchImpl ?? fetch;
    this.#nowMs = options.nowMs ?? (() => new Date().getTime());
  }

  stats(apeKey: string): Promise<MonkeytypeResponse<unknown>> {
    return this.#request("/users/stats", { apeKey });
  }

  personalBests(apeKey: string, mode: string, mode2: string): Promise<MonkeytypeResponse<unknown>> {
    const params = new URLSearchParams({ mode, mode2 });
    return this.#request(`/users/personalBests?${params}`, { apeKey });
  }

  results(apeKey: string, limit: number): Promise<MonkeytypeResponse<unknown>> {
    const params = new URLSearchParams({ limit: String(limit), offset: "0" });
    return this.#request(`/results?${params}`, { apeKey });
  }

  publicProfile(username: string): Promise<MonkeytypeResponse<unknown>> {
    const params = new URLSearchParams({ isUid: "false" });
    return this.#request(`/users/${encodeURIComponent(username)}/profile?${params}`);
  }

  async #request<T>(
    path: string,
    options: {
      apeKey?: string;
    } = {},
  ): Promise<MonkeytypeResponse<T>> {
    const headers = new Headers({ accept: "application/json" });
    if (options.apeKey) headers.set("authorization", `ApeKey ${options.apeKey}`);

    const response = await this.#fetchImpl(`${MONKEYTYPE_API_BASE_URL}${path}`, {
      headers,
      method: "GET",
    });
    const rateLimit = readMonkeytypeRateLimit(response.headers, this.#nowMs());
    const body = await readResponseBody(response);

    if (!response.ok) {
      throw monkeytypeErrorFromResponse(response.status, body, rateLimit);
    }

    return {
      data: unwrapMonkeytypeData<T>(body),
      rateLimit,
    };
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
    retryAt: rateLimit.resetAt,
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

async function readResponseBody(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function unwrapMonkeytypeData<T>(body: unknown): T {
  if (body && typeof body === "object" && "data" in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

function messageFromBody(body: unknown) {
  if (typeof body === "string") return body;
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  const value = record.message ?? record.error ?? record.errorMessage;
  return typeof value === "string" && value.trim() ? value : null;
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
