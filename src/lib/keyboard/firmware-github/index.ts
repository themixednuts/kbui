import type { FirmwareGeneratedFile, FirmwareSourceBundle } from "../firmware-source";

export type FirmwareGitHubProviderId = "github";
export type FirmwareGitHubRepositoryKind = "qmk-userspace" | "zmk-config";
export type FirmwareGitHubFirmwareFamily = "qmk" | "zmk";
export type FirmwareGitHubRepositoryRelationship = "managed" | "adopted";
export type FirmwareGitHubAutomationOperation =
  | "create-repository"
  | "create-from-template"
  | "adopt-repository"
  | "create-branch"
  | "sync-source"
  | "dispatch-build"
  | "read-build"
  | "download-artifact";
export type FirmwareGitHubAutomationTokenKind = "user" | "installation";
export type FirmwareGitHubBuildTrigger = "workflow-dispatch" | "push";
export type FirmwareGitHubActionsPolicyWarning = "private-actions-uses-account-quota";

export interface FirmwareGitHubProvider {
  id: FirmwareGitHubProviderId;
  owner?: string;
}

export interface FirmwareGitHubProfileTarget {
  firmware: FirmwareGitHubFirmwareFamily;
  id?: string;
  name?: string;
  vendor?: string;
  [key: string]: unknown;
}

export interface QmkUserspacePathLayout {
  defaultWorkflowPath: string;
  keymapDirectory: string;
  keymapName: string;
  keyboardPath?: string;
  kind: "qmk-userspace";
  qmkRepository: string;
  qmkRef: string;
  repositoryRoot: "";
  sourcePathPrefix: "qmk/";
  workflowDirectory: ".github/workflows";
}

export interface ZmkConfigPathLayout {
  board?: string;
  buildMatrixPath: "build.yaml";
  configDirectory: "config";
  defaultWorkflowPath: string;
  keymapName: string;
  kind: "zmk-config";
  repositoryRoot: "";
  shield?: string;
  sourcePathPrefix: "zmk/";
  workflowDirectory: ".github/workflows";
  zmkRepository: string;
  zmkRef: string;
}

export type FirmwareGitHubPathLayout = QmkUserspacePathLayout | ZmkConfigPathLayout;

export interface FirmwareGitHubDesiredRepository {
  defaultBranch: string;
  description: string;
  fullName?: string;
  kind: FirmwareGitHubRepositoryKind;
  name: string;
  owner?: string;
  pathLayout: FirmwareGitHubPathLayout;
  private: boolean;
  provider: FirmwareGitHubProviderId;
  relationship: FirmwareGitHubRepositoryRelationship;
}

export interface DeriveFirmwareGitHubRepositoryOptions {
  defaultBranch?: string;
  owner?: string;
  private?: boolean;
  repositoryName?: string;
}

export interface FirmwareGitHubFileUpsert {
  content: string;
  encoding: "utf-8";
  mimeType: FirmwareGeneratedFile["mimeType"];
  path: string;
  role: FirmwareGeneratedFile["role"];
  sha?: string;
}

export interface FirmwareGitHubWorkflowFileSummary {
  hasWorkflowFiles: boolean;
  requiresWorkflowPermission: boolean;
  workflowPaths: string[];
}

export interface FirmwareGitHubContentUpsertPlan {
  branch: string;
  buildCommand: string;
  commitMessage: string;
  files: FirmwareGitHubFileUpsert[];
  repository: FirmwareGitHubDesiredRepository;
  sourceHash: string;
  workflowFiles: FirmwareGitHubWorkflowFileSummary;
}

export interface FirmwareGitHubContentUpsertOptions {
  branch?: string;
  commitMessage?: string;
  existingShas?: Readonly<Record<string, string | undefined>>;
  generatedAt?: string;
  variant?: FirmwareGitHubVariantRef;
}

export interface FirmwareGitHubWorkflowDispatchRequest {
  inputs?: Record<string, string>;
  owner: string;
  ref: string;
  repo: string;
  workflowId: string;
}

export interface FirmwareGitHubRepositoryRuntime {
  private: boolean;
  relationship: FirmwareGitHubRepositoryRelationship;
}

export interface FirmwareGitHubActionsPolicySummary {
  buildTrigger: FirmwareGitHubBuildTrigger;
  canRun: boolean;
  notes: FirmwareGitHubActionsPolicyWarning[];
}

export interface FirmwareGitHubAutomationTokenPlan {
  operation: FirmwareGitHubAutomationOperation;
  tokenKind: FirmwareGitHubAutomationTokenKind;
  reason: string;
}

export interface FirmwareGitHubVariantRef {
  id: string;
  name?: string;
  sourceSavePointId?: string;
}

export const defaultFirmwareGitHubRepositoryName = "kbui-userspace";
export const defaultQmkFirmwareRepository = "qmk/qmk_firmware";
export const defaultQmkFirmwareRef = "master";

type KnownGitHubWorkflowRunStatus =
  | "action_required"
  | "cancelled"
  | "completed"
  | "failure"
  | "in_progress"
  | "neutral"
  | "pending"
  | "queued"
  | "requested"
  | "skipped"
  | "stale"
  | "startup_failure"
  | "success"
  | "timed_out"
  | "waiting";

type KnownGitHubWorkflowRunConclusion =
  | "action_required"
  | "cancelled"
  | "failure"
  | "neutral"
  | "skipped"
  | "stale"
  | "success"
  | "timed_out";

export type GitHubWorkflowRunStatus = KnownGitHubWorkflowRunStatus | (string & {});
export type GitHubWorkflowRunConclusion = KnownGitHubWorkflowRunConclusion | (string & {});

export interface FirmwareGitHubWorkflowRun {
  conclusion?: GitHubWorkflowRunConclusion | null;
  htmlUrl?: string;
  id?: number;
  name?: string;
  runNumber?: number;
  status?: GitHubWorkflowRunStatus | null;
  workflowName?: string;
}

export type FirmwareGitHubBuildState =
  | "action-required"
  | "cancelled"
  | "failed"
  | "queued"
  | "running"
  | "skipped"
  | "succeeded"
  | "unknown";

export interface FirmwareGitHubBuildStatusSummary {
  conclusion?: GitHubWorkflowRunConclusion | null;
  htmlUrl?: string;
  label: string;
  runId?: number;
  runNumber?: number;
  state: FirmwareGitHubBuildState;
  status?: GitHubWorkflowRunStatus | null;
  successful: boolean;
  terminal: boolean;
}

type UnknownRecord = Record<string, unknown>;

const metadataContainerKeys = [
  "github",
  "firmwareGithub",
  "firmwareGitHub",
  "firmwareSource",
  "firmwareMetadata",
  "source",
  "catalog",
  "boardMetadata",
];

export function deriveFirmwareGitHubRepository(
  target: FirmwareGitHubProfileTarget,
  options: DeriveFirmwareGitHubRepositoryOptions = {},
): FirmwareGitHubDesiredRepository {
  const kind: FirmwareGitHubRepositoryKind =
    target.firmware === "zmk" ? "zmk-config" : "qmk-userspace";
  const records = metadataRecords(target, target.firmware);
  const displayName = firstString([target as unknown as UnknownRecord], ["name", "id"]) ?? kind;
  const configuredName = options.repositoryName;
  const name = slugFor(
    configuredName ?? defaultFirmwareGitHubRepositoryName,
    defaultFirmwareGitHubRepositoryName,
  );
  const owner =
    options.owner ?? firstString(records, ["owner", "githubOwner", "repositoryOwner", "login"]);
  const defaultBranch =
    options.defaultBranch ?? firstString(records, ["defaultBranch", "branch"]) ?? "main";
  const isPrivate =
    options.private ?? firstBoolean(records, ["private", "isPrivate", "repositoryPrivate"]) ?? true;
  const pathLayout =
    kind === "zmk-config"
      ? zmkConfigPathLayout(records, displayName)
      : qmkUserspacePathLayout(records, displayName);

  return {
    defaultBranch,
    description: "Generated kbui firmware source and build workflows.",
    fullName: owner ? `${owner}/${name}` : undefined,
    kind,
    name,
    owner,
    pathLayout,
    private: isPrivate,
    provider: "github",
    relationship: "managed",
  };
}

export function firmwareSourceBundleToGitHubUpserts(
  bundle: FirmwareSourceBundle,
  repository: FirmwareGitHubDesiredRepository,
  options: FirmwareGitHubContentUpsertOptions = {},
): FirmwareGitHubContentUpsertPlan {
  const supportFiles = firmwareGitHubSupportFiles(repository, bundle, {
    generatedAt: options.generatedAt,
    variant: options.variant,
  });
  const files = [...bundle.files, ...supportFiles]
    .map((file) => {
      const path = repositoryPathForGeneratedFile(file.path, repository.pathLayout);
      return {
        content: file.content,
        encoding: "utf-8" as const,
        mimeType: file.mimeType,
        path,
        role: file.role,
        sha: options.existingShas?.[path],
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));

  return {
    branch: options.branch ?? repository.defaultBranch,
    buildCommand: bundle.buildCommand,
    commitMessage:
      options.commitMessage ?? defaultCommitMessage(repository.kind, bundle.sourceHash),
    files,
    repository,
    sourceHash: bundle.sourceHash,
    workflowFiles: summarizeFirmwareGitHubWorkflowFiles(files),
  };
}

export function repositoryPathForGeneratedFile(
  generatedPath: string,
  layout: FirmwareGitHubPathLayout,
) {
  const path = normalizeGitHubRepositoryPath(generatedPath);
  if (!path.startsWith(layout.sourcePathPrefix)) return path;
  const sourceRelativePath = normalizeGitHubRepositoryPath(
    path.slice(layout.sourcePathPrefix.length),
  );

  if (layout.kind === "qmk-userspace") {
    if (sourceRelativePath === "keymap.json") return `.kbui/${layout.keymapName}.keymap.json`;
    const keymapPrefix = `keymaps/${layout.keymapName}/`;
    if (layout.keyboardPath && sourceRelativePath.startsWith(keymapPrefix)) {
      return normalizeGitHubRepositoryPath(
        `keyboards/${layout.keyboardPath}/keymaps/${layout.keymapName}/${sourceRelativePath.slice(
          keymapPrefix.length,
        )}`,
      );
    }
  }

  return sourceRelativePath;
}

export function firmwareGitHubBranchForVariant(variant: FirmwareGitHubVariantRef) {
  const scoped = variant.id
    .split("/")
    .map((part) => slugFor(part, "main"))
    .filter(Boolean);
  if (scoped.length > 1) return `kbui/${scoped.join("/")}`;
  if (variant.id === "main") return "kbui/main";
  return `kbui/${slugFor(variant.id, "variant")}`;
}

export function firmwareGitHubVariantForProfile(
  target: FirmwareGitHubProfileTarget,
  variant: FirmwareGitHubVariantRef,
): FirmwareGitHubVariantRef {
  const profileSlug = firmwareGitHubProfileSlug(target);
  const variantSlug = slugFor(variant.id, "main");
  return {
    ...variant,
    id: `${profileSlug}/${variantSlug}`,
    name: variant.name ?? variant.id,
  };
}

export function summarizeFirmwareGitHubWorkflowFiles(
  files: readonly { path: string }[],
): FirmwareGitHubWorkflowFileSummary {
  const workflowPaths = [
    ...new Set(
      files
        .map((file) => normalizeGitHubRepositoryPath(file.path))
        .filter((path) => path.startsWith(".github/workflows/")),
    ),
  ].sort((left, right) => left.localeCompare(right));

  return {
    hasWorkflowFiles: workflowPaths.length > 0,
    requiresWorkflowPermission: workflowPaths.length > 0,
    workflowPaths,
  };
}

export function mapGitHubWorkflowRunToBuildStatus(
  run: FirmwareGitHubWorkflowRun,
): FirmwareGitHubBuildStatusSummary {
  const status = run.status ?? "unknown";

  if (status === "completed") {
    return summaryForCompletedRun(run);
  }

  if (["queued", "pending", "requested", "waiting"].includes(status)) {
    return buildStatus(run, "queued", "Queued", false, false);
  }

  if (status === "in_progress") {
    return buildStatus(run, "running", "Running", false, false);
  }

  if (status === "action_required") {
    return buildStatus(run, "action-required", "Action required", false, false);
  }

  if (["failure", "startup_failure", "stale", "timed_out"].includes(status)) {
    return buildStatus(run, "failed", "Failed", true, false);
  }

  if (status === "cancelled") {
    return buildStatus(run, "cancelled", "Cancelled", true, false);
  }

  if (status === "success") {
    return buildStatus(run, "succeeded", "Succeeded", true, true);
  }

  if (["neutral", "skipped"].includes(status)) {
    return buildStatus(run, "skipped", "Skipped", true, false);
  }

  return buildStatus(run, "unknown", "Unknown", false, false);
}

export function normalizeGitHubRepositoryPath(path: string) {
  const trimmed = path.trim().replace(/\\/g, "/");
  if (/^[a-zA-Z]:\//.test(trimmed)) {
    throw new Error(`GitHub repository paths must be relative: ${path}`);
  }

  const withoutLeadingSlash = trimmed.replace(/^\/+/, "").replace(/^\.\/+/, "");
  const parts = withoutLeadingSlash.split("/").filter((part) => part.length > 0 && part !== ".");
  if (parts.length === 0) {
    throw new Error("GitHub repository path cannot be empty.");
  }
  if (parts.includes("..")) {
    throw new Error(`GitHub repository path cannot traverse directories: ${path}`);
  }

  return parts.join("/");
}

export function tokenPlanForFirmwareGitHubOperation(
  operation: FirmwareGitHubAutomationOperation,
): FirmwareGitHubAutomationTokenPlan {
  if (
    operation === "create-repository" ||
    operation === "create-from-template" ||
    operation === "adopt-repository"
  ) {
    return {
      operation,
      tokenKind: "user",
      reason:
        "Repo setup changes the user's account or selects a repo they can access, so it must run with a GitHub App user token.",
    };
  }

  return {
    operation,
    tokenKind: "installation",
    reason:
      "Branch maintenance and build feedback should run as the installed GitHub App with a short-lived installation token.",
  };
}

export function summarizeFirmwareGitHubActionsPolicy(
  repository: FirmwareGitHubRepositoryRuntime,
  buildTrigger: FirmwareGitHubBuildTrigger,
): FirmwareGitHubActionsPolicySummary {
  const notes: FirmwareGitHubActionsPolicyWarning[] = [];
  if (repository.private) notes.push("private-actions-uses-account-quota");

  return {
    buildTrigger,
    canRun: true,
    notes,
  };
}

function firmwareGitHubSupportFiles(
  repository: FirmwareGitHubDesiredRepository,
  bundle: FirmwareSourceBundle,
  options: Pick<FirmwareGitHubContentUpsertOptions, "generatedAt" | "variant">,
): FirmwareGeneratedFile[] {
  const manifest = kbuiManifestFile(repository, bundle, options);
  return repository.pathLayout.kind === "zmk-config"
    ? [zmkWorkflowFile(repository.pathLayout), zmkWestManifestFile(repository.pathLayout), manifest]
    : [qmkWorkflowFile(repository.pathLayout), qmkUserspaceManifestFile(repository), manifest];
}

function qmkWorkflowFile(layout: QmkUserspacePathLayout): FirmwareGeneratedFile {
  return {
    content: [
      "name: Build QMK firmware",
      "",
      "on:",
      "  workflow_dispatch:",
      "    inputs:",
      "      source_hash:",
      "        description: Generated source hash",
      "        required: false",
      "        type: string",
      "      variant_id:",
      "        description: Kbui keyboard variant",
      "        required: false",
      "        type: string",
      "",
      "permissions:",
      "  contents: write",
      "",
      "jobs:",
      "  build:",
      "    name: QMK Userspace Build",
      "    uses: qmk/.github/.github/workflows/qmk_userspace_build.yml@main",
      "    with:",
      `      qmk_repo: ${JSON.stringify(layout.qmkRepository)}`,
      `      qmk_ref: ${JSON.stringify(layout.qmkRef)}`,
      "  publish:",
      "    name: QMK Userspace Publish",
      "    uses: qmk/.github/.github/workflows/qmk_userspace_publish.yml@main",
      "    needs: build",
      "",
    ].join("\n"),
    mimeType: "text/yaml",
    path: ".github/workflows/build_binaries.yaml",
    role: "github-workflow",
  };
}

function qmkUserspaceManifestFile(
  repository: FirmwareGitHubDesiredRepository,
): FirmwareGeneratedFile {
  const layout = repository.pathLayout;
  const buildTargets =
    layout.kind === "qmk-userspace" && layout.keyboardPath
      ? [[layout.keyboardPath, layout.keymapName]]
      : [];
  return {
    content: `${JSON.stringify(
      {
        userspace_version: "1.1",
        build_targets: buildTargets,
      },
      null,
      2,
    )}\n`,
    mimeType: "application/json",
    path: "qmk.json",
    role: "qmk-userspace-manifest",
  };
}

function zmkWorkflowFile(layout: ZmkConfigPathLayout): FirmwareGeneratedFile {
  return {
    content: [
      "name: Build ZMK firmware",
      "",
      "on:",
      "  workflow_dispatch:",
      "    inputs:",
      "      source_hash:",
      "        description: Generated source hash",
      "        required: false",
      "        type: string",
      "      variant_id:",
      "        description: Kbui keyboard variant",
      "        required: false",
      "        type: string",
      "",
      "jobs:",
      "  build:",
      `    uses: ${layout.zmkRepository}/.github/workflows/build-user-config.yml@${layout.zmkRef}`,
      "",
    ].join("\n"),
    mimeType: "text/yaml",
    path: ".github/workflows/build.yml",
    role: "github-workflow",
  };
}

function zmkWestManifestFile(layout: ZmkConfigPathLayout): FirmwareGeneratedFile {
  const [owner] = layout.zmkRepository.split("/");
  return {
    content: [
      "manifest:",
      "  defaults:",
      `    revision: ${layout.zmkRef}`,
      "  remotes:",
      "    - name: zmkfirmware",
      `      url-base: https://github.com/${owner || "zmkfirmware"}`,
      "  projects:",
      "    - name: zmk",
      "      remote: zmkfirmware",
      "      import: app/west.yml",
      "  self:",
      "    path: config",
      "",
    ].join("\n"),
    mimeType: "text/yaml",
    path: "config/west.yml",
    role: "zmk-west-manifest",
  };
}

function kbuiManifestFile(
  repository: FirmwareGitHubDesiredRepository,
  bundle: FirmwareSourceBundle,
  options: Pick<FirmwareGitHubContentUpsertOptions, "generatedAt" | "variant">,
): FirmwareGeneratedFile {
  return {
    content: `${JSON.stringify(
      {
        generatedAt: options.generatedAt ?? new Date(0).toISOString(),
        generator: "kbui",
        repository: {
          kind: repository.kind,
          relationship: repository.relationship,
          workflowPath: repository.pathLayout.defaultWorkflowPath,
        },
        source: {
          buildCommand: bundle.buildCommand,
          diagnostics: bundle.diagnostics.length,
          files: bundle.files.length,
          hash: bundle.sourceHash,
        },
        variant: options.variant ?? { id: "main", name: "main" },
      },
      null,
      2,
    )}\n`,
    mimeType: "application/json",
    path: ".kbui/manifest.json",
    role: "kbui-manifest",
  };
}

function qmkUserspacePathLayout(
  records: readonly UnknownRecord[],
  displayName: string,
): QmkUserspacePathLayout {
  const keymapName =
    firstString(records, ["keymap", "keymapName", "qmkKeymap"]) ??
    slugFor(displayName, "kbgui_keymap").replace(/-/g, "_");
  const keyboardPath = firstString(records, [
    "keyboard",
    "keyboardPath",
    "qmkKeyboard",
    "qmkKeyboardPath",
    "keyboard_path",
  ]);

  return {
    defaultWorkflowPath: ".github/workflows/build_binaries.yaml",
    keymapDirectory: keyboardPath
      ? `keyboards/${keyboardPath}/keymaps/${keymapName}`
      : `keymaps/${keymapName}`,
    keymapName,
    keyboardPath,
    kind: "qmk-userspace",
    qmkRepository:
      firstString(records, ["qmkRepository", "qmkRepo", "repository"]) ??
      defaultQmkFirmwareRepository,
    qmkRef: firstString(records, ["qmkRef", "ref", "revision"]) ?? defaultQmkFirmwareRef,
    repositoryRoot: "",
    sourcePathPrefix: "qmk/",
    workflowDirectory: ".github/workflows",
  };
}

function zmkConfigPathLayout(
  records: readonly UnknownRecord[],
  displayName: string,
): ZmkConfigPathLayout {
  const keymapName =
    firstString(records, ["keymapName", "keymap", "shield", "zmkShield"]) ??
    slugFor(displayName, "kbgui_keymap").replace(/-/g, "_");

  return {
    board: firstString(records, ["board", "zmkBoard"]),
    buildMatrixPath: "build.yaml",
    configDirectory: "config",
    defaultWorkflowPath: ".github/workflows/build.yml",
    keymapName,
    kind: "zmk-config",
    repositoryRoot: "",
    shield: firstString(records, ["shield", "zmkShield"]),
    sourcePathPrefix: "zmk/",
    workflowDirectory: ".github/workflows",
    zmkRepository:
      firstString(records, ["zmkRepository", "zmkRepo", "repository"]) ?? "zmkfirmware/zmk",
    zmkRef: firstString(records, ["zmkRef", "ref", "revision"]) ?? "main",
  };
}

function summaryForCompletedRun(run: FirmwareGitHubWorkflowRun) {
  switch (run.conclusion) {
    case "success":
      return buildStatus(run, "succeeded", "Succeeded", true, true);
    case "cancelled":
      return buildStatus(run, "cancelled", "Cancelled", true, false);
    case "neutral":
    case "skipped":
      return buildStatus(run, "skipped", "Skipped", true, false);
    case "action_required":
      return buildStatus(run, "action-required", "Action required", true, false);
    case "failure":
    case "stale":
    case "timed_out":
      return buildStatus(run, "failed", "Failed", true, false);
    default:
      return buildStatus(run, "unknown", "Unknown", true, false);
  }
}

function buildStatus(
  run: FirmwareGitHubWorkflowRun,
  state: FirmwareGitHubBuildState,
  label: string,
  terminal: boolean,
  successful: boolean,
): FirmwareGitHubBuildStatusSummary {
  return {
    conclusion: run.conclusion,
    htmlUrl: run.htmlUrl,
    label,
    runId: run.id,
    runNumber: run.runNumber,
    state,
    status: run.status,
    successful,
    terminal,
  };
}

function metadataRecords(
  target: FirmwareGitHubProfileTarget,
  family: FirmwareGitHubFirmwareFamily,
) {
  const root = target as unknown as UnknownRecord;
  const records: UnknownRecord[] = [root];

  for (const key of metadataContainerKeys) {
    const record = nestedRecord(root, key);
    if (!record) continue;
    records.push(record);
    const familyRecord = nestedRecord(record, family);
    if (familyRecord) records.push(familyRecord);
  }

  const familyRecord = nestedRecord(root, family);
  if (familyRecord) records.push(familyRecord);

  return records;
}

function firmwareGitHubProfileSlug(target: FirmwareGitHubProfileTarget) {
  const records = metadataRecords(target, target.firmware);
  const displayName =
    firstString([target as unknown as UnknownRecord], ["name", "id"]) ?? target.firmware;
  const candidate =
    firstString(records, [
      "profileId",
      "keyboardId",
      "deviceProfileId",
      "id",
      "keyboard",
      "keyboardPath",
      "qmkKeyboard",
      "shield",
      "zmkShield",
      "name",
    ]) ?? displayName;
  return slugFor(candidate, "keyboard");
}

function nestedRecord(record: UnknownRecord, key: string) {
  const value = record[key];
  return isRecord(value) ? value : undefined;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function firstString(records: readonly UnknownRecord[], keys: readonly string[]) {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return undefined;
}

function firstBoolean(records: readonly UnknownRecord[], keys: readonly string[]) {
  for (const record of records) {
    for (const key of keys) {
      const value = record[key];
      if (typeof value === "boolean") return value;
    }
  }
  return undefined;
}

function defaultCommitMessage(kind: FirmwareGitHubRepositoryKind, sourceHash: string) {
  const hashSuffix = sourceHash.trim() ? ` (${sourceHash.trim().slice(0, 12)})` : "";
  return `Update ${kind} firmware source${hashSuffix}`;
}

function slugFor(value: string, fallback: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/(^[-._]+|[-._]+$)/g, "");

  return slug || fallback;
}
