import { browser } from "$app/environment";
import { getContext, setContext } from "svelte";
import type { Attachment } from "svelte/attachments";
import { AgentClient } from "agents/client";
import { Effect } from "effect";

import type {
  FirmwareBuildAgent,
  FirmwareBuildAgentState,
  FirmwareBuildTracking,
} from "../../agents/firmware-build-agent";
import type { GitHubFirmwareBuildEvent } from "$lib/github-app/types";
import { mountEffect } from "$lib/effect/svelte";

const FIRMWARE_BUILD_EVENTS_CONTEXT = Symbol("kbui.firmware-build-events");

export class FirmwareBuildEventsStore {
  connected = $state(false);
  events = $state<GitHubFirmwareBuildEvent[]>([]);
  tracking = $state<FirmwareBuildTracking[]>([]);
  error = $state<string | null>(null);

  #client: AgentClient<FirmwareBuildAgent, FirmwareBuildAgentState> | null = null;
  #detach: (() => void) | null = null;

  readonly attach = (accountId: string | null): Attachment<HTMLElement> => {
    return () => {
      this.disconnect();
      if (!browser || !accountId) return;

      const connection = Effect.acquireRelease(
        Effect.sync(() => this.createClient()),
        (client) =>
          Effect.sync(() => {
            if (this.#client === client) this.#client = null;
            client.close(1000, "component detached");
          }),
      );
      this.#detach = mountEffect(
        "firmware.events.connection",
        Effect.flatMap(connection, () => Effect.never),
        (_label, message) => (this.error = message),
      );

      return () => {
        this.disconnect();
      };
    };
  };

  private createClient(): AgentClient<FirmwareBuildAgent, FirmwareBuildAgentState> {
    const client = new AgentClient<FirmwareBuildAgent, FirmwareBuildAgentState>({
      agent: "FirmwareBuildAgent",
      basePath: "api/firmware/events",
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
        if (this.#client !== client) return;
        this.events = state.events;
        this.tracking = state.tracking ?? [];
      },
    });
    client.addEventListener("close", () => {
      if (this.#client !== client) return;
      this.connected = false;
      if (!client.connectionError) this.error = "Reconnecting to the build event stream…";
    });
    client.addEventListener("error", () => {
      if (this.#client !== client) return;
      this.connected = false;
      this.error = "Reconnecting to the build event stream…";
    });
    client.addEventListener("open", () => {
      if (this.#client !== client) return;
      this.connected = true;
      this.error = null;
    });
    this.#client = client;
    return client;
  }

  latestForRequest(requestId: string | null | undefined) {
    if (!requestId) return null;
    return this.events.find((event) => event.run.requestId === requestId) ?? null;
  }

  trackingForRequest(requestId: string | null | undefined) {
    if (!requestId) return null;
    return this.tracking.find((item) => item.requestId === requestId) ?? null;
  }

  trackingForBranch(branchName: string | null | undefined, repository?: string | null) {
    if (!branchName) return null;
    return (
      this.tracking.find(
        (item) => item.branchName === branchName && (!repository || item.repository === repository),
      ) ?? null
    );
  }

  disconnect() {
    this.#detach?.();
    this.#detach = null;
    this.connected = false;
    this.error = null;
  }
}

export function setFirmwareBuildEventsContext(store: FirmwareBuildEventsStore) {
  setContext(FIRMWARE_BUILD_EVENTS_CONTEXT, store);
}

export function getFirmwareBuildEventsContext(): FirmwareBuildEventsStore {
  return getContext<FirmwareBuildEventsStore>(FIRMWARE_BUILD_EVENTS_CONTEXT);
}
