import { browser } from "$app/environment";
import { AgentClient } from "agents/client";
import { Cause, Effect, Fiber, FiberMap, Schedule } from "effect";
import type { Attachment } from "svelte/attachments";

import type { UserWorkbenchAgent, UserWorkbenchState } from "../../agents/user-workbench";
import {
  workbenchVersionGraphFingerprint,
  type WorkbenchVersionGraph,
} from "$lib/app/workbench-version-graph";
import type { WorkbenchStore } from "$lib/app/workbench-store.svelte";
import { platformError } from "$lib/effect/errors";
import { mountEffect } from "$lib/effect/svelte";

type SyncRuntime = <A, E>(key: string, effect: Effect.Effect<A, E>) => Fiber.Fiber<A, E>;

export class WorkbenchCloudSyncStore {
  connected = $state(false);
  error = $state<string | null>(null);

  #accountId: string | null = null;
  #client: AgentClient<UserWorkbenchAgent, UserWorkbenchState> | null = null;
  #detach: (() => void) | null = null;
  #workbench: WorkbenchStore | null = null;

  readonly attach = (
    accountId: string | null,
    workbench: WorkbenchStore,
  ): Attachment<HTMLElement> => {
    return () => {
      this.disconnect();
      this.#workbench = workbench;
      if (!browser || !accountId) return;

      this.#accountId = accountId;
      const lifecycle = Effect.gen({ self: this }, function* () {
        const run = yield* FiberMap.makeRuntime<never, string>();
        yield* Effect.acquireRelease(
          Effect.sync(() => this.createClient(workbench, run)),
          (client) =>
            Effect.sync(() => {
              if (this.#client === client) this.#client = null;
              client.close(1000, "component detached");
            }),
        );
        workbench.setVersionGraphSynchronizer((graph) => {
          return Effect.sync(() => this.scheduleSync(run, graph));
        });
        yield* Effect.never;
      });

      this.#detach = mountEffect(
        "workbench.cloud-sync.connection",
        lifecycle,
        (_label, message) => (this.error = message),
      );

      return () => this.disconnect();
    };
  };

  private createClient(workbench: WorkbenchStore, run: SyncRuntime) {
    const client = new AgentClient<UserWorkbenchAgent, UserWorkbenchState>({
      agent: "UserWorkbenchAgent",
      basePath: "api/workbench/events",
      host: window.location.host,
      maxRetries: Number.POSITIVE_INFINITY,
      maxReconnectionDelay: 30_000,
      minReconnectionDelay: 500,
      reconnectionDelayGrowFactor: 1.8,
      onConnectionError: (connectionError) => {
        if (this.#client !== client) return;
        this.error = connectionError.message;
      },
      onStateUpdate: (state) => {
        if (this.#client !== client || !state.graph) return;
        const remote = state.graph;
        run(
          "reconcile",
          Effect.tryPromise({
            try: () => workbench.reconcileVersionGraph(remote),
            catch: (cause) => platformError("workbench.reconcile-version-graph", cause),
          }).pipe(
            Effect.tap((merged) =>
              Effect.sync(() => {
                if (
                  workbenchVersionGraphFingerprint(merged) !==
                  workbenchVersionGraphFingerprint(remote)
                ) {
                  this.scheduleSync(run, merged);
                }
              }),
            ),
            this.observe("Could not reconcile version history"),
          ),
        );
      },
    });
    client.addEventListener("open", () => {
      if (this.#client !== client) return;
      this.connected = true;
      this.error = null;
    });
    client.addEventListener("close", () => {
      if (this.#client !== client) return;
      this.connected = false;
      if (!client.connectionError) this.error = "Reconnecting version history…";
    });
    client.addEventListener("error", () => {
      if (this.#client !== client) return;
      this.connected = false;
      this.error = "Reconnecting version history…";
    });
    this.#client = client;
    return client;
  }

  private scheduleSync(run: SyncRuntime, graph: WorkbenchVersionGraph) {
    const client = this.#client;
    const accountId = this.#accountId;
    if (!client || !accountId) return;

    run(
      "save",
      Effect.tryPromise({
        try: () => client.call("saveVersionGraph", [{ graph }]),
        catch: (cause) => platformError("workbench.save-version-graph", cause),
      }).pipe(
        this.observe("Version history sync failed; retrying"),
        Effect.retry({ schedule: Schedule.jittered(Schedule.spaced("3 seconds")) }),
        Effect.tap(() => Effect.sync(() => (this.error = null))),
      ),
    );
  }

  private observe(prefix: string) {
    return <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(
        Effect.tapCause((cause) =>
          Effect.sync(() => {
            this.error = `${prefix}: ${Cause.pretty(cause)}`;
          }),
        ),
      );
  }

  disconnect() {
    this.#workbench?.setVersionGraphSynchronizer(null);
    this.#workbench = null;
    this.#accountId = null;
    this.#detach?.();
    this.#detach = null;
    this.connected = false;
    this.error = null;
  }
}
