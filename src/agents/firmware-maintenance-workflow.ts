import { AgentWorkflow, type AgentWorkflowEvent, type AgentWorkflowStep } from "agents/workflows";
import { Effect } from "effect";

import type { AuthAgent, FirmwareMaintenanceSummary } from "./auth-agent";
import { workflowRetryDelay } from "$lib/effect/cloudflare-workflow-retry";
import { platformError } from "$lib/effect/errors";
import { runWorkerEffect } from "$lib/effect/worker-runtime";

export interface FirmwareMaintenanceWorkflowParams {
  reason: "scheduled" | "requested";
  requestedAt: string;
}

const reconciliationStepConfig = {
  retries: {
    limit: 10_000,
    delay: workflowRetryDelay({ baseDelayMs: 5_000, maxDelayMs: 900_000 }),
  },
  timeout: "15 minutes",
} as const;

export class FirmwareMaintenanceWorkflow extends AgentWorkflow<
  AuthAgent,
  FirmwareMaintenanceWorkflowParams
> {
  async run(
    event: AgentWorkflowEvent<FirmwareMaintenanceWorkflowParams>,
    step: AgentWorkflowStep,
  ): Promise<FirmwareMaintenanceSummary> {
    return runWorkerEffect(
      "workflow.firmware-maintenance",
      Effect.gen({ self: this }, function* () {
        const summary = yield* Effect.tryPromise({
          try: () =>
            step.do<FirmwareMaintenanceSummary, typeof reconciliationStepConfig>(
              "reconcile firmware repositories",
              reconciliationStepConfig,
              () => this.agent.reconcileFirmwareRepositories(),
            ),
          catch: (cause) => platformError("firmware-maintenance.reconcile-step", cause),
        });
        yield* Effect.tryPromise({
          try: () => step.reportComplete({ ...summary, ...event.payload }),
          catch: (cause) => platformError("firmware-maintenance.report-complete", cause),
        });
        return summary;
      }),
    );
  }
}
