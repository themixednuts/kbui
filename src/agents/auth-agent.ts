import { Agent, type AgentContext } from "agents";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { drizzle } from "drizzle-orm/durable-sqlite";
import { Effect, Schedule, Schema } from "effect";

import * as authSchema from "$lib/server/auth/schema";
import {
  githubFirmwareAppPlugin,
  reconcileGitHubFirmwareBranch,
} from "$lib/server/auth/github-firmware-app-plugin";
import { monkeytypePlugin } from "$lib/server/auth/monkeytype-plugin";
import { TYPING_RUNS_AGENT_NAME } from "$lib/typing-runs/contracts";
import type { GitHubFirmwareBuildEvent } from "$lib/github-app/types";
import {
  firmwareBuildEventFromDispatch,
  firmwareBuildEventFromSync,
} from "$lib/github-app/build-events";
import { mapGitHubWorkflowRunToBuildStatus } from "$lib/keyboard/firmware-github";
import type { GitHubWorkflowRunWebhookEvent } from "$lib/server/github/webhook";
import { attachWorkflowArtifactsEffect } from "$lib/server/github/workflow-artifacts";
import { deriveFirmwareGitHubRepository } from "$lib/keyboard/firmware-github";
import { GitHubFirmwareSyncInputSchema } from "$lib/github-app/types";
import { GitHubRestClient } from "$lib/server/github/client";
import { GitHubAppOAuthClient } from "$lib/server/github-app/oauth";
import {
  decryptGitHubAppUserAccessTokenEffect,
  decryptGitHubAppUserRefreshTokenEffect,
  encryptGitHubAppUserTokenEffect,
  githubAppUserTokenSecretFor,
  githubAppUserTokenSecretsFor,
} from "$lib/server/github-app/user-token-store";
import { platformError } from "$lib/effect/errors";
import { runWorkerEffect } from "$lib/effect/worker-runtime";
import {
  collectFirmwareMaintenanceResults,
  firmwareMaintenanceError,
  retryFirmwareMaintenance,
  type FirmwareMaintenanceSummary,
} from "$lib/server/auth/firmware-maintenance";

export type { FirmwareMaintenanceSummary } from "$lib/server/auth/firmware-maintenance";

type AuthAgentEnv = Cloudflare.Env & {
  GITHUB_APP_SLUG?: string;
  GITHUB_APP_TOKEN_SECRET_KEY?: string;
  MONKEYTYPE_SECRET_KEY?: string;
};

interface AuthAgentState {
  configuredProviders: string[];
  updatedAt: string;
}

interface AuthHandler {
  handler(request: Request): Promise<Response>;
}

export interface RecordGitHubWorkflowRunWebhookInput {
  deliveryId: string;
  event: GitHubWorkflowRunWebhookEvent;
  receivedAt?: string;
}

export interface RecordGitHubWorkflowRunWebhookResult {
  duplicate: boolean;
  event: GitHubFirmwareBuildEvent;
  userId: string;
}

export interface RequestFirmwareVariantCleanupInput {
  userId: string;
  variantIds: string[];
}

const githubWebhookQueueRetry = {
  baseDelayMs: 500,
  maxAttempts: 12,
  maxDelayMs: 30_000,
} as const;

const localAuthSecret = "keeb-workbench-local-development-secret-change-before-deploy";

class GitHubAuthorizationExpiredError extends Schema.TaggedErrorClass<GitHubAuthorizationExpiredError>()(
  "GitHubAuthorizationExpiredError",
  {
    message: Schema.String,
  },
) {}

class GitHubTokenDecryptError extends Schema.TaggedErrorClass<GitHubTokenDecryptError>()(
  "GitHubTokenDecryptError",
  {
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

class GitHubOAuthRefreshError extends Schema.TaggedErrorClass<GitHubOAuthRefreshError>()(
  "GitHubOAuthRefreshError",
  {
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

const localDynamicBaseURL = {
  allowedHosts: ["localhost:*", "127.0.0.1:*", "*.workers.dev"],
  protocol: "auto" as const,
};

export class AuthAgent extends Agent<AuthAgentEnv, AuthAgentState> {
  initialState: AuthAgentState = {
    configuredProviders: [],
    updatedAt: new Date(0).toISOString(),
  };

  readonly #agentCtx: AgentContext;
  readonly #agentEnv: AuthAgentEnv;
  #auth: AuthHandler | undefined;

  constructor(ctx: AgentContext, env: AuthAgentEnv) {
    super(ctx, env);
    this.#agentCtx = ctx;
    this.#agentEnv = env;
  }

  onStart(): Promise<void> {
    return runWorkerEffect(
      "auth.on-start",
      Effect.gen({ self: this }, function* () {
        yield* Effect.logInfo("AuthAgent starting: ensuring tables and provider state");
        yield* Effect.sync(() => {
          this.ensureAuthTables();
          this.pruneExpiredAuthAndFirmwareHistory();
          this.setState({
            configuredProviders: this.githubConfigured() ? ["github"] : [],
            updatedAt: new Date().toISOString(),
          });
        });
        yield* Effect.tryPromise({
          try: () =>
            this.scheduleEvery(6 * 60 * 60, "runFirmwareMaintenance", undefined, {
              retry: githubWebhookQueueRetry,
            }),
          catch: (cause) => platformError("auth.schedule-firmware-maintenance", cause),
        }).pipe(Effect.retry({ schedule: Schedule.jittered(Schedule.spaced("3 seconds")) }));

        yield* Effect.matchEffect(
          Effect.try({
            try: () =>
              this.#agentCtx.storage.sql
                .exec(
                  "SELECT identifier, expires_at FROM verification ORDER BY created_at DESC LIMIT 5",
                )
                .toArray(),
            catch: (cause) => platformError("auth.snapshot-verification-table", cause),
          }),
          {
            onFailure: (error) => Effect.logWarning(error.message),
            onSuccess: (rows) =>
              Effect.logInfo(`Verification table on boot: ${rows.length} row(s)`),
          },
        );
      }),
    );
  }

  private pruneExpiredAuthAndFirmwareHistory() {
    this.#agentCtx.storage.transactionSync(() => {
      this.#agentCtx.storage.sql.exec(
        "DELETE FROM github_firmware_app_state WHERE expires_at < datetime('now')",
      );
      this.#agentCtx.storage.sql.exec(
        "DELETE FROM github_webhook_delivery WHERE received_at < datetime('now', '-30 days')",
      );
      this.#agentCtx.storage.sql.exec(`
        DELETE FROM github_firmware_run
        WHERE completed_at < datetime('now', '-90 days')
          AND request_id NOT IN (
            SELECT last_run_id FROM github_firmware_branch WHERE last_run_id IS NOT NULL
          )
      `);
    });
  }

  override fetch(request: Request): Promise<Response> {
    return runWorkerEffect(
      "auth.fetch",
      Effect.gen({ self: this }, function* () {
        yield* Effect.tryPromise({
          try: () => this.__unsafe_ensureInitialized(),
          catch: (cause) => platformError("auth.initialize", cause),
        });
        const url = new URL(request.url);
        yield* Effect.logInfo(`${request.method} ${url.pathname}${url.search}`);
        if (url.pathname.endsWith("/callback/github")) {
          // Snapshot what we know about verifications BEFORE handing off to
          // better-auth so we can compare against the state token in the URL.
          yield* Effect.matchEffect(
            Effect.try({
              try: () =>
                this.#agentCtx.storage.sql
                  .exec(
                    "SELECT identifier, length(value) AS value_len, expires_at, created_at FROM verification ORDER BY created_at DESC LIMIT 5",
                  )
                  .toArray(),
              catch: (cause) => platformError("auth.observe-verification", cause),
            }),
            {
              onFailure: (error) => Effect.logWarning(error.message),
              onSuccess: (rows) =>
                Effect.logInfo(`Verification rows at callback-time: ${rows.length}`),
            },
          );
        }
        const auth = this.getAuth();
        const response = yield* Effect.tryPromise({
          try: () => auth.handler(request),
          catch: (cause) => platformError("auth.handler", cause),
        });
        yield* Effect.logInfo(`${request.method} ${url.pathname} -> ${response.status}`);
        return response;
      }),
    );
  }

  recordGitHubWorkflowRunWebhook(
    input: RecordGitHubWorkflowRunWebhookInput,
  ): RecordGitHubWorkflowRunWebhookResult | null {
    const receivedAt = input.receivedAt ?? new Date().toISOString();
    return this.#agentCtx.storage.transactionSync(() => {
      const duplicate = this.#agentCtx.storage.sql
        .exec<{ delivery_id: string }>(
          "SELECT delivery_id FROM github_webhook_delivery WHERE delivery_id = ? LIMIT 1",
          input.deliveryId,
        )
        .toArray()[0];

      const repository = this.#agentCtx.storage.sql
        .exec<FirmwareRepositorySqlRow>(
          `SELECT * FROM github_firmware_repository
           WHERE installation_id = ?
             AND (repo_id = ? OR (owner = ? AND repo = ?))
           LIMIT 1`,
          input.event.installationId,
          input.event.repository.id,
          input.event.repository.owner,
          input.event.repository.name,
        )
        .toArray()[0];
      if (!repository) return null;

      const run = this.#agentCtx.storage.sql
        .exec<FirmwareRunSqlRow>(
          `SELECT * FROM github_firmware_run
           WHERE repository_id = ? AND run_id = ? LIMIT 1`,
          repository.id,
          input.event.run.id,
        )
        .toArray()[0];
      if (!run) return null;

      const branch = run.branch_id
        ? this.#agentCtx.storage.sql
            .exec<FirmwareBranchSqlRow>(
              "SELECT * FROM github_firmware_branch WHERE id = ? LIMIT 1",
              run.branch_id,
            )
            .toArray()[0]
        : undefined;
      if (!branch) return null;

      const updatedAtMs = Date.parse(input.event.run.updatedAt) || Date.now();
      const completedAtMs = input.event.run.status === "completed" ? updatedAtMs : null;
      const startedAtMs = input.event.run.startedAt
        ? Date.parse(input.event.run.startedAt) || null
        : null;

      if (!duplicate) {
        this.#agentCtx.storage.sql.exec(
          `UPDATE github_firmware_run SET
             head_branch = ?, head_sha = ?, status = ?, conclusion = ?, html_url = ?,
             started_at = COALESCE(?, started_at), completed_at = ?, updated_at = ?
           WHERE id = ?`,
          input.event.run.headBranch,
          input.event.run.headSha,
          input.event.run.status ?? "unknown",
          input.event.run.conclusion,
          input.event.run.htmlUrl,
          startedAtMs,
          completedAtMs,
          updatedAtMs,
          run.id,
        );
        this.#agentCtx.storage.sql.exec(
          "UPDATE github_firmware_branch SET last_run_id = ?, last_status = ?, updated_at = ? WHERE id = ?",
          input.event.run.id,
          input.event.run.status ?? "unknown",
          updatedAtMs,
          branch.id,
        );
        this.#agentCtx.storage.sql.exec(
          "UPDATE github_firmware_repository SET last_run_id = ?, last_status = ?, updated_at = ? WHERE id = ?",
          input.event.run.id,
          input.event.run.status ?? "unknown",
          updatedAtMs,
          repository.id,
        );
        this.#agentCtx.storage.sql.exec(
          `INSERT INTO github_webhook_delivery
             (delivery_id, event_name, action, run_id, received_at)
           VALUES (?, 'workflow_run', ?, ?, ?)`,
          input.deliveryId,
          input.event.action,
          input.event.run.id,
          updatedAtMs,
        );
      }

      const status = mapGitHubWorkflowRunToBuildStatus({
        conclusion: input.event.run.conclusion,
        htmlUrl: input.event.run.htmlUrl,
        id: Number(input.event.run.id),
        name: input.event.run.displayTitle,
        runNumber: input.event.run.runNumber,
        status: input.event.run.status,
        workflowName: input.event.run.name ?? undefined,
      });
      return {
        duplicate: Boolean(duplicate),
        userId: repository.user_id,
        event: {
          branch: firmwareBranchDto(branch, input.event, updatedAtMs),
          deliveryId: input.deliveryId,
          receivedAt,
          repository: firmwareRepositoryDto(repository),
          run: {
            artifact: null,
            artifacts: [],
            conclusion: input.event.run.conclusion,
            headBranch: input.event.run.headBranch,
            headSha: input.event.run.headSha,
            htmlUrl: input.event.run.htmlUrl,
            label: status.label,
            requestId: run.request_id,
            runId: input.event.run.id,
            runNumber: input.event.run.runNumber,
            sourceHash: run.source_hash,
            state: status.state,
            status: input.event.run.status ?? "unknown",
            successful: status.successful,
            terminal: status.terminal,
            updatedAt: new Date(updatedAtMs).toISOString(),
          },
        },
      };
    });
  }

  runFirmwareMaintenance(reason: "scheduled" | "requested" = "scheduled"): Promise<string> {
    return runWorkerEffect(
      "auth.run-firmware-maintenance",
      this.runFirmwareMaintenanceEffect(reason),
    );
  }

  private runFirmwareMaintenanceEffect(reason: "scheduled" | "requested") {
    const requestedAt = new Date().toISOString();
    return Effect.tryPromise({
      try: () =>
        this.runWorkflow(
          "FirmwareMaintenanceWorkflow",
          { reason, requestedAt },
          {
            id: `firmware-maintenance-${crypto.randomUUID()}`,
            metadata: { reason, requestedAt },
          },
        ),
      catch: (cause) => platformError("auth.run-firmware-maintenance", cause),
    });
  }

  requestFirmwareVariantCleanup(input: RequestFirmwareVariantCleanupInput): Promise<string | null> {
    const variantIds = [...new Set(input.variantIds.filter((id) => id.trim().length > 0))];
    if (!input.userId.trim() || variantIds.length === 0) {
      return runWorkerEffect("auth.request-firmware-cleanup.empty", Effect.succeed(null));
    }
    const placeholders = variantIds.map(() => "?").join(", ");
    return runWorkerEffect(
      "auth.request-firmware-cleanup",
      Effect.gen({ self: this }, function* () {
        yield* Effect.try({
          try: () =>
            this.#agentCtx.storage.sql.exec(
              `UPDATE github_firmware_branch
               SET delete_requested = 1, last_status = 'cleanup-requested', updated_at = ?
               WHERE repository_id IN (
                 SELECT id FROM github_firmware_repository WHERE user_id = ?
               ) AND variant_id IN (${placeholders})`,
              Date.now(),
              input.userId,
              ...variantIds,
            ),
          catch: (cause) => platformError("auth.mark-firmware-cleanup", cause),
        });
        return yield* this.runFirmwareMaintenanceEffect("requested");
      }),
    );
  }

  reconcileFirmwareRepositories(): Promise<FirmwareMaintenanceSummary> {
    this.ensureAuthTables();
    const rows = this.#agentCtx.storage.sql
      .exec<FirmwareMaintenanceSqlRow>(`
        SELECT
          b.id AS branch_id,
          b.branch_name,
          b.delete_requested,
          b.sync_input_json,
          r.id AS repository_id,
          r.owner,
          r.repo,
          r.default_branch,
          r.firmware_family,
          r.relationship,
          c.user_access_token_ciphertext,
          c.user_access_token_expires_at,
          c.user_access_token_iv,
          c.user_refresh_token_ciphertext,
          c.user_refresh_token_expires_at,
          c.user_refresh_token_iv
        FROM github_firmware_branch b
        JOIN github_firmware_repository r ON r.id = b.repository_id
        JOIN github_firmware_app_connection c ON c.user_id = r.user_id
        WHERE b.sync_input_json IS NOT NULL OR b.delete_requested = 1
        ORDER BY r.updated_at ASC, b.updated_at ASC
      `)
      .toArray();
    return runWorkerEffect(
      "auth.reconcile-firmware-repositories",
      collectFirmwareMaintenanceResults(
        rows,
        (row) => this.reconcileFirmwareRepositoryRowEffect(row),
        (row, error) =>
          Effect.try({
            try: () => this.markFirmwareMaintenanceFailure(row, error),
            catch: (cause) => platformError("auth.mark-firmware-maintenance-failure", cause),
          }).pipe(
            Effect.catch((markError) =>
              Effect.logError("Failed to persist GitHub firmware maintenance failure").pipe(
                Effect.annotateLogs({
                  branchId: row.branch_id,
                  operation: markError.operation,
                  repository: `${row.owner}/${row.repo}`,
                }),
              ),
            ),
          ),
      ),
    );
  }

  processGitHubWorkflowRunWebhook(
    input: RecordGitHubWorkflowRunWebhookInput,
    queueItem: { id: string },
  ): Promise<void> {
    return runWorkerEffect(
      "auth.process-github-workflow-run-webhook",
      Effect.gen({ self: this }, function* () {
        const recorded = yield* Effect.sync(() => this.recordGitHubWorkflowRunWebhook(input));
        if (!recorded) {
          console.info(
            JSON.stringify({
              event: "github.workflow_run.ignored",
              deliveryId: input.deliveryId,
              queueId: queueItem.id,
              repository: input.event.repository.fullName,
              runId: input.event.run.id,
            }),
          );
          return;
        }

        const buildEvent = yield* attachWorkflowArtifactsEffect(
          recorded.event,
          input.event.installationId,
          input.event.repository.id,
          this.#agentEnv,
        );
        yield* Effect.tryPromise({
          try: () =>
            this.#agentEnv.FirmwareBuildAgent.getByName(recorded.userId).publish(buildEvent),
          catch: (cause) => platformError("github.publish-firmware-build-event", cause),
        });

        console.info(
          JSON.stringify({
            event: "github.workflow_run.processed",
            deliveryId: input.deliveryId,
            duplicate: recorded.duplicate,
            queueId: queueItem.id,
            requestId: buildEvent.run.requestId,
            runId: buildEvent.run.runId,
            terminal: buildEvent.run.terminal,
          }),
        );
      }),
    );
  }

  private reconcileFirmwareRepositoryRowEffect(row: FirmwareMaintenanceSqlRow) {
    return Effect.gen({ self: this }, function* () {
      // OAuth refresh rotates credentials, so it is intentionally outside the
      // retry boundary. A later maintenance pass can try it again safely.
      const accessToken = yield* this.firmwareMaintenanceAccessTokenEffect(row).pipe(
        Effect.mapError((cause) =>
          firmwareMaintenanceError("auth.firmware-maintenance-access-token", cause, false),
        ),
      );

      yield* retryFirmwareMaintenance(
        this.reconcileFirmwareRepositoryWithAccessTokenEffect(row, accessToken),
        {
          branchId: row.branch_id,
          repository: `${row.owner}/${row.repo}`,
        },
      );
    });
  }

  private reconcileFirmwareRepositoryWithAccessTokenEffect(
    row: FirmwareMaintenanceSqlRow,
    accessToken: string,
  ) {
    return Effect.gen({ self: this }, function* () {
      const client = new GitHubRestClient({ token: accessToken });
      if (row.delete_requested === 1) {
        yield* client.deleteRef(row.owner, row.repo, `heads/${row.branch_name}`).pipe(
          Effect.catchIf(
            (error) => error.code === "GITHUB_NOT_FOUND",
            () => Effect.succeed(null),
          ),
        );
        yield* Effect.try({
          try: () =>
            this.#agentCtx.storage.sql.exec(
              "DELETE FROM github_firmware_branch WHERE id = ? AND delete_requested = 1",
              row.branch_id,
            ),
          catch: (cause) => platformError("auth.delete-reconciled-firmware-branch", cause),
        });
        return;
      }
      const syncInput = yield* Schema.decodeUnknownEffect(
        Schema.fromJsonString(GitHubFirmwareSyncInputSchema),
      )(row.sync_input_json);
      const repository = yield* client.getRepository(row.owner, row.repo).pipe(
        Effect.catchIf(
          (error) => error.code === "GITHUB_NOT_FOUND" && row.relationship === "managed",
          () => {
            const desired = deriveFirmwareGitHubRepository(syncInput.profile, {
              owner: row.owner,
              private: true,
              repositoryName: row.repo,
            });
            return client.createRepositoryForAuthenticatedUser({
              auto_init: true,
              description: desired.description,
              name: desired.name,
              private: true,
            });
          },
        ),
      );
      const repaired = yield* reconcileGitHubFirmwareBranch({
        client,
        nowMs: Date.now(),
        repository: {
          defaultBranch: repository.default_branch || row.default_branch,
          firmwareFamily: row.firmware_family,
          owner: repository.owner.login,
          repo: repository.name,
        },
        syncInput,
      });
      yield* Effect.try({
        try: () => {
          const now = Date.now();
          this.#agentCtx.storage.sql.exec(
            `UPDATE github_firmware_branch
             SET branch_name = ?, last_source_hash = ?, last_commit_sha = ?,
                 last_status = 'reconciled', updated_at = ?
             WHERE id = ?`,
            repaired.branchName,
            repaired.sourceHash,
            repaired.commitSha,
            now,
            row.branch_id,
          );
          this.#agentCtx.storage.sql.exec(
            `UPDATE github_firmware_repository
             SET owner = ?, repo = ?, repo_id = ?, default_branch = ?, workflow_path = ?,
                 last_source_hash = ?, last_commit_sha = ?, last_status = 'reconciled', updated_at = ?
             WHERE id = ?`,
            repository.owner.login,
            repository.name,
            String(repository.id),
            repository.default_branch || row.default_branch,
            repaired.workflowPath,
            repaired.sourceHash,
            repaired.commitSha,
            now,
            row.repository_id,
          );
        },
        catch: (cause) => platformError("auth.persist-reconciled-firmware-branch", cause),
      });
    }).pipe(
      Effect.mapError((cause) =>
        firmwareMaintenanceError("auth.reconcile-firmware-repository", cause),
      ),
    );
  }

  private firmwareMaintenanceAccessTokenEffect(row: FirmwareMaintenanceSqlRow) {
    return Effect.gen({ self: this }, function* () {
      const secrets = githubAppUserTokenSecretsFor(this.#agentEnv);
      const accessTokenCiphertext = row.user_access_token_ciphertext;
      const accessTokenIv = row.user_access_token_iv;
      const nowMs = Date.now();
      if (
        accessTokenCiphertext &&
        accessTokenIv &&
        (!row.user_access_token_expires_at ||
          Number(row.user_access_token_expires_at) > nowMs + 60_000)
      ) {
        return yield* decryptWithSecretsEffect(secrets, (secret) =>
          decryptGitHubAppUserAccessTokenEffect({ accessTokenCiphertext, accessTokenIv }, secret),
        );
      }

      const clientId = this.#agentEnv.GITHUB_APP_CLIENT_ID;
      const clientSecret = this.#agentEnv.GITHUB_APP_CLIENT_SECRET;
      const encryptionSecret = githubAppUserTokenSecretFor(this.#agentEnv);
      const refreshTokenCiphertext = row.user_refresh_token_ciphertext;
      const refreshTokenIv = row.user_refresh_token_iv;
      if (
        !clientId ||
        !clientSecret ||
        !encryptionSecret ||
        !refreshTokenCiphertext ||
        !refreshTokenIv ||
        (row.user_refresh_token_expires_at && Number(row.user_refresh_token_expires_at) <= nowMs)
      ) {
        return yield* Effect.fail(
          new GitHubAuthorizationExpiredError({
            message: "GitHub App user authorization must be renewed before repository repair.",
          }),
        );
      }
      const refreshToken = yield* decryptWithSecretsEffect(secrets, (secret) =>
        decryptGitHubAppUserRefreshTokenEffect({ refreshTokenCiphertext, refreshTokenIv }, secret),
      );
      return yield* Effect.uninterruptibleMask((restore) =>
        Effect.gen({ self: this }, function* () {
          const token = yield* restore(
            new GitHubAppOAuthClient()
              .refreshUserToken({ clientId, clientSecret, refreshToken })
              .pipe(
                Effect.mapError(
                  (cause) =>
                    new GitHubOAuthRefreshError({
                      message: "GitHub App user token refresh failed.",
                      cause,
                    }),
                ),
              ),
          );
          const encrypted = yield* encryptGitHubAppUserTokenEffect(token, encryptionSecret, nowMs);
          yield* Effect.try({
            try: () =>
              this.#agentCtx.storage.sql.exec(
                `UPDATE github_firmware_app_connection SET
                   user_access_token_ciphertext = ?, user_access_token_iv = ?,
                   user_access_token_expires_at = ?, user_refresh_token_ciphertext = ?,
                   user_refresh_token_iv = ?, user_refresh_token_expires_at = ?,
                   user_token_type = ?, updated_at = ?
                 WHERE user_access_token_ciphertext = ?`,
                encrypted.accessTokenCiphertext,
                encrypted.accessTokenIv,
                encrypted.accessTokenExpiresAt?.getTime() ?? null,
                encrypted.refreshTokenCiphertext,
                encrypted.refreshTokenIv,
                encrypted.refreshTokenExpiresAt?.getTime() ?? null,
                encrypted.tokenType,
                Date.now(),
                row.user_access_token_ciphertext,
              ),
            catch: (cause) => platformError("auth.persist-refreshed-github-token", cause),
          });
          return token.accessToken;
        }),
      );
    });
  }

  private markFirmwareMaintenanceFailure(row: FirmwareMaintenanceSqlRow, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const status = `repair-needed:${message.slice(0, 180)}`;
    this.#agentCtx.storage.sql.exec(
      "UPDATE github_firmware_branch SET last_status = ?, updated_at = ? WHERE id = ?",
      status,
      Date.now(),
      row.branch_id,
    );
    console.error(
      JSON.stringify({
        event: "github.firmware.maintenance.failed",
        branchId: row.branch_id,
        error: message,
        repository: `${row.owner}/${row.repo}`,
      }),
    );
  }

  private getAuth(): AuthHandler {
    const githubClientId = this.#agentEnv.GITHUB_CLIENT_ID;
    const githubClientSecret = this.#agentEnv.GITHUB_CLIENT_SECRET;

    if (!this.#auth) {
      this.#auth = betterAuth({
        appName: "kbui",
        basePath: "/api/auth",
        baseURL: this.#agentEnv.BETTER_AUTH_URL ?? localDynamicBaseURL,
        // `logger: true` makes drizzle emit every prepared SQL query +
        // params to console.log. That's how we'll see better-auth's
        // INSERT into verification at sign-in vs. SELECT at callback,
        // and diagnose any identifier mismatch / missing row.
        database: drizzleAdapter(drizzle(this.#agentCtx.storage, { logger: true }), {
          provider: "sqlite",
          schema: authSchema,
          camelCase: true,
        }),
        logger: {
          level: "debug",
          log: (level, message, ...args) => {
            console.log(`[better-auth][${level}] ${message}`, ...args);
          },
        },
        secret: this.#agentEnv.BETTER_AUTH_SECRET ?? localAuthSecret,
        session: {
          cookieCache: {
            enabled: true,
            maxAge: 300, // seconds; bounded session-revocation lag, standard trade-off
          },
        },
        user: {
          additionalFields: {
            githubLogin: {
              type: "string",
              required: false,
            },
          },
        },
        socialProviders:
          githubClientId && githubClientSecret
            ? {
                github: {
                  clientId: githubClientId,
                  clientSecret: githubClientSecret,
                  mapProfileToUser: (profile) => ({ githubLogin: profile.login }),
                  overrideUserInfoOnSignIn: true,
                },
              }
            : {},
        plugins: [
          githubFirmwareAppPlugin({
            ...this.#agentEnv,
            onBuildDispatched: async ({ response, userId }) => {
              const startedAt = new Date().toISOString();
              await this.#agentEnv.FirmwareBuildAgent.getByName(userId).startTracking({
                branchName: response.branch.branchName,
                initialEvent: firmwareBuildEventFromDispatch(response, startedAt),
                repository: response.repository.fullName,
                requestId: response.build.requestId,
                runId: response.build.runId,
                startedAt,
              });
            },
            onCleanedUp: async ({ response, userId }) => {
              await this.#agentEnv.FirmwareBuildAgent.getByName(userId).removeTarget(response);
            },
            onSourceSynced: async ({ response, userId }) => {
              await this.#agentEnv.FirmwareBuildAgent.getByName(userId).publish(
                firmwareBuildEventFromSync(response),
              );
            },
          }),
          monkeytypePlugin({
            secretKey: this.#agentEnv.MONKEYTYPE_SECRET_KEY,
            onResultsSynced: async ({ userId, results }) => {
              await this.#agentEnv.TypingRunsAgent.getByName(
                TYPING_RUNS_AGENT_NAME,
              ).upsertMonkeytypeResults(userId, results);
            },
          }),
        ],
        trustedOrigins: trustedOriginsFor(this.#agentEnv.BETTER_AUTH_URL),
        advanced: {
          trustedProxyHeaders: true,
          backgroundTasks: {
            handler: (promise) => this.#agentCtx.waitUntil(promise),
          },
        },
      });
    }

    return this.#auth;
  }

  private githubConfigured() {
    return Boolean(this.#agentEnv.GITHUB_CLIENT_ID && this.#agentEnv.GITHUB_CLIENT_SECRET);
  }

  private ensureAuthTables() {
    void this.sql`
      CREATE TABLE IF NOT EXISTS user (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        email_verified INTEGER NOT NULL DEFAULT 0,
        image TEXT,
        github_login TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `;
    this.ensureColumn("user", "github_login TEXT");

    void this.sql`
      CREATE TABLE IF NOT EXISTS session (
        id TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL,
        token TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
      )
    `;

    void this.sql`CREATE INDEX IF NOT EXISTS session_user_id_idx ON session (user_id)`;

    void this.sql`
      CREATE TABLE IF NOT EXISTS account (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        access_token TEXT,
        refresh_token TEXT,
        id_token TEXT,
        access_token_expires_at INTEGER,
        refresh_token_expires_at INTEGER,
        scope TEXT,
        password TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `;

    void this.sql`CREATE INDEX IF NOT EXISTS account_user_id_idx ON account (user_id)`;
    void this.sql`
      CREATE UNIQUE INDEX IF NOT EXISTS account_provider_account_id_idx
      ON account (provider_id, account_id)
    `;

    void this.sql`
      CREATE TABLE IF NOT EXISTS verification (
        id TEXT PRIMARY KEY,
        identifier TEXT NOT NULL,
        value TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `;

    void this
      .sql`CREATE INDEX IF NOT EXISTS verification_identifier_idx ON verification (identifier)`;

    void this.sql`
      CREATE TABLE IF NOT EXISTS monkeytype_connection (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        ape_key_ciphertext TEXT NOT NULL,
        ape_key_iv TEXT NOT NULL,
        username TEXT,
        mode TEXT NOT NULL,
        mode2 TEXT NOT NULL,
        summary_json TEXT,
        last_synced_at INTEGER,
        rate_limit_reset_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `;

    void this.sql`
      CREATE UNIQUE INDEX IF NOT EXISTS monkeytype_connection_user_id_idx
      ON monkeytype_connection (user_id)
    `;

    void this.sql`
      CREATE INDEX IF NOT EXISTS monkeytype_connection_rate_limit_reset_idx
      ON monkeytype_connection (rate_limit_reset_at)
    `;

    void this.sql`
      CREATE TABLE IF NOT EXISTS github_firmware_app_connection (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        installation_id TEXT NOT NULL,
        account_login TEXT,
        account_type TEXT,
        target_type TEXT,
        repository_selection TEXT,
        setup_action TEXT,
        user_access_token_ciphertext TEXT,
        user_access_token_iv TEXT,
        user_access_token_expires_at INTEGER,
        user_refresh_token_ciphertext TEXT,
        user_refresh_token_iv TEXT,
        user_refresh_token_expires_at INTEGER,
        user_token_type TEXT,
        connected_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `;

    this.ensureColumn("github_firmware_app_connection", "user_access_token_ciphertext TEXT");
    this.ensureColumn("github_firmware_app_connection", "user_access_token_iv TEXT");
    this.ensureColumn("github_firmware_app_connection", "user_access_token_expires_at INTEGER");
    this.ensureColumn("github_firmware_app_connection", "user_refresh_token_ciphertext TEXT");
    this.ensureColumn("github_firmware_app_connection", "user_refresh_token_iv TEXT");
    this.ensureColumn("github_firmware_app_connection", "user_refresh_token_expires_at INTEGER");
    this.ensureColumn("github_firmware_app_connection", "user_token_type TEXT");

    void this.sql`
      CREATE UNIQUE INDEX IF NOT EXISTS github_firmware_app_connection_user_id_idx
      ON github_firmware_app_connection (user_id)
    `;

    void this.sql`
      CREATE INDEX IF NOT EXISTS github_firmware_app_connection_installation_id_idx
      ON github_firmware_app_connection (installation_id)
    `;

    void this.sql`
      CREATE TABLE IF NOT EXISTS github_firmware_repository (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        installation_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        firmware_family TEXT NOT NULL,
        repository_kind TEXT NOT NULL,
        relationship TEXT NOT NULL,
        owner TEXT NOT NULL,
        repo TEXT NOT NULL,
        repo_id TEXT,
        default_branch TEXT NOT NULL,
        private INTEGER NOT NULL,
        fork INTEGER NOT NULL DEFAULT 0,
        parent_owner TEXT,
        parent_repo TEXT,
        workflow_path TEXT NOT NULL,
        last_source_hash TEXT,
        last_commit_sha TEXT,
        last_run_id TEXT,
        last_status TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `;

    void this.sql`
      CREATE UNIQUE INDEX IF NOT EXISTS github_firmware_repository_user_id_owner_repo_idx
      ON github_firmware_repository (user_id, owner, repo)
    `;

    void this.sql`
      CREATE INDEX IF NOT EXISTS github_firmware_repository_installation_id_idx
      ON github_firmware_repository (installation_id)
    `;

    void this.sql`
      CREATE TABLE IF NOT EXISTS github_firmware_branch (
        id TEXT PRIMARY KEY,
        repository_id TEXT NOT NULL REFERENCES github_firmware_repository(id) ON DELETE CASCADE,
        variant_id TEXT NOT NULL,
        variant_name TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        source_save_point_id TEXT,
        sync_input_json TEXT,
        delete_requested INTEGER NOT NULL DEFAULT 0,
        last_source_hash TEXT,
        last_commit_sha TEXT,
        last_run_id TEXT,
        last_status TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `;
    this.ensureColumn("github_firmware_branch", "sync_input_json TEXT");
    this.ensureColumn("github_firmware_branch", "delete_requested INTEGER NOT NULL DEFAULT 0");

    void this.sql`
      CREATE UNIQUE INDEX IF NOT EXISTS github_firmware_branch_repository_variant_idx
      ON github_firmware_branch (repository_id, variant_id)
    `;

    void this.sql`
      CREATE UNIQUE INDEX IF NOT EXISTS github_firmware_branch_repository_branch_idx
      ON github_firmware_branch (repository_id, branch_name)
    `;

    void this.sql`
      CREATE TABLE IF NOT EXISTS github_firmware_run (
        id TEXT PRIMARY KEY,
        repository_id TEXT NOT NULL REFERENCES github_firmware_repository(id) ON DELETE CASCADE,
        branch_id TEXT REFERENCES github_firmware_branch(id) ON DELETE SET NULL,
        request_id TEXT NOT NULL,
        run_id TEXT,
        head_branch TEXT,
        head_sha TEXT,
        source_hash TEXT,
        status TEXT NOT NULL,
        conclusion TEXT,
        artifact_name TEXT,
        artifact_id TEXT,
        log_url TEXT,
        html_url TEXT,
        started_at INTEGER,
        completed_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `;

    this.ensureColumn(
      "github_firmware_run",
      "branch_id TEXT REFERENCES github_firmware_branch(id) ON DELETE SET NULL",
    );

    void this.sql`
      CREATE UNIQUE INDEX IF NOT EXISTS github_firmware_run_request_id_idx
      ON github_firmware_run (request_id)
    `;

    void this.sql`
      CREATE INDEX IF NOT EXISTS github_firmware_run_repository_id_idx
      ON github_firmware_run (repository_id)
    `;

    void this.sql`
      CREATE INDEX IF NOT EXISTS github_firmware_run_run_id_idx
      ON github_firmware_run (run_id)
    `;

    void this.sql`
      CREATE TABLE IF NOT EXISTS github_firmware_app_state (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
        state TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `;

    void this.sql`
      CREATE UNIQUE INDEX IF NOT EXISTS github_firmware_app_state_state_idx
      ON github_firmware_app_state (state)
    `;

    void this.sql`
      CREATE INDEX IF NOT EXISTS github_firmware_app_state_user_id_idx
      ON github_firmware_app_state (user_id)
    `;

    void this.sql`
      CREATE TABLE IF NOT EXISTS github_webhook_delivery (
        delivery_id TEXT PRIMARY KEY,
        event_name TEXT NOT NULL,
        action TEXT,
        run_id TEXT,
        received_at INTEGER NOT NULL
      )
    `;
    void this.sql`
      CREATE INDEX IF NOT EXISTS github_webhook_delivery_run_id_idx
      ON github_webhook_delivery (run_id)
    `;
  }

  private ensureColumn(tableName: string, columnDefinition: string) {
    try {
      this.#agentCtx.storage.sql.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes("duplicate column")) {
        throw error;
      }
    }
  }
}

interface FirmwareRepositorySqlRow extends Record<string, SqlStorageValue> {
  default_branch: string;
  firmware_family: "qmk" | "zmk";
  id: string;
  owner: string;
  private: number;
  repo: string;
  repository_kind: "qmk-userspace" | "zmk-config";
  user_id: string;
  workflow_path: string;
}

interface FirmwareMaintenanceSqlRow extends Record<string, SqlStorageValue> {
  branch_id: string;
  branch_name: string;
  default_branch: string;
  delete_requested: number;
  firmware_family: "qmk" | "zmk";
  owner: string;
  relationship: string;
  repo: string;
  repository_id: string;
  sync_input_json: string;
  user_access_token_ciphertext: string | null;
  user_access_token_expires_at: number | null;
  user_access_token_iv: string | null;
  user_refresh_token_ciphertext: string | null;
  user_refresh_token_expires_at: number | null;
  user_refresh_token_iv: string | null;
}

interface FirmwareBranchSqlRow extends Record<string, SqlStorageValue> {
  branch_name: string;
  id: string;
  last_commit_sha: string | null;
  last_run_id: string | null;
  last_source_hash: string | null;
  last_status: string | null;
  source_save_point_id: string | null;
  updated_at: number | null;
  variant_id: string;
  variant_name: string;
}

interface FirmwareRunSqlRow extends Record<string, SqlStorageValue> {
  branch_id: string | null;
  id: string;
  request_id: string;
  source_hash: string | null;
}

function firmwareRepositoryDto(row: FirmwareRepositorySqlRow) {
  return {
    defaultBranch: row.default_branch,
    firmwareFamily: row.firmware_family,
    fullName: `${row.owner}/${row.repo}`,
    htmlUrl: `https://github.com/${row.owner}/${row.repo}`,
    owner: row.owner,
    private: row.private === 1,
    repo: row.repo,
    repositoryKind: row.repository_kind,
    workflowPath: row.workflow_path,
  };
}

function firmwareBranchDto(
  row: FirmwareBranchSqlRow,
  event: GitHubWorkflowRunWebhookEvent,
  updatedAtMs: number,
) {
  return {
    branchName: row.branch_name,
    lastCommitSha: row.last_commit_sha,
    lastRunId: event.run.id,
    lastSourceHash: row.last_source_hash,
    lastStatus: event.run.status ?? "unknown",
    sourceSavePointId: row.source_save_point_id,
    updatedAt: new Date(updatedAtMs).toISOString(),
    variantId: row.variant_id,
    variantName: row.variant_name,
  };
}

function trustedOriginsFor(baseURL: string | undefined) {
  const configuredOrigin = originFrom(baseURL);
  const localDevPatterns = ["http://localhost:*", "http://127.0.0.1:*"];

  if (!configuredOrigin) return localDevPatterns;
  if (isLoopbackOrigin(configuredOrigin)) return [configuredOrigin, ...localDevPatterns];
  return [configuredOrigin];
}

function originFrom(value: string | undefined) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isLoopbackOrigin(origin: string) {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

function decryptWithSecretsEffect<E>(
  secrets: readonly string[],
  decrypt: (secret: string) => Effect.Effect<string, E>,
) {
  const [first, ...rest] = secrets;
  if (!first) {
    return Effect.fail(
      new GitHubTokenDecryptError({
        message: "GitHub App token encryption key is unavailable.",
        cause: null,
      }),
    );
  }
  return Effect.firstSuccessOf([decrypt(first), ...rest.map(decrypt)]).pipe(
    Effect.mapError(
      (cause) =>
        new GitHubTokenDecryptError({
          message: "GitHub App token could not be decrypted with the configured keys.",
          cause,
        }),
    ),
  );
}
