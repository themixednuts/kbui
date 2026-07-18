import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  githubLogin: text("github_login"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_user_id_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("account_user_id_idx").on(table.userId),
    uniqueIndex("account_provider_account_id_idx").on(table.providerId, table.accountId),
  ],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const monkeytypeConnection = sqliteTable(
  "monkeytype_connection",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    apeKeyCiphertext: text("ape_key_ciphertext").notNull(),
    apeKeyIv: text("ape_key_iv").notNull(),
    username: text("username"),
    mode: text("mode").notNull(),
    mode2: text("mode2").notNull(),
    summaryJson: text("summary_json"),
    lastSyncedAt: integer("last_synced_at", { mode: "timestamp_ms" }),
    rateLimitResetAt: integer("rate_limit_reset_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("monkeytype_connection_user_id_idx").on(table.userId),
    index("monkeytype_connection_rate_limit_reset_idx").on(table.rateLimitResetAt),
  ],
);

export const githubFirmwareAppConnection = sqliteTable(
  "github_firmware_app_connection",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    installationId: text("installation_id").notNull(),
    accountLogin: text("account_login"),
    accountType: text("account_type"),
    targetType: text("target_type"),
    repositorySelection: text("repository_selection"),
    setupAction: text("setup_action"),
    userAccessTokenCiphertext: text("user_access_token_ciphertext"),
    userAccessTokenIv: text("user_access_token_iv"),
    userAccessTokenExpiresAt: integer("user_access_token_expires_at", { mode: "timestamp_ms" }),
    userRefreshTokenCiphertext: text("user_refresh_token_ciphertext"),
    userRefreshTokenIv: text("user_refresh_token_iv"),
    userRefreshTokenExpiresAt: integer("user_refresh_token_expires_at", { mode: "timestamp_ms" }),
    userTokenType: text("user_token_type"),
    connectedAt: integer("connected_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("github_firmware_app_connection_user_id_idx").on(table.userId),
    index("github_firmware_app_connection_installation_id_idx").on(table.installationId),
  ],
);

export const githubFirmwareRepository = sqliteTable(
  "github_firmware_repository",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    installationId: text("installation_id").notNull(),
    provider: text("provider").notNull(),
    firmwareFamily: text("firmware_family").notNull(),
    repositoryKind: text("repository_kind").notNull(),
    relationship: text("relationship").notNull(),
    owner: text("owner").notNull(),
    repo: text("repo").notNull(),
    repoId: text("repo_id"),
    defaultBranch: text("default_branch").notNull(),
    private: integer("private", { mode: "boolean" }).notNull(),
    fork: integer("fork", { mode: "boolean" }).notNull().default(false),
    parentOwner: text("parent_owner"),
    parentRepo: text("parent_repo"),
    workflowPath: text("workflow_path").notNull(),
    lastSourceHash: text("last_source_hash"),
    lastCommitSha: text("last_commit_sha"),
    lastRunId: text("last_run_id"),
    lastStatus: text("last_status"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("github_firmware_repository_user_id_owner_repo_idx").on(
      table.userId,
      table.owner,
      table.repo,
    ),
    index("github_firmware_repository_installation_id_idx").on(table.installationId),
  ],
);

export const githubFirmwareBranch = sqliteTable(
  "github_firmware_branch",
  {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => githubFirmwareRepository.id, { onDelete: "cascade" }),
    variantId: text("variant_id").notNull(),
    variantName: text("variant_name").notNull(),
    branchName: text("branch_name").notNull(),
    sourceSavePointId: text("source_save_point_id"),
    syncInputJson: text("sync_input_json"),
    deleteRequested: integer("delete_requested", { mode: "boolean" }).notNull().default(false),
    lastSourceHash: text("last_source_hash"),
    lastCommitSha: text("last_commit_sha"),
    lastRunId: text("last_run_id"),
    lastStatus: text("last_status"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("github_firmware_branch_repository_variant_idx").on(
      table.repositoryId,
      table.variantId,
    ),
    uniqueIndex("github_firmware_branch_repository_branch_idx").on(
      table.repositoryId,
      table.branchName,
    ),
  ],
);

export const githubFirmwareRun = sqliteTable(
  "github_firmware_run",
  {
    id: text("id").primaryKey(),
    repositoryId: text("repository_id")
      .notNull()
      .references(() => githubFirmwareRepository.id, { onDelete: "cascade" }),
    branchId: text("branch_id").references(() => githubFirmwareBranch.id, {
      onDelete: "set null",
    }),
    requestId: text("request_id").notNull(),
    runId: text("run_id"),
    headBranch: text("head_branch"),
    headSha: text("head_sha"),
    sourceHash: text("source_hash"),
    status: text("status").notNull(),
    conclusion: text("conclusion"),
    artifactName: text("artifact_name"),
    artifactId: text("artifact_id"),
    logUrl: text("log_url"),
    htmlUrl: text("html_url"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("github_firmware_run_request_id_idx").on(table.requestId),
    index("github_firmware_run_repository_id_idx").on(table.repositoryId),
    index("github_firmware_run_run_id_idx").on(table.runId),
  ],
);

export const githubFirmwareAppState = sqliteTable(
  "github_firmware_app_state",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    state: text("state").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("github_firmware_app_state_state_idx").on(table.state),
    index("github_firmware_app_state_user_id_idx").on(table.userId),
  ],
);
