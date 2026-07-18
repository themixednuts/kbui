import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";

import {
  AuthSessionDataSchema,
  GitHubFirmwareBuildResponseSchema,
  MonkeytypeConnectionStatusSchema,
} from "./auth-client-boundary";

describe("auth client boundary schemas", () => {
  it("decodes session and Monkeytype payloads", () => {
    const session = Schema.decodeUnknownSync(AuthSessionDataSchema)({
      user: {
        id: "user-1",
        name: "Key Mapper",
        email: null,
        image: null,
        githubLogin: "keymapper",
      },
    });
    const monkeytype = Schema.decodeUnknownSync(MonkeytypeConnectionStatusSchema)({
      connected: true,
      username: "keymapper",
      mode: "time",
      mode2: "60",
      summary: null,
      lastSyncedAt: "2026-07-18T00:00:00.000Z",
      stale: false,
      error: null,
    });

    expect(session?.user?.githubLogin).toBe("keymapper");
    expect(monkeytype.connected).toBe(true);
  });

  it("rejects malformed firmware build payloads", () => {
    const decode = Schema.decodeUnknownSync(GitHubFirmwareBuildResponseSchema);

    expect(() =>
      decode({
        branch: {
          branchName: "kbui/main",
          lastCommitSha: null,
          lastRunId: null,
          lastSourceHash: null,
          lastStatus: null,
          sourceSavePointId: null,
          updatedAt: null,
          variantId: "main",
          variantName: "main",
        },
        build: {
          htmlUrl: null,
          requestId: 42,
          runId: null,
          status: "queued",
        },
        commit: null,
        files: 3,
        repository: {
          defaultBranch: "main",
          firmwareFamily: "qmk",
          fullName: "keymapper/kbui-userspace",
          htmlUrl: null,
          owner: "keymapper",
          private: true,
          relationship: "managed",
          repo: "kbui-userspace",
          repositoryKind: "qmk-userspace",
          workflowPath: ".github/workflows/build_binaries.yaml",
        },
        sourceHash: "sha256:source",
        workflowPaths: [".github/workflows/build_binaries.yaml"],
      }),
    ).toThrow();
  });
});
