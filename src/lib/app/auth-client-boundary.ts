import { Effect, Schema } from "effect";

import type {
  GitHubFirmwareAppStatus,
  GitHubFirmwareBuildResponse,
  GitHubFirmwareSyncResponse,
} from "$lib/github-app/types";
import type { MonkeytypeConnectionStatus, MonkeytypeStatusError } from "$lib/monkeytype/types";

const nullableString = Schema.NullOr(Schema.String);
const dateLike = Schema.Union([Schema.String, Schema.DateValid]);
const nullableDateLike = Schema.NullOr(dateLike);

export const AuthClientErrorSchema = Schema.Struct({
  code: Schema.optionalKey(Schema.String),
  message: Schema.optionalKey(Schema.String),
  status: Schema.optionalKey(Schema.Finite),
  statusText: Schema.optionalKey(Schema.String),
});

export interface AuthClientError extends Schema.Schema.Type<typeof AuthClientErrorSchema> {}

export const AuthSessionDataSchema = Schema.NullOr(
  Schema.Struct({
    user: Schema.optionalKey(
      Schema.NullOr(
        Schema.Struct({
          id: Schema.optionalKey(Schema.String),
          name: Schema.optionalKey(nullableString),
          email: Schema.optionalKey(nullableString),
          image: Schema.optionalKey(nullableString),
          githubLogin: Schema.optionalKey(nullableString),
        }),
      ),
    ),
  }),
);

export const AuthRedirectDataSchema = Schema.NullOr(
  Schema.Struct({ url: Schema.optionalKey(Schema.String) }),
);

const MonkeytypeRateLimitSchema = Schema.Struct({
  limit: Schema.NullOr(Schema.Finite),
  remaining: Schema.NullOr(Schema.Finite),
  resetAt: nullableDateLike,
  resetEpochSeconds: Schema.NullOr(Schema.Finite),
  rawReset: nullableDateLike,
});

const MonkeytypeStatusErrorSchema = Schema.Struct({
  code: Schema.String,
  message: Schema.String,
  status: Schema.optionalKey(Schema.Finite),
  retryAt: Schema.optionalKey(nullableDateLike),
  rateLimit: Schema.optionalKey(Schema.NullOr(MonkeytypeRateLimitSchema)),
});

const MonkeytypeSummarySchema = Schema.Struct({
  wpm: Schema.NullOr(Schema.Finite),
  accuracy: Schema.NullOr(Schema.Finite),
  consistency: Schema.NullOr(Schema.Finite),
  tests: Schema.NullOr(Schema.Finite),
  pb: Schema.NullOr(Schema.Finite),
  mode: Schema.String,
  mode2: Schema.String,
  resultCount: Schema.Finite,
  generatedAt: nullableDateLike,
  stale: Schema.Boolean,
  error: Schema.NullOr(MonkeytypeStatusErrorSchema),
});

export const MonkeytypeConnectionStatusSchema = Schema.Struct({
  connected: Schema.Boolean,
  username: nullableString,
  mode: Schema.String,
  mode2: Schema.String,
  summary: Schema.NullOr(MonkeytypeSummarySchema),
  lastSyncedAt: nullableDateLike,
  stale: Schema.Boolean,
  error: Schema.NullOr(MonkeytypeStatusErrorSchema),
});

const GitHubFirmwareAppInstallationSchema = Schema.Struct({
  accountLogin: nullableString,
  accountType: nullableString,
  connectedAt: nullableDateLike,
  installationId: Schema.String,
  repositorySelection: nullableString,
  setupAction: nullableString,
  updatedAt: nullableDateLike,
});

export const GitHubFirmwareAppStatusSchema = Schema.Struct({
  appName: Schema.String,
  appSlug: nullableString,
  configured: Schema.Boolean,
  connected: Schema.Boolean,
  installUrl: nullableString,
  installation: Schema.NullOr(GitHubFirmwareAppInstallationSchema),
  message: nullableString,
  permissions: Schema.Struct({
    actions: Schema.Literals(["read", "write"]),
    administration: Schema.Literals(["write"]),
    contents: Schema.Literals(["write"]),
    metadata: Schema.Literals(["read"]),
    workflows: Schema.Literals(["write"]),
  }),
  state: Schema.Literals(["unconfigured", "signed-out", "not-connected", "pending", "connected"]),
  tokenState: Schema.Literals([
    "stored",
    "not-stored",
    "expired",
    "refresh-expired",
    "unavailable",
  ]),
});

export const GitHubFirmwareAppConnectResponseSchema = Schema.Struct({
  installUrl: Schema.String,
  state: Schema.String,
});

const GitHubFirmwareRepositorySchema = Schema.Struct({
  defaultBranch: Schema.String,
  firmwareFamily: Schema.Literals(["qmk", "zmk"]),
  fullName: Schema.String,
  htmlUrl: nullableString,
  owner: Schema.String,
  private: Schema.Boolean,
  relationship: Schema.optionalKey(Schema.Literals(["adopted", "managed"])),
  repo: Schema.String,
  repositoryKind: Schema.Literals(["qmk-userspace", "zmk-config"]),
  workflowPath: Schema.String,
});

const GitHubFirmwareBranchSchema = Schema.Struct({
  branchName: Schema.String,
  lastCommitSha: nullableString,
  lastRunId: nullableString,
  lastSourceHash: nullableString,
  lastStatus: nullableString,
  sourceSavePointId: nullableString,
  updatedAt: nullableDateLike,
  variantId: Schema.String,
  variantName: Schema.String,
});

export const GitHubFirmwareSyncResponseSchema = Schema.Struct({
  branch: GitHubFirmwareBranchSchema,
  commit: Schema.NullOr(
    Schema.Struct({
      htmlUrl: nullableString,
      sha: Schema.String,
    }),
  ),
  files: Schema.Finite,
  repository: GitHubFirmwareRepositorySchema,
  sourceHash: Schema.String,
  workflowPaths: Schema.mutable(Schema.Array(Schema.String)),
});

export const GitHubFirmwareBuildResponseSchema = Schema.Struct({
  ...GitHubFirmwareSyncResponseSchema.fields,
  build: Schema.Struct({
    htmlUrl: nullableString,
    requestId: Schema.String,
    runId: nullableString,
    status: Schema.String,
  }),
});

export const GitHubFirmwareCleanupResponseSchema = Schema.Struct({
  action: Schema.Literals(["branch", "repository"]),
  branchName: nullableString,
  deleted: Schema.Boolean,
  repositoryFullName: Schema.String,
});

function dateString(value: string | Date | null): string | null {
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeMonkeytypeError(
  error: Schema.Schema.Type<typeof MonkeytypeStatusErrorSchema> | null,
): MonkeytypeStatusError | null {
  if (!error) return null;
  return {
    code: error.code,
    message: error.message,
    ...(error.status === undefined ? {} : { status: error.status }),
    ...(error.retryAt === undefined ? {} : { retryAt: dateString(error.retryAt) }),
    ...(error.rateLimit === undefined
      ? {}
      : {
          rateLimit:
            error.rateLimit === null
              ? null
              : {
                  limit: error.rateLimit.limit,
                  remaining: error.rateLimit.remaining,
                  resetAt: dateString(error.rateLimit.resetAt),
                  resetEpochSeconds: error.rateLimit.resetEpochSeconds,
                  rawReset: dateString(error.rateLimit.rawReset),
                },
        }),
  };
}

function normalizeMonkeytypeConnectionStatus(
  status: Schema.Schema.Type<typeof MonkeytypeConnectionStatusSchema>,
): MonkeytypeConnectionStatus {
  return {
    ...status,
    lastSyncedAt: dateString(status.lastSyncedAt),
    error: normalizeMonkeytypeError(status.error),
    summary:
      status.summary === null
        ? null
        : {
            ...status.summary,
            generatedAt: dateString(status.summary.generatedAt),
            error: normalizeMonkeytypeError(status.summary.error),
          },
  };
}

function normalizeGitHubFirmwareAppStatus(
  status: Schema.Schema.Type<typeof GitHubFirmwareAppStatusSchema>,
): GitHubFirmwareAppStatus {
  return {
    ...status,
    installation:
      status.installation === null
        ? null
        : {
            ...status.installation,
            connectedAt: dateString(status.installation.connectedAt),
            updatedAt: dateString(status.installation.updatedAt),
          },
  };
}

function normalizeGitHubFirmwareSyncResponse(
  response: Schema.Schema.Type<typeof GitHubFirmwareSyncResponseSchema>,
): GitHubFirmwareSyncResponse {
  return {
    ...response,
    branch: {
      ...response.branch,
      updatedAt: dateString(response.branch.updatedAt),
    },
    workflowPaths: [...response.workflowPaths],
  };
}

function normalizeGitHubFirmwareBuildResponse(
  response: Schema.Schema.Type<typeof GitHubFirmwareBuildResponseSchema>,
): GitHubFirmwareBuildResponse {
  return {
    ...normalizeGitHubFirmwareSyncResponse(response),
    build: { ...response.build },
  };
}

export const decodeAuthClientErrorEffect = Schema.decodeUnknownEffect(
  Schema.NullishOr(AuthClientErrorSchema),
);
export const decodeAuthSessionDataEffect = Schema.decodeUnknownEffect(AuthSessionDataSchema);
export const decodeAuthRedirectDataEffect = Schema.decodeUnknownEffect(AuthRedirectDataSchema);
const decodeRawMonkeytypeConnectionStatusEffect = Schema.decodeUnknownEffect(
  MonkeytypeConnectionStatusSchema,
);
const decodeRawGitHubFirmwareAppStatusEffect = Schema.decodeUnknownEffect(
  GitHubFirmwareAppStatusSchema,
);
const decodeRawGitHubFirmwareSyncResponseEffect = Schema.decodeUnknownEffect(
  GitHubFirmwareSyncResponseSchema,
);
const decodeRawGitHubFirmwareBuildResponseEffect = Schema.decodeUnknownEffect(
  GitHubFirmwareBuildResponseSchema,
);

export const decodeMonkeytypeConnectionStatusEffect = (value: unknown) =>
  decodeRawMonkeytypeConnectionStatusEffect(value).pipe(
    Effect.map(normalizeMonkeytypeConnectionStatus),
  );
export const decodeGitHubFirmwareAppStatusEffect = (value: unknown) =>
  decodeRawGitHubFirmwareAppStatusEffect(value).pipe(Effect.map(normalizeGitHubFirmwareAppStatus));
export const decodeGitHubFirmwareAppConnectResponseEffect = Schema.decodeUnknownEffect(
  GitHubFirmwareAppConnectResponseSchema,
);
export const decodeGitHubFirmwareSyncResponseEffect = (value: unknown) =>
  decodeRawGitHubFirmwareSyncResponseEffect(value).pipe(
    Effect.map(normalizeGitHubFirmwareSyncResponse),
  );
export const decodeGitHubFirmwareBuildResponseEffect = (value: unknown) =>
  decodeRawGitHubFirmwareBuildResponseEffect(value).pipe(
    Effect.map(normalizeGitHubFirmwareBuildResponse),
  );
export const decodeGitHubFirmwareCleanupResponseEffect = Schema.decodeUnknownEffect(
  GitHubFirmwareCleanupResponseSchema,
);
