import { Agent, type Connection } from "agents";
import { Effect, Schema } from "effect";

import {
  GitHubFirmwareBuildEventSchema,
  type GitHubFirmwareBuildEvent,
} from "$lib/github-app/types";
import type { GitHubFirmwareCleanupResponse } from "$lib/github-app/types";
import { platformError } from "$lib/effect/errors";
import { runWorkerEffect } from "$lib/effect/worker-runtime";
import type { FirmwareBuildWorkflowParams } from "./firmware-build-workflow";

export type FirmwareBuildTrackingStatus =
  | "starting"
  | "waiting"
  | "completed"
  | "failed"
  | "timed-out";

export interface FirmwareBuildTracking {
  branchName: string;
  detail: string | null;
  repository: string;
  requestId: string;
  runId: string | null;
  startedAt: string;
  status: FirmwareBuildTrackingStatus;
  updatedAt: string;
  workflowId: string;
}

export interface FirmwareBuildAgentState {
  events: GitHubFirmwareBuildEvent[];
  tracking: FirmwareBuildTracking[];
  updatedAt: string;
}

export class FirmwareBuildAgent extends Agent<Cloudflare.Env, FirmwareBuildAgentState> {
  static options = { sendIdentityOnConnect: false };

  initialState: FirmwareBuildAgentState = {
    events: [],
    tracking: [],
    updatedAt: new Date(0).toISOString(),
  };

  onStart(): Promise<void> {
    return runWorkerEffect(
      "firmware-agent.initialize",
      Effect.sync(() => {
        this.ensureTables();
        this.prune();
        this.refreshState();
      }),
    );
  }

  onError(connection: Connection, error: unknown): void;
  onError(error: unknown): void;
  onError(connectionOrError: unknown, error?: unknown) {
    if (error) {
      console.warn(
        `Firmware build event connection ${(connectionOrError as Connection).id} closed with an error.`,
      );
      return;
    }
    console.warn("Firmware build event agent error.", connectionOrError);
  }

  startTracking(input: FirmwareBuildWorkflowParams): Promise<FirmwareBuildTracking> {
    return runWorkerEffect(
      "firmware-agent.start-tracking",
      Effect.gen({ self: this }, function* () {
        yield* Effect.sync(() => this.ensureTables());
        const existing = this.tracking(input.requestId)[0];
        if (existing) return existing;

        const workflowId = `firmware-${input.requestId}`;
        yield* Effect.sync(() => {
          void this.sql`
            INSERT INTO firmware_build_tracking (
              request_id, workflow_id, run_id, repository, branch_name,
              status, detail, started_at, updated_at
            ) VALUES (
              ${input.requestId}, ${workflowId}, ${input.runId}, ${input.repository},
              ${input.branchName}, ${"starting"}, ${"Starting durable build tracking"},
              ${input.startedAt}, ${input.startedAt}
            )
          `;
          this.refreshState(input.startedAt);
        });

        yield* Effect.tryPromise({
          try: () =>
            this.runWorkflow("FirmwareBuildWorkflow", input, {
              id: workflowId,
              metadata: {
                branchName: input.branchName,
                repository: input.repository,
                requestId: input.requestId,
              },
            }),
          catch: (cause) => platformError("firmware-agent.run-build-workflow", cause),
        }).pipe(
          Effect.tapError((error) =>
            this.updateTrackingEffect(input.requestId, "failed", error.message),
          ),
        );

        return this.tracking(input.requestId)[0]!;
      }),
    );
  }

  publish(event: GitHubFirmwareBuildEvent): Promise<GitHubFirmwareBuildEvent> {
    return runWorkerEffect(
      "firmware-agent.publish-event",
      Effect.gen({ self: this }, function* () {
        const encodedEvent = yield* Effect.try({
          try: () =>
            Schema.encodeSync(Schema.fromJsonString(GitHubFirmwareBuildEventSchema))(event),
          catch: (cause) => platformError("firmware-agent.encode-build-event", cause),
        });
        yield* Effect.sync(() => {
          this.ensureTables();
          void this.sql`
            INSERT INTO firmware_build_event (delivery_id, request_id, run_id, received_at, data)
            VALUES (
              ${event.deliveryId}, ${event.run.requestId}, ${event.run.runId},
              ${event.receivedAt}, ${encodedEvent}
            )
            ON CONFLICT(delivery_id) DO UPDATE SET
              request_id = excluded.request_id,
              run_id = excluded.run_id,
              received_at = excluded.received_at,
              data = excluded.data
          `;
          this.prune();
          this.refreshState(event.receivedAt);
        });

        if (event.run.terminal) {
          const tracked = this.tracking(event.run.requestId)[0];
          if (tracked && !terminalTrackingStatus(tracked.status)) {
            yield* Effect.tryPromise({
              try: () =>
                this.sendWorkflowEvent("FirmwareBuildWorkflow", tracked.workflowId, {
                  type: "github-terminal",
                  payload: event,
                }),
              catch: (cause) => platformError("firmware-agent.send-terminal-event", cause),
            });
          }
        }

        return event;
      }),
    );
  }

  updateTracking(
    requestId: string,
    status: FirmwareBuildTrackingStatus,
    detail: string | null,
  ): Promise<void> {
    return runWorkerEffect(
      "firmware-agent.update-tracking",
      this.updateTrackingEffect(requestId, status, detail),
    );
  }

  completeTracking(event: GitHubFirmwareBuildEvent): Promise<void> {
    return runWorkerEffect(
      "firmware-agent.complete-tracking",
      this.updateTrackingEffect(
        event.run.requestId,
        event.run.successful ? "completed" : "failed",
        event.run.label,
      ),
    );
  }

  private updateTrackingEffect(
    requestId: string,
    status: FirmwareBuildTrackingStatus,
    detail: string | null,
  ) {
    return Effect.sync(() => {
      this.ensureTables();
      const updatedAt = new Date().toISOString();
      void this.sql`
        UPDATE firmware_build_tracking
        SET status = ${status}, detail = ${detail}, updated_at = ${updatedAt}
        WHERE request_id = ${requestId}
      `;
      this.refreshState(updatedAt);
    });
  }

  removeTarget(cleanup: GitHubFirmwareCleanupResponse): Promise<void> {
    return runWorkerEffect(
      "firmware-agent.remove-target",
      Effect.sync(() => {
        this.ensureTables();
        const rows = this.sql<{ data: string; delivery_id: string }>`
          SELECT delivery_id, data FROM firmware_build_event
          ORDER BY received_at DESC
        `;
        for (const row of rows) {
          const event = Schema.decodeUnknownSync(
            Schema.fromJsonString(GitHubFirmwareBuildEventSchema),
          )(row.data) as GitHubFirmwareBuildEvent;
          const matchesRepository = event.repository.fullName === cleanup.repositoryFullName;
          const matchesBranch =
            cleanup.branchName === null || event.branch.branchName === cleanup.branchName;
          if (matchesRepository && matchesBranch) {
            void this.sql`DELETE FROM firmware_build_event WHERE delivery_id = ${row.delivery_id}`;
          }
        }
        if (cleanup.branchName === null) {
          void this.sql`
            DELETE FROM firmware_build_tracking WHERE repository = ${cleanup.repositoryFullName}
          `;
        } else {
          void this.sql`
            DELETE FROM firmware_build_tracking
            WHERE repository = ${cleanup.repositoryFullName}
              AND branch_name = ${cleanup.branchName}
          `;
        }
        this.refreshState();
      }),
    );
  }

  latest(requestId?: string): GitHubFirmwareBuildEvent[] {
    this.ensureTables();
    const rows = requestId
      ? this.sql<{ data: string }>`
          SELECT data FROM firmware_build_event
          WHERE request_id = ${requestId}
          ORDER BY received_at DESC
          LIMIT 25
        `
      : this.sql<{ data: string }>`
          SELECT data FROM firmware_build_event
          ORDER BY received_at DESC
          LIMIT 25
        `;
    return rows.map(
      (row) =>
        Schema.decodeUnknownSync(Schema.fromJsonString(GitHubFirmwareBuildEventSchema))(
          row.data,
        ) as GitHubFirmwareBuildEvent,
    );
  }

  tracking(requestId?: string): FirmwareBuildTracking[] {
    this.ensureTables();
    const rows = requestId
      ? this.sql<FirmwareBuildTrackingRow>`
          SELECT * FROM firmware_build_tracking
          WHERE request_id = ${requestId}
          ORDER BY updated_at DESC
          LIMIT 1
        `
      : this.sql<FirmwareBuildTrackingRow>`
          SELECT * FROM firmware_build_tracking
          ORDER BY updated_at DESC
          LIMIT 25
        `;
    return rows.map(trackingRowToDto);
  }

  private refreshState(updatedAt = new Date().toISOString()) {
    this.setState({ events: this.latest(), tracking: this.tracking(), updatedAt });
  }

  private prune() {
    void this.sql`
      DELETE FROM firmware_build_event
      WHERE delivery_id NOT IN (
        SELECT delivery_id FROM firmware_build_event
        ORDER BY received_at DESC
        LIMIT 100
      )
    `;
    void this.sql`
      DELETE FROM firmware_build_tracking
      WHERE status IN (${"completed"}, ${"failed"}, ${"timed-out"})
        AND updated_at < datetime('now', '-14 days')
    `;
  }

  private ensureTables() {
    void this.sql`
      CREATE TABLE IF NOT EXISTS firmware_build_event (
        delivery_id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        run_id TEXT,
        received_at TEXT NOT NULL,
        data TEXT NOT NULL
      )
    `;
    void this.sql`
      CREATE INDEX IF NOT EXISTS firmware_build_event_request_idx
      ON firmware_build_event (request_id, received_at DESC)
    `;
    void this.sql`
      CREATE INDEX IF NOT EXISTS firmware_build_event_run_idx
      ON firmware_build_event (run_id, received_at DESC)
    `;
    void this.sql`
      CREATE TABLE IF NOT EXISTS firmware_build_tracking (
        request_id TEXT PRIMARY KEY,
        workflow_id TEXT NOT NULL UNIQUE,
        run_id TEXT,
        repository TEXT NOT NULL,
        branch_name TEXT NOT NULL,
        status TEXT NOT NULL,
        detail TEXT,
        started_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `;
    void this.sql`
      CREATE INDEX IF NOT EXISTS firmware_build_tracking_status_idx
      ON firmware_build_tracking (status, updated_at DESC)
    `;
  }
}

interface FirmwareBuildTrackingRow {
  branch_name: string;
  detail: string | null;
  repository: string;
  request_id: string;
  run_id: string | null;
  started_at: string;
  status: FirmwareBuildTrackingStatus;
  updated_at: string;
  workflow_id: string;
}

function trackingRowToDto(row: FirmwareBuildTrackingRow): FirmwareBuildTracking {
  return {
    branchName: row.branch_name,
    detail: row.detail,
    repository: row.repository,
    requestId: row.request_id,
    runId: row.run_id,
    startedAt: row.started_at,
    status: row.status,
    updatedAt: row.updated_at,
    workflowId: row.workflow_id,
  };
}

function terminalTrackingStatus(status: FirmwareBuildTrackingStatus) {
  return status === "completed" || status === "failed" || status === "timed-out";
}
