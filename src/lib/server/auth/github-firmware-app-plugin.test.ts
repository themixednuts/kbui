import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import type { GitHubFirmwareAppStatus } from "$lib/github-app/types";
import { GitHubRestApiError } from "$lib/server/github/client";
import { GitHubAppOAuthClient } from "$lib/server/github-app/oauth";
import {
  githubFirmwareAppPlugin,
  type GitHubFirmwareAppPluginOptions,
} from "./github-firmware-app-plugin";

describe("GitHub firmware app better-auth plugin", () => {
  it("starts with GitHub App user authorization", async () => {
    const auth = createTestAuth();
    const { cookie } = await signIn(auth);

    const response = await connect(auth, cookie);
    const body = (await response.json()) as { installUrl: string; state: string };
    const url = new URL(body.installUrl);

    expect(response.status).toBe(200);
    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("Iv1.client");
    expect(url.searchParams.get("prompt")).toBe("select_account");
    expect(url.searchParams.get("redirect_uri")).toBeNull();
    expect(url.searchParams.get("state")).toBe(body.state);
  });

  it("connects an existing installation after user authorization", async () => {
    const auth = createTestAuth({
      fetchImpl: oauthFetch({
        installations: [
          {
            id: 144856631,
            account: { login: "themixednuts", type: "User" },
            repository_selection: "all",
            target_type: "User",
          },
        ],
      }),
    });
    const { cookie } = await signIn(auth);
    const connectResponse = await connect(auth, cookie);
    const { state } = (await connectResponse.json()) as { state: string };

    const callback = await auth.handler(
      new Request(
        `http://localhost/api/auth/firmware/github/callback?code=code-123&installation_id=144856631&state=${state}`,
        {
          headers: { cookie },
        },
      ),
    );

    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe(
      "http://localhost/settings?github_firmware=connected",
    );

    const status = await auth.handler(
      new Request("http://localhost/api/auth/firmware/github/status", {
        headers: { cookie },
      }),
    );
    const body = (await status.json()) as GitHubFirmwareAppStatus;

    expect(body.connected).toBe(true);
    expect(body.installation?.installationId).toBe("144856631");
    expect(body.tokenState).toBe("not-stored");
  });

  it("stores encrypted GitHub App user-token state when a token secret is configured", async () => {
    const auth = createTestAuth({
      secretKey: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
      fetchImpl: oauthFetch({
        installations: [
          {
            id: 144856631,
            account: { login: "themixednuts", type: "User" },
            repository_selection: "all",
            target_type: "User",
          },
        ],
      }),
    });
    const { cookie } = await signIn(auth);
    const connectResponse = await connect(auth, cookie);
    const { state } = (await connectResponse.json()) as { state: string };

    await auth.handler(
      new Request(
        `http://localhost/api/auth/firmware/github/callback?code=code-123&installation_id=144856631&state=${state}`,
        {
          headers: { cookie },
        },
      ),
    );

    const status = await auth.handler(
      new Request("http://localhost/api/auth/firmware/github/status", {
        headers: { cookie },
      }),
    );
    const body = (await status.json()) as GitHubFirmwareAppStatus;
    const serialized = JSON.stringify(body);

    expect(body.tokenState).toBe("stored");
    expect(serialized).not.toContain("ghu_token");
    expect(serialized).not.toContain("ghr_refresh");
  });

  it("creates a managed repo, syncs the active firmware branch, and dispatches a build", async () => {
    const github = new FakeGitHubClient();
    const auth = createTestAuth({
      fetchImpl: oauthFetch({
        installations: [
          {
            id: 144856631,
            account: { login: "octo-user", type: "User" },
            repository_selection: "all",
            target_type: "User",
          },
        ],
      }),
      githubClientFactory: () => github,
      installationTokenClient: fakeInstallationTokenClient(),
      secretKey: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
    });
    const { cookie } = await signIn(auth);
    const connectResponse = await connect(auth, cookie);
    const { state } = (await connectResponse.json()) as { state: string };
    await auth.handler(
      new Request(
        `http://localhost/api/auth/firmware/github/callback?code=code-123&installation_id=144856631&state=${state}`,
        { headers: { cookie } },
      ),
    );

    const build = await auth.handler(
      new Request("http://localhost/api/auth/firmware/github/build", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          profile: {
            firmware: "zmk",
            id: "corne",
            name: "Corne",
            zmk: { board: "nice_nano_v2", shield: "corne_left" },
          },
          source: {
            buildCommand: "west build -b nice_nano_v2 -- -DSHIELD=corne_left",
            files: [
              {
                content: "include:\n  - board: nice_nano_v2\n    shield: corne_left\n",
                mimeType: "text/yaml",
                path: "zmk/build.yaml",
                role: "zmk-build-yaml",
              },
            ],
            sourceHash: "abcdef1234567890",
          },
          variant: { id: "main", name: "main" },
        }),
      }),
    );
    const body = (await build.json()) as {
      branch: { branchName: string };
      build: { htmlUrl: string | null; requestId: string; runId: string | null; status: string };
      commit: { sha: string };
      repository: { fullName: string };
    };

    expect(build.status).toBe(200);
    expect(body.repository.fullName).toBe("octo-user/kbui-userspace");
    expect(body.branch.branchName).toBe("kbui/corne/main");
    expect(body.commit.sha).toBe("new-commit-sha");
    expect(body.build.status).toBe("dispatched");
    expect(body.build.runId).toBe("1");
    expect(github.createdRepository?.name).toBe("kbui-userspace");
    expect(github.createdTreePaths).toEqual([
      ".github/workflows/build.yml",
      ".kbui/manifest.json",
      "build.yaml",
      "config/west.yml",
    ]);
    expect(github.dispatchedWorkflow).toMatchObject({
      ref: "kbui/corne/main",
      workflowId: ".github/workflows/build.yml",
    });
    expect(github.defaultBranchWorkflow).toMatchObject({
      branch: "main",
      path: ".github/workflows/build.yml",
    });

    const download = await auth.handler(
      new Request("http://localhost/api/auth/firmware/github/artifact/download", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          artifactId: "456",
          requestId: body.build.requestId,
        }),
      }),
    );
    const downloadBody = (await download.json()) as {
      artifactName: string;
      fileName: string;
      zipBase64: string;
    };
    expect(download.status).toBe(200);
    expect(downloadBody.artifactName).toBe("firmware-uf2");
    expect(downloadBody.fileName).toBe("firmware-uf2.zip");
    expect(downloadBody.zipBase64).toBe("UEsDBA==");
  });

  it("falls back to the install URL when no installation is visible to the user", async () => {
    const auth = createTestAuth({
      fetchImpl: oauthFetch({ installations: [] }),
    });
    const { cookie } = await signIn(auth);
    const connectResponse = await connect(auth, cookie);
    const { state } = (await connectResponse.json()) as { state: string };

    const callback = await auth.handler(
      new Request(
        `http://localhost/api/auth/firmware/github/callback?code=code-123&state=${state}`,
        {
          headers: { cookie },
        },
      ),
    );
    const redirectUrl = new URL(callback.headers.get("location") ?? "");

    expect(callback.status).toBe(302);
    expect(redirectUrl.origin + redirectUrl.pathname).toBe(
      "https://github.com/apps/kbui-firmware/installations/new",
    );
    expect(redirectUrl.searchParams.get("state")).toBeTruthy();
  });
});

function createTestAuth({
  fetchImpl = oauthFetch(),
  githubClientFactory,
  installationTokenClient,
  releaseFlags,
  secretKey,
}: {
  fetchImpl?: typeof fetch;
  githubClientFactory?: GitHubFirmwareAppPluginOptions["githubClientFactory"];
  installationTokenClient?: GitHubFirmwareAppPluginOptions["installationTokenClient"];
  releaseFlags?: GitHubFirmwareAppPluginOptions["FLAGS"];
  secretKey?: string;
} = {}) {
  return betterAuth({
    baseURL: "http://localhost",
    secret: "better-auth-secret-for-github-firmware-plugin-tests",
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
      githubFirmwareAppConnection: [],
      githubFirmwareBranch: [],
      githubFirmwareRepository: [],
      githubFirmwareRun: [],
      githubFirmwareAppState: [],
    }),
    emailAndPassword: { enabled: true },
    rateLimit: { enabled: false },
    plugins: [
      githubFirmwareAppPlugin({
        FLAGS: releaseFlags ?? enabledReleaseFlags,
        GITHUB_APP_ID: "4232738",
        GITHUB_APP_CLIENT_ID: "Iv1.client",
        GITHUB_APP_CLIENT_SECRET: "secret",
        GITHUB_APP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
        GITHUB_APP_SLUG: "kbui-firmware",
        GITHUB_APP_TOKEN_SECRET_KEY: secretKey,
        githubClientFactory,
        installationTokenClient,
        nowMs: () => new Date("2026-07-06T18:00:00.000Z").getTime(),
        oauthClient: new GitHubAppOAuthClient({ fetchImpl }),
      }),
    ],
  });
}

const enabledReleaseFlags: NonNullable<GitHubFirmwareAppPluginOptions["FLAGS"]> = {
  getBooleanDetails: async (flagKey) => ({
    flagKey,
    value: true,
    variant: "on",
    reason: "test",
  }),
};

async function connect(auth: ReturnType<typeof createTestAuth>, cookie: string) {
  return auth.handler(
    new Request("http://localhost/api/auth/firmware/github/connect", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie,
      },
      body: "{}",
    }),
  );
}

async function signIn(auth: ReturnType<typeof createTestAuth>) {
  const signUp = await auth.handler(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Test User",
        email: "test@example.com",
        password: "test-password-123",
      }),
    }),
  );
  expect(signUp.status).toBe(200);

  const signInResponse = await auth.handler(
    new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "test-password-123",
      }),
    }),
  );
  expect(signInResponse.status).toBe(200);

  const setCookie = signInResponse.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0];
  expect(cookie).toContain("better-auth.session_token=");

  return { cookie };
}

function oauthFetch({
  installations = [],
}: {
  installations?: Array<{
    account: { login: string; type: string };
    id: number;
    repository_selection: string;
    target_type: string;
  }>;
} = {}): typeof fetch {
  return async (input) => {
    const url = requestUrl(input);
    if (url.endsWith("/login/oauth/access_token")) {
      return Response.json({
        access_token: "ghu_token",
        expires_in: 28800,
        refresh_token: "ghr_refresh",
        refresh_token_expires_in: 15897600,
        token_type: "bearer",
      });
    }

    return Response.json({
      installations,
      total_count: installations.length,
    });
  };
}

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

function fakeInstallationTokenClient() {
  return {
    createInstallationAccessToken() {
      return Effect.succeed({
        expiresAt: "2026-07-06T19:00:00.000Z",
        permissions: {},
        repositories: null,
        repositorySelection: "all",
        token: "ghs_installation",
      });
    },
  };
}

class FakeGitHubClient {
  createdRepository: { name: string } | null = null;
  createdTreePaths: string[] = [];
  defaultBranchWorkflow: { branch: string; path: string } | null = null;
  dispatchedWorkflow: { ref: string; workflowId: string | number } | null = null;
  transientWorkflowRunFailures = 0;
  workflowRunReadAttempts = 0;

  createRepositoryForAuthenticatedUser(request: { name: string; private?: boolean }) {
    this.createdRepository = { name: request.name };
    return Effect.succeed({
      clone_url: `https://github.com/octo-user/${request.name}.git`,
      default_branch: "main",
      full_name: `octo-user/${request.name}`,
      html_url: `https://github.com/octo-user/${request.name}`,
      id: 1,
      name: request.name,
      owner: { login: "octo-user" },
      private: request.private ?? true,
    });
  }

  getRepository(owner: string, repo: string) {
    return this.createRepositoryForAuthenticatedUser({ name: repo, private: true });
  }

  getContentMetadata() {
    return Effect.fail(
      new GitHubRestApiError({
        body: null,
        code: "GITHUB_NOT_FOUND",
        documentationUrl: null,
        errors: null,
        message: "Not Found",
        requestId: null,
        retryAt: null,
        status: 404,
      }),
    );
  }

  putFileContents(owner: string, repo: string, path: string, request: { branch?: string }) {
    this.defaultBranchWorkflow = { branch: request.branch ?? "main", path };
    return Effect.succeed({
      commit: {
        html_url: "https://github.test/commit/workflow-commit-sha",
        sha: "workflow-commit-sha",
      },
      content: {
        html_url: `https://github.test/blob/main/${path}`,
        name: path.split("/").at(-1) ?? path,
        path,
        sha: "workflow-content-sha",
      },
    });
  }

  getRef(owner: string, repo: string, ref: string) {
    if (ref === "heads/kbui/corne/main") {
      return Effect.fail(
        new GitHubRestApiError({
          body: null,
          code: "GITHUB_NOT_FOUND",
          documentationUrl: null,
          errors: null,
          message: "Not Found",
          requestId: null,
          retryAt: null,
          status: 404,
        }),
      );
    }
    return Effect.succeed(gitRef(ref, "parent-sha"));
  }

  createRef(owner: string, repo: string, request: { ref: string; sha: string }) {
    return Effect.succeed(gitRef(request.ref, request.sha));
  }

  getCommit() {
    return Effect.succeed({
      commit: { tree: { sha: "base-tree-sha", url: "https://api.github.test/tree" } },
      html_url: "https://github.com/octo-user/kbui-userspace/commit/parent-sha",
      sha: "parent-sha",
      url: "https://api.github.test/commit",
    });
  }

  createTree(owner: string, repo: string, request: { tree: Array<{ path: string }> }) {
    this.createdTreePaths = request.tree.map((item) => item.path).sort();
    return Effect.succeed({ sha: "tree-sha", tree: [], url: "https://api.github.test/tree" });
  }

  createCommit() {
    return Effect.succeed({
      html_url: "https://github.com/octo-user/kbui-userspace/commit/new-commit-sha",
      sha: "new-commit-sha",
      url: "https://api.github.test/commit",
    });
  }

  updateRef(owner: string, repo: string, ref: string, request: { sha: string }) {
    return Effect.succeed(gitRef(ref, request.sha));
  }

  deleteRef() {
    return Effect.succeed(null);
  }

  deleteRepository() {
    return Effect.succeed(null);
  }

  dispatchWorkflow(
    owner: string,
    repo: string,
    workflowId: string | number,
    request: { ref: string },
  ) {
    this.dispatchedWorkflow = { ref: request.ref, workflowId };
    return Effect.succeed({
      html_url: "https://github.com/octo-user/kbui-userspace/actions/runs/1",
      run_url: "https://api.github.com/repos/octo-user/kbui-userspace/actions/runs/1",
      workflow_run_id: 1,
    });
  }

  getWorkflowRun() {
    return Effect.gen({ self: this }, function* () {
      this.workflowRunReadAttempts += 1;
      if (this.transientWorkflowRunFailures > 0) {
        this.transientWorkflowRunFailures -= 1;
        return yield* Effect.fail(new Error("Network connection lost."));
      }
      return {
        artifacts_url:
          "https://api.github.com/repos/octo-user/kbui-userspace/actions/runs/1/artifacts",
        conclusion: "success",
        created_at: "2026-07-06T18:00:00.000Z",
        display_title: "Build ZMK firmware",
        event: "workflow_dispatch",
        head_branch: "kbui/corne/main",
        head_sha: "new-commit-sha",
        html_url: "https://github.com/octo-user/kbui-userspace/actions/runs/1",
        id: 1,
        name: "Build ZMK firmware",
        path: ".github/workflows/build.yml",
        run_number: 7,
        status: "completed",
        updated_at: "2026-07-06T18:02:00.000Z",
        workflow_id: 99,
      };
    });
  }

  listWorkflowRuns() {
    return this.getWorkflowRun().pipe(
      Effect.map((run) => ({
        total_count: 1,
        workflow_runs: [run],
      })),
    );
  }

  listWorkflowRunArtifacts() {
    return Effect.succeed({
      artifacts: [
        {
          archive_download_url:
            "https://api.github.com/repos/octo-user/kbui-userspace/actions/artifacts/456/zip",
          created_at: "2026-07-06T18:02:00.000Z",
          expired: false,
          expires_at: "2026-10-04T18:02:00.000Z",
          id: 456,
          name: "firmware-uf2",
          size_in_bytes: 4096,
          updated_at: "2026-07-06T18:02:00.000Z",
          url: "https://api.github.com/repos/octo-user/kbui-userspace/actions/artifacts/456",
        },
      ],
      total_count: 1,
    });
  }

  downloadArtifactZip() {
    return Effect.succeed({
      bytes: new Uint8Array([80, 75, 3, 4]),
      contentType: "application/zip",
      fileName: "firmware-uf2.zip",
      sizeBytes: 4,
    });
  }
}

function gitRef(ref: string, sha: string) {
  return {
    object: {
      sha,
      type: "commit",
      url: `https://api.github.test/commit/${sha}`,
    },
    ref: ref.startsWith("refs/") ? ref : `refs/${ref}`,
    url: `https://api.github.test/git/${ref}`,
  };
}
