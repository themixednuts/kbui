import { APIError, createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import type { BetterAuthPlugin } from "better-auth";
import { Effect, Schema } from "effect";
import * as z from "zod";

import { runWorkerEffect } from "$lib/effect/worker-runtime";
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
  decryptGitHubAppUserAccessToken,
  decryptGitHubAppUserRefreshToken,
  encryptGitHubAppUserToken,
  githubAppUserTokenSecretFor,
  githubAppUserTokenSecretsFor,
} from "$lib/server/github-app/user-token-store";
import {
  GitHubAppInstallationTokenClient,
  githubAppInstallationAuthConfigFromEnv,
  type GitHubAppInstallationAccessToken,
} from "$lib/server/github-app/installation-token";
import {
  GitHubRestApiError,
  GitHubRestClient,
  type GitHubCommit,
  type GitHubGitRef,
} from "$lib/server/github/client";

interface AuthEndpointContext {
  context: {
    session?: unknown;
    adapter: unknown;
  };
  body?: unknown;
  json: <T extends Record<string, unknown> | null>(body: T) => T | Promise<T>;
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
        (ctx) =>
          runGitHubEndpoint("auth.github-firmware.status", async () => {
            const authCtx = asAuthEndpointContext(ctx);
            const session = requireSession(authCtx);
            const config = githubFirmwareAppConfigFromEnv(options);
            const connection = await findConnection(authCtx, session.user.id);
            return ctx.json(statusForConnection(config, connection, nowMs()));
          }),
      ),
      githubFirmwareAppConnect: createAuthEndpoint(
        "/firmware/github/connect",
        {
          method: "POST",
          requireRequest: true,
          use: [sessionMiddleware],
        },
        (ctx) =>
          runGitHubEndpoint("auth.github-firmware.connect", async () => {
            const authCtx = asAuthEndpointContext(ctx);
            const session = requireSession(authCtx);
            const config = githubFirmwareAppConfigFromEnv(options);
            if (!config.configured) {
              throw APIError.from("SERVICE_UNAVAILABLE", {
                code: "GITHUB_FIRMWARE_APP_NOT_CONFIGURED",
                message:
                  "GitHub App firmware builds are not configured. Set the GitHub App env vars and restart the Worker.",
              });
            }

            const state = crypto.randomUUID();
            await createInstallState(authCtx, session.user.id, state, nowMs());

            return ctx.json({
              installUrl: githubFirmwareAppAuthorizeUrl(config, state),
              state,
            } satisfies GitHubFirmwareAppConnectResponse);
          }),
      ),
      githubFirmwareAppCallback: createAuthEndpoint(
        "/firmware/github/callback",
        {
          method: "GET",
          query: callbackQuerySchema,
          requireRequest: true,
          use: [sessionMiddleware],
        },
        (ctx) =>
          runGitHubEndpoint("auth.github-firmware.callback", async () => {
            const authCtx = asAuthEndpointContext(ctx);
            const session = requireSession(authCtx);
            const config = githubFirmwareAppConfigFromEnv(options);
            const query = callbackQuerySchema.parse(authCtx.query);
            const redirectBase = new URL(githubFirmwareAppSettingsPath, authCtx.request?.url);

            if (query.error) {
              throw authCtx.redirect(settingsRedirect(redirectBase, "error"));
            }
            if (!config.clientId || !config.clientSecret || !query.code || !query.state) {
              throw authCtx.redirect(settingsRedirect(redirectBase, "error"));
            }

            await consumeInstallState(authCtx, session.user.id, query.state, nowMs());
            const verified = await verifiedUserInstallation(
              oauthClient,
              config,
              query.code,
              query.installation_id,
            );
            if (!verified?.installation) {
              const state = crypto.randomUUID();
              await createInstallState(authCtx, session.user.id, state, nowMs());
              throw authCtx.redirect(githubFirmwareAppInstallUrl(config, state));
            }

            await upsertConnection(authCtx, session.user.id, verified.installation, {
              setupAction: query.setup_action ?? null,
              token: verified.token,
              tokenSecret: githubAppUserTokenSecretFor(options),
              tokenIssuedAtMs: nowMs(),
            });
            throw authCtx.redirect(settingsRedirect(redirectBase, "connected"));
          }),
      ),
      githubFirmwareAppSetup: createAuthEndpoint(
        "/firmware/github/setup",
        {
          method: "GET",
          query: callbackQuerySchema,
          requireRequest: true,
          use: [sessionMiddleware],
        },
        (ctx) =>
          runGitHubEndpoint("auth.github-firmware.setup", async () => {
            const authCtx = asAuthEndpointContext(ctx);
            const session = requireSession(authCtx);
            const config = githubFirmwareAppConfigFromEnv(options);
            if (!config.configured) {
              throw APIError.from("SERVICE_UNAVAILABLE", {
                code: "GITHUB_FIRMWARE_APP_NOT_CONFIGURED",
                message:
                  "GitHub App firmware builds are not configured. Set the GitHub App env vars and restart the Worker.",
              });
            }

            const state = crypto.randomUUID();
            await createInstallState(authCtx, session.user.id, state, nowMs());
            throw authCtx.redirect(githubFirmwareAppAuthorizeUrl(config, state));
          }),
      ),
      githubFirmwareAppSync: createAuthEndpoint(
        "/firmware/github/sync",
        {
          method: "POST",
          body: firmwareSyncBodySchema,
          use: [sessionMiddleware],
        },
        (ctx) =>
          runGitHubEndpoint("auth.github-firmware.sync", async () => {
            const authCtx = asAuthEndpointContext(ctx);
            const session = requireSession(authCtx);
            const body = firmwareSyncBodySchema.parse(authCtx.body) as GitHubFirmwareSyncInput;
            const result = await syncFirmwareSourceBranch({
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
            await options.onSourceSynced?.({ response, userId: session.user.id });
            return ctx.json(response);
          }),
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
            async () => {
              const authCtx = asAuthEndpointContext(ctx);
              const session = requireSession(authCtx);
              const body = firmwareSyncBodySchema.parse(authCtx.body) as GitHubFirmwareSyncInput;
              const synced = await syncFirmwareSourceBranch({
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
              const installationToken = await installationTokenForFirmware(
                options,
                installationTokenClient,
                synced.connection.installationId,
              );
              const client = githubClientFactory(installationToken.token);
              const dispatched = await client.dispatchWorkflow(
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
              await adapterFor(authCtx).create({
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
              });
              await updateFirmwareBranch(authCtx, synced.branchRow, {
                lastRunId: requestId,
                lastStatus: "dispatched",
                updatedAt: now,
              });
              await updateFirmwareRepository(authCtx, synced.repositoryRow, {
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
              await options.onBuildDispatched?.({ response, userId: session.user.id });
              return ctx.json(response);
            },
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
        (ctx) =>
          runGitHubEndpoint("auth.github-firmware.download-artifact", async () => {
            const authCtx = asAuthEndpointContext(ctx);
            const session = requireSession(authCtx);
            const body = firmwareArtifactDownloadBodySchema.parse(
              authCtx.body,
            ) as GitHubFirmwareArtifactDownloadInput;
            const result = await downloadFirmwareArtifact({
              body,
              ctx: authCtx,
              env: options,
              githubClientFactory,
              installationTokenClient,
              userId: session.user.id,
            });
            return ctx.json(result);
          }),
      ),
      githubFirmwareAppCleanup: createAuthEndpoint(
        "/firmware/github/cleanup",
        {
          method: "POST",
          body: firmwareCleanupBodySchema,
          use: [sessionMiddleware],
        },
        (ctx) =>
          runGitHubEndpoint("auth.github-firmware.cleanup", async () => {
            const authCtx = asAuthEndpointContext(ctx);
            const session = requireSession(authCtx);
            const body = firmwareCleanupBodySchema.parse(
              authCtx.body,
            ) as GitHubFirmwareCleanupInput;
            const result = await cleanupFirmwareRepository({
              body,
              ctx: authCtx,
              env: options,
              githubClientFactory,
              installationTokenClient,
              nowMs: nowMs(),
              userId: session.user.id,
            });
            await options.onCleanedUp?.({ response: result, userId: session.user.id });
            return ctx.json(result);
          }),
      ),
      githubFirmwareAppDisconnect: createAuthEndpoint(
        "/firmware/github/disconnect",
        {
          method: "POST",
          use: [sessionMiddleware],
        },
        (ctx) =>
          runGitHubEndpoint("auth.github-firmware.disconnect", async () => {
            const authCtx = asAuthEndpointContext(ctx);
            const session = requireSession(authCtx);
            await adapterFor(authCtx).deleteMany({
              model: "githubFirmwareAppConnection",
              where: [{ field: "userId", value: session.user.id }],
            });
            return ctx.json(
              disconnectedGitHubFirmwareAppStatus(githubFirmwareAppConfigFromEnv(options)),
            );
          }),
      ),
    },
  };
}

function runGitHubEndpoint<A>(
  operation: string,
  run: () => PromiseLike<A>,
  before: Effect.Effect<void, unknown> = Effect.void,
): Promise<A> {
  const endpoint = Effect.tryPromise({
    try: run,
    // Better Auth's APIError and redirect responses must cross the Effect
    // boundary unchanged so its endpoint adapter can render them correctly.
    catch: (error) => error,
  });
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

async function findConnection(ctx: AuthEndpointContext, userId: string) {
  return (await adapterFor(ctx).findOne({
    model: "githubFirmwareAppConnection",
    where: [{ field: "userId", value: userId }],
  })) as GitHubFirmwareAppConnectionRow | null;
}

async function createInstallState(
  ctx: AuthEndpointContext,
  userId: string,
  state: string,
  nowMsValue: number,
) {
  const now = new Date(nowMsValue);
  return adapterFor(ctx).create({
    model: "githubFirmwareAppState",
    data: {
      userId,
      state,
      expiresAt: new Date(nowMsValue + installStateTtlMs),
      createdAt: now,
      updatedAt: now,
    },
  });
}

async function consumeInstallState(
  ctx: AuthEndpointContext,
  userId: string,
  state: string,
  nowMsValue: number,
) {
  const row = (await adapterFor(ctx).findOne({
    model: "githubFirmwareAppState",
    where: [
      { field: "userId", value: userId },
      { field: "state", value: state },
    ],
  })) as GitHubFirmwareAppStateRow | null;
  if (!row || dateMs(row.expiresAt) <= nowMsValue) {
    throw APIError.from("BAD_REQUEST", {
      code: "GITHUB_FIRMWARE_APP_STATE_EXPIRED",
      message: "GitHub App connection expired. Start the connection again.",
    });
  }
  await adapterFor(ctx).deleteMany({
    model: "githubFirmwareAppState",
    where: [{ field: "state", value: state }],
  });
}

async function upsertConnection(
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
  const existing = await findConnection(ctx, userId);
  const now = new Date();
  const encryptedToken = meta.tokenSecret
    ? await encryptGitHubAppUserToken(meta.token, meta.tokenSecret, meta.tokenIssuedAtMs)
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
    return adapterFor(ctx).update({
      model: "githubFirmwareAppConnection",
      where: [{ field: "userId", value: userId }],
      update: data,
    });
  }

  return adapterFor(ctx).create({
    model: "githubFirmwareAppConnection",
    data: {
      ...data,
      connectedAt: now,
      userId,
    },
  });
}

async function verifiedUserInstallation(
  oauthClient: GitHubAppOAuthClient,
  config: ReturnType<typeof githubFirmwareAppConfigFromEnv>,
  code: string,
  installationId: string | undefined,
) {
  if (!config.clientId || !config.clientSecret) return null;

  const token = await oauthClient.exchangeUserCode({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    code,
  });
  const installations = await oauthClient.listUserInstallations(token.accessToken);
  const installation = selectInstallation(installations.installations, installationId);
  return installation ? { installation, token } : null;
}

async function syncFirmwareSourceBranch(input: {
  body: GitHubFirmwareSyncInput;
  config: ReturnType<typeof githubFirmwareAppConfigFromEnv>;
  ctx: AuthEndpointContext;
  env: GitHubFirmwareAppEnv;
  githubClientFactory: (token: string) => GitHubRestClientLike;
  installationTokenClient: GitHubAppInstallationTokenClientLike;
  nowMs: number;
  oauthClient: GitHubAppOAuthClient;
  userId: string;
}): Promise<FirmwareSourceBranchSync> {
  assertNoBlockingFirmwareDiagnostics(input.body.source);
  if (!input.config.configured) {
    throw APIError.from("SERVICE_UNAVAILABLE", {
      code: "GITHUB_FIRMWARE_APP_NOT_CONFIGURED",
      message: "GitHub App firmware builds are not configured.",
    });
  }

  const connection = await findConnection(input.ctx, input.userId);
  if (!connection) {
    throw APIError.from("UNAUTHORIZED", {
      code: "GITHUB_FIRMWARE_APP_NOT_CONNECTED",
      message: "Install the GitHub App before syncing firmware.",
    });
  }

  const { desired, row } = await ensureFirmwareRepository(input, connection);
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
  const installationToken = await installationTokenForFirmware(
    input.env,
    input.installationTokenClient,
    connection.installationId,
  );
  const client = input.githubClientFactory(installationToken.token);
  await ensureDefaultBranchWorkflowFiles(client, row, plan);
  const commit = await syncBranchCommit(client, row, branchName, plan);
  const now = new Date(input.nowMs);
  const branchRow = await upsertFirmwareBranch(input.ctx, row, {
    branchName,
    lastCommitSha: commit.sha,
    lastSourceHash: plan.sourceHash,
    lastStatus: "synced",
    sourceSavePointId: variant.sourceSavePointId ?? null,
    syncInputJson: Schema.encodeSync(Schema.fromJsonString(GitHubFirmwareSyncInputSchema))(
      input.body,
    ),
    deleteRequested: false,
    updatedAt: now,
    variantId: variant.id,
    variantName: variant.name ?? variant.id,
  });
  const repositoryRow = await updateFirmwareRepository(input.ctx, row, {
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
  };
}

export async function reconcileGitHubFirmwareBranch(input: {
  client: GitHubRestClientLike;
  nowMs: number;
  repository: GitHubFirmwareRepositoryTarget;
  syncInput: unknown;
}): Promise<ReconcileGitHubFirmwareBranchResult> {
  const body = firmwareSyncBodySchema.parse(input.syncInput) as GitHubFirmwareSyncInput;
  assertNoBlockingFirmwareDiagnostics(body.source);
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
  await ensureDefaultBranchWorkflowFiles(input.client, input.repository, plan);
  const commit = await syncBranchCommit(input.client, input.repository, branchName, plan);
  return {
    branchName,
    commitSha: commit.sha,
    sourceHash: plan.sourceHash,
    workflowPath: desired.pathLayout.defaultWorkflowPath,
  };
}

async function cleanupFirmwareRepository(input: {
  body: GitHubFirmwareCleanupInput;
  ctx: AuthEndpointContext;
  env: GitHubFirmwareAppEnv;
  githubClientFactory: (token: string) => GitHubRestClientLike;
  installationTokenClient: GitHubAppInstallationTokenClientLike;
  nowMs: number;
  userId: string;
}): Promise<GitHubFirmwareCleanupResponse> {
  const context = await resolveFirmwareCleanupContext(input);
  if (!context.repository) {
    throw APIError.from("NOT_FOUND", {
      code: "GITHUB_FIRMWARE_REPOSITORY_NOT_FOUND",
      message: "No managed firmware repository exists for this profile.",
    });
  }

  const repository = context.repository;
  const fullName = `${repository.owner}/${repository.repo}`;
  const installationToken = await installationTokenForFirmware(
    input.env,
    input.installationTokenClient,
    context.connection.installationId,
  );
  const client = input.githubClientFactory(installationToken.token);

  if (input.body.action === "branch") {
    const branch = context.branch;
    if (!branch) {
      throw APIError.from("NOT_FOUND", {
        code: "GITHUB_FIRMWARE_BRANCH_NOT_FOUND",
        message: "No generated firmware branch exists for this variant.",
      });
    }
    if (!branch.branchName.startsWith("kbui/") || branch.branchName === repository.defaultBranch) {
      throw APIError.from("FORBIDDEN", {
        code: "GITHUB_FIRMWARE_BRANCH_NOT_MANAGED",
        message: "Only generated kbui branches can be removed.",
      });
    }

    try {
      await client.deleteRef(repository.owner, repository.repo, `heads/${branch.branchName}`);
    } catch (error) {
      if (!(error instanceof GitHubRestApiError) || error.code !== "GITHUB_NOT_FOUND") throw error;
    }
    await adapterFor(input.ctx).deleteMany({
      model: "githubFirmwareBranch",
      where: [{ field: "id", value: branch.id }],
    });
    return {
      action: "branch",
      branchName: branch.branchName,
      deleted: true,
      repositoryFullName: fullName,
    };
  }

  if (repository.relationship !== "managed") {
    throw APIError.from("FORBIDDEN", {
      code: "GITHUB_FIRMWARE_REPOSITORY_ADOPTED",
      message: "Adopted repositories are never deleted by kbui.",
    });
  }
  if (input.body.confirmation !== fullName) {
    throw APIError.from("BAD_REQUEST", {
      code: "GITHUB_FIRMWARE_REPOSITORY_CONFIRMATION_REQUIRED",
      message: `Type ${fullName} exactly to delete this managed repository.`,
    });
  }

  await client.deleteRepository(repository.owner, repository.repo);
  await adapterFor(input.ctx).deleteMany({
    model: "githubFirmwareRepository",
    where: [{ field: "id", value: repository.id }],
  });
  return {
    action: "repository",
    branchName: null,
    deleted: true,
    repositoryFullName: fullName,
  };
}

async function downloadFirmwareArtifact(input: {
  body: GitHubFirmwareArtifactDownloadInput;
  ctx: AuthEndpointContext;
  env: GitHubFirmwareAppEnv;
  githubClientFactory: (token: string) => GitHubRestClientLike;
  installationTokenClient: GitHubAppInstallationTokenClientLike;
  userId: string;
}): Promise<GitHubFirmwareArtifactDownloadResponse> {
  const run = await findFirmwareRunByRequestId(input.ctx, input.body.requestId);
  if (!run) {
    throw APIError.from("NOT_FOUND", {
      code: "GITHUB_FIRMWARE_RUN_NOT_FOUND",
      message: "GitHub firmware build run was not found.",
    });
  }
  const repository = await findFirmwareRepositoryByIdForUser(
    input.ctx,
    input.userId,
    run.repositoryId,
  );
  if (!repository || !run.runId) {
    throw APIError.from("BAD_REQUEST", {
      code: "GITHUB_FIRMWARE_RUN_NOT_READY",
      message: "The durable build event has not attached an artifact to this run yet.",
    });
  }
  const connection = await findConnection(input.ctx, input.userId);
  if (!connection || connection.installationId !== repository.installationId) {
    throw APIError.from("UNAUTHORIZED", {
      code: "GITHUB_FIRMWARE_APP_NOT_CONNECTED",
      message: "Install the GitHub App before downloading firmware artifacts.",
    });
  }

  const installationToken = await installationTokenForFirmware(
    input.env,
    input.installationTokenClient,
    connection.installationId,
  );
  const client = input.githubClientFactory(installationToken.token);
  const runId = Number(run.runId);
  const artifacts = (
    await client.listWorkflowRunArtifacts(repository.owner, repository.repo, runId, {
      per_page: 100,
    })
  ).artifacts;
  const artifact = artifacts.find((item) => String(item.id) === input.body.artifactId);
  if (!artifact) {
    throw APIError.from("NOT_FOUND", {
      code: "GITHUB_FIRMWARE_ARTIFACT_NOT_FOUND",
      message: "GitHub firmware artifact was not found for this run.",
    });
  }

  const archive = await client.downloadArtifactZip(
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
  };
}

async function ensureFirmwareRepository(
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
    throw APIError.from("BAD_REQUEST", {
      code: "GITHUB_FIRMWARE_REPOSITORY_OWNER_MISSING",
      message: "GitHub account login was not available for repository setup.",
    });
  }

  const existing = await findFirmwareRepository(
    input.ctx,
    input.userId,
    desired.owner,
    desired.name,
  );
  if (existing) return { desired, row: existing };

  const userToken = await userTokenForRepositorySetup({
    config: input.config,
    connection,
    ctx: input.ctx,
    env: input.env,
    nowMs: input.nowMs,
    oauthClient: input.oauthClient,
  });
  const client = input.githubClientFactory(userToken);
  const repo = await createOrReadFirmwareRepository(client, desired);
  const now = new Date(input.nowMs);
  const row = (await adapterFor(input.ctx).create({
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
  })) as GitHubFirmwareRepositoryRow;

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
}

async function userTokenForRepositorySetup(input: {
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
    throw APIError.from("SERVICE_UNAVAILABLE", {
      code: "GITHUB_FIRMWARE_USER_TOKEN_SECRET_MISSING",
      message: "GitHub App user-token storage is not configured.",
    });
  }
  if (input.connection.userAccessTokenCiphertext && input.connection.userAccessTokenIv) {
    const expiresAtMs = dateMs(input.connection.userAccessTokenExpiresAt);
    if (expiresAtMs === 0 || expiresAtMs > input.nowMs + 60_000) {
      return decryptStoredGitHubToken(tokenSecrets, (candidate) =>
        decryptGitHubAppUserAccessToken(
          {
            accessTokenCiphertext: input.connection.userAccessTokenCiphertext!,
            accessTokenIv: input.connection.userAccessTokenIv!,
          },
          candidate,
        ),
      );
    }
  }

  if (
    !input.config.clientId ||
    !input.config.clientSecret ||
    !input.connection.userRefreshTokenCiphertext ||
    !input.connection.userRefreshTokenIv ||
    dateMs(input.connection.userRefreshTokenExpiresAt) <= input.nowMs
  ) {
    throw APIError.from("UNAUTHORIZED", {
      code: "GITHUB_FIRMWARE_USER_TOKEN_EXPIRED",
      message: "GitHub App user authorization expired. Reconnect the app.",
    });
  }

  const refreshToken = await decryptStoredGitHubToken(tokenSecrets, (candidate) =>
    decryptGitHubAppUserRefreshToken(
      {
        refreshTokenCiphertext: input.connection.userRefreshTokenCiphertext!,
        refreshTokenIv: input.connection.userRefreshTokenIv!,
      },
      candidate,
    ),
  );
  const refreshed = await input.oauthClient.refreshUserToken({
    clientId: input.config.clientId,
    clientSecret: input.config.clientSecret,
    refreshToken,
  });
  const encrypted = await encryptGitHubAppUserToken(refreshed, tokenSecret, input.nowMs);
  await adapterFor(input.ctx).update({
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
  });
  return refreshed.accessToken;
}

function assertNoBlockingFirmwareDiagnostics(source: GitHubFirmwareSourceBundleInput) {
  const blocking = (source.diagnostics ?? []).filter(
    (diagnostic): diagnostic is { message?: unknown; severity: "error" } =>
      typeof diagnostic === "object" &&
      diagnostic !== null &&
      "severity" in diagnostic &&
      diagnostic.severity === "error",
  );
  if (blocking.length === 0) return;
  const firstMessage = blocking
    .map((diagnostic) => diagnostic.message)
    .find((message): message is string => typeof message === "string" && message.trim().length > 0);
  throw APIError.from("BAD_REQUEST", {
    code: "FIRMWARE_SOURCE_BLOCKED",
    message:
      firstMessage ??
      `Firmware source has ${blocking.length} blocking diagnostic${blocking.length === 1 ? "" : "s"}.`,
  });
}

async function decryptStoredGitHubToken(
  secrets: readonly string[],
  decrypt: (secret: string) => Promise<string>,
) {
  let lastError: unknown;
  for (const secret of secrets) {
    try {
      return await decrypt(secret);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("GitHub App user-token decryption key is unavailable.");
}

async function createOrReadFirmwareRepository(
  client: GitHubRestClientLike,
  desired: FirmwareGitHubDesiredRepository,
) {
  try {
    return await client.createRepositoryForAuthenticatedUser({
      auto_init: true,
      description: desired.description,
      name: desired.name,
      private: desired.private,
    });
  } catch (error) {
    if (
      error instanceof GitHubRestApiError &&
      ["GITHUB_VALIDATION_FAILED", "GITHUB_CONFLICT"].includes(error.code)
    ) {
      if (!desired.owner) throw error;
      return client.getRepository(desired.owner, desired.name);
    }
    throw error;
  }
}

async function installationTokenForFirmware(
  env: GitHubFirmwareAppEnv,
  client: GitHubAppInstallationTokenClientLike,
  installationId: string,
): Promise<GitHubAppInstallationAccessToken> {
  const auth = githubAppInstallationAuthConfigFromEnv(env);
  if (!auth.configured) {
    throw APIError.from("SERVICE_UNAVAILABLE", {
      code: "GITHUB_FIRMWARE_INSTALLATION_AUTH_NOT_CONFIGURED",
      message: "GitHub App ID and private key are required for firmware branch sync.",
    });
  }
  return client.createInstallationAccessToken(auth, {
    installationId,
    permissions: {
      actions: "write",
      contents: "write",
      metadata: "read",
      workflows: "write",
    },
  });
}

async function syncBranchCommit(
  client: GitHubRestClientLike,
  repository: GitHubFirmwareRepositoryTarget,
  branchName: string,
  plan: ReturnType<typeof firmwareSourceBundleToGitHubUpserts>,
): Promise<GitHubCommit> {
  const branchRef = await ensureBranchRef(client, repository, branchName);
  const headCommit = await client.getCommit(
    repository.owner,
    repository.repo,
    branchRef.object.sha,
  );
  const baseTree = headCommit.commit?.tree?.sha;
  const tree = await client.createTree(repository.owner, repository.repo, {
    ...(baseTree ? { base_tree: baseTree } : {}),
    tree: plan.files.map((file) => ({
      content: file.content,
      mode: "100644" as const,
      path: file.path,
      type: "blob" as const,
    })),
  });
  const commit = await client.createCommit(repository.owner, repository.repo, {
    message: plan.commitMessage,
    parents: [branchRef.object.sha],
    tree: tree.sha,
  });
  await client.updateRef(repository.owner, repository.repo, `heads/${branchName}`, {
    sha: commit.sha,
  });
  return commit;
}

async function ensureDefaultBranchWorkflowFiles(
  client: GitHubRestClientLike,
  repository: GitHubFirmwareRepositoryTarget,
  plan: ReturnType<typeof firmwareSourceBundleToGitHubUpserts>,
) {
  const workflowFiles = plan.files.filter((file) => file.path.startsWith(".github/workflows/"));
  for (const file of workflowFiles) {
    const content = bytesToBase64(new TextEncoder().encode(file.content));
    let existingSha: string | undefined;
    try {
      const existing = await client.getContentMetadata(
        repository.owner,
        repository.repo,
        file.path,
        {
          ref: repository.defaultBranch,
        },
      );
      if (!Array.isArray(existing)) {
        existingSha = existing.sha;
        if (
          existing.encoding === "base64" &&
          existing.content?.replace(/\s/g, "") === content.replace(/\s/g, "")
        ) {
          continue;
        }
      }
    } catch (error) {
      if (!(error instanceof GitHubRestApiError) || error.code !== "GITHUB_NOT_FOUND") throw error;
    }

    await client.putFileContents(repository.owner, repository.repo, file.path, {
      branch: repository.defaultBranch,
      content,
      message: `Update kbui ${repository.firmwareFamily.toUpperCase()} build workflow`,
      ...(existingSha ? { sha: existingSha } : {}),
    });
  }
}

async function ensureBranchRef(
  client: GitHubRestClientLike,
  repository: GitHubFirmwareRepositoryTarget,
  branchName: string,
): Promise<GitHubGitRef> {
  try {
    return await client.getRef(repository.owner, repository.repo, `heads/${branchName}`);
  } catch (error) {
    if (!(error instanceof GitHubRestApiError) || error.code !== "GITHUB_NOT_FOUND") throw error;
  }

  const defaultRef = await client.getRef(
    repository.owner,
    repository.repo,
    `heads/${repository.defaultBranch}`,
  );
  return client.createRef(repository.owner, repository.repo, {
    ref: `refs/heads/${branchName}`,
    sha: defaultRef.object.sha,
  });
}

async function findFirmwareRepository(
  ctx: AuthEndpointContext,
  userId: string,
  owner: string,
  repo: string,
) {
  return (await adapterFor(ctx).findOne({
    model: "githubFirmwareRepository",
    where: [
      { field: "userId", value: userId },
      { field: "owner", value: owner },
      { field: "repo", value: repo },
    ],
  })) as GitHubFirmwareRepositoryRow | null;
}

async function findFirmwareRepositoryByIdForUser(
  ctx: AuthEndpointContext,
  userId: string,
  repositoryId: string,
) {
  return (await adapterFor(ctx).findOne({
    model: "githubFirmwareRepository",
    where: [
      { field: "id", value: repositoryId },
      { field: "userId", value: userId },
    ],
  })) as GitHubFirmwareRepositoryRow | null;
}

async function findFirmwareBranchByVariant(
  ctx: AuthEndpointContext,
  repositoryId: string,
  variantId: string,
) {
  return (await adapterFor(ctx).findOne({
    model: "githubFirmwareBranch",
    where: [
      { field: "repositoryId", value: repositoryId },
      { field: "variantId", value: variantId },
    ],
  })) as GitHubFirmwareBranchRow | null;
}

async function findFirmwareRunByRequestId(ctx: AuthEndpointContext, requestId: string) {
  return (await adapterFor(ctx).findOne({
    model: "githubFirmwareRun",
    where: [{ field: "requestId", value: requestId }],
  })) as GitHubFirmwareRunRow | null;
}

async function resolveFirmwareCleanupContext(input: {
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
    throw APIError.from("SERVICE_UNAVAILABLE", {
      code: "GITHUB_FIRMWARE_APP_NOT_CONFIGURED",
      message: "GitHub App firmware builds are not configured.",
    });
  }

  const connection = await findConnection(input.ctx, input.userId);
  if (!connection) {
    throw APIError.from("UNAUTHORIZED", {
      code: "GITHUB_FIRMWARE_APP_NOT_CONNECTED",
      message: "Install the GitHub App before reading firmware builds.",
    });
  }

  const owner = connection.accountLogin ?? undefined;
  const desired = deriveFirmwareGitHubRepository(input.body.profile, {
    owner,
    repositoryName: input.body.repositoryName,
  });
  if (!desired.owner) return { branch: null, connection, repository: null };

  const repository = await findFirmwareRepository(
    input.ctx,
    input.userId,
    desired.owner,
    desired.name,
  );
  if (!repository) return { branch: null, connection, repository: null };

  const branch = await findFirmwareBranchByVariant(
    input.ctx,
    repository.id,
    firmwareGitHubVariantForProfile(input.body.profile, input.body.variant).id,
  );
  return { branch, connection, repository };
}

async function upsertFirmwareBranch(
  ctx: AuthEndpointContext,
  repository: GitHubFirmwareRepositoryRow,
  data: Omit<Partial<GitHubFirmwareBranchRow>, "id" | "repositoryId"> & {
    branchName: string;
    updatedAt: Date;
    variantId: string;
    variantName: string;
  },
) {
  const existing = (await adapterFor(ctx).findOne({
    model: "githubFirmwareBranch",
    where: [
      { field: "repositoryId", value: repository.id },
      { field: "variantId", value: data.variantId },
    ],
  })) as GitHubFirmwareBranchRow | null;

  if (existing) return updateFirmwareBranch(ctx, existing, data);

  return (await adapterFor(ctx).create({
    model: "githubFirmwareBranch",
    data: {
      ...data,
      createdAt: data.updatedAt,
      repositoryId: repository.id,
    },
  })) as GitHubFirmwareBranchRow;
}

async function updateFirmwareBranch(
  ctx: AuthEndpointContext,
  branch: GitHubFirmwareBranchRow,
  update: Partial<GitHubFirmwareBranchRow>,
) {
  return (await adapterFor(ctx).update({
    model: "githubFirmwareBranch",
    where: [{ field: "id", value: branch.id }],
    update,
  })) as GitHubFirmwareBranchRow;
}

async function updateFirmwareRepository(
  ctx: AuthEndpointContext,
  repository: GitHubFirmwareRepositoryRow,
  update: Partial<GitHubFirmwareRepositoryRow>,
) {
  return (await adapterFor(ctx).update({
    model: "githubFirmwareRepository",
    where: [{ field: "id", value: repository.id }],
    update,
  })) as GitHubFirmwareRepositoryRow;
}

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
