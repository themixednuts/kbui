import { AgentWorkflow, type AgentWorkflowEvent, type AgentWorkflowStep } from "agents/workflows";
import { Effect } from "effect";

import type { GitHubFirmwareBuildEvent } from "$lib/github-app/types";
import { workflowRetryDelay } from "$lib/effect/cloudflare-workflow-retry";
import { platformError } from "$lib/effect/errors";
import { runWorkerEffect } from "$lib/effect/worker-runtime";

import type { FirmwareBuildAgent } from "./firmware-build-agent";

export interface FirmwareBuildWorkflowParams {
  branchName: string;
  initialEvent: GitHubFirmwareBuildEvent;
  repository: string;
  requestId: string;
  runId: string | null;
  startedAt: string;
}

const trackingStepConfig = {
  retries: {
    limit: 10_000,
    delay: workflowRetryDelay({ baseDelayMs: 2_000, maxDelayMs: 300_000 }),
  },
  timeout: "30 seconds",
} as const;

export class FirmwareBuildWorkflow extends AgentWorkflow<
  FirmwareBuildAgent,
  FirmwareBuildWorkflowParams
> {
  async run(
    event: AgentWorkflowEvent<FirmwareBuildWorkflowParams>,
    step: AgentWorkflowStep,
  ): Promise<{ requestId: string; terminal: boolean }> {
    return runWorkerEffect(
      "workflow.firmware-build",
      Effect.gen({ self: this }, function* () {
        const params = event.payload;
        yield* Effect.tryPromise({
          try: () =>
            step.do("mark github build waiting", trackingStepConfig, () =>
              runWorkerEffect(
                "workflow.firmware-build.mark-waiting",
                Effect.gen({ self: this }, function* () {
                  yield* Effect.tryPromise({
                    try: () => this.agent.publish(params.initialEvent),
                    catch: (cause) => platformError("firmware-build.publish-initial", cause),
                  });
                  yield* Effect.tryPromise({
                    try: () =>
                      this.agent.updateTracking(
                        params.requestId,
                        "waiting",
                        "Waiting for GitHub Actions",
                      ),
                    catch: (cause) => platformError("firmware-build.mark-waiting", cause),
                  });
                }),
              ),
            ),
          catch: (cause) => platformError("firmware-build.waiting-step", cause),
        });

        const completion = yield* Effect.tryPromise({
          try: () =>
            step.waitForEvent<GitHubFirmwareBuildEvent>("wait for github workflow completion", {
              type: "github-terminal",
              // Workflows require a finite deadline. The platform maximum keeps
              // this event-driven without introducing a polling path.
              timeout: "365 days",
            }),
          catch: (cause) => platformError("firmware-build.wait-for-terminal-event", cause),
        });

        yield* Effect.tryPromise({
          try: () =>
            step.do("mark github build complete", trackingStepConfig, () =>
              this.agent.completeTracking(completion.payload),
            ),
          catch: (cause) => platformError("firmware-build.complete-step", cause),
        });

        const result = { requestId: params.requestId, terminal: true };
        yield* Effect.tryPromise({
          try: () => step.reportComplete(result),
          catch: (cause) => platformError("firmware-build.report-complete", cause),
        });
        return result;
      }),
    );
  }
}
