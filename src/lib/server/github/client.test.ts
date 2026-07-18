import { describe, expect, it } from "vite-plus/test";

import {
  GITHUB_REST_ACCEPT,
  GITHUB_REST_API_VERSION,
  GITHUB_REST_USER_AGENT,
  GitHubRestApiError,
  GitHubRestClient,
  mapGitHubRestError,
} from "./client";
import type { GitHubRepository, GitHubRestFetch } from "./client";

describe("GitHub REST client", () => {
  it("creates repositories with GitHub REST headers and JSON bodies", async () => {
    const fetchMock = createFetchMock([
      Response.json(repositoryResponse("firmware-builds")),
      Response.json(repositoryResponse("zmk-config")),
      Response.json(repositoryResponse("qmk-userspace-fork")),
    ]);
    const client = new GitHubRestClient({
      token: "ghu_test_token",
      fetchImpl: fetchMock.fetchImpl,
    });

    await client.createRepositoryForAuthenticatedUser({
      name: "firmware-builds",
      description: "KBG firmware builds",
      private: true,
      auto_init: true,
    });
    await client.createRepositoryFromTemplate(
      { owner: "zmkfirmware", repo: "unified firmware template" },
      {
        owner: "octo-user",
        name: "zmk-config",
        private: true,
        include_all_branches: false,
      },
    );
    await client.createRepositoryFork(
      { owner: "qmk", repo: "qmk_userspace" },
      {
        default_branch_only: true,
        name: "qmk-userspace-fork",
      },
    );

    const create = fetchMock.call(0);
    expect(create.method).toBe("POST");
    expect(create.url.pathname).toBe("/user/repos");
    expect(bodyJson(create)).toEqual({
      name: "firmware-builds",
      description: "KBG firmware builds",
      private: true,
      auto_init: true,
    });
    expectGitHubHeaders(create);

    const generate = fetchMock.call(1);
    expect(generate.method).toBe("POST");
    expect(generate.url.pathname).toBe("/repos/zmkfirmware/unified%20firmware%20template/generate");
    expect(bodyJson(generate)).toEqual({
      owner: "octo-user",
      name: "zmk-config",
      private: true,
      include_all_branches: false,
    });
    expectGitHubHeaders(generate);

    const fork = fetchMock.call(2);
    expect(fork.method).toBe("POST");
    expect(fork.url.pathname).toBe("/repos/qmk/qmk_userspace/forks");
    expect(bodyJson(fork)).toEqual({
      default_branch_only: true,
      name: "qmk-userspace-fork",
    });
    expectGitHubHeaders(fork);
  });

  it("creates and updates file contents, then dispatches a workflow", async () => {
    const fetchMock = createFetchMock([
      Response.json({
        content: {
          name: "crkbd.keymap",
          path: "config/crkbd.keymap",
          sha: "new-file-sha",
          html_url: "https://github.com/octo-user/zmk-config/blob/main/config/crkbd.keymap",
        },
        commit: {
          sha: "commit-sha",
          html_url: "https://github.com/octo-user/zmk-config/commit/commit-sha",
        },
      }),
      Response.json({
        workflow_run_id: 123,
        run_url: "https://api.github.com/repos/octo-user/zmk-config/actions/runs/123",
        html_url: "https://github.com/octo-user/zmk-config/actions/runs/123",
      }),
    ]);
    const client = new GitHubRestClient({
      token: "ghu_test_token",
      fetchImpl: fetchMock.fetchImpl,
    });

    await client.putFileContents("octo-user", "zmk-config", "config/crkbd.keymap", {
      message: "Update keymap",
      content: "YmFzZTY0LWtleW1hcA==",
      sha: "old-file-sha",
      branch: "main",
    });
    const dispatch = await client.dispatchWorkflow(
      "octo-user",
      "zmk-config",
      ".github/workflows/firmware.yml",
      {
        ref: "main",
        inputs: {
          board: "crkbd",
          shield: "corne_left",
          includeSettingsReset: true,
        },
      },
    );

    const putFile = fetchMock.call(0);
    expect(putFile.method).toBe("PUT");
    expect(putFile.url.pathname).toBe("/repos/octo-user/zmk-config/contents/config/crkbd.keymap");
    expect(bodyJson(putFile)).toEqual({
      message: "Update keymap",
      content: "YmFzZTY0LWtleW1hcA==",
      sha: "old-file-sha",
      branch: "main",
    });
    expectGitHubHeaders(putFile);

    const workflowDispatch = fetchMock.call(1);
    expect(workflowDispatch.method).toBe("POST");
    expect(workflowDispatch.url.pathname).toBe(
      "/repos/octo-user/zmk-config/actions/workflows/.github%2Fworkflows%2Ffirmware.yml/dispatches",
    );
    expect(bodyJson(workflowDispatch)).toEqual({
      ref: "main",
      inputs: {
        board: "crkbd",
        shield: "corne_left",
        includeSettingsReset: true,
      },
    });
    expect(dispatch.workflow_run_id).toBe(123);
    expectGitHubHeaders(workflowDispatch);
  });

  it("creates a branch commit through Git refs and trees", async () => {
    const fetchMock = createFetchMock([
      Response.json(gitRefResponse("refs/heads/kbui/main", "parent-sha")),
      Response.json({
        sha: "parent-sha",
        url: "https://api.github.com/repos/octo-user/zmk-config/git/commits/parent-sha",
        html_url: "https://github.com/octo-user/zmk-config/commit/parent-sha",
        commit: {
          tree: {
            sha: "base-tree-sha",
            url: "https://api.github.com/repos/octo-user/zmk-config/git/trees/base-tree-sha",
          },
        },
      }),
      Response.json({
        sha: "new-tree-sha",
        url: "https://api.github.com/repos/octo-user/zmk-config/git/trees/new-tree-sha",
        tree: [],
      }),
      Response.json({
        sha: "new-commit-sha",
        url: "https://api.github.com/repos/octo-user/zmk-config/git/commits/new-commit-sha",
        html_url: "https://github.com/octo-user/zmk-config/commit/new-commit-sha",
      }),
      Response.json(gitRefResponse("refs/heads/kbui/main", "new-commit-sha")),
    ]);
    const client = new GitHubRestClient({
      token: "ghu_test_token",
      fetchImpl: fetchMock.fetchImpl,
    });

    await client.getRef("octo-user", "zmk-config", "heads/kbui/main");
    await client.getCommit("octo-user", "zmk-config", "parent-sha");
    await client.createTree("octo-user", "zmk-config", {
      base_tree: "base-tree-sha",
      tree: [{ content: "keymap", mode: "100644", path: "config/corne.keymap", type: "blob" }],
    });
    await client.createCommit("octo-user", "zmk-config", {
      message: "Sync firmware",
      parents: ["parent-sha"],
      tree: "new-tree-sha",
    });
    await client.updateRef("octo-user", "zmk-config", "heads/kbui/main", {
      sha: "new-commit-sha",
    });

    expect(fetchMock.call(0).url.pathname).toBe(
      "/repos/octo-user/zmk-config/git/ref/heads/kbui/main",
    );
    expect(fetchMock.call(1).url.pathname).toBe(
      "/repos/octo-user/zmk-config/git/commits/parent-sha",
    );
    expect(fetchMock.call(2).method).toBe("POST");
    expect(fetchMock.call(2).url.pathname).toBe("/repos/octo-user/zmk-config/git/trees");
    expect(bodyJson(fetchMock.call(2))).toEqual({
      base_tree: "base-tree-sha",
      tree: [{ content: "keymap", mode: "100644", path: "config/corne.keymap", type: "blob" }],
    });
    expect(fetchMock.call(3).url.pathname).toBe("/repos/octo-user/zmk-config/git/commits");
    expect(bodyJson(fetchMock.call(3))).toEqual({
      message: "Sync firmware",
      parents: ["parent-sha"],
      tree: "new-tree-sha",
    });
    expect(fetchMock.call(4).method).toBe("PATCH");
    expect(fetchMock.call(4).url.pathname).toBe(
      "/repos/octo-user/zmk-config/git/refs/heads/kbui/main",
    );
    expect(bodyJson(fetchMock.call(4))).toEqual({ sha: "new-commit-sha" });
  });

  it("deletes only the requested branch ref or repository", async () => {
    const fetchMock = createFetchMock([
      new Response(null, { status: 204 }),
      new Response(null, { status: 204 }),
    ]);
    const client = new GitHubRestClient({
      token: "ghu_test_token",
      fetchImpl: fetchMock.fetchImpl,
    });

    await client.deleteRef("octo-user", "kbui-userspace", "heads/kbui/main");
    await client.deleteRepository("octo-user", "kbui-userspace");

    expect(fetchMock.call(0).method).toBe("DELETE");
    expect(fetchMock.call(0).url.pathname).toBe(
      "/repos/octo-user/kbui-userspace/git/refs/heads/kbui/main",
    );
    expect(fetchMock.call(1).method).toBe("DELETE");
    expect(fetchMock.call(1).url.pathname).toBe("/repos/octo-user/kbui-userspace");
  });

  it("reads repositories, content metadata, workflow runs, and run artifacts", async () => {
    const fetchMock = createFetchMock([
      Response.json(repositoryResponse("zmk-config")),
      Response.json({
        type: "file",
        name: "firmware.yml",
        path: ".github/workflows/firmware.yml",
        sha: "workflow-file-sha",
        size: 512,
        url: "https://api.github.com/repos/octo-user/zmk-config/contents/.github/workflows/firmware.yml",
        html_url:
          "https://github.com/octo-user/zmk-config/blob/main/.github/workflows/firmware.yml",
        download_url:
          "https://raw.githubusercontent.com/octo-user/zmk-config/main/.github/workflows/firmware.yml",
      }),
      Response.json({
        total_count: 1,
        workflow_runs: [
          {
            id: 123,
            name: "Firmware",
            head_branch: "main",
            head_sha: "abc123",
            path: ".github/workflows/firmware.yml",
            display_title: "Firmware build",
            run_number: 7,
            event: "workflow_dispatch",
            status: "completed",
            conclusion: "success",
            workflow_id: 99,
            html_url: "https://github.com/octo-user/zmk-config/actions/runs/123",
            artifacts_url:
              "https://api.github.com/repos/octo-user/zmk-config/actions/runs/123/artifacts",
            created_at: "2026-07-06T12:00:00Z",
            updated_at: "2026-07-06T12:02:00Z",
          },
        ],
      }),
      Response.json({
        total_count: 1,
        artifacts: [
          {
            id: 456,
            name: "firmware-uf2",
            size_in_bytes: 4096,
            url: "https://api.github.com/repos/octo-user/zmk-config/actions/artifacts/456",
            archive_download_url:
              "https://api.github.com/repos/octo-user/zmk-config/actions/artifacts/456/zip",
            expired: false,
            created_at: "2026-07-06T12:02:00Z",
            updated_at: "2026-07-06T12:02:00Z",
            expires_at: "2026-10-04T12:02:00Z",
          },
        ],
      }),
      Response.json({
        id: 123,
        name: "Firmware",
        head_branch: "main",
        head_sha: "abc123",
        path: ".github/workflows/firmware.yml",
        display_title: "Firmware build",
        run_number: 7,
        event: "workflow_dispatch",
        status: "completed",
        conclusion: "success",
        workflow_id: 99,
        html_url: "https://github.com/octo-user/zmk-config/actions/runs/123",
        artifacts_url:
          "https://api.github.com/repos/octo-user/zmk-config/actions/runs/123/artifacts",
        created_at: "2026-07-06T12:00:00Z",
        updated_at: "2026-07-06T12:02:00Z",
      }),
      new Response(new Uint8Array([80, 75, 3, 4]), {
        headers: {
          "content-disposition": 'attachment; filename="firmware-uf2.zip"',
          "content-type": "application/zip",
        },
      }),
    ]);
    const client = new GitHubRestClient({
      token: "ghu_test_token",
      fetchImpl: fetchMock.fetchImpl,
    });

    await client.getRepository("octo-user", "zmk-config");
    const metadata = await client.getContentMetadata(
      "octo-user",
      "zmk-config",
      ".github/workflows/firmware.yml",
      { ref: "feature/firmware build" },
    );
    const runs = await client.listWorkflowRuns("octo-user", "zmk-config", {
      branch: "main",
      event: "workflow_dispatch",
      status: "completed",
      head_sha: "abc123",
      per_page: 10,
      page: 2,
      exclude_pull_requests: true,
    });
    const artifacts = await client.listWorkflowRunArtifacts("octo-user", "zmk-config", 123, {
      name: "firmware-uf2",
      direction: "asc",
      per_page: 50,
    });
    const run = await client.getWorkflowRun("octo-user", "zmk-config", 123);
    const zip = await client.downloadArtifactZip("octo-user", "zmk-config", 456);

    expect(fetchMock.call(0).method).toBe("GET");
    expect(fetchMock.call(0).url.pathname).toBe("/repos/octo-user/zmk-config");
    expect(fetchMock.call(1).url.pathname).toBe(
      "/repos/octo-user/zmk-config/contents/.github/workflows/firmware.yml",
    );
    expect(fetchMock.call(1).url.searchParams.get("ref")).toBe("feature/firmware build");
    expect(fetchMock.call(2).url.pathname).toBe("/repos/octo-user/zmk-config/actions/runs");
    expect(fetchMock.call(2).url.searchParams.get("branch")).toBe("main");
    expect(fetchMock.call(2).url.searchParams.get("event")).toBe("workflow_dispatch");
    expect(fetchMock.call(2).url.searchParams.get("status")).toBe("completed");
    expect(fetchMock.call(2).url.searchParams.get("head_sha")).toBe("abc123");
    expect(fetchMock.call(2).url.searchParams.get("per_page")).toBe("10");
    expect(fetchMock.call(2).url.searchParams.get("page")).toBe("2");
    expect(fetchMock.call(2).url.searchParams.get("exclude_pull_requests")).toBe("true");
    expect(fetchMock.call(3).url.pathname).toBe(
      "/repos/octo-user/zmk-config/actions/runs/123/artifacts",
    );
    expect(fetchMock.call(3).url.searchParams.get("name")).toBe("firmware-uf2");
    expect(fetchMock.call(3).url.searchParams.get("direction")).toBe("asc");
    expect(fetchMock.call(3).url.searchParams.get("per_page")).toBe("50");
    expect(fetchMock.call(4).url.pathname).toBe("/repos/octo-user/zmk-config/actions/runs/123");
    expect(fetchMock.call(5).url.pathname).toBe(
      "/repos/octo-user/zmk-config/actions/artifacts/456/zip",
    );
    expectGitHubHeaders(fetchMock.call(0));
    expectGitHubHeaders(fetchMock.call(1));
    expectGitHubHeaders(fetchMock.call(2));
    expectGitHubHeaders(fetchMock.call(3));
    expectGitHubHeaders(fetchMock.call(4));
    expectGitHubHeaders(fetchMock.call(5));
    expect(Array.isArray(metadata)).toBe(false);
    expect((metadata as { sha: string }).sha).toBe("workflow-file-sha");
    expect(runs.workflow_runs[0]?.id).toBe(123);
    expect(artifacts.artifacts[0]?.archive_download_url).toContain("/zip");
    expect(run.conclusion).toBe("success");
    expect(zip.fileName).toBe("firmware-uf2.zip");
    expect(zip.bytes).toEqual(new Uint8Array([80, 75, 3, 4]));
  });

  it("rejects unsafe repository content paths before making a request", async () => {
    const fetchMock = createFetchMock([]);
    const client = new GitHubRestClient({
      token: "ghu_test_token",
      fetchImpl: fetchMock.fetchImpl,
    });

    expect(() => client.getContentMetadata("octo-user", "zmk-config", "../secret.txt")).toThrow(
      "cannot traverse",
    );
    expect(() =>
      client.putFileContents("octo-user", "zmk-config", "C:/tmp/keymap.c", {
        message: "bad path",
        content: "YmFk",
      }),
    ).toThrow("must be relative");
  });

  it("maps GitHub HTTP errors to small typed errors", async () => {
    const fetchMock = createFetchMock([
      Response.json(
        {
          message: "Not Found",
          documentation_url: "https://docs.github.com/rest/repos/repos#get-a-repository",
        },
        {
          status: 404,
          headers: { "x-github-request-id": "ABC1:DEF2:123" },
        },
      ),
    ]);
    const client = new GitHubRestClient({
      token: "ghu_test_token",
      fetchImpl: fetchMock.fetchImpl,
    });

    let caught: unknown;
    try {
      await client.getRepository("octo-user", "missing-repo");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(GitHubRestApiError);
    const notFound = caught as GitHubRestApiError;
    expect(notFound.code).toBe("GITHUB_NOT_FOUND");
    expect(notFound.status).toBe(404);
    expect(notFound.message).toBe("Not Found");
    expect(notFound.documentationUrl).toBe(
      "https://docs.github.com/rest/repos/repos#get-a-repository",
    );
    expect(notFound.requestId).toBe("ABC1:DEF2:123");

    const rateLimited = mapGitHubRestError(
      403,
      { message: "API rate limit exceeded" },
      new Headers({
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": "60",
      }),
    );

    expect(rateLimited.code).toBe("GITHUB_RATE_LIMITED");
    expect(rateLimited.retryAt).toBe("1970-01-01T00:01:00.000Z");
  });
});

interface RecordedRequest {
  url: URL;
  method: string;
  headers: Headers;
  rawBody: string | null;
}

function createFetchMock(responses: Response[]) {
  const calls: RecordedRequest[] = [];
  const fetchImpl: GitHubRestFetch = async (input, init) => {
    calls.push({
      url: new URL(input instanceof Request ? input.url : String(input)),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      rawBody: typeof init?.body === "string" ? init.body : null,
    });

    const response = responses.shift();
    if (!response) throw new Error("Unexpected GitHub REST request in test.");
    return response;
  };

  return {
    fetchImpl,
    call(index: number) {
      const call = calls[index];
      expect(call).toBeDefined();
      return call as RecordedRequest;
    },
  };
}

function bodyJson(call: RecordedRequest) {
  expect(call.rawBody).not.toBeNull();
  return JSON.parse(call.rawBody ?? "null") as unknown;
}

function expectGitHubHeaders(call: RecordedRequest) {
  expect(call.headers.get("accept")).toBe(GITHUB_REST_ACCEPT);
  expect(call.headers.get("authorization")).toBe("Bearer ghu_test_token");
  expect(call.headers.get("user-agent")).toBe(GITHUB_REST_USER_AGENT);
  expect(call.headers.get("x-github-api-version")).toBe(GITHUB_REST_API_VERSION);
}

function repositoryResponse(name: string): GitHubRepository {
  return {
    id: 1,
    name,
    full_name: `octo-user/${name}`,
    private: true,
    html_url: `https://github.com/octo-user/${name}`,
    clone_url: `https://github.com/octo-user/${name}.git`,
    default_branch: "main",
    is_template: false,
    owner: {
      login: "octo-user",
    },
  };
}

function gitRefResponse(ref: string, sha: string) {
  return {
    object: {
      sha,
      type: "commit",
      url: `https://api.github.com/repos/octo-user/zmk-config/git/commits/${sha}`,
    },
    ref,
    url: `https://api.github.com/repos/octo-user/zmk-config/git/${ref}`,
  };
}
