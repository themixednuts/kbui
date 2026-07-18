import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import { Effect, Schema } from "effect";
import * as z from "zod";

import { runWorkerEffect } from "$lib/effect/worker-runtime";
import { platformError, type PlatformError } from "$lib/effect/errors";
import {
  releaseFlagKeys,
  requireBooleanReleaseFlag,
  type BooleanReleaseFlagBinding,
} from "$lib/server/release-flags";

import {
  GitHubFirmwareSyncInputSchema,
  type GitHubFirmwareAppConnectResponse,
  type GitHubFirmwareAppInstallation,
  type GitHubFirmwareAppStatus,
  type GitHubFirmwareArtifactDownloadInput,
  type GitHubFirmwareArtifactDownloadResponse,
  type GitHubFirmwareBuildResponse,
  type GitHubFirmwareCleanupInput,
  type GitHubFirmwareCleanupResponse,
  type GitHubFirmwareBranchDto,
  type GitHubFirmwareRepositoryDto,
  type GitHubFirmwareSyncInput,
  type GitHubFirmwareSyncResponse,
  type GitHubFirmwareSourceBundleInput,
} from "$lib/github-app/types";
import {
  deriveFirmwareGitHubRepository,
  firmwareGitHubBranchForVariant,
  firmwareGitHubVariantForProfile,
  firmwareSourceBundleToGitHubUpserts,
  type FirmwareGitHubDesiredRepository,
} from "$lib/keyboard/firmware-github";
import type { FirmwareGeneratedFile, FirmwareSourceBundle } from "$lib/keyboard/firmware-source";
import {
  disconnectedGitHubFirmwareAppStatus,
  githubFirmwareAppAuthorizeUrl,
  githubFirmwareAppConfigFromEnv,
  githubFirmwareAppInstallUrl,
  githubFirmwareAppSettingsPath,
  type GitHubFirmwareAppEnv,
} from "$lib/server/github-app/config";
import {
  GitHubAppOAuthClient,
  type GitHubAppUserInstallation,
  type GitHubAppUserToken,
} from "$lib/server/github-app/oauth";
import {
  decryptGitHubAppUserAccessTokenEffect,
  decryptGitHubAppUserRefreshTokenEffect,
  encryptGitHubAppUserTokenEffect,
  githubAppUserTokenSecretFor,
  githubAppUserTokenSecretsFor,
} from "$lib/server/github-app/user-token-store";
import {
  GitHubAppInstallationTokenClient,
  githubAppInstallationAuthConfigFromEnv,
} from "$lib/server/github-app/installation-token";
import { GitHubRestClient } from "$lib/server/github/client";

interface AuthEndpointContext {
  context: {
    session?: unknown;
    adapter: unknown;
  };
  body?: unknown;
  json: <T extends object | null>(body: T) => T | Promise<T>;
  query?: unknown;
  request?: Request;
  redirect: (url: string) => unknown;
}

interface AuthenticatedSession {
  user: {
    id: string;
  };
}

interface BetterAuthAdapter {
  create: (args: unknown) => Promise<unknown>;
  deleteMany: (args: unknown) => Promise<unknown>;
  findOne: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
}

export interface GitHubRestClientLike {
  createCommit: GitHubRestClient["createCommit"];
  createRef: GitHubRestClient["createRef"];
  createRepositoryForAuthenticatedUser: GitHubRestClient["createRepositoryForAuthenticatedUser"];
  createTree: GitHubRestClient["createTree"];
  deleteRef: GitHubRestClient["deleteRef"];
  deleteRepository: GitHubRestClient["deleteRepository"];
  dispatchWorkflow: GitHubRestClient["dispatchWorkflow"];
  downloadArtifactZip: GitHubRestClient["downloadArtifactZip"];
  getContentMetadata: GitHubRestClient["getContentMetadata"];
  getCommit: GitHubRestClient["getCommit"];
  getRef: GitHubRestClient["getRef"];
  getRepository: GitHubRestClient["getRepository"];
  listWorkflowRunArtifacts: GitHubRestClient["listWorkflowRunArtifacts"];
  putFileContents: GitHubRestClient["putFileContents"];
  updateRef: GitHubRestClient["updateRef"];
}

interface GitHubAppInstallationTokenClientLike {
  createInstallationAccessToken: GitHubAppInstallationTokenClient["createInstallationAccessToken"];
}

interface GitHubFirmwareAppConnectionRow {
  accountLogin?: string | null;
  accountType?: string | null;
  connectedAt?: Date | string | null;
  installationId: string;
  repositorySelection?: string | null;
  setupAction?: string | null;
  targetType?: string | null;
  updatedAt?: Date | string | null;
  userAccessTokenCiphertext?: string | null;
  userAccessTokenExpiresAt?: Date | string | null;
  userAccessTokenIv?: string | null;
  userRefreshTokenCiphertext?: string | null;
  userRefreshTokenExpiresAt?: Date | string | null;
  userRefreshTokenIv?: string | null;
  userTokenType?: string | null;
  userId: string;
}

interface GitHubFirmwareAppStateRow {
  createdAt?: Date | string | null;
  expiresAt?: Date | string | null;
  state: string;
  updatedAt?: Date | string | null;
  userId: string;
}

interface GitHubFirmwareRepositoryRow {
  createdAt?: Date | string | null;
  defaultBranch: string;
  firmwareFamily: "qmk" | "zmk";
  fork?: boolean | number | null;
  id: string;
  installationId: string;
  lastCommitSha?: string | null;
  lastRunId?: string | null;
  lastSourceHash?: string | null;
  lastStatus?: string | null;
  owner: string;
  private: boolean | number;
  provider: string;
  relationship: string;
  repo: string;
  repoId?: string | null;
  repositoryKind: "qmk-userspace" | "zmk-config";
  updatedAt?: Date | string | null;
  userId: string;
  workflowPath: string;
}

interface GitHubFirmwareBranchRow {
  branchName: string;
  createdAt?: Date | string | null;
  id: string;
  lastCommitSha?: string | null;
  lastRunId?: string | null;
  lastSourceHash?: string | null;
  lastStatus?: string | null;
  repositoryId: string;
  sourceSavePointId?: string | null;
  syncInputJson?: string | null;
  deleteRequested?: boolean | number | null;
  updatedAt?: Date | string | null;
  variantId: string;
  variantName: string;
}

interface GitHubFirmwareRunRow {
  artifactId?: string | null;
  artifactName?: string | null;
  branchId?: string | null;
  completedAt?: Date | string | null;
  createdAt?: Date | string | null;
  headBranch?: string | null;
  headSha?: string | null;
  htmlUrl?: string | null;
  id: string;
  logUrl?: string | null;
  repositoryId: string;
  requestId: string;
  runId?: string | null;
  sourceHash?: string | null;
  startedAt?: Date | string | null;
  status: string;
  conclusion?: string | null;
  updatedAt?: Date | string | null;
}

export interface GitHubFirmwareRepositoryTarget {
  defaultBranch: string;
  firmwareFamily: "qmk" | "zmk";
  owner: string;
  repo: string;
}

export interface ReconcileGitHubFirmwareBranchResult {
  branchName: string;
  commitSha: string;
  sourceHash: string;
  workflowPath: string;
}

interface FirmwareSourceBranchSync {
  branch: GitHubFirmwareBranchDto;
  branchRow: GitHubFirmwareBranchRow;
  commit: { htmlUrl: string | null; sha: string } | null;
  connection: GitHubFirmwareAppConnectionRow;
  files: number;
  repository: GitHubFirmwareRepositoryDto;
  repositoryRow: GitHubFirmwareRepositoryRow;
  sourceHash: string;
  workflowPaths: string[];
}

export interface GitHubFirmwareAppPluginOptions extends GitHubFirmwareAppEnv {
  FLAGS?: BooleanReleaseFlagBinding;
  githubClientFactory?: (token: string) => GitHubRestClientLike;
  installationTokenClient?: GitHubAppInstallationTokenClientLike;
  nowMs?: () => number;
  oauthClient?: GitHubAppOAuthClient;
  onBuildDispatched?: (input: {
    response: GitHubFirmwareBuildResponse;
    userId: string;
  }) => Promise<void> | void;
  onCleanedUp?: (input: {
    response: GitHubFirmwareCleanupResponse;
    userId: string;
  }) => Promise<void> | void;
  onSourceSynced?: (input: {
    response: GitHubFirmwareSyncResponse;
    userId: string;
  }) => Promise<void> | void;
}

const installStateTtlMs = 15 * 60 * 1000;

const callbackQuerySchema = z.object({
  code: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
  installation_id: z.string().optional(),
  setup_action: z.string().optional(),
  state: z.string().optional(),
});

const firmwareSourceFileSchema = z.object({
  content: z.string(),
  mimeType: z.string(),
  path: z.string(),
  role: z.string(),
});

const firmwareSourceBundleSchema = z.object({
  buildCommand: z.string(),
  diagnostics: z.array(z.unknown()).optional().default([]),
  files: z.array(firmwareSourceFileSchema).min(1),
  sourceHash: z.string(),
});

const firmwareProfileTargetSchema = z
  .object({
    firmware: z.enum(["qmk", "zmk"]),
    id: z.string().optional(),
    name: z.string().optional(),
    vendor: z.string().optional(),
  })
  .passthrough();

const firmwareVariantSchema = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  sourceSavePointId: z.string().optional(),
});

const firmwareSyncBodySchema = z.object({
  private: z.boolean().optional(),
  profile: firmwareProfileTargetSchema,
  repositoryName: z.string().optional(),
  source: firmwareSourceBundleSchema,
  variant: firmwareVariantSchema,
});

const firmwareTargetBodySchema = z.object({
  profile: firmwareProfileTargetSchema,
  repositoryName: z.string().optional(),
  variant: firmwareVariantSchema,
});

const firmwareArtifactDownloadBodySchema = z.object({
  artifactId: z.string().min(1),
  requestId: z.string().min(1),
});

const firmwareCleanupBodySchema = firmwareTargetBodySchema.extend({
  action: z.enum(["branch", "repository"]),
  confirmation: z.string().optional(),
});

export const githubFirmwareAppPluginSchema = {
  githubFirmwareAppConnection: {
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
      installationId: {
        type: "string",
        required: true,
      },
      accountLogin: {
        type: "string",
        required: false,
      },
      accountType: {
        type: "string",
        required: false,
      },
      targetType: {
        type: "string",
        required: false,
      },
      repositorySelection: {
        type: "string",
        required: false,
      },
      setupAction: {
        type: "string",
        required: false,
      },
      userAccessTokenCiphertext: {
        type: "string",
        required: false,
        returned: false,
      },
      userAccessTokenIv: {
        type: "string",
        required: false,
        returned: false,
      },
      userAccessTokenExpiresAt: {
        type: "date",
        required: false,
      },
      userRefreshTokenCiphertext: {
        type: "string",
        required: false,
        returned: false,
      },
      userRefreshTokenIv: {
        type: "string",
        required: false,
        returned: false,
      },
      userRefreshTokenExpiresAt: {
        type: "date",
        required: false,
      },
      userTokenType: {
        type: "string",
        required: false,
      },
      connectedAt: {
        type: "date",
        required: true,
      },
      updatedAt: {
        type: "date",
        required: true,
      },
    },
  },
  githubFirmwareRepository: {
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
      installationId: { type: "string", required: true },
      provider: { type: "string", required: true },
      firmwareFamily: { type: "string", required: true },
      repositoryKind: { type: "string", required: true },
      relationship: { type: "string", required: true },
      owner: { type: "string", required: true },
      repo: { type: "string", required: true },
      repoId: { type: "string", required: false },
      defaultBranch: { type: "string", required: true },
      private: { type: "boolean", required: true },
      fork: { type: "boolean", required: true },
      parentOwner: { type: "string", required: false },
      parentRepo: { type: "string", required: false },
      workflowPath: { type: "string", required: true },
      lastSourceHash: { type: "string", required: false },
      lastCommitSha: { type: "string", required: false },
      lastRunId: { type: "string", required: false },
      lastStatus: { type: "string", required: false },
      createdAt: { type: "date", required: true },
      updatedAt: { type: "date", required: true },
    },
  },
  githubFirmwareBranch: {
    fields: {
      repositoryId: {
        type: "string",
        required: true,
        references: {
          model: "githubFirmwareRepository",
          field: "id",
          onDelete: "cascade",
        },
      },
      variantId: { type: "string", required: true },
      variantName: { type: "string", required: true },
      branchName: { type: "string", required: true },
      sourceSavePointId: { type: "string", required: false },
      syncInputJson: { type: "string", required: false },
      deleteRequested: { type: "boolean", required: true, defaultValue: false },
      lastSourceHash: { type: "string", required: false },
      lastCommitSha: { type: "string", required: false },
      lastRunId: { type: "string", required: false },
      lastStatus: { type: "string", required: false },
      createdAt: { type: "date", required: true },
      updatedAt: { type: "date", required: true },
    },
  },
  githubFirmwareRun: {
    fields: {
      repositoryId: {
        type: "string",
        required: true,
        references: {
          model: "githubFirmwareRepository",
          field: "id",
          onDelete: "cascade",
        },
      },
      branchId: {
        type: "string",
        required: false,
        references: {
          model: "githubFirmwareBranch",
          field: "id",
          onDelete: "set null",
        },
      },
      requestId: { type: "string", required: true },
      runId: { type: "string", required: false },
      headBranch: { type: "string", required: false },
      headSha: { type: "string", required: false },
      sourceHash: { type: "string", required: false },
      status: { type: "string", required: true },
      conclusion: { type: "string", required: false },
      artifactName: { type: "string", required: false },
      artifactId: { type: "string", required: false },
      logUrl: { type: "string", required: false },
      htmlUrl: { type: "string", required: false },
      startedAt: { type: "date", required: false },
      completedAt: { type: "date", required: false },
      createdAt: { type: "date", required: true },
      updatedAt: { type: "date", required: true },
    },
  },
  githubFirmwareAppState: {
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
      state: {
        type: "string",
        required: true,
        returned: false,
      },
      expiresAt: {
        type: "date",
        required: true,
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

export function githubFirmwareAppPlugin(
  options: GitHubFirmwareAppPluginOptions = {},
): BetterAuthPlugin {
  const nowMs = options.nowMs ?? (() => Date.now());
  const oauthClient = options.oauthClient ?? new GitHubAppOAuthClient();
  const githubClientFactory =
    options.githubClientFactory ?? ((token: string) => new GitHubRestClient({ token }));
  const installationTokenClient =
    options.installationTokenClient ?? new GitHubAppInstallationTokenClient();

  return {
    id: "github-firmware-app",
    schema: githubFirmwareAppPluginSchema,
    endpoints: {
      githubFirmwareAppStatus: createAuthEndpoint(
        "/firmware/github/status",
        {
          method: "GET",
          use: [sessionMiddleware],
        },
        (ctx) => {
          const authCtx = asAuthEndpointContext(ctx);
          return runGitHubEndpoint(
            "auth.github-firmware.status",
            Effect.gen(function* () {
              const session = yield* requireSessionEffect(authCtx);
              const config = githubFirmwareAppConfigFromEnv(options);
              const connection = yield* findConnection(authCtx, session.user.id);
              return yield* authJsonEffect(
                authCtx,
                statusForConnection(config, connection, nowMs()),
              );
            }),
          );
        },
      ),
      githubFirmwareAppConnect: createAuthEndpoint(
        "/firmware/github/connect",
        {
          method: "POST",
          requireRequest: true,
          use: [sessionMiddleware],
        },
        (ctx) => {
          const authCtx = asAuthEndpointContext(ctx);
          return runGitHubEndpoint(
            "auth.github-firmware.connect",
            Effect.gen(function* () {
              const session = yield* requireSessionEffect(authCtx);
              const config = githubFirmwareAppConfigFromEnv(options);
              if (!config.configured) {
                return yield* Effect.fail(
                  APIError.from("SERVICE_UNAVAILABLE", {
                    code: "GITHUB_FIRMWARE_APP_NOT_CONFIGURED",
                    message:
                      "GitHub App firmware builds are not configured. Set the GitHub App env vars and restart the Worker.",
                  }),
                );
              }

              const state = crypto.randomUUID();
              yield* createInstallState(authCtx, session.user.id, state, nowMs());

              return yield* authJsonEffect(authCtx, {
                installUrl: githubFirmwareAppAuthorizeUrl(config, state),
                state,
              } satisfies GitHubFirmwareAppConnectResponse);
            }),
          );
        },
      ),
      githubFirmwareAppCallback: createAuthEndpoint(
        "/firmware/github/callback",
        {
          method: "GET",
          query: callbackQuerySchema,
          requireRequest: true,
          use: [sessionMiddleware],
        },
        (ctx) => {
          const authCtx = asAuthEndpointContext(ctx);
          return runGitHubEndpoint(
            "auth.github-firmware.callback",
            Effect.gen(function* () {
              const session = yield* requireSessionEffect(authCtx);
              const config = githubFirmwareAppConfigFromEnv(options);
              const query = yield* parseBodyEffect(callbackQuerySchema, authCtx.query);
              const redirectBase = new URL(githubFirmwareAppSettingsPath, authCtx.request?.url);

              if (query.error) {
                return yield* Effect.fail(
                  authCtx.redirect(settingsRedirect(redirectBase, "error")),
                );
              }
              if (!config.clientId || !config.clientSecret || !query.code || !query.state) {
                return yield* Effect.fail(
                  authCtx.redirect(settingsRedirect(redirectBase, "error")),
                );
              }

              yield* consumeInstallState(authCtx, session.user.id, query.state, nowMs());
              const verified = yield* verifiedUserInstallation(
                oauthClient,
                config,
                query.code,
                query.installation_id,
              );
              if (!verified?.installation) {
                const state = crypto.randomUUID();
                yield* createInstallState(authCtx, session.user.id, state, nowMs());
                return yield* Effect.fail(
                  authCtx.redirect(githubFirmwareAppInstallUrl(config, state)),
                );
              }

              yield* upsertConnection(authCtx, session.user.id, verified.installation, {
                setupAction: query.setup_action ?? null,
                token: verified.token,
                tokenSecret: githubAppUserTokenSecretFor(options),
                tokenIssuedAtMs: nowMs(),
              });
              return yield* Effect.fail(
                authCtx.redirect(settingsRedirect(redirectBase, "connected")),
              );
            }),
          );
        },
      ),
      githubFirmwareAppSetup: createAuthEndpoint(
        "/firmware/github/setup",
        {
          method: "GET",
          query: callbackQuerySchema,
          requireRequest: true,
          use: [sessionMiddleware],
        },
        (ctx) => {
          const authCtx = asAuthEndpointContext(ctx);
          return runGitHubEndpoint(
            "auth.github-firmware.setup",
            Effect.gen(function* () {
              const session = yield* requireSessionEffect(authCtx);
              const config = githubFirmwareAppConfigFromEnv(options);
              if (!config.configured) {
                return yield* Effect.fail(
                  APIError.from("SERVICE_UNAVAILABLE", {
                    code: "GITHUB_FIRMWARE_APP_NOT_CONFIGURED",
                    message:
                      "GitHub App firmware builds are not configured. Set the GitHub App env vars and restart the Worker.",
                  }),
                );
              }

              const state = crypto.randomUUID();
              yield* createInstallState(authCtx, session.user.id, state, nowMs());
              return yield* Effect.fail(
                authCtx.redirect(githubFirmwareAppAuthorizeUrl(config, state)),
              );
            }),
          );
        },
      ),
      githubFirmwareAppSync: createAuthEndpoint(
        "/firmware/github/sync",
        {
          method: "POST",
          body: firmwareSyncBodySchema,
          use: [sessionMiddleware],
        },
        (ctx) => {
          const authCtx = asAuthEndpointContext(ctx);
          return runGitHubEndpoint(
            "auth.github-firmware.sync",
            Effect.gen(function* () {
              const session = yield* requireSessionEffect(authCtx);
              const body = yield* parseBodyEffect(firmwareSyncBodySchema, authCtx.body);
              const result = yield* syncFirmwareSourceBranch({
                body,
                config: githubFirmwareAppConfigFromEnv(options),
                ctx: authCtx,
                env: options,
                githubClientFactory,
                installationTokenClient,
                nowMs: nowMs(),
                oauthClient,
                userId: session.user.id,
              });
              const response = publicSyncResult(result);
              if (options.onSourceSynced) {
                yield* Effect.tryPromise({
                  try: async () => options.onSourceSynced?.({ response, userId: session.user.id }),
                  catch: (cause) => platformError("github-firmware.on-source-synced", cause),
                });
              }
              return yield* authJsonEffect(authCtx, response);
            }),
          );
        },
      ),
      githubFirmwareAppBuild: createAuthEndpoint(
        "/firmware/github/build",
        {
          method: "POST",
          body: firmwareSyncBodySchema,
          use: [sessionMiddleware],
        },
        (ctx) =>
          runGitHubEndpoint(
            "auth.github-firmware.build",
            Effect.gen(function* () {
              const authCtx = asAuthEndpointContext(ctx);
              const session = yield* requireSessionEffect(authCtx);
              const body = yield* parseBodyEffect(firmwareSyncBodySchema, authCtx.body);
              const synced = yield* syncFirmwareSourceBranch({
                body,
                config: githubFirmwareAppConfigFromEnv(options),
                ctx: authCtx,
                env: options,
                githubClientFactory,
                installationTokenClient,
                nowMs: nowMs(),
                oauthClient,
                userId: session.user.id,
              });
              const requestId = crypto.randomUUID();
              const installationToken = yield* installationTokenForFirmware(
                options,
                installationTokenClient,
                synced.connection.installationId,
              );
              const client = githubClientFactory(installationToken.token);
              const dispatched = yield* client.dispatchWorkflow(
                synced.repository.owner,
                synced.repository.repo,
                synced.repository.workflowPath,
                {
                  inputs: {
                    source_hash: synced.sourceHash,
                    variant_id: synced.branch.variantId,
                  },
                  ref: synced.branch.branchName,
                },
              );

              const now = new Date(nowMs());
              yield* adapterRequestEffect("github-firmware.create-run", () =>
                adapterFor(authCtx).create({
                  model: "githubFirmwareRun",
                  data: {
                    branchId: synced.branchRow.id,
                    createdAt: now,
                    headBranch: synced.branch.branchName,
                    headSha: synced.commit?.sha ?? null,
                    htmlUrl: dispatched.html_url ?? null,
                    repositoryId: synced.repositoryRow.id,
                    requestId,
                    runId: String(dispatched.workflow_run_id),
                    sourceHash: synced.sourceHash,
                    status: "dispatched",
                    updatedAt: now,
                  },
                }),
              );
              yield* updateFirmwareBranch(authCtx, synced.branchRow, {
                lastRunId: requestId,
                lastStatus: "dispatched",
                updatedAt: now,
              });
              yield* updateFirmwareRepository(authCtx, synced.repositoryRow, {
                lastRunId: requestId,
                lastStatus: "dispatched",
                updatedAt: now,
              });

              const response = {
                ...publicSyncResult(synced),
                build: {
                  htmlUrl: dispatched.html_url ?? null,
                  requestId,
                  runId: String(dispatched.workflow_run_id),
                  status: "dispatched",
                },
              } satisfies GitHubFirmwareBuildResponse;
              if (options.onBuildDispatched) {
                yield* Effect.tryPromise({
                  try: async () =>
                    options.onBuildDispatched?.({ response, userId: session.user.id }),
                  catch: (cause) => platformError("github-firmware.on-build-dispatched", cause),
                });
              }
              return yield* authJsonEffect(authCtx, response);
            }),
            githubFirmwareBuildReleaseGate(options),
          ),
      ),
      githubFirmwareAppArtifactDownload: createAuthEndpoint(
        "/firmware/github/artifact/download",
        {
          method: "POST",
          body: firmwareArtifactDownloadBodySchema,
          use: [sessionMiddleware],
        },
        (ctx) => {
          const authCtx = asAuthEndpointContext(ctx);
          return runGitHubEndpoint(
            "auth.github-firmware.download-artifact",
            Effect.gen(function* () {
              const session = yield* requireSessionEffect(authCtx);
              const body = yield* parseBodyEffect(firmwareArtifactDownloadBodySchema, authCtx.body);
              const result = yield* downloadFirmwareArtifact({
                body,
                ctx: authCtx,
                env: options,
                githubClientFactory,
                installationTokenClient,
                userId: session.user.id,
              });
              return yield* authJsonEffect(authCtx, result);
            }),
          );
        },
      ),
      githubFirmwareAppCleanup: createAuthEndpoint(
        "/firmware/github/cleanup",
        {
          method: "POST",
          body: firmwareCleanupBodySchema,
          use: [sessionMiddleware],
        },
        (ctx) => {
          const authCtx = asAuthEndpointContext(ctx);
          return runGitHubEndpoint(
            "auth.github-firmware.cleanup",
            Effect.gen(function* () {
              const session = yield* requireSessionEffect(authCtx);
              const body = yield* parseBodyEffect(firmwareCleanupBodySchema, authCtx.body);
              const result = yield* cleanupFirmwareRepository({
                body,
                ctx: authCtx,
                env: options,
                githubClientFactory,
                installationTokenClient,
                nowMs: nowMs(),
                userId: session.user.id,
              });
              if (options.onCleanedUp) {
                yield* Effect.tryPromise({
                  try: async () =>
                    options.onCleanedUp?.({ response: result, userId: session.user.id }),
                  catch: (cause) => platformError("github-firmware.on-cleaned-up", cause),
                });
              }
              return yield* authJsonEffect(authCtx, result);
            }),
          );
        },
      ),
      githubFirmwareAppDisconnect: createAuthEndpoint(
        "/firmware/github/disconnect",
        {
          method: "POST",
          use: [sessionMiddleware],
        },
        (ctx) => {
          const authCtx = asAuthEndpointContext(ctx);
          return runGitHubEndpoint(
            "auth.github-firmware.disconnect",
            Effect.gen(function* () {
              const session = yield* requireSessionEffect(authCtx);
              yield* adapterRequestEffect("github-firmware.disconnect", () =>
                adapterFor(authCtx).deleteMany({
                  model: "githubFirmwareAppConnection",
                  where: [{ field: "userId", value: session.user.id }],
                }),
              );
              return yield* authJsonEffect(
                authCtx,
                disconnectedGitHubFirmwareAppStatus(githubFirmwareAppConfigFromEnv(options)),
              );
            }),
          );
        },
      ),
    },
  };
}

function runGitHubEndpoint<A, E>(
  operation: string,
  endpoint: Effect.Effect<A, E>,
  before: Effect.Effect<void, unknown> = Effect.void,
): Promise<A> {
  // Better Auth's APIError and redirect responses stay in the failure channel
  // unchanged so its endpoint adapter can render them correctly.
  return runWorkerEffect(operation, Effect.andThen(before, endpoint));
}

function githubFirmwareBuildReleaseGate(options: GitHubFirmwareAppPluginOptions) {
  return requireBooleanReleaseFlag(options.FLAGS, releaseFlagKeys.githubFirmwareBuilds, {
    surface: "github-firmware-build",
  }).pipe(
    Effect.mapError((error) =>
      APIError.from("SERVICE_UNAVAILABLE", {
        code:
          error._tag === "ReleaseFlagDisabled"
            ? "GITHUB_FIRMWARE_BUILDS_DISABLED"
            : "GITHUB_FIRMWARE_BUILD_FLAG_UNAVAILABLE",
        message:
          error._tag === "ReleaseFlagDisabled"
            ? "GitHub firmware builds are currently disabled by the release control."
            : "GitHub firmware build release control is temporarily unavailable.",
      }),
    ),
  );
}

function asAuthEndpointContext(ctx: unknown) {
  return ctx as AuthEndpointContext;
}

const requireSessionEffect = Effect.fn("github-firmware.require-session")(function* (
  ctx: AuthEndpointContext,
) {
  return yield* Effect.try({
    try: () => requireSession(ctx),
    catch: (error) => error,
  });
});

function parseBodyEffect<S extends z.ZodType>(schema: S, value: unknown) {
  return Effect.try({
    try: () => schema.parse(value),
    catch: (error) => error,
  });
}

function authJsonEffect<T extends object | null>(ctx: AuthEndpointContext, body: T) {
  return Effect.tryPromise({
    try: async () => ctx.json(body),
    catch: (error) => error,
  });
}

function adapterRequestEffect<A>(operation: string, request: () => Promise<A>) {
  return Effect.tryPromise({
    try: request,
    catch: (cause) => platformError(operation, cause),
  });
}

function requireSession(ctx: AuthEndpointContext) {
  const session = ctx.context.session as Partial<AuthenticatedSession> | undefined;
  if (!session?.user?.id) {
    throw APIError.from("UNAUTHORIZED", {
      code: "GITHUB_FIRMWARE_SESSION_REQUIRED",
      message: "Sign in before connecting the GitHub firmware app.",
    });
  }
  return {
    user: {
      id: session.user.id,
    },
  };
}

function statusForConnection(
  config: ReturnType<typeof githubFirmwareAppConfigFromEnv>,
  connection: GitHubFirmwareAppConnectionRow | null,
  nowMsValue: number,
): GitHubFirmwareAppStatus {
  if (!connection) return disconnectedGitHubFirmwareAppStatus(config);

  return {
    appName: config.appName,
    appSlug: config.appSlug,
    configured: config.configured,
    connected: true,
    installUrl: null,
    installation: connectionToDto(connection),
    message: "GitHub App is installed and verified for firmware builds.",
    permissions: config.permissions,
    state: "connected",
    tokenState: tokenStateForConnection(connection, nowMsValue),
  };
}

const findConnection = Effect.fn("github-firmware.find-connection")(function* (
  ctx: AuthEndpointContext,
  userId: string,
) {
  return yield* adapterRequestEffect("github-firmware.find-connection", () =>
    adapterFor(ctx).findOne({
      model: "githubFirmwareAppConnection",
      where: [{ field: "userId", value: userId }],
    }),
  ).pipe(Effect.map((row) => row as GitHubFirmwareAppConnectionRow | null));
});

const createInstallState = Effect.fn("github-firmware.create-install-state")(function* (
  ctx: AuthEndpointContext,
  userId: string,
  state: string,
  nowMsValue: number,
) {
  const now = new Date(nowMsValue);
  return yield* adapterRequestEffect("github-firmware.create-install-state", () =>
    adapterFor(ctx).create({
      model: "githubFirmwareAppState",
      data: {
        userId,
        state,
        expiresAt: new Date(nowMsValue + installStateTtlMs),
        createdAt: now,
        updatedAt: now,
      },
    }),
  );
});

const consumeInstallState = Effect.fn("github-firmware.consume-install-state")(function* (
  ctx: AuthEndpointContext,
  userId: string,
  state: string,
  nowMsValue: number,
) {
  const row = yield* adapterRequestEffect("github-firmware.find-install-state", () =>
    adapterFor(ctx).findOne({
      model: "githubFirmwareAppState",
      where: [
        { field: "userId", value: userId },
        { field: "state", value: state },
      ],
    }),
  ).pipe(Effect.map((value) => value as GitHubFirmwareAppStateRow | null));
  if (!row || dateMs(row.expiresAt) <= nowMsValue) {
    return yield* Effect.fail(
      APIError.from("BAD_REQUEST", {
        code: "GITHUB_FIRMWARE_APP_STATE_EXPIRED",
        message: "GitHub App connection expired. Start the connection again.",
      }),
    );
  }
  yield* adapterRequestEffect("github-firmware.delete-install-state", () =>
    adapterFor(ctx).deleteMany({
      model: "githubFirmwareAppState",
      where: [{ field: "state", value: state }],
    }),
  );
});

const upsertConnection = Effect.fn("github-firmware.upsert-connection")(function* (
  ctx: AuthEndpointContext,
  userId: string,
  installation: GitHubAppUserInstallation,
  meta: {
    setupAction: string | null;
    token: GitHubAppUserToken;
    tokenIssuedAtMs: number;
    tokenSecret: string | null;
  },
) {
  const existing = yield* findConnection(ctx, userId);
  const now = new Date();
  const encryptedToken = meta.tokenSecret
    ? yield* encryptGitHubAppUserTokenEffect(meta.token, meta.tokenSecret, meta.tokenIssuedAtMs)
    : null;
  const tokenData = encryptedToken
    ? {
        userAccessTokenCiphertext: encryptedToken.accessTokenCiphertext,
        userAccessTokenExpiresAt: encryptedToken.accessTokenExpiresAt,
        userAccessTokenIv: encryptedToken.accessTokenIv,
        userRefreshTokenCiphertext: encryptedToken.refreshTokenCiphertext,
        userRefreshTokenExpiresAt: encryptedToken.refreshTokenExpiresAt,
        userRefreshTokenIv: encryptedToken.refreshTokenIv,
        userTokenType: encryptedToken.tokenType,
      }
    : {};
  const data = {
    accountLogin: installation.account?.login ?? null,
    accountType: installation.account?.type ?? null,
    installationId: String(installation.id),
    repositorySelection: installation.repository_selection ?? null,
    setupAction: meta.setupAction,
    targetType: installation.target_type ?? null,
    updatedAt: now,
    ...tokenData,
  };

  if (existing) {
    return yield* adapterRequestEffect("github-firmware.update-connection", () =>
      adapterFor(ctx).update({
        model: "githubFirmwareAppConnection",
        where: [{ field: "userId", value: userId }],
        update: data,
      }),
    );
  }

  return yield* adapterRequestEffect("github-firmware.create-connection", () =>
    adapterFor(ctx).create({
      model: "githubFirmwareAppConnection",
      data: {
        ...data,
        connectedAt: now,
        userId,
      },
    }),
  );
});

const verifiedUserInstallation = Effect.fn("github-firmware.verify-user-installation")(function* (
  oauthClient: GitHubAppOAuthClient,
  config: ReturnType<typeof githubFirmwareAppConfigFromEnv>,
  code: string,
  installationId: string | undefined,
) {
  if (!config.clientId || !config.clientSecret) return null;

  const token = yield* oauthClient.exchangeUserCode({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    code,
  });
  const installations = yield* oauthClient.listUserInstallations(token.accessToken);
  const installation = selectInstallation(installations.installations, installationId);
  return installation ? { installation, token } : null;
});

const syncFirmwareSourceBranch = Effect.fn("github-firmware.sync-source-branch")(function* (input: {
  body: GitHubFirmwareSyncInput;
  config: ReturnType<typeof githubFirmwareAppConfigFromEnv>;
  ctx: AuthEndpointContext;
  env: GitHubFirmwareAppEnv;
  githubClientFactory: (token: string) => GitHubRestClientLike;
  installationTokenClient: GitHubAppInstallationTokenClientLike;
  nowMs: number;
  oauthClient: GitHubAppOAuthClient;
  userId: string;
}) {
  yield* noBlockingFirmwareDiagnosticsEffect(input.body.source);
  if (!input.config.configured) {
    return yield* Effect.fail(
      APIError.from("SERVICE_UNAVAILABLE", {
        code: "GITHUB_FIRMWARE_APP_NOT_CONFIGURED",
        message: "GitHub App firmware builds are not configured.",
      }),
    );
  }

  const connection = yield* findConnection(input.ctx, input.userId);
  if (!connection) {
    return yield* Effect.fail(
      APIError.from("UNAUTHORIZED", {
        code: "GITHUB_FIRMWARE_APP_NOT_CONNECTED",
        message: "Install the GitHub App before syncing firmware.",
      }),
    );
  }

  const { desired, row } = yield* ensureFirmwareRepository(input, connection);
  const variant = firmwareGitHubVariantForProfile(input.body.profile, input.body.variant);
  const branchName = firmwareGitHubBranchForVariant(variant);
  const source = sourceBundleFromInput(input.body.source);
  const plan = firmwareSourceBundleToGitHubUpserts(source, desired, {
    branch: branchName,
    commitMessage: `Sync ${variant.name ?? variant.id} firmware source (${source.sourceHash.slice(
      0,
      12,
    )})`,
    generatedAt: new Date(input.nowMs).toISOString(),
    variant,
  });
  const installationToken = yield* installationTokenForFirmware(
    input.env,
    input.installationTokenClient,
    connection.installationId,
  );
  const client = input.githubClientFactory(installationToken.token);
  yield* ensureDefaultBranchWorkflowFiles(client, row, plan);
  const commit = yield* syncBranchCommit(client, row, branchName, plan);
  const now = new Date(input.nowMs);
  const syncInputJson = yield* Schema.encodeEffect(
    Schema.fromJsonString(GitHubFirmwareSyncInputSchema),
  )(input.body).pipe(
    Effect.mapError((cause) => platformError("github-firmware.encode-sync-input", cause)),
  );
  const branchRow = yield* upsertFirmwareBranch(input.ctx, row, {
    branchName,
    lastCommitSha: commit.sha,
    lastSourceHash: plan.sourceHash,
    lastStatus: "synced",
    sourceSavePointId: variant.sourceSavePointId ?? null,
    syncInputJson,
    deleteRequested: false,
    updatedAt: now,
    variantId: variant.id,
    variantName: variant.name ?? variant.id,
  });
  const repositoryRow = yield* updateFirmwareRepository(input.ctx, row, {
    firmwareFamily: input.body.profile.firmware,
    lastCommitSha: commit.sha,
    lastSourceHash: plan.sourceHash,
    lastStatus: "synced",
    repositoryKind: desired.kind,
    updatedAt: now,
    workflowPath: desired.pathLayout.defaultWorkflowPath,
  });

  return {
    branch: branchRowToDto(branchRow),
    branchRow,
    commit: {
      htmlUrl: commit.html_url ?? null,
      sha: commit.sha,
    },
    connection,
    files: plan.files.length,
    repository: repositoryRowToDto(repositoryRow),
    repositoryRow,
    sourceHash: plan.sourceHash,
    workflowPaths: plan.workflowFiles.workflowPaths,
  } satisfies FirmwareSourceBranchSync;
});

export const reconcileGitHubFirmwareBranch = Effect.fn("github-firmware.reconcile-branch")(
  function* (input: {
    client: GitHubRestClientLike;
    nowMs: number;
    repository: GitHubFirmwareRepositoryTarget;
    syncInput: unknown;
  }) {
    const body = yield* parseBodyEffect(firmwareSyncBodySchema, input.syncInput);
    yield* noBlockingFirmwareDiagnosticsEffect(body.source);
    const desired = deriveFirmwareGitHubRepository(body.profile, {
      owner: input.repository.owner,
      private: true,
      repositoryName: input.repository.repo,
    });
    const variant = firmwareGitHubVariantForProfile(body.profile, body.variant);
    const branchName = firmwareGitHubBranchForVariant(variant);
    const source = sourceBundleFromInput(body.source);
    const plan = firmwareSourceBundleToGitHubUpserts(source, desired, {
      branch: branchName,
      commitMessage: `Reconcile ${variant.name ?? variant.id} firmware source (${source.sourceHash.slice(0, 12)})`,
      generatedAt: new Date(input.nowMs).toISOString(),
      variant,
    });
    yield* ensureDefaultBranchWorkflowFiles(input.client, input.repository, plan);
    const commit = yield* syncBranchCommit(input.client, input.repository, branchName, plan);
    return {
      branchName,
      commitSha: commit.sha,
      sourceHash: plan.sourceHash,
      workflowPath: desired.pathLayout.defaultWorkflowPath,
    } satisfies ReconcileGitHubFirmwareBranchResult;
  },
);

const cleanupFirmwareRepository = Effect.fn("github-firmware.cleanup-repository")(
  function* (input: {
    body: GitHubFirmwareCleanupInput;
    ctx: AuthEndpointContext;
    env: GitHubFirmwareAppEnv;
    githubClientFactory: (token: string) => GitHubRestClientLike;
    installationTokenClient: GitHubAppInstallationTokenClientLike;
    nowMs: number;
    userId: string;
  }) {
    const context = yield* resolveFirmwareCleanupContext(input);
    if (!context.repository) {
      return yield* Effect.fail(
        APIError.from("NOT_FOUND", {
          code: "GITHUB_FIRMWARE_REPOSITORY_NOT_FOUND",
          message: "No managed firmware repository exists for this profile.",
        }),
      );
    }

    const repository = context.repository;
    const fullName = `${repository.owner}/${repository.repo}`;
    const installationToken = yield* installationTokenForFirmware(
      input.env,
      input.installationTokenClient,
      context.connection.installationId,
    );
    const client = input.githubClientFactory(installationToken.token);

    if (input.body.action === "branch") {
      const branch = context.branch;
      if (!branch) {
        return yield* Effect.fail(
          APIError.from("NOT_FOUND", {
            code: "GITHUB_FIRMWARE_BRANCH_NOT_FOUND",
            message: "No generated firmware branch exists for this variant.",
          }),
        );
      }
      if (
        !branch.branchName.startsWith("kbui/") ||
        branch.branchName === repository.defaultBranch
      ) {
        return yield* Effect.fail(
          APIError.from("FORBIDDEN", {
            code: "GITHUB_FIRMWARE_BRANCH_NOT_MANAGED",
            message: "Only generated kbui branches can be removed.",
          }),
        );
      }

      yield* client.deleteRef(repository.owner, repository.repo, `heads/${branch.branchName}`).pipe(
        Effect.catchIf(
          (error) => error.code === "GITHUB_NOT_FOUND",
          () => Effect.succeed(null),
        ),
      );
      yield* adapterRequestEffect("github-firmware.delete-branch-row", () =>
        adapterFor(input.ctx).deleteMany({
          model: "githubFirmwareBranch",
          where: [{ field: "id", value: branch.id }],
        }),
      );
      return {
        action: "branch" as const,
        branchName: branch.branchName,
        deleted: true,
        repositoryFullName: fullName,
      } satisfies GitHubFirmwareCleanupResponse;
    }

    if (repository.relationship !== "managed") {
      return yield* Effect.fail(
        APIError.from("FORBIDDEN", {
          code: "GITHUB_FIRMWARE_REPOSITORY_ADOPTED",
          message: "Adopted repositories are never deleted by kbui.",
        }),
      );
    }
    if (input.body.confirmation !== fullName) {
      return yield* Effect.fail(
        APIError.from("BAD_REQUEST", {
          code: "GITHUB_FIRMWARE_REPOSITORY_CONFIRMATION_REQUIRED",
          message: `Type ${fullName} exactly to delete this managed repository.`,
        }),
      );
    }

    yield* client.deleteRepository(repository.owner, repository.repo);
    yield* adapterRequestEffect("github-firmware.delete-repository-row", () =>
      adapterFor(input.ctx).deleteMany({
        model: "githubFirmwareRepository",
        where: [{ field: "id", value: repository.id }],
      }),
    );
    return {
      action: "repository" as const,
      branchName: null,
      deleted: true,
      repositoryFullName: fullName,
    } satisfies GitHubFirmwareCleanupResponse;
  },
);

const downloadFirmwareArtifact = Effect.fn("github-firmware.download-artifact")(function* (input: {
  body: GitHubFirmwareArtifactDownloadInput;
  ctx: AuthEndpointContext;
  env: GitHubFirmwareAppEnv;
  githubClientFactory: (token: string) => GitHubRestClientLike;
  installationTokenClient: GitHubAppInstallationTokenClientLike;
  userId: string;
}) {
  const run = yield* findFirmwareRunByRequestId(input.ctx, input.body.requestId);
  if (!run) {
    return yield* Effect.fail(
      APIError.from("NOT_FOUND", {
        code: "GITHUB_FIRMWARE_RUN_NOT_FOUND",
        message: "GitHub firmware build run was not found.",
      }),
    );
  }
  const repository = yield* findFirmwareRepositoryByIdForUser(
    input.ctx,
    input.userId,
    run.repositoryId,
  );
  if (!repository || !run.runId) {
    return yield* Effect.fail(
      APIError.from("BAD_REQUEST", {
        code: "GITHUB_FIRMWARE_RUN_NOT_READY",
        message: "The durable build event has not attached an artifact to this run yet.",
      }),
    );
  }
  const connection = yield* findConnection(input.ctx, input.userId);
  if (!connection || connection.installationId !== repository.installationId) {
    return yield* Effect.fail(
      APIError.from("UNAUTHORIZED", {
        code: "GITHUB_FIRMWARE_APP_NOT_CONNECTED",
        message: "Install the GitHub App before downloading firmware artifacts.",
      }),
    );
  }

  const installationToken = yield* installationTokenForFirmware(
    input.env,
    input.installationTokenClient,
    connection.installationId,
  );
  const client = input.githubClientFactory(installationToken.token);
  const runId = Number(run.runId);
  const artifacts = yield* client
    .listWorkflowRunArtifacts(repository.owner, repository.repo, runId, { per_page: 100 })
    .pipe(Effect.map((response) => response.artifacts));
  const artifact = artifacts.find((item) => String(item.id) === input.body.artifactId);
  if (!artifact) {
    return yield* Effect.fail(
      APIError.from("NOT_FOUND", {
        code: "GITHUB_FIRMWARE_ARTIFACT_NOT_FOUND",
        message: "GitHub firmware artifact was not found for this run.",
      }),
    );
  }

  const archive = yield* client.downloadArtifactZip(
    repository.owner,
    repository.repo,
    Number(input.body.artifactId),
  );
  return {
    artifactId: String(artifact.id),
    artifactName: artifact.name,
    contentType: archive.contentType,
    digest: artifact.digest ?? null,
    fileName: archive.fileName ?? `${artifact.name}.zip`,
    sizeBytes: archive.sizeBytes,
    zipBase64: bytesToBase64(archive.bytes),
  } satisfies GitHubFirmwareArtifactDownloadResponse;
});

const ensureFirmwareRepository = Effect.fn("github-firmware.ensure-repository")(function* (
  input: {
    body: GitHubFirmwareSyncInput;
    ctx: AuthEndpointContext;
    config: ReturnType<typeof githubFirmwareAppConfigFromEnv>;
    env: GitHubFirmwareAppEnv;
    githubClientFactory: (token: string) => GitHubRestClientLike;
    nowMs: number;
    oauthClient: GitHubAppOAuthClient;
    userId: string;
  },
  connection: GitHubFirmwareAppConnectionRow,
) {
  const owner = connection.accountLogin ?? undefined;
  const desired = deriveFirmwareGitHubRepository(input.body.profile, {
    owner,
    private: input.body.private,
    repositoryName: input.body.repositoryName,
  });
  if (!desired.owner) {
    return yield* Effect.fail(
      APIError.from("BAD_REQUEST", {
        code: "GITHUB_FIRMWARE_REPOSITORY_OWNER_MISSING",
        message: "GitHub account login was not available for repository setup.",
      }),
    );
  }

  const existing = yield* findFirmwareRepository(
    input.ctx,
    input.userId,
    desired.owner,
    desired.name,
  );
  if (existing) return { desired, row: existing };

  const userToken = yield* userTokenForRepositorySetup({
    config: input.config,
    connection,
    ctx: input.ctx,
    env: input.env,
    nowMs: input.nowMs,
    oauthClient: input.oauthClient,
  });
  const client = input.githubClientFactory(userToken);
  const repo = yield* createOrReadFirmwareRepository(client, desired);
  const now = new Date(input.nowMs);
  const row = yield* adapterRequestEffect("github-firmware.create-repository-row", () =>
    adapterFor(input.ctx).create({
      model: "githubFirmwareRepository",
      data: {
        createdAt: now,
        defaultBranch: repo.default_branch || desired.defaultBranch,
        firmwareFamily: input.body.profile.firmware,
        fork: false,
        installationId: connection.installationId,
        owner: repo.owner.login,
        private: repo.private,
        provider: "github",
        relationship: desired.relationship,
        repo: repo.name,
        repoId: String(repo.id),
        repositoryKind: desired.kind,
        updatedAt: now,
        userId: input.userId,
        workflowPath: desired.pathLayout.defaultWorkflowPath,
      },
    }),
  ).pipe(Effect.map((value) => value as GitHubFirmwareRepositoryRow));

  return {
    desired: {
      ...desired,
      defaultBranch: row.defaultBranch,
      name: row.repo,
      owner: row.owner,
      private: Boolean(row.private),
    },
    row,
  };
});

const userTokenForRepositorySetup = Effect.fn("github-firmware.user-token-for-repository")(
  function* (input: {
    config: ReturnType<typeof githubFirmwareAppConfigFromEnv>;
    connection: GitHubFirmwareAppConnectionRow;
    ctx: AuthEndpointContext;
    env: GitHubFirmwareAppEnv;
    nowMs: number;
    oauthClient: GitHubAppOAuthClient;
  }) {
    const tokenSecrets = githubAppUserTokenSecretsFor(input.env);
    const tokenSecret = tokenSecrets[0] ?? null;
    if (!tokenSecret) {
      return yield* Effect.fail(
        APIError.from("SERVICE_UNAVAILABLE", {
          code: "GITHUB_FIRMWARE_USER_TOKEN_SECRET_MISSING",
          message: "GitHub App user-token storage is not configured.",
        }),
      );
    }
    const accessTokenCiphertext = input.connection.userAccessTokenCiphertext;
    const accessTokenIv = input.connection.userAccessTokenIv;
    if (accessTokenCiphertext && accessTokenIv) {
      const expiresAtMs = dateMs(input.connection.userAccessTokenExpiresAt);
      if (expiresAtMs === 0 || expiresAtMs > input.nowMs + 60_000) {
        return yield* decryptStoredGitHubTokenEffect(tokenSecrets, (candidate) =>
          decryptGitHubAppUserAccessTokenEffect(
            { accessTokenCiphertext, accessTokenIv },
            candidate,
          ),
        );
      }
    }

    const clientId = input.config.clientId;
    const clientSecret = input.config.clientSecret;
    const refreshTokenCiphertext = input.connection.userRefreshTokenCiphertext;
    const refreshTokenIv = input.connection.userRefreshTokenIv;
    if (
      !clientId ||
      !clientSecret ||
      !refreshTokenCiphertext ||
      !refreshTokenIv ||
      dateMs(input.connection.userRefreshTokenExpiresAt) <= input.nowMs
    ) {
      return yield* Effect.fail(
        APIError.from("UNAUTHORIZED", {
          code: "GITHUB_FIRMWARE_USER_TOKEN_EXPIRED",
          message: "GitHub App user authorization expired. Reconnect the app.",
        }),
      );
    }

    const refreshToken = yield* decryptStoredGitHubTokenEffect(tokenSecrets, (candidate) =>
      decryptGitHubAppUserRefreshTokenEffect({ refreshTokenCiphertext, refreshTokenIv }, candidate),
    );
    return yield* Effect.uninterruptibleMask((restore) =>
      Effect.gen(function* () {
        const refreshed = yield* restore(
          input.oauthClient.refreshUserToken({ clientId, clientSecret, refreshToken }),
        );
        const encrypted = yield* encryptGitHubAppUserTokenEffect(
          refreshed,
          tokenSecret,
          input.nowMs,
        );
        yield* adapterRequestEffect("github-firmware.persist-refreshed-user-token", () =>
          adapterFor(input.ctx).update({
            model: "githubFirmwareAppConnection",
            where: [{ field: "userId", value: input.connection.userId }],
            update: {
              userAccessTokenCiphertext: encrypted.accessTokenCiphertext,
              userAccessTokenExpiresAt: encrypted.accessTokenExpiresAt,
              userAccessTokenIv: encrypted.accessTokenIv,
              userRefreshTokenCiphertext: encrypted.refreshTokenCiphertext,
              userRefreshTokenExpiresAt: encrypted.refreshTokenExpiresAt,
              userRefreshTokenIv: encrypted.refreshTokenIv,
              userTokenType: encrypted.tokenType,
              updatedAt: new Date(input.nowMs),
            },
          }),
        );
        return refreshed.accessToken;
      }),
    );
  },
);

function noBlockingFirmwareDiagnosticsEffect(source: GitHubFirmwareSourceBundleInput) {
  const blocking = (source.diagnostics ?? []).filter(
    (diagnostic): diagnostic is { message?: unknown; severity: "error" } =>
      typeof diagnostic === "object" &&
      diagnostic !== null &&
      "severity" in diagnostic &&
      diagnostic.severity === "error",
  );
  if (blocking.length === 0) return Effect.void;
  const firstMessage = blocking
    .map((diagnostic) => diagnostic.message)
    .find((message): message is string => typeof message === "string" && message.trim().length > 0);
  return Effect.fail(
    APIError.from("BAD_REQUEST", {
      code: "FIRMWARE_SOURCE_BLOCKED",
      message:
        firstMessage ??
        `Firmware source has ${blocking.length} blocking diagnostic${blocking.length === 1 ? "" : "s"}.`,
    }),
  );
}

function decryptStoredGitHubTokenEffect(
  secrets: readonly string[],
  decrypt: (secret: string) => Effect.Effect<string, PlatformError>,
) {
  const [first, ...rest] = secrets;
  if (!first) {
    return Effect.fail(
      platformError(
        "github-firmware.decrypt-user-token",
        "GitHub App user-token decryption key is unavailable.",
      ),
    );
  }
  return Effect.firstSuccessOf([decrypt(first), ...rest.map(decrypt)]);
}

const createOrReadFirmwareRepository = Effect.fn("github-firmware.create-or-read-repository")(
  function* (client: GitHubRestClientLike, desired: FirmwareGitHubDesiredRepository) {
    return yield* client
      .createRepositoryForAuthenticatedUser({
        auto_init: true,
        description: desired.description,
        name: desired.name,
        private: desired.private,
      })
      .pipe(
        Effect.catchIf(
          (error) => error.code === "GITHUB_VALIDATION_FAILED" || error.code === "GITHUB_CONFLICT",
          (error) =>
            desired.owner ? client.getRepository(desired.owner, desired.name) : Effect.fail(error),
        ),
      );
  },
);

const installationTokenForFirmware = Effect.fn("github-firmware.installation-token")(function* (
  env: GitHubFirmwareAppEnv,
  client: GitHubAppInstallationTokenClientLike,
  installationId: string,
) {
  const auth = githubAppInstallationAuthConfigFromEnv(env);
  if (!auth.configured) {
    return yield* Effect.fail(
      APIError.from("SERVICE_UNAVAILABLE", {
        code: "GITHUB_FIRMWARE_INSTALLATION_AUTH_NOT_CONFIGURED",
        message: "GitHub App ID and private key are required for firmware branch sync.",
      }),
    );
  }
  return yield* client.createInstallationAccessToken(auth, {
    installationId,
    permissions: {
      actions: "write",
      contents: "write",
      metadata: "read",
      workflows: "write",
    },
  });
});

const syncBranchCommit = Effect.fn("github-firmware.sync-branch-commit")(function* (
  client: GitHubRestClientLike,
  repository: GitHubFirmwareRepositoryTarget,
  branchName: string,
  plan: ReturnType<typeof firmwareSourceBundleToGitHubUpserts>,
) {
  const branchRef = yield* ensureBranchRef(client, repository, branchName);
  const headCommit = yield* client.getCommit(
    repository.owner,
    repository.repo,
    branchRef.object.sha,
  );
  const baseTree = headCommit.commit?.tree?.sha;
  const tree = yield* client.createTree(repository.owner, repository.repo, {
    ...(baseTree ? { base_tree: baseTree } : {}),
    tree: plan.files.map((file) => ({
      content: file.content,
      mode: "100644" as const,
      path: file.path,
      type: "blob" as const,
    })),
  });
  const commit = yield* client.createCommit(repository.owner, repository.repo, {
    message: plan.commitMessage,
    parents: [branchRef.object.sha],
    tree: tree.sha,
  });
  yield* client.updateRef(repository.owner, repository.repo, `heads/${branchName}`, {
    sha: commit.sha,
  });
  return commit;
});

const ensureDefaultBranchWorkflowFiles = Effect.fn("github-firmware.ensure-default-workflow-files")(
  function* (
    client: GitHubRestClientLike,
    repository: GitHubFirmwareRepositoryTarget,
    plan: ReturnType<typeof firmwareSourceBundleToGitHubUpserts>,
  ) {
    const workflowFiles = plan.files.filter((file) => file.path.startsWith(".github/workflows/"));
    yield* Effect.forEach(
      workflowFiles,
      (file) =>
        Effect.gen(function* () {
          const content = bytesToBase64(new TextEncoder().encode(file.content));
          const existing = yield* client
            .getContentMetadata(repository.owner, repository.repo, file.path, {
              ref: repository.defaultBranch,
            })
            .pipe(
              Effect.catchIf(
                (error) => error.code === "GITHUB_NOT_FOUND",
                () => Effect.succeed(null),
              ),
            );
          const existingFile = existing && "sha" in existing ? existing : null;
          if (
            existingFile?.encoding === "base64" &&
            existingFile.content?.replace(/\s/g, "") === content.replace(/\s/g, "")
          ) {
            return;
          }

          yield* client.putFileContents(repository.owner, repository.repo, file.path, {
            branch: repository.defaultBranch,
            content,
            message: `Update kbui ${repository.firmwareFamily.toUpperCase()} build workflow`,
            ...(existingFile ? { sha: existingFile.sha } : {}),
          });
        }),
      { discard: true },
    );
  },
);

const ensureBranchRef = Effect.fn("github-firmware.ensure-branch-ref")(function* (
  client: GitHubRestClientLike,
  repository: GitHubFirmwareRepositoryTarget,
  branchName: string,
) {
  return yield* client.getRef(repository.owner, repository.repo, `heads/${branchName}`).pipe(
    Effect.catchIf(
      (error) => error.code === "GITHUB_NOT_FOUND",
      () =>
        Effect.gen(function* () {
          const defaultRef = yield* client.getRef(
            repository.owner,
            repository.repo,
            `heads/${repository.defaultBranch}`,
          );
          return yield* client.createRef(repository.owner, repository.repo, {
            ref: `refs/heads/${branchName}`,
            sha: defaultRef.object.sha,
          });
        }),
    ),
  );
});

const findFirmwareRepository = Effect.fn("github-firmware.find-repository")(function* (
  ctx: AuthEndpointContext,
  userId: string,
  owner: string,
  repo: string,
) {
  return yield* adapterRequestEffect("github-firmware.find-repository", () =>
    adapterFor(ctx).findOne({
      model: "githubFirmwareRepository",
      where: [
        { field: "userId", value: userId },
        { field: "owner", value: owner },
        { field: "repo", value: repo },
      ],
    }),
  ).pipe(Effect.map((row) => row as GitHubFirmwareRepositoryRow | null));
});

const findFirmwareRepositoryByIdForUser = Effect.fn("github-firmware.find-repository-by-id")(
  function* (ctx: AuthEndpointContext, userId: string, repositoryId: string) {
    return yield* adapterRequestEffect("github-firmware.find-repository-by-id", () =>
      adapterFor(ctx).findOne({
        model: "githubFirmwareRepository",
        where: [
          { field: "id", value: repositoryId },
          { field: "userId", value: userId },
        ],
      }),
    ).pipe(Effect.map((row) => row as GitHubFirmwareRepositoryRow | null));
  },
);

const findFirmwareBranchByVariant = Effect.fn("github-firmware.find-branch-by-variant")(function* (
  ctx: AuthEndpointContext,
  repositoryId: string,
  variantId: string,
) {
  return yield* adapterRequestEffect("github-firmware.find-branch-by-variant", () =>
    adapterFor(ctx).findOne({
      model: "githubFirmwareBranch",
      where: [
        { field: "repositoryId", value: repositoryId },
        { field: "variantId", value: variantId },
      ],
    }),
  ).pipe(Effect.map((row) => row as GitHubFirmwareBranchRow | null));
});

const findFirmwareRunByRequestId = Effect.fn("github-firmware.find-run-by-request-id")(function* (
  ctx: AuthEndpointContext,
  requestId: string,
) {
  return yield* adapterRequestEffect("github-firmware.find-run-by-request-id", () =>
    adapterFor(ctx).findOne({
      model: "githubFirmwareRun",
      where: [{ field: "requestId", value: requestId }],
    }),
  ).pipe(Effect.map((row) => row as GitHubFirmwareRunRow | null));
});

const resolveFirmwareCleanupContext = Effect.fn("github-firmware.resolve-cleanup-context")(
  function* (input: {
    body: GitHubFirmwareCleanupInput;
    ctx: AuthEndpointContext;
    env: GitHubFirmwareAppEnv;
    githubClientFactory: (token: string) => GitHubRestClientLike;
    installationTokenClient: GitHubAppInstallationTokenClientLike;
    nowMs: number;
    userId: string;
  }) {
    const config = githubFirmwareAppConfigFromEnv(input.env);
    if (!config.configured) {
      return yield* Effect.fail(
        APIError.from("SERVICE_UNAVAILABLE", {
          code: "GITHUB_FIRMWARE_APP_NOT_CONFIGURED",
          message: "GitHub App firmware builds are not configured.",
        }),
      );
    }

    const connection = yield* findConnection(input.ctx, input.userId);
    if (!connection) {
      return yield* Effect.fail(
        APIError.from("UNAUTHORIZED", {
          code: "GITHUB_FIRMWARE_APP_NOT_CONNECTED",
          message: "Install the GitHub App before reading firmware builds.",
        }),
      );
    }

    const owner = connection.accountLogin ?? undefined;
    const desired = deriveFirmwareGitHubRepository(input.body.profile, {
      owner,
      repositoryName: input.body.repositoryName,
    });
    if (!desired.owner) return { branch: null, connection, repository: null };

    const repository = yield* findFirmwareRepository(
      input.ctx,
      input.userId,
      desired.owner,
      desired.name,
    );
    if (!repository) return { branch: null, connection, repository: null };

    const branch = yield* findFirmwareBranchByVariant(
      input.ctx,
      repository.id,
      firmwareGitHubVariantForProfile(input.body.profile, input.body.variant).id,
    );
    return { branch, connection, repository };
  },
);

const upsertFirmwareBranch = Effect.fn("github-firmware.upsert-branch")(function* (
  ctx: AuthEndpointContext,
  repository: GitHubFirmwareRepositoryRow,
  data: Omit<Partial<GitHubFirmwareBranchRow>, "id" | "repositoryId"> & {
    branchName: string;
    updatedAt: Date;
    variantId: string;
    variantName: string;
  },
) {
  const existing = yield* adapterRequestEffect("github-firmware.find-branch-for-upsert", () =>
    adapterFor(ctx).findOne({
      model: "githubFirmwareBranch",
      where: [
        { field: "repositoryId", value: repository.id },
        { field: "variantId", value: data.variantId },
      ],
    }),
  ).pipe(Effect.map((row) => row as GitHubFirmwareBranchRow | null));

  if (existing) return yield* updateFirmwareBranch(ctx, existing, data);

  return yield* adapterRequestEffect("github-firmware.create-branch", () =>
    adapterFor(ctx).create({
      model: "githubFirmwareBranch",
      data: {
        ...data,
        createdAt: data.updatedAt,
        repositoryId: repository.id,
      },
    }),
  ).pipe(Effect.map((row) => row as GitHubFirmwareBranchRow));
});

const updateFirmwareBranch = Effect.fn("github-firmware.update-branch")(function* (
  ctx: AuthEndpointContext,
  branch: GitHubFirmwareBranchRow,
  update: Partial<GitHubFirmwareBranchRow>,
) {
  return yield* adapterRequestEffect("github-firmware.update-branch", () =>
    adapterFor(ctx).update({
      model: "githubFirmwareBranch",
      where: [{ field: "id", value: branch.id }],
      update,
    }),
  ).pipe(Effect.map((row) => row as GitHubFirmwareBranchRow));
});

const updateFirmwareRepository = Effect.fn("github-firmware.update-repository")(function* (
  ctx: AuthEndpointContext,
  repository: GitHubFirmwareRepositoryRow,
  update: Partial<GitHubFirmwareRepositoryRow>,
) {
  return yield* adapterRequestEffect("github-firmware.update-repository", () =>
    adapterFor(ctx).update({
      model: "githubFirmwareRepository",
      where: [{ field: "id", value: repository.id }],
      update,
    }),
  ).pipe(Effect.map((row) => row as GitHubFirmwareRepositoryRow));
});

function sourceBundleFromInput(input: GitHubFirmwareSyncInput["source"]): FirmwareSourceBundle {
  return {
    buildCommand: input.buildCommand,
    diagnostics: [],
    files: input.files.map(
      (file): FirmwareGeneratedFile => ({
        content: file.content,
        mimeType: file.mimeType,
        path: file.path,
        role: file.role as FirmwareGeneratedFile["role"],
      }),
    ),
    sourceHash: input.sourceHash,
  };
}

function publicSyncResult(sync: FirmwareSourceBranchSync): GitHubFirmwareSyncResponse {
  return {
    branch: sync.branch,
    commit: sync.commit,
    files: sync.files,
    repository: sync.repository,
    sourceHash: sync.sourceHash,
    workflowPaths: sync.workflowPaths,
  };
}

function repositoryRowToDto(row: GitHubFirmwareRepositoryRow): GitHubFirmwareRepositoryDto {
  return {
    defaultBranch: row.defaultBranch,
    firmwareFamily: row.firmwareFamily,
    fullName: `${row.owner}/${row.repo}`,
    htmlUrl: `https://github.com/${row.owner}/${row.repo}`,
    owner: row.owner,
    private: Boolean(row.private),
    relationship: row.relationship === "managed" ? "managed" : "adopted",
    repo: row.repo,
    repositoryKind: row.repositoryKind,
    workflowPath: row.workflowPath,
  };
}

function branchRowToDto(row: GitHubFirmwareBranchRow): GitHubFirmwareBranchDto {
  return {
    branchName: row.branchName,
    lastCommitSha: row.lastCommitSha ?? null,
    lastRunId: row.lastRunId ?? null,
    lastSourceHash: row.lastSourceHash ?? null,
    lastStatus: row.lastStatus ?? null,
    sourceSavePointId: row.sourceSavePointId ?? null,
    updatedAt: dateIso(row.updatedAt),
    variantId: row.variantId,
    variantName: row.variantName,
  };
}

function selectInstallation(
  installations: GitHubAppUserInstallation[],
  installationId: string | undefined,
) {
  if (installationId) {
    return installations.find((installation) => String(installation.id) === installationId) ?? null;
  }
  return installations[0] ?? null;
}

function connectionToDto(row: GitHubFirmwareAppConnectionRow): GitHubFirmwareAppInstallation {
  return {
    accountLogin: row.accountLogin ?? null,
    accountType: row.accountType ?? null,
    connectedAt: dateIso(row.connectedAt),
    installationId: row.installationId,
    repositorySelection: row.repositorySelection ?? null,
    setupAction: row.setupAction ?? null,
    updatedAt: dateIso(row.updatedAt),
  };
}

function settingsRedirect(base: URL, result: string) {
  base.searchParams.set("github_firmware", result);
  return base.toString();
}

function adapterFor(ctx: AuthEndpointContext) {
  return ctx.context.adapter as BetterAuthAdapter;
}

function dateMs(value: Date | string | null | undefined) {
  if (!value) return 0;
  const ms = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function dateIso(value: Date | string | null | undefined) {
  const ms = dateMs(value);
  return ms > 0 ? new Date(ms).toISOString() : null;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function tokenStateForConnection(connection: GitHubFirmwareAppConnectionRow, nowMsValue: number) {
  const accessTokenExpiresMs = dateMs(connection.userAccessTokenExpiresAt);
  const refreshTokenExpiresMs = dateMs(connection.userRefreshTokenExpiresAt);
  const hasAccessToken = Boolean(
    connection.userAccessTokenCiphertext && connection.userAccessTokenIv,
  );

  if (!hasAccessToken) return "not-stored" as const;
  if (refreshTokenExpiresMs > 0 && refreshTokenExpiresMs <= nowMsValue) {
    return "refresh-expired" as const;
  }
  if (accessTokenExpiresMs > 0 && accessTokenExpiresMs <= nowMsValue) return "expired" as const;
  return "stored" as const;
}
