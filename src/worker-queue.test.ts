import { describe, expect, it, vi } from "vite-plus/test";

import type { RecordGitHubWorkflowRunWebhookInput } from "./agents/auth-agent";
import { processGitHubWebhookQueue } from "./worker-queue";

function input(): RecordGitHubWorkflowRunWebhookInput {
  return {
    deliveryId: "delivery-1",
    event: {
      action: "completed",
      installationId: "1",
      repository: {
        id: "2",
        fullName: "owner/repo",
        name: "repo",
        owner: "owner",
      },
      run: {
        conclusion: "success",
        createdAt: "2026-07-16T09:59:00.000Z",
        displayTitle: "kbui firmware",
        event: "workflow_dispatch",
        headBranch: "kbui/board/main",
        headSha: "abc",
        htmlUrl: "https://github.com/owner/repo/actions/runs/3",
        id: "3",
        name: "Build firmware",
        runNumber: 4,
        startedAt: "2026-07-16T09:59:10.000Z",
        status: "completed",
        updatedAt: "2026-07-16T10:00:00.000Z",
      },
    },
    receivedAt: "2026-07-16T10:00:00.000Z",
  };
}

function queueMessage(body = input()) {
  return {
    ack: vi.fn(),
    attempts: 1,
    body,
    id: "queue-1",
    retry: vi.fn(),
    timestamp: new Date("2026-07-16T10:00:00.000Z"),
  };
}

function batch(message: ReturnType<typeof queueMessage>) {
  return {
    ackAll: vi.fn(),
    messages: [message],
    queue: "kbui-github-firmware-events",
    retryAll: vi.fn(),
  } as unknown as MessageBatch<RecordGitHubWorkflowRunWebhookInput>;
}

describe("GitHub firmware webhook queue", () => {
  it("acknowledges a message only after the AuthAgent processes it", async () => {
    const process = vi.fn().mockResolvedValue(undefined);
    const send = vi.fn();
    const message = queueMessage();
    const env = {
      AuthAgent: { getByName: () => ({ processGitHubWorkflowRunWebhook: process }) },
      GITHUB_FIRMWARE_EVENTS: { send },
    } as unknown as Cloudflare.Env;

    await processGitHubWebhookQueue(batch(message), env, {} as ExecutionContext);

    expect(process).toHaveBeenCalledWith(message.body, { id: message.id });
    expect(message.ack).toHaveBeenCalledOnce();
    expect(message.retry).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("delegates a failed message to Cloudflare's native queue retry", async () => {
    const process = vi.fn().mockRejectedValue(new Error("Agent unavailable"));
    const send = vi.fn().mockResolvedValue(undefined);
    const message = queueMessage();
    const env = {
      AuthAgent: { getByName: () => ({ processGitHubWorkflowRunWebhook: process }) },
      GITHUB_FIRMWARE_EVENTS: { send },
    } as unknown as Cloudflare.Env;

    await processGitHubWebhookQueue(batch(message), env, {} as ExecutionContext);

    expect(send).not.toHaveBeenCalled();
    expect(message.ack).not.toHaveBeenCalled();
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 4 });
  });

  it("does not depend on a second queue send to schedule retry", async () => {
    const process = vi.fn().mockRejectedValue(new Error("Agent unavailable"));
    const send = vi.fn().mockRejectedValue(new Error("Queue unavailable"));
    const message = queueMessage();
    const env = {
      AuthAgent: { getByName: () => ({ processGitHubWorkflowRunWebhook: process }) },
      GITHUB_FIRMWARE_EVENTS: { send },
    } as unknown as Cloudflare.Env;

    await processGitHubWebhookQueue(batch(message), env, {} as ExecutionContext);

    expect(message.ack).not.toHaveBeenCalled();
    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 4 });
  });
});
