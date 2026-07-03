import { Agent } from "agents";

import type { ChangeRecord, DeviceProfile } from "$lib/keyboard/schema";

export interface UserWorkbenchState {
  userId: string;
  latestProfileId?: string;
  profileCount: number;
  changeCount: number;
  updatedAt: string;
}

export interface SaveSnapshotInput {
  userId: string;
  profile: DeviceProfile;
  changes: ChangeRecord[];
}

export interface AgentSnapshot {
  state: UserWorkbenchState;
  profile?: DeviceProfile;
  changes: ChangeRecord[];
}

export class UserWorkbenchAgent extends Agent<Cloudflare.Env, UserWorkbenchState> {
  initialState: UserWorkbenchState = {
    userId: "anonymous",
    profileCount: 0,
    changeCount: 0,
    updatedAt: new Date(0).toISOString(),
  };

  onStart() {
    console.log("[UserWorkbench] onStart — creating tables");
    this.ensureTables();
  }

  private ensureTables() {
    this.sql`
      CREATE TABLE IF NOT EXISTS keyboard_profiles (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `;

    this.sql`
      CREATE TABLE IF NOT EXISTS change_sets (
        id TEXT PRIMARY KEY,
        profile_id TEXT NOT NULL,
        data TEXT NOT NULL,
        staged INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      )
    `;
  }

  saveSnapshot(input: SaveSnapshotInput): AgentSnapshot {
    // Defensive: agents.Agent re-creates instances on cold start, and the
    // onStart hook isn't guaranteed to have run before the first RPC
    // method call when the request hits a freshly-vivified DO. Calling
    // `ensureTables` here keeps the schema CREATE-IF-NOT-EXISTS idempotent
    // while making sure we never write to a missing table.
    console.log(
      `[UserWorkbench] saveSnapshot user=${input.userId} profile=${input.profile?.id}`,
    );
    this.ensureTables();
    const updatedAt = new Date().toISOString();

    void this.sql`
      INSERT INTO keyboard_profiles (id, data, updated_at)
      VALUES (${input.profile.id}, ${JSON.stringify(input.profile)}, ${updatedAt})
      ON CONFLICT(id) DO UPDATE SET
        data = excluded.data,
        updated_at = excluded.updated_at
    `;

    void this.sql`DELETE FROM change_sets WHERE profile_id = ${input.profile.id}`;

    for (const change of input.changes) {
      void this.sql`
        INSERT INTO change_sets (id, profile_id, data, staged, created_at)
        VALUES (${change.id}, ${input.profile.id}, ${JSON.stringify(change)}, ${change.staged ? 1 : 0}, ${updatedAt})
      `;
    }

    const [{ count: profileCount }] = this.sql<{
      count: number;
    }>`SELECT COUNT(*) AS count FROM keyboard_profiles`;
    const [{ count: changeCount }] = this.sql<{
      count: number;
    }>`SELECT COUNT(*) AS count FROM change_sets`;

    this.setState({
      userId: input.userId,
      latestProfileId: input.profile.id,
      profileCount,
      changeCount,
      updatedAt,
    });

    return this.getSnapshot(input.profile.id);
  }

  getSnapshot(profileId?: string): AgentSnapshot {
    this.ensureTables();
    const targetProfileId = profileId ?? this.state.latestProfileId;
    const profileRows = targetProfileId
      ? this.sql<{
          data: string;
        }>`SELECT data FROM keyboard_profiles WHERE id = ${targetProfileId} LIMIT 1`
      : [];
    const changeRows = targetProfileId
      ? this.sql<{
          data: string;
        }>`SELECT data FROM change_sets WHERE profile_id = ${targetProfileId} ORDER BY created_at ASC`
      : [];

    return {
      state: this.state,
      profile: profileRows[0] ? (JSON.parse(profileRows[0].data) as DeviceProfile) : undefined,
      changes: changeRows.map((row) => JSON.parse(row.data) as ChangeRecord),
    };
  }

  clearProfile(profileId: string): UserWorkbenchState {
    this.ensureTables();
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
  }
}
