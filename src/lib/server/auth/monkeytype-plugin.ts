import { createAuthEndpoint, sessionMiddleware, APIError } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import { Effect, Schedule, Schema } from "effect";
import * as z from "zod";

import {
  DEFAULT_MONKEYTYPE_MODE,
  DEFAULT_MONKEYTYPE_MODE2,
  MONKEYTYPE_CACHE_TTL_MS,
  MONKEYTYPE_RESULTS_LIMIT,
  MonkeytypeSummarySchema,
  type MonkeytypeConnectInput,
  type MonkeytypeConnectionStatus,
  type MonkeytypeRateLimit,
  type MonkeytypeStatusError,
  type MonkeytypeSummary,
} from "$lib/monkeytype/types";
import {
  assertValidMonkeytypeSecret,
  decryptApeKeyEffect,
  encryptApeKeyEffect,
} from "$lib/server/monkeytype/crypto";
import { MonkeytypeApiClient, MonkeytypeApiError } from "$lib/server/monkeytype/client";
import { deriveMonkeytypeSummary } from "$lib/server/monkeytype/summary";
import { BoundaryDecodeError, PlatformError, platformError } from "$lib/effect/errors";
import { runWorkerEffect } from "$lib/effect/worker-runtime";

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
  onResultsSynced?: (input: {
    userId: string;
    results: unknown;
  }) => Effect.Effect<number, PlatformError | BoundaryDecodeError>;
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
        (ctx) =>
          runWorkerEffect(
            "auth.monkeytype.connect",
            Effect.gen(function* () {
              const authCtx = asAuthEndpointContext(ctx);
              const session = requireSession(authCtx);
              const body = normalizeConnectInput(authCtx.body as MonkeytypeConnectInput);
              const existing = yield* findConnectionEffect(authCtx, session.user.id);
              const secretKey = monkeytypeSecretFor(options.secretKey);
              const apeKey = yield* resolveApeKeyEffect(body.apeKey, existing, secretKey);
              const mode = body.mode ?? existing?.mode ?? DEFAULT_MONKEYTYPE_MODE;
              const mode2 = body.mode2 ?? existing?.mode2 ?? DEFAULT_MONKEYTYPE_MODE2;
              const username = body.username ?? existing?.username ?? null;
              const previous = yield* parseSummaryEffect(existing?.summaryJson);

              yield* validateUsernameEffect(apiClient, username);
              const fetched = yield* fetchSummaryEffect({
                apiClient,
                apeKey,
                mode,
                mode2,
                nowMs,
                previous,
              });
              const encrypted = body.apeKey
                ? yield* encryptApeKeyEffect(apeKey, secretKey)
                : {
                    ciphertext: existing?.apeKeyCiphertext ?? "",
                    iv: existing?.apeKeyIv ?? "",
                  };
              const updated = yield* upsertConnectionEffect(authCtx, session.user.id, {
                apeKeyCiphertext: encrypted.ciphertext,
                apeKeyIv: encrypted.iv,
                username,
                mode,
                mode2,
                summaryJson: JSON.stringify(fetched.summary),
                lastSyncedAt: fetched.lastSyncedAt,
                rateLimitResetAt: fetched.rateLimitResetAt,
              });
              yield* syncResultsEffect(options.onResultsSynced, session.user.id, fetched.results);

              return ctx.json(yield* connectionToDtoEffect(updated, nowMs()));
            }),
          ),
      ),
      monkeytypeDisconnect: createAuthEndpoint(
        "/monkeytype/disconnect",
        {
          method: "POST",
          use: [sessionMiddleware],
        },
        (ctx) =>
          runWorkerEffect(
            "auth.monkeytype.disconnect",
            Effect.gen(function* () {
              const authCtx = asAuthEndpointContext(ctx);
              const session = requireSession(authCtx);
              yield* promiseEffect("monkeytype.delete-connection", () =>
                adapterFor(authCtx).deleteMany({
                  model: "monkeytypeConnection",
                  where: [{ field: "userId", value: session.user.id }],
                }),
              );
              return ctx.json(disconnectedDto());
            }),
          ),
      ),
      monkeytypeStatus: createAuthEndpoint(
        "/monkeytype/status",
        {
          method: "GET",
          use: [sessionMiddleware],
        },
        (ctx) =>
          runWorkerEffect(
            "auth.monkeytype.status",
            Effect.gen(function* () {
              const authCtx = asAuthEndpointContext(ctx);
              const session = requireSession(authCtx);
              const connection = yield* findConnectionEffect(authCtx, session.user.id);
              return ctx.json(yield* connectionToDtoEffect(connection, nowMs()));
            }),
          ),
      ),
      monkeytypeRefresh: createAuthEndpoint(
        "/monkeytype/refresh",
        {
          method: "POST",
          body: refreshBodySchema,
          use: [sessionMiddleware],
        },
        (ctx) =>
          runWorkerEffect(
            "auth.monkeytype.refresh",
            Effect.gen(function* () {
              const authCtx = asAuthEndpointContext(ctx);
              const session = requireSession(authCtx);
              const connection = yield* findConnectionEffect(authCtx, session.user.id);
              if (!connection) return ctx.json(disconnectedDto());

              const current = nowMs();
              const force = (authCtx.body as { force?: boolean }).force === true;
              const status = yield* connectionToDtoEffect(connection, current);
              if (!force && !status.stale) return ctx.json(status);

              const resetMs = dateMs(connection.rateLimitResetAt);
              if (!force && resetMs !== null && resetMs > current) {
                return yield* Effect.fail(
                  APIError.from("TOO_MANY_REQUESTS", {
                    code: "MONKEYTYPE_RATE_LIMIT_COOLDOWN",
                    message: `Monkeytype refresh is rate limited until ${new Date(resetMs).toISOString()}.`,
                  }),
                );
              }

              const secretKey = monkeytypeSecretFor(options.secretKey);
              const apeKey = yield* decryptApeKeyEffect(
                {
                  ciphertext: connection.apeKeyCiphertext,
                  iv: connection.apeKeyIv,
                },
                secretKey,
              );
              const previous = yield* parseSummaryEffect(connection.summaryJson);

              const fetched = yield* fetchSummaryEffect({
                apiClient,
                apeKey,
                mode: connection.mode,
                mode2: connection.mode2,
                nowMs,
                previous,
              });
              const updated = yield* updateConnectionEffect(authCtx, session.user.id, {
                summaryJson: JSON.stringify(fetched.summary),
                lastSyncedAt: fetched.lastSyncedAt,
                rateLimitResetAt: fetched.rateLimitResetAt,
              });
              yield* syncResultsEffect(options.onResultsSynced, session.user.id, fetched.results);
              return ctx.json(yield* connectionToDtoEffect(updated, current));
            }),
          ),
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

function monkeytypeSecretFor(secretKey: string | null | undefined) {
  try {
    return assertValidMonkeytypeSecret(secretKey);
  } catch {
    throw APIError.from("SERVICE_UNAVAILABLE", {
      code: "MONKEYTYPE_SECRET_NOT_CONFIGURED",
      message:
        "Monkeytype encryption is not configured. Set MONKEYTYPE_SECRET_KEY to a base64-encoded 32-byte key and restart the Worker.",
    });
  }
}

function findConnectionEffect(ctx: AuthEndpointContext, userId: string) {
  return promiseEffect("monkeytype.find-connection", () =>
    adapterFor(ctx).findOne({
      model: "monkeytypeConnection",
      where: [{ field: "userId", value: userId }],
    }),
  ).pipe(Effect.map((row) => row as MonkeytypeConnectionRow | null));
}

function upsertConnectionEffect(
  ctx: AuthEndpointContext,
  userId: string,
  data: Partial<MonkeytypeConnectionRow>,
) {
  return Effect.gen(function* () {
    const existing = yield* findConnectionEffect(ctx, userId);
    const now = new Date();
    if (existing) {
      return yield* updateConnectionEffect(ctx, userId, {
        ...data,
        updatedAt: now,
      });
    }

    return yield* promiseEffect("monkeytype.create-connection", () =>
      adapterFor(ctx).create({
        model: "monkeytypeConnection",
        data: {
          userId,
          mode: DEFAULT_MONKEYTYPE_MODE,
          mode2: DEFAULT_MONKEYTYPE_MODE2,
          ...data,
          createdAt: now,
          updatedAt: now,
        },
      }),
    ).pipe(Effect.map((row) => row as MonkeytypeConnectionRow));
  });
}

function updateConnectionEffect(
  ctx: AuthEndpointContext,
  userId: string,
  data: Partial<MonkeytypeConnectionRow>,
) {
  return promiseEffect("monkeytype.update-connection", () =>
    adapterFor(ctx).update({
      model: "monkeytypeConnection",
      where: [{ field: "userId", value: userId }],
      update: {
        ...data,
        updatedAt: data.updatedAt ?? new Date(),
      },
    }),
  ).pipe(Effect.map((row) => row as MonkeytypeConnectionRow));
}

function adapterFor(ctx: AuthEndpointContext) {
  return ctx.context.adapter as BetterAuthAdapter;
}

function resolveApeKeyEffect(
  apeKey: string | undefined,
  existing: MonkeytypeConnectionRow | null,
  secretKey: string,
) {
  if (apeKey) return Effect.succeed(apeKey);
  if (!existing) {
    return Effect.fail(
      APIError.from("BAD_REQUEST", {
        code: "MONKEYTYPE_APE_KEY_REQUIRED",
        message: "Enter a Monkeytype ApeKey to connect this data source.",
      }),
    );
  }
  return decryptApeKeyEffect(
    {
      ciphertext: existing.apeKeyCiphertext,
      iv: existing.apeKeyIv,
    },
    secretKey,
  );
}

function validateUsernameEffect(apiClient: MonkeytypeApiClient, username: string | null) {
  if (!username) return Effect.void;
  return apiClient.publicProfileEffect(username).pipe(Effect.mapError(apiErrorFrom), Effect.asVoid);
}

function syncResultsEffect(
  onResultsSynced: MonkeytypePluginOptions["onResultsSynced"],
  userId: string,
  results: unknown,
) {
  if (!onResultsSynced) return Effect.void;

  const schedule = Schedule.exponential("250 millis").pipe(
    Schedule.jittered,
    Schedule.upTo({ times: 3 }),
  );
  return onResultsSynced({ userId, results }).pipe(
    Effect.retry({
      schedule,
      while: (error) => error._tag === "PlatformError",
    }),
    Effect.mapError(() =>
      APIError.from("BAD_GATEWAY", {
        code: "MONKEYTYPE_RESULTS_SYNC_FAILED",
        message: "Monkeytype results could not be stored for correlation.",
      }),
    ),
    Effect.asVoid,
  );
}

function fetchSummaryEffect({
  apiClient,
  apeKey,
  mode,
  mode2,
  nowMs,
  previous,
}: {
  apiClient: MonkeytypeApiClient;
  apeKey: string;
  mode: string;
  mode2: string;
  nowMs: () => number;
  previous: MonkeytypeSummary | null;
}) {
  return Effect.gen(function* () {
    const generatedAt = new Date(nowMs()).toISOString();
    const [stats, personalBests, results] = yield* Effect.all(
      [
        apiClient.statsEffect(apeKey).pipe(Effect.mapError(apiErrorFrom)),
        apiClient.personalBestsEffect(apeKey, mode, mode2).pipe(Effect.mapError(apiErrorFrom)),
        apiClient
          .resultsEffect(apeKey, MONKEYTYPE_RESULTS_LIMIT)
          .pipe(Effect.mapError(apiErrorFrom)),
      ],
      { concurrency: 3 },
    );
    const summary = deriveMonkeytypeSummary(
      {
        stats: stats.data,
        personalBests: personalBests.data,
        results: results.data,
      },
      {
        mode,
        mode2,
        generatedAt,
        previous,
        stale: false,
        error: null,
      },
    );
    return {
      summary,
      results: results.data,
      rateLimitResetAt: latestRateLimitReset([
        stats.rateLimit,
        personalBests.rateLimit,
        results.rateLimit,
      ]),
      lastSyncedAt: new Date(nowMs()),
    };
  });
}

function promiseEffect<A>(operation: string, run: () => PromiseLike<A>) {
  return Effect.tryPromise({
    try: run,
    catch: (cause) => platformError(operation, cause),
  }).pipe(Effect.withSpan(operation));
}

function apiErrorFrom(error: unknown) {
  const statusError = toStatusError(error);
  if (!statusError) {
    return APIError.from("BAD_GATEWAY", {
      code: "MONKEYTYPE_REQUEST_FAILED",
      message: "Monkeytype request failed.",
    });
  }
  return APIError.from(statusForError(statusError), {
    code: statusError.code,
    message: statusError.message,
  });
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

function connectionToDtoEffect(
  connection: MonkeytypeConnectionRow | null | undefined,
  nowMsValue: number,
) {
  if (!connection) return Effect.succeed(disconnectedDto());
  return Effect.map(
    parseSummaryEffect(connection.summaryJson),
    (summary): MonkeytypeConnectionStatus => {
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
    },
  );
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

function parseSummaryEffect(summaryJson: string | null | undefined) {
  if (!summaryJson) return Effect.succeed<MonkeytypeSummary | null>(null);
  return Schema.decodeUnknownEffect(Schema.fromJsonString(MonkeytypeSummarySchema))(
    summaryJson,
  ).pipe(
    Effect.mapError(
      (cause) =>
        new BoundaryDecodeError({
          operation: "monkeytype.decode-summary",
          message: `Stored Monkeytype summary did not match its contract: ${String(cause)}`,
          cause,
        }),
    ),
  );
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

function latestRateLimitReset(limits: Array<MonkeytypeRateLimit | null | undefined>) {
  const resetTimes = limits
    .map((limit) => dateMs(limit?.resetAt))
    .filter((value): value is number => value !== null);
  if (resetTimes.length === 0) return null;
  return new Date(Math.max(...resetTimes));
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
