import { describe, expect, it } from "vitest";

import { parseGitHubWorkflowRunWebhook, verifyGitHubWebhookSignature } from "./webhook";

describe("GitHub workflow run webhooks", () => {
  it("verifies the GitHub HMAC and normalizes a workflow_run payload", async () => {
    const secret = "test-webhook-secret";
    const payload = {
      action: "completed",
      installation: { id: 144_856_631 },
      repository: {
        id: 123,
        name: "kbui-userspace",
        full_name: "octo/kbui-userspace",
        owner: { login: "octo" },
      },
      workflow_run: {
        id: 456,
        run_number: 7,
        name: "Build QMK firmware",
        display_title: "Build main",
        event: "workflow_dispatch",
        status: "completed",
        conclusion: "success",
        head_branch: "kbui/corne/main",
        head_sha: "abc123",
        html_url: "https://github.com/octo/kbui-userspace/actions/runs/456",
        created_at: "2026-07-10T10:00:00Z",
        updated_at: "2026-07-10T10:02:00Z",
        run_started_at: "2026-07-10T10:00:05Z",
      },
    };
    const body = new TextEncoder().encode(JSON.stringify(payload));
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { hash: "SHA-256", name: "HMAC" },
      false,
      ["sign"],
    );
    const signature = await crypto.subtle.sign("HMAC", key, body);
    const header = `sha256=${hex(new Uint8Array(signature))}`;

    expect(await verifyGitHubWebhookSignature(body.buffer, header, secret)).toBe(true);
    expect(parseGitHubWorkflowRunWebhook(payload)).toMatchObject({
      action: "completed",
      installationId: "144856631",
      repository: { fullName: "octo/kbui-userspace", id: "123" },
      run: {
        conclusion: "success",
        headBranch: "kbui/corne/main",
        id: "456",
        status: "completed",
      },
    });
  });

  it("rejects malformed or differently signed payloads", async () => {
    const body = new TextEncoder().encode("{}");
    expect(await verifyGitHubWebhookSignature(body.buffer, null, "secret")).toBe(false);
    expect(
      await verifyGitHubWebhookSignature(body.buffer, `sha256=${"00".repeat(32)}`, "secret"),
    ).toBe(false);
    expect(() => parseGitHubWorkflowRunWebhook({ action: "completed" })).toThrow();
  });
});

function hex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
