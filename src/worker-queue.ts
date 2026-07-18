import { Effect } from "effect";

import type { RecordGitHubWorkflowRunWebhookInput } from "./agents/auth-agent";
import { platformError } from "./lib/effect/errors";
import { runWorkerEffect } from "./lib/effect/worker-runtime";

const authAgentName = "global-auth";

export function processGitHubWebhookQueue(
  batch: MessageBatch<RecordGitHubWorkflowRunWebhookInput>,
  env: Cloudflare.Env,
  _context: ExecutionContext,
): Promise<void> {
  return runWorkerEffect(
    "queue.github-workflow-runs",
    Effect.forEach(
      batch.messages,
      (message) => {
        const processMessage = Effect.tryPromise({
          try: () =>
            env.AuthAgent.getByName(authAgentName).processGitHubWorkflowRunWebhook(message.body, {
              id: message.id,
            }),
          catch: (cause) => platformError("queue.process-github-workflow-run", cause),
        });
        return Effect.matchEffect(processMessage, {
          onFailure: (error) => {
            const delaySeconds = Math.min(300, 2 ** Math.min(message.attempts + 1, 8));
            return Effect.sync(() => {
              console.warn(
                JSON.stringify({
                  event: "github.workflow_run.retry_scheduled",
                  deliveryId: message.body.deliveryId,
                  delaySeconds,
                  error: error.message,
                  queueMessageId: message.id,
                }),
              );
              message.retry({ delaySeconds });
            });
          },
          onSuccess: () => Effect.sync(() => message.ack()),
        });
      },
      { concurrency: 4, discard: true },
    ),
  );
}
