import { Effect, Schema } from "effect";

export const GITHUB_REST_API_BASE_URL = "https://api.github.com";
export const GITHUB_REST_API_VERSION = "2026-03-10";
export const GITHUB_REST_ACCEPT = "application/vnd.github+json";
export const GITHUB_REST_USER_AGENT = "kbui";

export type GitHubRestFetch = typeof fetch;

const defaultGitHubFetch: GitHubRestFetch = (input, init) => globalThis.fetch(input, init);

export type GitHubRestErrorCode =
  | "GITHUB_UNAUTHORIZED"
  | "GITHUB_FORBIDDEN"
  | "GITHUB_NOT_FOUND"
  | "GITHUB_CONFLICT"
  | "GITHUB_VALIDATION_FAILED"
  | "GITHUB_RATE_LIMITED"
  | "GITHUB_API_ERROR";

export interface GitHubRestErrorDetails {
  code: GitHubRestErrorCode;
  status: number;
  message: string;
  documentationUrl: string | null;
  requestId: string | null;
  retryAt: string | null;
  errors: unknown;
  body: unknown;
}

export class GitHubRestApiError extends Schema.TaggedErrorClass<GitHubRestApiError>()(
  "GitHubRestApiError",
  {
    code: Schema.Literals([
      "GITHUB_UNAUTHORIZED",
      "GITHUB_FORBIDDEN",
      "GITHUB_NOT_FOUND",
      "GITHUB_CONFLICT",
      "GITHUB_VALIDATION_FAILED",
      "GITHUB_RATE_LIMITED",
      "GITHUB_API_ERROR",
    ]),
    status: Schema.Number,
    message: Schema.String,
    documentationUrl: Schema.NullOr(Schema.String),
    requestId: Schema.NullOr(Schema.String),
    retryAt: Schema.NullOr(Schema.String),
    errors: Schema.Unknown,
    body: Schema.Unknown,
  },
) {}

export interface GitHubRestClientOptions {
  token: string;
  fetchImpl?: GitHubRestFetch;
  apiBaseUrl?: string;
  apiVersion?: string;
}

export interface CreateGitHubRepositoryRequest {
  name: string;
  description?: string;
  private?: boolean;
  auto_init?: boolean;
}

export interface CreateGitHubRepositoryFromTemplateRequest {
  owner?: string;
  name: string;
  description?: string;
  private?: boolean;
  include_all_branches?: boolean;
}

export interface CreateGitHubRepositoryForkRequest {
  default_branch_only?: boolean;
  name?: string;
  organization?: string;
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  clone_url: string;
  default_branch: string;
  is_template?: boolean;
  owner: {
    login: string;
  };
}

export interface GitHubContentMetadata {
  type: "file" | "dir" | "symlink" | "submodule";
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string | null;
  download_url: string | null;
  content?: string;
  encoding?: string;
}

export interface PutGitHubFileContentsRequest {
  message: string;
  content: string;
  sha?: string;
  branch?: string;
  committer?: GitHubCommitIdentity;
  author?: GitHubCommitIdentity;
}

export interface GitHubCommitIdentity {
  name: string;
  email: string;
}

export interface PutGitHubFileContentsResponse {
  content: {
    name: string;
    path: string;
    sha: string;
    html_url: string;
  };
  commit: {
    sha: string;
    html_url: string;
  };
}

export interface GitHubGitRef {
  ref: string;
  node_id?: string;
  url: string;
  object: {
    sha: string;
    type: string;
    url: string;
  };
}

export interface CreateGitHubRefRequest {
  ref: string;
  sha: string;
}

export interface UpdateGitHubRefRequest {
  force?: boolean;
  sha: string;
}

export interface GitHubTreeItem {
  content?: string;
  mode: "100644" | "100755" | "040000" | "160000" | "120000";
  path: string;
  sha?: string | null;
  type: "blob" | "tree" | "commit";
}

export interface CreateGitHubTreeRequest {
  base_tree?: string;
  tree: GitHubTreeItem[];
}

export interface GitHubTree {
  sha: string;
  url: string;
  tree: ReadonlyArray<{
    mode: string;
    path: string;
    sha: string;
    type: string;
    url: string;
  }>;
  truncated?: boolean;
}

export interface CreateGitHubCommitRequest {
  author?: GitHubCommitIdentity;
  committer?: GitHubCommitIdentity;
  message: string;
  parents?: string[];
  tree: string;
}

export interface GitHubCommit {
  commit?: {
    tree?: {
      sha: string;
      url: string;
    };
  };
  html_url: string;
  node_id?: string;
  sha: string;
  url: string;
}

export interface DispatchGitHubWorkflowRequest {
  ref: string;
  inputs?: Record<string, string | number | boolean>;
}

export interface DispatchGitHubWorkflowResponse {
  workflow_run_id: number;
  run_url: string;
  html_url: string;
}

export type GitHubWorkflowRunStatus =
  | "completed"
  | "action_required"
  | "cancelled"
  | "failure"
  | "neutral"
  | "skipped"
  | "stale"
  | "success"
  | "timed_out"
  | "in_progress"
  | "queued"
  | "requested"
  | "waiting"
  | "pending";

export interface ListGitHubWorkflowRunsQuery {
  branch?: string;
  event?: string;
  status?: GitHubWorkflowRunStatus;
  head_sha?: string;
  per_page?: number;
  page?: number;
  created?: string;
  exclude_pull_requests?: boolean;
}

export interface ListGitHubWorkflowRunsResponse {
  total_count: number;
  workflow_runs: ReadonlyArray<GitHubWorkflowRun>;
}

export interface GitHubWorkflowRun {
  id: number;
  name: string | null;
  head_branch: string | null;
  head_sha: string;
  path: string;
  display_title: string;
  run_number: number;
  event: string;
  status: string | null;
  conclusion: string | null;
  workflow_id: number;
  html_url: string;
  artifacts_url: string;
  created_at: string;
  updated_at: string;
}

export interface GetGitHubWorkflowRunResponse extends GitHubWorkflowRun {}

export interface ListGitHubWorkflowRunArtifactsQuery {
  per_page?: number;
  page?: number;
  name?: string;
  direction?: "asc" | "desc";
}

export interface ListGitHubWorkflowRunArtifactsResponse {
  total_count: number;
  artifacts: ReadonlyArray<GitHubWorkflowRunArtifact>;
}

export interface GitHubWorkflowRunArtifact {
  id: number;
  name: string;
  size_in_bytes: number;
  url: string;
  archive_download_url: string;
  expired: boolean;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  digest?: string | null;
}

export interface GitHubArtifactZipDownload {
  bytes: Uint8Array;
  contentType: string;
  fileName: string | null;
  sizeBytes: number;
}

const nullableString = Schema.NullOr(Schema.String);
const gitHubRepositorySchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  full_name: Schema.String,
  private: Schema.Boolean,
  html_url: Schema.String,
  clone_url: Schema.String,
  default_branch: Schema.String,
  is_template: Schema.optionalKey(Schema.Boolean),
  owner: Schema.Struct({ login: Schema.String }),
});
const gitHubContentMetadataSchema = Schema.Struct({
  type: Schema.Literals(["file", "dir", "symlink", "submodule"]),
  name: Schema.String,
  path: Schema.String,
  sha: Schema.String,
  size: Schema.Number,
  url: Schema.String,
  html_url: nullableString,
  download_url: nullableString,
  content: Schema.optionalKey(Schema.String),
  encoding: Schema.optionalKey(Schema.String),
});
const putGitHubFileContentsResponseSchema = Schema.Struct({
  content: Schema.Struct({
    name: Schema.String,
    path: Schema.String,
    sha: Schema.String,
    html_url: Schema.String,
  }),
  commit: Schema.Struct({ sha: Schema.String, html_url: Schema.String }),
});
const gitHubGitRefSchema = Schema.Struct({
  ref: Schema.String,
  node_id: Schema.optionalKey(Schema.String),
  url: Schema.String,
  object: Schema.Struct({ sha: Schema.String, type: Schema.String, url: Schema.String }),
});
const gitHubCommitSchema = Schema.Struct({
  commit: Schema.optionalKey(
    Schema.Struct({
      tree: Schema.optionalKey(Schema.Struct({ sha: Schema.String, url: Schema.String })),
    }),
  ),
  html_url: Schema.String,
  node_id: Schema.optionalKey(Schema.String),
  sha: Schema.String,
  url: Schema.String,
});
const gitHubTreeSchema = Schema.Struct({
  sha: Schema.String,
  url: Schema.String,
  tree: Schema.Array(
    Schema.Struct({
      mode: Schema.String,
      path: Schema.String,
      sha: Schema.String,
      type: Schema.String,
      url: Schema.String,
    }),
  ),
  truncated: Schema.optionalKey(Schema.Boolean),
});
const dispatchGitHubWorkflowResponseSchema = Schema.Struct({
  workflow_run_id: Schema.Number,
  run_url: Schema.String,
  html_url: Schema.String,
});
const gitHubWorkflowRunSchema = Schema.Struct({
  id: Schema.Number,
  name: nullableString,
  head_branch: nullableString,
  head_sha: Schema.String,
  path: Schema.String,
  display_title: Schema.String,
  run_number: Schema.Number,
  event: Schema.String,
  status: nullableString,
  conclusion: nullableString,
  workflow_id: Schema.Number,
  html_url: Schema.String,
  artifacts_url: Schema.String,
  created_at: Schema.String,
  updated_at: Schema.String,
});
const listGitHubWorkflowRunsResponseSchema = Schema.Struct({
  total_count: Schema.Number,
  workflow_runs: Schema.Array(gitHubWorkflowRunSchema),
});
const gitHubWorkflowRunArtifactSchema = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  size_in_bytes: Schema.Number,
  url: Schema.String,
  archive_download_url: Schema.String,
  expired: Schema.Boolean,
  created_at: Schema.String,
  updated_at: Schema.String,
  expires_at: nullableString,
  digest: Schema.optionalKey(nullableString),
});
const listGitHubWorkflowRunArtifactsResponseSchema = Schema.Struct({
  total_count: Schema.Number,
  artifacts: Schema.Array(gitHubWorkflowRunArtifactSchema),
});

interface GitHubRequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

export class GitHubRestClient {
  readonly #token: string;
  readonly #fetchImpl: GitHubRestFetch;
  readonly #apiBaseUrl: string;
  readonly #apiVersion: string;

  constructor(options: GitHubRestClientOptions) {
    this.#token = options.token;
    this.#fetchImpl = options.fetchImpl ?? defaultGitHubFetch;
    this.#apiBaseUrl = trimTrailingSlash(options.apiBaseUrl ?? GITHUB_REST_API_BASE_URL);
    this.#apiVersion = options.apiVersion ?? GITHUB_REST_API_VERSION;
  }

  createRepositoryForAuthenticatedUser(
    request: CreateGitHubRepositoryRequest,
  ): Effect.Effect<GitHubRepository, GitHubRestApiError> {
    return this.#request<GitHubRepository>("/user/repos", gitHubRepositorySchema, {
      method: "POST",
      body: request,
    });
  }

  createRepositoryFromTemplate(
    template: { owner: string; repo: string },
    request: CreateGitHubRepositoryFromTemplateRequest,
  ): Effect.Effect<GitHubRepository, GitHubRestApiError> {
    return this.#request<GitHubRepository>(
      `/repos/${pathSegment(template.owner)}/${pathSegment(template.repo)}/generate`,
      gitHubRepositorySchema,
      {
        method: "POST",
        body: request,
      },
    );
  }

  createRepositoryFork(
    source: { owner: string; repo: string },
    request: CreateGitHubRepositoryForkRequest = {},
  ): Effect.Effect<GitHubRepository, GitHubRestApiError> {
    return this.#request<GitHubRepository>(
      `/repos/${pathSegment(source.owner)}/${pathSegment(source.repo)}/forks`,
      gitHubRepositorySchema,
      {
        method: "POST",
        body: request,
      },
    );
  }

  getRepository(owner: string, repo: string): Effect.Effect<GitHubRepository, GitHubRestApiError> {
    return this.#request<GitHubRepository>(
      `/repos/${pathSegment(owner)}/${pathSegment(repo)}`,
      gitHubRepositorySchema,
    );
  }

  getContentMetadata(
    owner: string,
    repo: string,
    filePath: string,
    options: { ref?: string } = {},
  ): Effect.Effect<
    GitHubContentMetadata | ReadonlyArray<GitHubContentMetadata>,
    GitHubRestApiError
  > {
    return this.#request<GitHubContentMetadata | ReadonlyArray<GitHubContentMetadata>>(
      `/repos/${pathSegment(owner)}/${pathSegment(repo)}/contents/${repositoryPath(filePath)}`,
      Schema.Union([gitHubContentMetadataSchema, Schema.Array(gitHubContentMetadataSchema)]),
      {
        query: { ref: options.ref },
      },
    );
  }

  getContentSha(
    owner: string,
    repo: string,
    filePath: string,
    options: { ref?: string } = {},
  ): Effect.Effect<string, GitHubRestApiError> {
    return this.getContentMetadata(owner, repo, filePath, options).pipe(
      Effect.flatMap((metadata) =>
        "sha" in metadata
          ? Effect.succeed(metadata.sha)
          : Effect.fail(
              new GitHubRestApiError({
                code: "GITHUB_API_ERROR",
                status: 200,
                message:
                  "Expected GitHub content metadata for a file, received a directory listing.",
                documentationUrl: null,
                requestId: null,
                retryAt: null,
                errors: null,
                body: metadata,
              }),
            ),
      ),
      Effect.withSpan("github.rest.get-content-sha"),
    );
  }

  putFileContents(
    owner: string,
    repo: string,
    filePath: string,
    request: PutGitHubFileContentsRequest,
  ): Effect.Effect<PutGitHubFileContentsResponse, GitHubRestApiError> {
    return this.#request<PutGitHubFileContentsResponse>(
      `/repos/${pathSegment(owner)}/${pathSegment(repo)}/contents/${repositoryPath(filePath)}`,
      putGitHubFileContentsResponseSchema,
      {
        method: "PUT",
        body: request,
      },
    );
  }

  getRef(
    owner: string,
    repo: string,
    ref: string,
  ): Effect.Effect<GitHubGitRef, GitHubRestApiError> {
    return this.#request<GitHubGitRef>(
      `/repos/${pathSegment(owner)}/${pathSegment(repo)}/git/ref/${refPath(ref)}`,
      gitHubGitRefSchema,
    );
  }

  createRef(
    owner: string,
    repo: string,
    request: CreateGitHubRefRequest,
  ): Effect.Effect<GitHubGitRef, GitHubRestApiError> {
    return this.#request<GitHubGitRef>(
      `/repos/${pathSegment(owner)}/${pathSegment(repo)}/git/refs`,
      gitHubGitRefSchema,
      {
        method: "POST",
        body: request,
      },
    );
  }

  updateRef(
    owner: string,
    repo: string,
    ref: string,
    request: UpdateGitHubRefRequest,
  ): Effect.Effect<GitHubGitRef, GitHubRestApiError> {
    return this.#request<GitHubGitRef>(
      `/repos/${pathSegment(owner)}/${pathSegment(repo)}/git/refs/${refPath(ref)}`,
      gitHubGitRefSchema,
      {
        method: "PATCH",
        body: request,
      },
    );
  }

  deleteRef(owner: string, repo: string, ref: string): Effect.Effect<null, GitHubRestApiError> {
    return this.#request<null>(
      `/repos/${pathSegment(owner)}/${pathSegment(repo)}/git/refs/${refPath(ref)}`,
      Schema.Null,
      { method: "DELETE" },
    );
  }

  deleteRepository(owner: string, repo: string): Effect.Effect<null, GitHubRestApiError> {
    return this.#request<null>(`/repos/${pathSegment(owner)}/${pathSegment(repo)}`, Schema.Null, {
      method: "DELETE",
    });
  }

  getCommit(
    owner: string,
    repo: string,
    ref: string,
  ): Effect.Effect<GitHubCommit, GitHubRestApiError> {
    return this.#request<GitHubCommit>(
      `/repos/${pathSegment(owner)}/${pathSegment(repo)}/git/commits/${pathSegment(ref)}`,
      gitHubCommitSchema,
    );
  }

  createTree(
    owner: string,
    repo: string,
    request: CreateGitHubTreeRequest,
  ): Effect.Effect<GitHubTree, GitHubRestApiError> {
    return this.#request<GitHubTree>(
      `/repos/${pathSegment(owner)}/${pathSegment(repo)}/git/trees`,
      gitHubTreeSchema,
      {
        method: "POST",
        body: request,
      },
    );
  }

  createCommit(
    owner: string,
    repo: string,
    request: CreateGitHubCommitRequest,
  ): Effect.Effect<GitHubCommit, GitHubRestApiError> {
    return this.#request<GitHubCommit>(
      `/repos/${pathSegment(owner)}/${pathSegment(repo)}/git/commits`,
      gitHubCommitSchema,
      {
        method: "POST",
        body: request,
      },
    );
  }

  dispatchWorkflow(
    owner: string,
    repo: string,
    workflowId: string | number,
    request: DispatchGitHubWorkflowRequest,
  ): Effect.Effect<DispatchGitHubWorkflowResponse, GitHubRestApiError> {
    return this.#request<DispatchGitHubWorkflowResponse>(
      `/repos/${pathSegment(owner)}/${pathSegment(repo)}/actions/workflows/${pathSegment(
        String(workflowId),
      )}/dispatches`,
      dispatchGitHubWorkflowResponseSchema,
      {
        method: "POST",
        body: request,
      },
    );
  }

  listWorkflowRuns(
    owner: string,
    repo: string,
    query: ListGitHubWorkflowRunsQuery = {},
  ): Effect.Effect<ListGitHubWorkflowRunsResponse, GitHubRestApiError> {
    return this.#request<ListGitHubWorkflowRunsResponse>(
      `/repos/${pathSegment(owner)}/${pathSegment(repo)}/actions/runs`,
      listGitHubWorkflowRunsResponseSchema,
      {
        query: {
          branch: query.branch,
          event: query.event,
          status: query.status,
          head_sha: query.head_sha,
          per_page: query.per_page,
          page: query.page,
          created: query.created,
          exclude_pull_requests: query.exclude_pull_requests,
        },
      },
    );
  }

  getWorkflowRun(
    owner: string,
    repo: string,
    runId: number,
  ): Effect.Effect<GetGitHubWorkflowRunResponse, GitHubRestApiError> {
    return this.#request<GetGitHubWorkflowRunResponse>(
      `/repos/${pathSegment(owner)}/${pathSegment(repo)}/actions/runs/${runId}`,
      gitHubWorkflowRunSchema,
    );
  }

  listWorkflowRunArtifacts(
    owner: string,
    repo: string,
    runId: number,
    query: ListGitHubWorkflowRunArtifactsQuery = {},
  ): Effect.Effect<ListGitHubWorkflowRunArtifactsResponse, GitHubRestApiError> {
    return this.#request<ListGitHubWorkflowRunArtifactsResponse>(
      `/repos/${pathSegment(owner)}/${pathSegment(repo)}/actions/runs/${runId}/artifacts`,
      listGitHubWorkflowRunArtifactsResponseSchema,
      {
        query: {
          per_page: query.per_page,
          page: query.page,
          name: query.name,
          direction: query.direction,
        },
      },
    );
  }

  downloadArtifactZip(
    owner: string,
    repo: string,
    artifactId: number,
  ): Effect.Effect<GitHubArtifactZipDownload, GitHubRestApiError> {
    return Effect.gen({ self: this }, function* () {
      const response = yield* this.#rawRequestEffect(
        `/repos/${pathSegment(owner)}/${pathSegment(repo)}/actions/artifacts/${artifactId}/zip`,
      );
      if (!response.ok) {
        const responseText = yield* readGitHubResponseTextEffect(response);
        const body = decodeGitHubResponseTextLenient(response, responseText);
        return yield* Effect.fail(mapGitHubRestError(response.status, body, response.headers));
      }

      const buffer = yield* Effect.tryPromise({
        try: () => response.arrayBuffer(),
        catch: (cause) => networkGitHubError("GitHub artifact body could not be read.", cause),
      });
      const bytes = new Uint8Array(buffer);
      return {
        bytes,
        contentType: response.headers.get("content-type") ?? "application/zip",
        fileName: fileNameFromContentDisposition(response.headers.get("content-disposition")),
        sizeBytes: bytes.byteLength,
      };
    }).pipe(Effect.withSpan("github.rest.download-artifact"));
  }

  #request<T>(
    path: string,
    schema: Schema.Codec<T, unknown, never, never>,
    options: GitHubRequestOptions = {},
  ): Effect.Effect<T, GitHubRestApiError> {
    return Effect.gen({ self: this }, function* () {
      const response = yield* this.#rawRequestEffect(path, options);
      const responseText = yield* readGitHubResponseTextEffect(response);
      if (!response.ok) {
        const responseBody = decodeGitHubResponseTextLenient(response, responseText);
        return yield* Effect.fail(
          mapGitHubRestError(response.status, responseBody, response.headers),
        );
      }
      const responseBody = yield* decodeGitHubResponseTextEffect(response, responseText);
      return yield* Schema.decodeUnknownEffect(schema)(responseBody).pipe(
        Effect.mapError(
          (cause) =>
            new GitHubRestApiError({
              code: "GITHUB_API_ERROR",
              status: response.status,
              message: `GitHub REST response did not match its contract: ${String(cause)}`,
              documentationUrl: null,
              requestId: response.headers.get("x-github-request-id"),
              retryAt: null,
              errors: cause,
              body: responseBody,
            }),
        ),
      );
    }).pipe(Effect.withSpan(`github.rest.${options.method ?? "GET"}.${path}`));
  }

  #rawRequestEffect(path: string, options: GitHubRequestOptions = {}) {
    return Effect.flatMap(
      Effect.try({
        try: () => {
          const url = new URL(`${this.#apiBaseUrl}${path}`);
          for (const [key, value] of Object.entries(options.query ?? {})) {
            if (value !== undefined) url.searchParams.set(key, String(value));
          }
          const headers = new Headers({
            Accept: GITHUB_REST_ACCEPT,
            Authorization: `Bearer ${this.#token}`,
            "User-Agent": GITHUB_REST_USER_AGENT,
            "X-GitHub-Api-Version": this.#apiVersion,
          });
          let body: string | undefined;
          if (options.body !== undefined) {
            headers.set("Content-Type", "application/json");
            body = JSON.stringify(options.body);
          }
          return { body, headers, url: url.toString() };
        },
        catch: (cause) => networkGitHubError("GitHub REST request could not be encoded.", cause),
      }),
      ({ body, headers, url }) =>
        Effect.tryPromise({
          try: (signal) =>
            this.#fetchImpl(url, { body, headers, method: options.method ?? "GET", signal }),
          catch: (cause) => networkGitHubError("GitHub REST request failed.", cause),
        }),
    );
  }
}

function networkGitHubError(message: string, cause: unknown) {
  return new GitHubRestApiError({
    code: "GITHUB_API_ERROR",
    status: 0,
    message: cause instanceof Error ? `${message} ${cause.message}` : message,
    documentationUrl: null,
    requestId: null,
    retryAt: null,
    errors: cause,
    body: null,
  });
}

function readGitHubResponseTextEffect(response: Response) {
  return Effect.tryPromise({
    try: () => response.text(),
    catch: (cause) => networkGitHubError("GitHub REST response body could not be read.", cause),
  });
}

function decodeGitHubResponseTextEffect(response: Response, text: string) {
  if (!text) return Effect.succeed(null);
  if (!isJsonResponseText(response, text)) return Effect.succeed(text);
  return Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(text).pipe(
    Effect.mapError(
      (cause) =>
        new GitHubRestApiError({
          code: "GITHUB_API_ERROR",
          status: response.status,
          message: `GitHub REST returned malformed JSON: ${String(cause)}`,
          documentationUrl: null,
          requestId: response.headers.get("x-github-request-id"),
          retryAt: null,
          errors: cause,
          body: text,
        }),
    ),
  );
}

function decodeGitHubResponseTextLenient(response: Response, text: string): unknown {
  if (!text) return null;
  if (!isJsonResponseText(response, text)) return text;
  const decoded = Schema.decodeUnknownResult(Schema.UnknownFromJsonString)(text);
  return decoded._tag === "Success" ? decoded.success : text;
}

function isJsonResponseText(response: Response, text: string) {
  const contentType = response.headers.get("content-type") ?? "";
  const trimmed = text.trimStart();
  return contentType.includes("json") || trimmed.startsWith("{") || trimmed.startsWith("[");
}

export function mapGitHubRestError(
  status: number,
  body: unknown,
  headers: Headers = new Headers(),
): GitHubRestApiError {
  return new GitHubRestApiError({
    code: gitHubErrorCode(status, headers),
    status,
    message: messageFromBody(body) ?? "GitHub REST request failed.",
    documentationUrl: stringField(body, "documentation_url"),
    requestId: headers.get("x-github-request-id"),
    retryAt: retryAtFromHeaders(headers),
    errors: objectField(body, "errors"),
    body,
  });
}

function gitHubErrorCode(status: number, headers: Headers): GitHubRestErrorCode {
  if (isRateLimited(status, headers)) return "GITHUB_RATE_LIMITED";
  switch (status) {
    case 401:
      return "GITHUB_UNAUTHORIZED";
    case 403:
      return "GITHUB_FORBIDDEN";
    case 404:
      return "GITHUB_NOT_FOUND";
    case 409:
      return "GITHUB_CONFLICT";
    case 422:
      return "GITHUB_VALIDATION_FAILED";
    default:
      return "GITHUB_API_ERROR";
  }
}

function isRateLimited(status: number, headers: Headers) {
  if (status === 429) return true;
  return status === 403 && headers.get("x-ratelimit-remaining") === "0";
}

function retryAtFromHeaders(headers: Headers) {
  const retryAfter = parseNumber(headers.get("retry-after"));
  if (retryAfter !== null) return new Date(Date.now() + retryAfter * 1000).toISOString();

  const resetEpochSeconds = parseNumber(headers.get("x-ratelimit-reset"));
  if (resetEpochSeconds !== null) return new Date(resetEpochSeconds * 1000).toISOString();

  return null;
}

function messageFromBody(body: unknown) {
  const message = stringField(body, "message");
  if (message) return message;
  if (typeof body === "string" && body.trim()) return body;
  return null;
}

function stringField(body: unknown, field: string) {
  if (!body || typeof body !== "object") return null;
  const value = (body as Record<string, unknown>)[field];
  return typeof value === "string" && value.trim() ? value : null;
}

function objectField(body: unknown, field: string) {
  if (!body || typeof body !== "object") return null;
  return (body as Record<string, unknown>)[field] ?? null;
}

function parseNumber(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fileNameFromContentDisposition(value: string | null) {
  if (!value) return null;
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(value);
  if (utf8Match?.[1]) return decodeURIComponent(utf8Match[1]);

  const quotedMatch = /filename="([^"]+)"/i.exec(value);
  if (quotedMatch?.[1]) return quotedMatch[1];

  const plainMatch = /filename=([^;]+)/i.exec(value);
  return plainMatch?.[1]?.trim() || null;
}

function pathSegment(value: string) {
  return encodeURIComponent(value);
}

function repositoryPath(value: string) {
  const trimmed = value.trim().replace(/\\/g, "/");
  if (!trimmed) throw new Error("GitHub repository path cannot be empty.");
  if (/^[a-zA-Z]:\//.test(trimmed)) {
    throw new Error(`GitHub repository paths must be relative: ${value}`);
  }

  const withoutLeadingSlash = trimmed.replace(/^\/+/, "").replace(/^\.\/+/, "");
  const segments = withoutLeadingSlash
    .split("/")
    .filter((segment) => segment.length > 0 && segment !== ".");

  if (segments.length === 0) throw new Error("GitHub repository path cannot be empty.");
  if (segments.includes("..")) {
    throw new Error(`GitHub repository path cannot traverse directories: ${value}`);
  }

  return segments.map((segment) => encodeURIComponent(segment)).join("/");
}

function refPath(value: string) {
  const trimmed = value
    .trim()
    .replace(/^refs\//, "")
    .replace(/^\/+/, "");
  if (!trimmed) throw new Error("GitHub ref cannot be empty.");
  if (trimmed.split("/").some((segment) => segment === "." || segment === ".." || !segment)) {
    throw new Error(`GitHub ref is invalid: ${value}`);
  }
  return trimmed
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}
