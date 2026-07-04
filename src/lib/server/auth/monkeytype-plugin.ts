import { createAuthEndpoint, sessionMiddleware, APIError } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import * as z from "zod";

import {
  DEFAULT_MONKEYTYPE_MODE,
  DEFAULT_MONKEYTYPE_MODE2,
  MONKEYTYPE_CACHE_TTL_MS,
  MONKEYTYPE_RESULTS_LIMIT,
  type MonkeytypeConnectInput,
  type MonkeytypeConnectionStatus,
  type MonkeytypeRateLimit,
  type MonkeytypeStatusError,
  type MonkeytypeSummary,
} from "$lib/monkeytype/types";
import {
  decryptApeKey,
  encryptApeKey,
  assertValidMonkeytypeSecret,
} from "$lib/server/monkeytype/crypto";
import { MonkeytypeApiClient, MonkeytypeApiError } from "$lib/server/monkeytype/client";
import { deriveMonkeytypeSummary } from "$lib/server/monkeytype/summary";

interface AuthEndpointContext {
  body: unknown;
  context: {
    session?: unknown;
    adapter: unknown;
  };
  json: <T>(body: T) => Response;
}

interface AuthenticatedSession {
  user: {
    id: string;
  };
}

interface BetterAuthAdapter {
  findOne: (args: unknown) => Promise<unknown>;
  create: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
  deleteMany: (args: unknown) => Promise<unknown>;
}

interface MonkeytypeConnectionRow {
  id?: string;
  userId: string;
  apeKeyCiphertext: string;
  apeKeyIv: string;
  username?: string | null;
  mode: string;
  mode2: string;
  summaryJson?: string | null;
  lastSyncedAt?: Date | string | null;
  rateLimitResetAt?: Date | string | null;
  createdAt?: Date | string | null;
  updatedAt?: Date | string | null;
}

export interface MonkeytypePluginOptions {
  secretKey?: string;
  apiClient?: MonkeytypeApiClient;
  nowMs?: () => number;
}

interface SummaryFetchResult {
  summary: MonkeytypeSummary;
  rateLimitResetAt: Date | null;
  lastSyncedAt: Date;
}

const connectBodySchema = z.object({
  apeKey: z.string().optional(),
  username: z.string().optional(),
  mode: z.string().optional(),
  mode2: z.string().optional(),
});

const refreshBodySchema = z.object({
  force: z.boolean().optional(),
});

export const monkeytypeConnectionPluginSchema = {
  monkeytypeConnection: {
    fields: {
      userId: {
        type: "string",
        required: true,
        references: {
          model: "user",
          field: "id",
          onDelete: "cascade",
        },
      },
      apeKeyCiphertext: {
        type: "string",
        required: true,
        returned: false,
      },
      apeKeyIv: {
        type: "string",
        required: true,
        returned: false,
      },
      username: {
        type: "string",
        required: false,
      },
      mode: {
        type: "string",
        required: true,
      },
      mode2: {
        type: "string",
        required: true,
      },
      summaryJson: {
        type: "string",
        required: false,
      },
      lastSyncedAt: {
        type: "date",
        required: false,
      },
      rateLimitResetAt: {
        type: "date",
        required: false,
      },
      createdAt: {
        type: "date",
        required: true,
      },
      updatedAt: {
        type: "date",
        required: true,
      },
    },
  },
} as const satisfies BetterAuthPlugin["schema"];

export function monkeytypePlugin(options: MonkeytypePluginOptions = {}): BetterAuthPlugin {
  const nowMs = options.nowMs ?? (() => new Date().getTime());
  const apiClient = options.apiClient ?? new MonkeytypeApiClient({ nowMs });

  return {
    id: "monkeytype",
    schema: monkeytypeConnectionPluginSchema,
    endpoints: {
      monkeytypeConnect: createAuthEndpoint(
        "/monkeytype/connect",
        {
          method: "POST",
          body: connectBodySchema,
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const authCtx = asAuthEndpointContext(ctx);
          const session = requireSession(authCtx);
          const body = normalizeConnectInput(authCtx.body as MonkeytypeConnectInput);
          const existing = await findConnection(authCtx, session.user.id);
          const secretKey = assertValidMonkeytypeSecret(options.secretKey);
          const apeKey = await resolveApeKey(body.apeKey, existing, secretKey);
          const mode = body.mode ?? existing?.mode ?? DEFAULT_MONKEYTYPE_MODE;
          const mode2 = body.mode2 ?? existing?.mode2 ?? DEFAULT_MONKEYTYPE_MODE2;
          const username = body.username ?? existing?.username ?? null;
          const previous = parseSummary(existing?.summaryJson);

          await validateUsername(apiClient, username);
          const fetched = await fetchSummary({
            apiClient,
            apeKey,
            mode,
            mode2,
            nowMs,
            previous,
            allowStaleOnRateLimit: false,
          });
          const encrypted = body.apeKey
            ? await encryptApeKey(apeKey, secretKey)
            : {
                ciphertext: existing?.apeKeyCiphertext ?? "",
                iv: existing?.apeKeyIv ?? "",
              };
          const updated = await upsertConnection(authCtx, session.user.id, {
            apeKeyCiphertext: encrypted.ciphertext,
            apeKeyIv: encrypted.iv,
            username,
            mode,
            mode2,
            summaryJson: JSON.stringify(fetched.summary),
            lastSyncedAt: fetched.lastSyncedAt,
            rateLimitResetAt: fetched.rateLimitResetAt,
          });

          return ctx.json(connectionToDto(updated, nowMs()));
        },
      ),
      monkeytypeDisconnect: createAuthEndpoint(
        "/monkeytype/disconnect",
        {
          method: "POST",
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const authCtx = asAuthEndpointContext(ctx);
          const session = requireSession(authCtx);
          await adapterFor(authCtx).deleteMany({
            model: "monkeytypeConnection",
            where: [{ field: "userId", value: session.user.id }],
          });
          return ctx.json(disconnectedDto());
        },
      ),
      monkeytypeStatus: createAuthEndpoint(
        "/monkeytype/status",
        {
          method: "GET",
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const authCtx = asAuthEndpointContext(ctx);
          const session = requireSession(authCtx);
          const connection = await findConnection(authCtx, session.user.id);
          return ctx.json(connectionToDto(connection, nowMs()));
        },
      ),
      monkeytypeRefresh: createAuthEndpoint(
        "/monkeytype/refresh",
        {
          method: "POST",
          body: refreshBodySchema,
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const authCtx = asAuthEndpointContext(ctx);
          const session = requireSession(authCtx);
          const connection = await findConnection(authCtx, session.user.id);
          if (!connection) return ctx.json(disconnectedDto());

          const current = nowMs();
          const force = (authCtx.body as { force?: boolean }).force === true;
          const status = connectionToDto(connection, current);
          if (!force && !status.stale) return ctx.json(status);

          const resetMs = dateMs(connection.rateLimitResetAt);
          if (!force && resetMs !== null && resetMs > current) {
            return ctx.json(
              withStatusError(status, {
                code: "MONKEYTYPE_RATE_LIMIT_COOLDOWN",
                message: "Monkeytype refresh is waiting for the current rate-limit window.",
                retryAt: new Date(resetMs).toISOString(),
              }),
            );
          }

          const secretKey = assertValidMonkeytypeSecret(options.secretKey);
          const apeKey = await decryptApeKey(
            {
              ciphertext: connection.apeKeyCiphertext,
              iv: connection.apeKeyIv,
            },
            secretKey,
          );
          const previous = parseSummary(connection.summaryJson);

          try {
            const fetched = await fetchSummary({
              apiClient,
              apeKey,
              mode: connection.mode,
              mode2: connection.mode2,
              nowMs,
              previous,
              allowStaleOnRateLimit: true,
            });
            const updated = await updateConnection(authCtx, session.user.id, {
              summaryJson: JSON.stringify(fetched.summary),
              lastSyncedAt: fetched.lastSyncedAt,
              rateLimitResetAt: fetched.rateLimitResetAt,
            });
            return ctx.json(connectionToDto(updated, current));
          } catch (error) {
            const statusError = toStatusError(error);
            if (!statusError) throw error;
            const stale = previous
              ? {
                  ...previous,
                  stale: true,
                  error: statusError,
                }
              : null;
            const updated = await updateConnection(authCtx, session.user.id, {
              summaryJson: stale ? JSON.stringify(stale) : connection.summaryJson,
              rateLimitResetAt: retryDate(statusError),
            });
            return ctx.json(withStatusError(connectionToDto(updated, current), statusError));
          }
        },
      ),
    },
  };
}

function asAuthEndpointContext(ctx: unknown) {
  return ctx as AuthEndpointContext;
}

function requireSession(ctx: AuthEndpointContext) {
  const session = ctx.context.session as Partial<AuthenticatedSession> | undefined;
  if (!session?.user?.id) {
    throw APIError.from("UNAUTHORIZED", {
      code: "MONKEYTYPE_SESSION_REQUIRED",
      message: "Sign in before using the Monkeytype integration.",
    });
  }
  return {
    user: {
      id: session.user.id,
    },
  };
}

async function findConnection(ctx: AuthEndpointContext, userId: string) {
  return (await adapterFor(ctx).findOne({
    model: "monkeytypeConnection",
    where: [{ field: "userId", value: userId }],
  })) as MonkeytypeConnectionRow | null;
}

async function upsertConnection(
  ctx: AuthEndpointContext,
  userId: string,
  data: Partial<MonkeytypeConnectionRow>,
) {
  const existing = await findConnection(ctx, userId);
  const now = new Date();
  if (existing) {
    return updateConnection(ctx, userId, {
      ...data,
      updatedAt: now,
    });
  }

  return (await adapterFor(ctx).create({
    model: "monkeytypeConnection",
    data: {
      userId,
      mode: DEFAULT_MONKEYTYPE_MODE,
      mode2: DEFAULT_MONKEYTYPE_MODE2,
      ...data,
      createdAt: now,
      updatedAt: now,
    },
  })) as MonkeytypeConnectionRow;
}

async function updateConnection(
  ctx: AuthEndpointContext,
  userId: string,
  data: Partial<MonkeytypeConnectionRow>,
) {
  return (await adapterFor(ctx).update({
    model: "monkeytypeConnection",
    where: [{ field: "userId", value: userId }],
    update: {
      ...data,
      updatedAt: data.updatedAt ?? new Date(),
    },
  })) as MonkeytypeConnectionRow;
}

function adapterFor(ctx: AuthEndpointContext) {
  return ctx.context.adapter as BetterAuthAdapter;
}

async function resolveApeKey(
  apeKey: string | undefined,
  existing: MonkeytypeConnectionRow | null,
  secretKey: string,
) {
  if (apeKey) return apeKey;
  if (!existing) {
    throw APIError.from("BAD_REQUEST", {
      code: "MONKEYTYPE_APE_KEY_REQUIRED",
      message: "Enter a Monkeytype ApeKey to connect this data source.",
    });
  }
  return decryptApeKey(
    {
      ciphertext: existing.apeKeyCiphertext,
      iv: existing.apeKeyIv,
    },
    secretKey,
  );
}

async function validateUsername(apiClient: MonkeytypeApiClient, username: string | null) {
  if (!username) return;
  try {
    await apiClient.publicProfile(username);
  } catch (error) {
    throwApiError(error);
  }
}

async function fetchSummary({
  apiClient,
  apeKey,
  mode,
  mode2,
  nowMs,
  previous,
  allowStaleOnRateLimit,
}: {
  apiClient: MonkeytypeApiClient;
  apeKey: string;
  mode: string;
  mode2: string;
  nowMs: () => number;
  previous: MonkeytypeSummary | null;
  allowStaleOnRateLimit: boolean;
}): Promise<SummaryFetchResult> {
  const generatedAt = new Date(nowMs()).toISOString();
  const stats = await apiClient.stats(apeKey).catch((error: unknown) => {
    if (allowStaleOnRateLimit && previous && isRateLimited(error)) return null;
    throwApiError(error);
  });
  const personalBests = await apiClient
    .personalBests(apeKey, mode, mode2)
    .catch((error: unknown) => {
      if (allowStaleOnRateLimit && previous && isRateLimited(error)) return null;
      throwApiError(error);
    });

  let results: Awaited<ReturnType<MonkeytypeApiClient["results"]>> | null = null;
  let resultError: MonkeytypeStatusError | null = null;
  try {
    results = await apiClient.results(apeKey, MONKEYTYPE_RESULTS_LIMIT);
  } catch (error) {
    if (!isRateLimited(error)) throwApiError(error);
    resultError = toStatusError(error);
  }

  if ((!stats || !personalBests) && previous) {
    const rateLimitError =
      resultError ??
      ({
        code: "MONKEYTYPE_APE_KEY_RATE_LIMITED",
        message: "Monkeytype ApeKey quota is temporarily exhausted.",
      } satisfies MonkeytypeStatusError);
    return {
      summary: {
        ...previous,
        stale: true,
        error: rateLimitError,
      },
      rateLimitResetAt: latestRateLimitReset([results?.rateLimit, rateLimitError.rateLimit]),
      lastSyncedAt: new Date(nowMs()),
    };
  }

  const summary = deriveMonkeytypeSummary(
    {
      stats: stats?.data,
      personalBests: personalBests?.data,
      results: results?.data,
    },
    {
      mode,
      mode2,
      generatedAt,
      previous,
      stale: resultError !== null,
      error: resultError,
    },
  );

  return {
    summary,
    rateLimitResetAt: latestRateLimitReset([
      stats?.rateLimit,
      personalBests?.rateLimit,
      results?.rateLimit,
      resultError?.rateLimit,
    ]),
    lastSyncedAt: new Date(nowMs()),
  };
}

function normalizeConnectInput(
  body: MonkeytypeConnectInput,
): Required<Pick<MonkeytypeConnectInput, "mode" | "mode2">> &
  Pick<MonkeytypeConnectInput, "apeKey" | "username"> {
  return {
    apeKey: cleanOptional(body.apeKey),
    username: normalizeUsername(body.username),
    mode: cleanOptional(body.mode) ?? DEFAULT_MONKEYTYPE_MODE,
    mode2: cleanOptional(body.mode2) ?? DEFAULT_MONKEYTYPE_MODE2,
  };
}

function normalizeUsername(username: string | undefined) {
  const value = cleanOptional(username);
  if (!value) return undefined;
  return value.startsWith("@") ? value.slice(1).trim() || undefined : value;
}

function cleanOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function connectionToDto(
  connection: MonkeytypeConnectionRow | null | undefined,
  nowMsValue: number,
): MonkeytypeConnectionStatus {
  if (!connection) return disconnectedDto();
  const summary = parseSummary(connection.summaryJson);
  const lastSyncedMs = dateMs(connection.lastSyncedAt);
  const stale =
    summary?.stale ??
    (lastSyncedMs === null || nowMsValue - lastSyncedMs >= MONKEYTYPE_CACHE_TTL_MS);
  const summaryError = summary?.error ?? null;

  return {
    connected: true,
    username: connection.username ?? null,
    mode: connection.mode || DEFAULT_MONKEYTYPE_MODE,
    mode2: connection.mode2 || DEFAULT_MONKEYTYPE_MODE2,
    summary,
    lastSyncedAt: dateIso(connection.lastSyncedAt),
    stale,
    error: summaryError,
  };
}

function disconnectedDto(): MonkeytypeConnectionStatus {
  return {
    connected: false,
    username: null,
    mode: DEFAULT_MONKEYTYPE_MODE,
    mode2: DEFAULT_MONKEYTYPE_MODE2,
    summary: null,
    lastSyncedAt: null,
    stale: false,
    error: null,
  };
}

function withStatusError(status: MonkeytypeConnectionStatus, error: MonkeytypeStatusError) {
  return {
    ...status,
    stale: status.connected,
    error,
    summary: status.summary
      ? {
          ...status.summary,
          stale: true,
          error,
        }
      : status.summary,
  };
}

function parseSummary(summaryJson: string | null | undefined): MonkeytypeSummary | null {
  if (!summaryJson) return null;
  try {
    return JSON.parse(summaryJson) as MonkeytypeSummary;
  } catch {
    return null;
  }
}

function throwApiError(error: unknown): never {
  const statusError = toStatusError(error);
  if (!statusError) {
    throw APIError.from("BAD_GATEWAY", {
      code: "MONKEYTYPE_REQUEST_FAILED",
      message: "Monkeytype request failed.",
    });
  }

  const status = statusForError(statusError);
  throw APIError.from(status, {
    code: statusError.code,
    message: statusError.message,
  });
}

function toStatusError(error: unknown): MonkeytypeStatusError | null {
  if (error instanceof MonkeytypeApiError) return error.toStatusError();
  if (error instanceof Error) {
    return {
      code: "MONKEYTYPE_REQUEST_FAILED",
      message: error.message || "Monkeytype request failed.",
    };
  }
  return null;
}

function statusForError(error: MonkeytypeStatusError) {
  if (error.code === "MONKEYTYPE_APE_KEY_RATE_LIMITED") return "TOO_MANY_REQUESTS";
  if (error.status === 401 || error.status === 403) return "UNAUTHORIZED";
  if (error.status === 404) return "NOT_FOUND";
  if (error.status && error.status >= 500) return "BAD_GATEWAY";
  return "BAD_REQUEST";
}

function isRateLimited(error: unknown) {
  return error instanceof MonkeytypeApiError && error.code === "MONKEYTYPE_APE_KEY_RATE_LIMITED";
}

function latestRateLimitReset(limits: Array<MonkeytypeRateLimit | null | undefined>) {
  const resetTimes = limits
    .map((limit) => dateMs(limit?.resetAt))
    .filter((value): value is number => value !== null);
  if (resetTimes.length === 0) return null;
  return new Date(Math.max(...resetTimes));
}

function retryDate(error: MonkeytypeStatusError) {
  const retryMs = dateMs(error.retryAt);
  return retryMs === null ? null : new Date(retryMs);
}

function dateMs(value: Date | string | null | undefined) {
  if (!value) return null;
  const millis = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(millis) ? millis : null;
}

function dateIso(value: Date | string | null | undefined) {
  const millis = dateMs(value);
  return millis === null ? null : new Date(millis).toISOString();
}
