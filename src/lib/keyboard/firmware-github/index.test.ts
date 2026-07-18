import { describe, expect, it } from "vite-plus/test";

import {
  deriveFirmwareGitHubRepository,
  firmwareGitHubBranchForVariant,
  firmwareGitHubVariantForProfile,
  firmwareSourceBundleToGitHubUpserts,
  mapGitHubWorkflowRunToBuildStatus,
  normalizeGitHubRepositoryPath,
  summarizeFirmwareGitHubWorkflowFiles,
  summarizeFirmwareGitHubActionsPolicy,
  tokenPlanForFirmwareGitHubOperation,
} from ".";
import type { FirmwareSourceBundle } from "../firmware-source";

function sourceBundle(files: FirmwareSourceBundle["files"]): FirmwareSourceBundle {
  return {
    buildCommand: "qmk compile -kb klakson/wb65 -km daily_driver",
    diagnostics: [],
    files,
    sourceHash: "abcdef1234567890",
  };
}

describe("firmware GitHub planning", () => {
  it("derives a QMK userspace repository and layout from profile-ish metadata", () => {
    const repository = deriveFirmwareGitHubRepository({
      firmware: "qmk",
      github: { owner: "octokey", private: false },
      name: "Klakson WB65",
      qmk: {
        keyboard: "klakson/wb65",
        keymap: "daily_driver",
        repository: "vendor/qmk-firmware",
        ref: "vendor-main",
      },
    });

    expect(repository).toMatchObject({
      defaultBranch: "main",
      fullName: "octokey/kbui-userspace",
      kind: "qmk-userspace",
      name: "kbui-userspace",
      owner: "octokey",
      private: false,
      provider: "github",
      relationship: "managed",
    });
    expect(repository.pathLayout).toMatchObject({
      defaultWorkflowPath: ".github/workflows/build_binaries.yaml",
      keymapDirectory: "keyboards/klakson/wb65/keymaps/daily_driver",
      keymapName: "daily_driver",
      keyboardPath: "klakson/wb65",
      kind: "qmk-userspace",
      qmkRepository: "vendor/qmk-firmware",
      qmkRef: "vendor-main",
      sourcePathPrefix: "qmk/",
      workflowDirectory: ".github/workflows",
    });
  });

  it("derives a ZMK layout inside the shared kbui userspace repo", () => {
    const repository = deriveFirmwareGitHubRepository({
      firmware: "zmk",
      firmwareGitHub: {
        defaultBranch: "trunk",
        repositoryName: "corney-config",
      },
      name: "Corney Left",
      zmk: {
        board: "nice_nano_v2",
        repository: "zmkfirmware/zmk",
        ref: "0123456789abcdef",
        shield: "corney_left",
      },
    });

    expect(repository).toMatchObject({
      defaultBranch: "trunk",
      kind: "zmk-config",
      name: "kbui-userspace",
      private: true,
    });
    expect(repository.pathLayout).toMatchObject({
      board: "nice_nano_v2",
      buildMatrixPath: "build.yaml",
      configDirectory: "config",
      keymapName: "corney_left",
      kind: "zmk-config",
      shield: "corney_left",
      sourcePathPrefix: "zmk/",
      zmkRepository: "zmkfirmware/zmk",
      zmkRef: "0123456789abcdef",
    });
  });

  it("scopes firmware branches by keyboard profile inside the shared repo", () => {
    expect(
      firmwareGitHubBranchForVariant(
        firmwareGitHubVariantForProfile(
          {
            firmware: "qmk",
            id: "workbench-65",
            name: "Workbench 65",
          },
          { id: "main", name: "Base" },
        ),
      ),
    ).toBe("kbui/workbench-65/main");
  });

  it("converts generated firmware source into deterministic GitHub content upserts", () => {
    const repository = deriveFirmwareGitHubRepository({
      firmware: "qmk",
      name: "Klakson WB65",
      qmk: {
        keyboard: "klakson/wb65",
        keymap: "daily_driver",
        repository: "vendor/qmk-firmware",
        ref: "vendor-main",
      },
    });
    const plan = firmwareSourceBundleToGitHubUpserts(
      sourceBundle([
        {
          content: "COMBO_ENABLE = yes\n",
          mimeType: "text/plain",
          path: "qmk/keymaps/daily_driver/rules.mk",
          role: "qmk-rules-mk",
        },
        {
          content: "#include QMK_KEYBOARD_H\n",
          mimeType: "text/x-csrc",
          path: "qmk/keymaps/daily_driver/keymap.c",
          role: "qmk-keymap-c",
        },
      ]),
      repository,
      {
        existingShas: {
          "keymaps/daily_driver/keymap.c": "existing-keymap-sha",
        },
      },
    );

    expect(plan).toMatchObject({
      branch: "main",
      buildCommand: "qmk compile -kb klakson/wb65 -km daily_driver",
      commitMessage: "Update qmk-userspace firmware source (abcdef123456)",
      sourceHash: "abcdef1234567890",
    });
    expect(plan.files.map((file) => file.path)).toEqual([
      ".github/workflows/build_binaries.yaml",
      ".kbui/manifest.json",
      "keyboards/klakson/wb65/keymaps/daily_driver/keymap.c",
      "keyboards/klakson/wb65/keymaps/daily_driver/rules.mk",
      "qmk.json",
    ]);
    expect(
      plan.files.find(
        (file) => file.path === "keyboards/klakson/wb65/keymaps/daily_driver/keymap.c",
      ),
    ).toMatchObject({
      encoding: "utf-8",
      role: "qmk-keymap-c",
    });
    expect(JSON.parse(plan.files.find((file) => file.path === "qmk.json")!.content)).toEqual({
      userspace_version: "1.1",
      build_targets: [["klakson/wb65", "daily_driver"]],
    });
    const workflow = plan.files.find(
      (file) => file.path === ".github/workflows/build_binaries.yaml",
    )!.content;
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("source_hash:");
    expect(workflow).toContain("variant_id:");
    expect(workflow).toContain('qmk_repo: "vendor/qmk-firmware"');
    expect(workflow).toContain('qmk_ref: "vendor-main"');
    expect(workflow).not.toContain("if: always()");
    expect(workflow).not.toContain("push:");
    expect(workflow).not.toContain("on: [push");
    expect(plan.workflowFiles.requiresWorkflowPermission).toBe(true);
  });

  it("flags workflow file upserts because GitHub requires workflow permission for them", () => {
    const repository = deriveFirmwareGitHubRepository({
      firmware: "zmk",
      name: "Corney Left",
      zmk: {
        board: "nice_nano_v2",
        ref: "0123456789abcdef",
        repository: "zmkfirmware/zmk",
        shield: "corney_left",
      },
    });
    const plan = firmwareSourceBundleToGitHubUpserts(
      sourceBundle([
        {
          content: "include:\n  - board: nice_nano_v2\n",
          mimeType: "text/yaml",
          path: "zmk/build.yaml",
          role: "zmk-build-yaml",
        },
      ]),
      repository,
    );

    expect(plan.files.map((file) => file.path)).toContain(".github/workflows/build.yml");
    expect(plan.files.map((file) => file.path)).toContain("build.yaml");
    expect(plan.files.map((file) => file.path)).toContain("config/west.yml");
    expect(plan.files.map((file) => file.path)).toContain(".kbui/manifest.json");
    expect(plan.workflowFiles).toEqual({
      hasWorkflowFiles: true,
      requiresWorkflowPermission: true,
      workflowPaths: [".github/workflows/build.yml"],
    });
    const workflow = plan.files.find(
      (file) => file.path === ".github/workflows/build.yml",
    )!.content;
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("source_hash:");
    expect(workflow).toContain("variant_id:");
    expect(workflow).toContain(
      "uses: zmkfirmware/zmk/.github/workflows/build-user-config.yml@0123456789abcdef",
    );
    const westManifest = plan.files.find((file) => file.path === "config/west.yml")!.content;
    expect(westManifest).toContain("revision: 0123456789abcdef");
    expect(workflow).not.toContain("push:");
    expect(workflow).not.toContain("pull_request:");
    expect(
      summarizeFirmwareGitHubWorkflowFiles([{ path: ".github/workflows/firmware.yaml" }]),
    ).toMatchObject({
      hasWorkflowFiles: true,
      requiresWorkflowPermission: true,
    });
  });

  it("maps GitHub workflow run status and conclusion into app build states", () => {
    expect(mapGitHubWorkflowRunToBuildStatus({ status: "queued" })).toMatchObject({
      state: "queued",
      successful: false,
      terminal: false,
    });
    expect(mapGitHubWorkflowRunToBuildStatus({ status: "in_progress" })).toMatchObject({
      state: "running",
      terminal: false,
    });
    expect(
      mapGitHubWorkflowRunToBuildStatus({
        conclusion: "success",
        htmlUrl: "https://github.test/actions/runs/1",
        id: 1,
        runNumber: 12,
        status: "completed",
      }),
    ).toMatchObject({
      htmlUrl: "https://github.test/actions/runs/1",
      runId: 1,
      runNumber: 12,
      state: "succeeded",
      successful: true,
      terminal: true,
    });
    expect(
      mapGitHubWorkflowRunToBuildStatus({ conclusion: "timed_out", status: "completed" }),
    ).toMatchObject({
      state: "failed",
      successful: false,
      terminal: true,
    });
    expect(
      mapGitHubWorkflowRunToBuildStatus({ conclusion: "action_required", status: "completed" }),
    ).toMatchObject({
      state: "action-required",
      terminal: true,
    });
  });

  it("rejects absolute and traversing repository paths", () => {
    expect(normalizeGitHubRepositoryPath("./zmk//config/corney.keymap")).toBe(
      "zmk/config/corney.keymap",
    );
    expect(() => normalizeGitHubRepositoryPath("C:/tmp/keymap.c")).toThrow("must be relative");
    expect(() => normalizeGitHubRepositoryPath("../keymap.c")).toThrow("cannot traverse");
  });

  it("keeps setup and maintenance token responsibilities separate", () => {
    expect(tokenPlanForFirmwareGitHubOperation("create-repository")).toMatchObject({
      tokenKind: "user",
    });
    expect(tokenPlanForFirmwareGitHubOperation("create-branch")).toMatchObject({
      tokenKind: "installation",
    });
    expect(tokenPlanForFirmwareGitHubOperation("sync-source")).toMatchObject({
      tokenKind: "installation",
    });
    expect(tokenPlanForFirmwareGitHubOperation("dispatch-build")).toMatchObject({
      tokenKind: "installation",
    });
    expect(tokenPlanForFirmwareGitHubOperation("download-artifact")).toMatchObject({
      tokenKind: "installation",
    });
  });

  it("surfaces private repo actions quota caveat without blocking manual builds", () => {
    expect(
      summarizeFirmwareGitHubActionsPolicy(
        {
          private: true,
          relationship: "managed",
        },
        "workflow-dispatch",
      ),
    ).toEqual({
      buildTrigger: "workflow-dispatch",
      canRun: true,
      notes: ["private-actions-uses-account-quota"],
    });
  });
});
