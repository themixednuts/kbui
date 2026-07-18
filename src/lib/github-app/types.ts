export type GitHubFirmwareAppConnectionState =
  | "unconfigured"
  | "signed-out"
  | "not-connected"
  | "pending"
  | "connected";

export type GitHubFirmwareAppUserTokenState =
  | "stored"
  | "not-stored"
  | "expired"
  | "refresh-expired"
  | "unavailable";

export interface GitHubFirmwareAppPermissionSummary {
  actions: "read" | "write";
  administration: "write";
  contents: "write";
  metadata: "read";
  workflows: "write";
}

export interface GitHubFirmwareAppInstallation {
  accountLogin: string | null;
  accountType: string | null;
  connectedAt: string | null;
  installationId: string;
  repositorySelection: string | null;
  setupAction: string | null;
  updatedAt: string | null;
}

export interface GitHubFirmwareAppStatus {
  appName: string;
  appSlug: string | null;
  configured: boolean;
  connected: boolean;
  installUrl: string | null;
  installation: GitHubFirmwareAppInstallation | null;
  message: string | null;
  permissions: GitHubFirmwareAppPermissionSummary;
  state: GitHubFirmwareAppConnectionState;
  tokenState: GitHubFirmwareAppUserTokenState;
}

export interface GitHubFirmwareAppConnectResponse {
  installUrl: string;
  state: string;
}

export interface GitHubFirmwareSourceFileInput {
  content: string;
  mimeType: string;
  path: string;
  role: string;
}

export interface GitHubFirmwareSourceBundleInput {
  buildCommand: string;
  diagnostics?: unknown[];
  files: GitHubFirmwareSourceFileInput[];
  sourceHash: string;
}

export interface GitHubFirmwareProfileTargetInput {
  firmware: "qmk" | "zmk";
  id?: string;
  name?: string;
  vendor?: string;
  [key: string]: unknown;
}

export interface GitHubFirmwareVariantInput {
  id: string;
  name?: string;
  sourceSavePointId?: string;
}

export interface GitHubFirmwareSyncInput {
  private?: boolean;
  profile: GitHubFirmwareProfileTargetInput;
  repositoryName?: string;
  source: GitHubFirmwareSourceBundleInput;
  variant: GitHubFirmwareVariantInput;
}

export interface GitHubFirmwareRepositoryDto {
  defaultBranch: string;
  firmwareFamily: "qmk" | "zmk";
  fullName: string;
  htmlUrl: string | null;
  owner: string;
  private: boolean;
  relationship?: "adopted" | "managed";
  repo: string;
  repositoryKind: "qmk-userspace" | "zmk-config";
  workflowPath: string;
}

export interface GitHubFirmwareBranchDto {
  branchName: string;
  lastCommitSha: string | null;
  lastRunId: string | null;
  lastSourceHash: string | null;
  lastStatus: string | null;
  sourceSavePointId: string | null;
  updatedAt: string | null;
  variantId: string;
  variantName: string;
}

export interface GitHubFirmwareSyncResponse {
  branch: GitHubFirmwareBranchDto;
  commit: {
    htmlUrl: string | null;
    sha: string;
  } | null;
  files: number;
  repository: GitHubFirmwareRepositoryDto;
  sourceHash: string;
  workflowPaths: string[];
}

export interface GitHubFirmwareBuildResponse extends GitHubFirmwareSyncResponse {
  build: {
    htmlUrl: string | null;
    requestId: string;
    runId: string | null;
    status: string;
  };
}

export interface GitHubFirmwareCleanupTargetInput {
  profile: GitHubFirmwareProfileTargetInput;
  repositoryName?: string;
  variant: GitHubFirmwareVariantInput;
}

export interface GitHubFirmwareCleanupInput extends GitHubFirmwareCleanupTargetInput {
  action: "branch" | "repository";
  /** Exact repository full name required before deleting a managed repository. */
  confirmation?: string;
}

export interface GitHubFirmwareCleanupResponse {
  action: "branch" | "repository";
  branchName: string | null;
  deleted: boolean;
  repositoryFullName: string;
}

export interface GitHubFirmwareRunArtifactDto {
  createdAt: string | null;
  digest: string | null;
  expired: boolean;
  expiresAt: string | null;
  id: string;
  name: string;
  sizeBytes: number;
  updatedAt: string | null;
}

export interface GitHubFirmwareRunDto {
  artifact: GitHubFirmwareRunArtifactDto | null;
  artifacts: GitHubFirmwareRunArtifactDto[];
  conclusion: string | null;
  headBranch: string | null;
  headSha: string | null;
  htmlUrl: string | null;
  label: string;
  requestId: string;
  runId: string | null;
  runNumber: number | null;
  sourceHash: string | null;
  state: string;
  status: string;
  successful: boolean;
  terminal: boolean;
  updatedAt: string | null;
}

export interface GitHubFirmwareArtifactDownloadInput {
  artifactId: string;
  requestId: string;
}

export interface GitHubFirmwareArtifactDownloadResponse {
  artifactId: string;
  artifactName: string;
  contentType: string;
  digest: string | null;
  fileName: string;
  sizeBytes: number;
  zipBase64: string;
}

export interface GitHubFirmwareBuildEvent {
  branch: GitHubFirmwareBranchDto;
  deliveryId: string;
  receivedAt: string;
  repository: GitHubFirmwareRepositoryDto;
  run: GitHubFirmwareRunDto;
}

const nullableString = Schema.NullOr(Schema.String);
const firmwareRepositorySchema = Schema.Struct({
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
const firmwareBranchSchema = Schema.Struct({
  branchName: Schema.String,
  lastCommitSha: nullableString,
  lastRunId: nullableString,
  lastSourceHash: nullableString,
  lastStatus: nullableString,
  sourceSavePointId: nullableString,
  updatedAt: nullableString,
  variantId: Schema.String,
  variantName: Schema.String,
});
const firmwareArtifactSchema = Schema.Struct({
  createdAt: nullableString,
  digest: nullableString,
  expired: Schema.Boolean,
  expiresAt: nullableString,
  id: Schema.String,
  name: Schema.String,
  sizeBytes: Schema.Number,
  updatedAt: nullableString,
});
const firmwareRunSchema = Schema.Struct({
  artifact: Schema.NullOr(firmwareArtifactSchema),
  artifacts: Schema.Array(firmwareArtifactSchema),
  conclusion: nullableString,
  headBranch: nullableString,
  headSha: nullableString,
  htmlUrl: nullableString,
  label: Schema.String,
  requestId: Schema.String,
  runId: nullableString,
  runNumber: Schema.NullOr(Schema.Number),
  sourceHash: nullableString,
  state: Schema.String,
  status: Schema.String,
  successful: Schema.Boolean,
  terminal: Schema.Boolean,
  updatedAt: nullableString,
});

export const GitHubFirmwareBuildEventSchema = Schema.Struct({
  branch: firmwareBranchSchema,
  deliveryId: Schema.String,
  receivedAt: Schema.String,
  repository: firmwareRepositorySchema,
  run: firmwareRunSchema,
});

export const GitHubFirmwareSyncInputSchema = Schema.Struct({
  private: Schema.optionalKey(Schema.Boolean),
  profile: Schema.Struct({
    firmware: Schema.Literals(["qmk", "zmk"]),
    id: Schema.optionalKey(Schema.String),
    name: Schema.optionalKey(Schema.String),
    vendor: Schema.optionalKey(Schema.String),
  }),
  repositoryName: Schema.optionalKey(Schema.String),
  source: Schema.Struct({
    buildCommand: Schema.String,
    diagnostics: Schema.optionalKey(Schema.Array(Schema.Unknown)),
    files: Schema.Array(
      Schema.Struct({
        content: Schema.String,
        mimeType: Schema.String,
        path: Schema.String,
        role: Schema.String,
      }),
    ),
    sourceHash: Schema.String,
  }),
  variant: Schema.Struct({
    id: Schema.String,
    name: Schema.optionalKey(Schema.String),
    sourceSavePointId: Schema.optionalKey(Schema.String),
  }),
});

export const decodeGitHubFirmwareBuildEventEffect = Schema.decodeUnknownEffect(
  GitHubFirmwareBuildEventSchema,
);
export const decodeGitHubFirmwareSyncInputEffect = Schema.decodeUnknownEffect(
  GitHubFirmwareSyncInputSchema,
);
import { Schema } from "effect";
