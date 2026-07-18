import { Agent, callable, type Connection, type ConnectionContext } from "agents";
import { Effect, Schema } from "effect";

import {
  decodeChangeRecordJsonEffect,
  decodeDeviceProfileFromStorageEffect,
  encodeChangeRecordJsonEffect,
  encodeDeviceProfileForStorageEffect,
  type ChangeRecord,
  type DeviceProfile,
} from "$lib/keyboard/schema";
import {
  decodeWorkbenchVersionGraphEffect,
  emptyWorkbenchVersionGraph,
  mergeWorkbenchVersionGraphs,
  type WorkbenchVersionGraph,
} from "$lib/app/workbench-version-graph";
import { platformError } from "$lib/effect/errors";
import { runWorkerEffect } from "$lib/effect/worker-runtime";

export interface UserWorkbenchState {
  userId: string;
  latestProfileId?: string;
  profileCount: number;
  changeCount: number;
  graph: WorkbenchVersionGraph;
  updatedAt: string;
}

export interface SaveSnapshotInput {
  userId: string;
  profile: DeviceProfile;
  changes: ChangeRecord[];
}

export interface SaveVersionGraphInput {
  graph: WorkbenchVersionGraph;
}

export interface AgentSnapshot {
  state: UserWorkbenchState;
  profile?: DeviceProfile;
  changes: ChangeRecord[];
}

export class UserWorkbenchAgent extends Agent<Cloudflare.Env, UserWorkbenchState> {
  static options = { sendIdentityOnConnect: false };

  initialState: UserWorkbenchState = {
    userId: "anonymous",
    profileCount: 0,
    changeCount: 0,
    graph: emptyWorkbenchVersionGraph(),
    updatedAt: new Date(0).toISOString(),
  };

  onStart(): Promise<void> {
    return runWorkerEffect(
      "workbench.start",
      Effect.gen({ self: this }, function* () {
        yield* Effect.logInfo("Creating UserWorkbench tables");
        yield* this.ensureTablesEffect();
        yield* Effect.sync(() => {
          if (!this.state.graph) {
            this.setState({ ...this.state, graph: emptyWorkbenchVersionGraph() });
          }
        });
      }),
    );
  }

  onConnect(connection: Connection, context: ConnectionContext) {
    const userId = context.request.headers.get("x-kbui-user-id")?.trim();
    if (!userId) {
      connection.close(4001, "Unauthorized");
      return;
    }
    if (this.state.userId !== userId) {
      this.setState({ ...this.state, userId });
    }
    connection.setState({ userId });
  }

  private ensureTablesEffect() {
    return Effect.sync(() => {
      void this.sql`
        CREATE TABLE IF NOT EXISTS keyboard_profiles (
          id TEXT PRIMARY KEY,
          data TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `;

      void this.sql`
        CREATE TABLE IF NOT EXISTS change_sets (
          id TEXT PRIMARY KEY,
          profile_id TEXT NOT NULL,
          data TEXT NOT NULL,
          staged INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL
        )
      `;
    }).pipe(Effect.withSpan("UserWorkbench.ensureTables"));
  }

  saveSnapshot(input: SaveSnapshotInput): Promise<AgentSnapshot> {
    return runWorkerEffect(
      "workbench.save-snapshot",
      Effect.gen({ self: this }, function* () {
        yield* this.ensureTablesEffect();
        const profile = yield* encodeDeviceProfileForStorageEffect(input.profile);
        const profileJson = yield* Schema.encodeEffect(Schema.UnknownFromJsonString)(profile);
        const changeRows = yield* Effect.forEach(input.changes, (change) =>
          Effect.map(encodeChangeRecordJsonEffect(change), (data) => ({ change, data })),
        );
        const updatedAt = new Date().toISOString();

        yield* Effect.sync(() => {
          void this.sql`
            INSERT INTO keyboard_profiles (id, data, updated_at)
            VALUES (${input.profile.id}, ${profileJson}, ${updatedAt})
            ON CONFLICT(id) DO UPDATE SET
              data = excluded.data,
              updated_at = excluded.updated_at
          `;
          void this.sql`DELETE FROM change_sets WHERE profile_id = ${input.profile.id}`;
          for (const { change, data } of changeRows) {
            void this.sql`
              INSERT INTO change_sets (id, profile_id, data, staged, created_at)
              VALUES (${change.id}, ${input.profile.id}, ${data}, ${change.staged ? 1 : 0}, ${updatedAt})
            `;
          }

          const [{ count: profileCount }] = this.sql<{
            count: number;
          }>`SELECT COUNT(*) AS count FROM keyboard_profiles`;
          const [{ count: changeCount }] = this.sql<{
            count: number;
          }>`SELECT COUNT(*) AS count FROM change_sets`;
          this.setState({
            ...this.state,
            userId: input.userId,
            latestProfileId: input.profile.id,
            profileCount,
            changeCount,
            updatedAt,
          });
        });

        return yield* this.getSnapshotEffect(input.profile.id);
      }).pipe(Effect.withSpan("UserWorkbench.saveSnapshot")),
    );
  }

  @callable()
  saveVersionGraph(input: SaveVersionGraphInput): Promise<WorkbenchVersionGraph> {
    return runWorkerEffect(
      "workbench.save-version-graph",
      Effect.gen({ self: this }, function* () {
        const userId = this.state.userId;
        if (!userId || userId === "anonymous") {
          return yield* Effect.fail(
            platformError("workbench.save-version-graph", "Authenticated workbench required."),
          );
        }
        const incoming = yield* decodeWorkbenchVersionGraphEffect(input.graph);
        const current = this.state.graph ?? emptyWorkbenchVersionGraph();
        const updatedAt = new Date().toISOString();
        const graph = {
          ...mergeWorkbenchVersionGraphs(current, incoming),
          revision: Math.max(current.revision, incoming.revision) + 1,
          updatedAt,
        } satisfies WorkbenchVersionGraph;
        yield* Effect.sync(() => {
          this.setState({ ...this.state, graph, userId, updatedAt });
          console.log(
            `[UserWorkbench] saved version graph revision=${graph.revision} variants=${graph.forks.length + 1} savePoints=${graph.savePoints.length}`,
          );
        });
        const newlyDeletedForkIds = graph.deletedForkIds.filter(
          (forkId) => !current.deletedForkIds.includes(forkId),
        );
        if (newlyDeletedForkIds.length > 0) {
          yield* Effect.tryPromise({
            try: () =>
              this.env.AuthAgent.getByName("global-auth").requestFirmwareVariantCleanup({
                userId,
                variantIds: newlyDeletedForkIds,
              }),
            catch: (cause) => platformError("workbench.request-firmware-cleanup", cause),
          });
        }
        return graph;
      }),
    );
  }

  private getSnapshotEffect(profileId?: string) {
    return Effect.gen({ self: this }, function* () {
      yield* this.ensureTablesEffect();
      const { changeRows, profileRows } = yield* Effect.sync(() => {
        const targetProfileId = profileId ?? this.state.latestProfileId;
        return {
          profileRows: targetProfileId
            ? this.sql<{
                data: string;
              }>`SELECT data FROM keyboard_profiles WHERE id = ${targetProfileId} LIMIT 1`
            : [],
          changeRows: targetProfileId
            ? this.sql<{
                data: string;
              }>`SELECT data FROM change_sets WHERE profile_id = ${targetProfileId} ORDER BY created_at ASC`
            : [],
        };
      });
      const storedProfile = profileRows[0]
        ? yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(profileRows[0].data)
        : undefined;
      const profile =
        storedProfile === undefined
          ? undefined
          : yield* decodeDeviceProfileFromStorageEffect(storedProfile);
      const changes = yield* Effect.forEach(changeRows, (row) =>
        decodeChangeRecordJsonEffect(row.data),
      );
      return { state: this.state, profile, changes } satisfies AgentSnapshot;
    }).pipe(Effect.withSpan("UserWorkbench.getSnapshot"));
  }

  getSnapshot(profileId?: string): Promise<AgentSnapshot> {
    return runWorkerEffect("workbench.get-snapshot", this.getSnapshotEffect(profileId));
  }

  clearProfile(profileId: string): Promise<UserWorkbenchState> {
    return runWorkerEffect(
      "workbench.clear-profile",
      Effect.gen({ self: this }, function* () {
        yield* this.ensureTablesEffect();
        return yield* Effect.sync(() => {
          void this.sql`DELETE FROM change_sets WHERE profile_id = ${profileId}`;
          void this.sql`DELETE FROM keyboard_profiles WHERE id = ${profileId}`;
          const [{ count: profileCount }] = this.sql<{
            count: number;
          }>`SELECT COUNT(*) AS count FROM keyboard_profiles`;
          const [{ count: changeCount }] = this.sql<{
            count: number;
          }>`SELECT COUNT(*) AS count FROM change_sets`;

          this.setState({
            ...this.state,
            latestProfileId: undefined,
            profileCount,
            changeCount,
            updatedAt: new Date().toISOString(),
          });
          return this.state;
        });
      }).pipe(Effect.withSpan("UserWorkbench.clearProfile")),
    );
  }
}
