import { browser } from "$app/environment";
import { Effect } from "effect";
import { SQLocal } from "sqlocal";

import {
  decodeDeviceProfileFromStorageEffect,
  decodeWorkspaceForkFromStorageEffect,
  encodeDeviceProfileForStorageEffect,
  encodeWorkspaceForkForStorageEffect,
  type DeviceProfile,
  type WorkspaceFork,
} from "./schema";

let client: SQLocal | undefined;

function getClient() {
  if (!browser) return undefined;

  client ??= new SQLocal({
    databasePath: "keeb-workbench.sqlite3",
    reactive: true,
    onInit: (sql) => [
      sql`CREATE TABLE IF NOT EXISTS local_profiles (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      sql`CREATE TABLE IF NOT EXISTS local_profile_drafts (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      sql`CREATE TABLE IF NOT EXISTS local_forks (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      sql`CREATE TABLE IF NOT EXISTS sync_log (
        id TEXT PRIMARY KEY,
        agent_name TEXT NOT NULL,
        status TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
    ],
  });

  return client;
}

function parseRowJsonEffect(raw: string) {
  return Effect.try({
    try: () => JSON.parse(raw) as unknown,
    catch: (error) =>
      new Error(error instanceof Error ? error.message : "Stored row is not valid JSON"),
  });
}

function serializeForStorageEffect(device: DeviceProfile) {
  return Effect.flatMap(encodeDeviceProfileForStorageEffect(device), (encoded) =>
    Effect.try({
      try: () => JSON.stringify(encoded),
      catch: (error) =>
        new Error(
          error instanceof Error ? error.message : "Profile could not be serialized for storage",
        ),
    }),
  );
}

function serializeForkForStorageEffect(fork: WorkspaceFork) {
  return Effect.flatMap(encodeWorkspaceForkForStorageEffect(fork), (encoded) =>
    Effect.try({
      try: () => JSON.stringify(encoded),
      catch: (error) =>
        new Error(
          error instanceof Error ? error.message : "Fork could not be serialized for storage",
        ),
    }),
  );
}

function decodeProfileRowEffect(raw: string) {
  return Effect.flatMap(parseRowJsonEffect(raw), decodeDeviceProfileFromStorageEffect);
}

function decodeForkRowEffect(raw: string) {
  return Effect.flatMap(parseRowJsonEffect(raw), decodeWorkspaceForkFromStorageEffect);
}

export async function loadLocalDevice(id?: string): Promise<DeviceProfile | undefined> {
  return Effect.runPromise(loadLocalDeviceEffect(id));
}

export function loadLocalDeviceEffect(id?: string) {
  return Effect.flatMap(
    Effect.tryPromise(async () => {
      const db = getClient();
      if (!db) return undefined;

      if (id) {
        const [row] = await db.sql<{
          data: string;
        }>`SELECT data FROM local_profiles WHERE id = ${id} LIMIT 1`;
        return row?.data;
      }

      const [row] = await db.sql<{
        data: string;
      }>`SELECT data FROM local_profiles ORDER BY updated_at DESC LIMIT 1`;
      return row?.data;
    }),
    (raw) =>
      raw === undefined
        ? Effect.succeed<DeviceProfile | undefined>(undefined)
        : decodeProfileRowEffect(raw),
  );
}

export async function saveLocalDevice(device: DeviceProfile): Promise<void> {
  return Effect.runPromise(saveLocalDeviceEffect(device));
}

export function saveLocalDeviceEffect(device: DeviceProfile) {
  if (!device.id) {
    return Effect.fail(new Error("Profile is missing an id; refusing to write."));
  }

  return Effect.flatMap(serializeForStorageEffect(device), (data) =>
    Effect.tryPromise(async () => {
      const db = getClient();
      if (!db) return;

      const updatedAt = new Date().toISOString();
      await db.sql`
        INSERT INTO local_profiles (id, data, updated_at)
        VALUES (${device.id}, ${data}, ${updatedAt})
        ON CONFLICT(id) DO UPDATE SET
          data = excluded.data,
          updated_at = excluded.updated_at
      `;
    }),
  );
}

export async function loadLocalDraft(id?: string): Promise<DeviceProfile | undefined> {
  return Effect.runPromise(loadLocalDraftEffect(id));
}

export function loadLocalDraftEffect(id?: string) {
  return Effect.flatMap(
    Effect.tryPromise(async () => {
      const db = getClient();
      if (!db) return undefined;

      if (id) {
        const [row] = await db.sql<{
          data: string;
        }>`SELECT data FROM local_profile_drafts WHERE id = ${id} LIMIT 1`;
        return row?.data;
      }

      const [row] = await db.sql<{
        data: string;
      }>`SELECT data FROM local_profile_drafts ORDER BY updated_at DESC LIMIT 1`;
      return row?.data;
    }),
    (raw) =>
      raw === undefined
        ? Effect.succeed<DeviceProfile | undefined>(undefined)
        : decodeProfileRowEffect(raw),
  );
}

export async function saveLocalDraft(device: DeviceProfile): Promise<void> {
  return Effect.runPromise(saveLocalDraftEffect(device));
}

export function saveLocalDraftEffect(device: DeviceProfile) {
  if (!device.id) {
    return Effect.fail(new Error("Draft is missing an id; refusing to write."));
  }

  return Effect.flatMap(serializeForStorageEffect(device), (data) =>
    Effect.tryPromise(async () => {
      const db = getClient();
      if (!db) return;

      const updatedAt = new Date().toISOString();
      await db.sql`
        INSERT INTO local_profile_drafts (id, data, updated_at)
        VALUES (${device.id}, ${data}, ${updatedAt})
        ON CONFLICT(id) DO UPDATE SET
          data = excluded.data,
          updated_at = excluded.updated_at
      `;
    }),
  );
}

export async function clearLocalDraft(id: string): Promise<void> {
  return Effect.runPromise(clearLocalDraftEffect(id));
}

export function clearLocalDraftEffect(id: string) {
  return Effect.tryPromise(async () => {
    const db = getClient();
    if (!db) return;

    await db.sql`DELETE FROM local_profile_drafts WHERE id = ${id}`;
  });
}

export async function clearLocalState(): Promise<void> {
  return Effect.runPromise(clearLocalStateEffect());
}

export function clearLocalStateEffect() {
  return Effect.tryPromise(async () => {
    const db = getClient();
    if (!db) return;

    await db.transaction(async (tx) => {
      await tx.sql`DELETE FROM local_profile_drafts`;
      await tx.sql`DELETE FROM local_profiles`;
      await tx.sql`DELETE FROM local_forks`;
      await tx.sql`DELETE FROM sync_log`;
    });
  });
}

export async function loadForks(): Promise<WorkspaceFork[]> {
  return Effect.runPromise(loadForksEffect());
}

export function loadForksEffect() {
  return Effect.flatMap(
    Effect.tryPromise(async () => {
      const db = getClient();
      if (!db) return [] as { id: string; data: string }[];

      return db.sql<{
        id: string;
        data: string;
      }>`SELECT id, data FROM local_forks ORDER BY created_at DESC`;
    }),
    (rows) =>
      Effect.sync(() => {
        const forks: WorkspaceFork[] = [];
        for (const row of rows) {
          const result = Effect.runSyncExit(decodeForkRowEffect(row.data));
          if (result._tag === "Success") {
            forks.push(result.value);
            continue;
          }

          if (typeof console !== "undefined") {
            console.warn(
              `Skipping fork ${row.id}: stored data is corrupt and could not be decoded.`,
              result.cause,
            );
          }
        }

        return forks;
      }),
  );
}

export async function saveForks(forks: WorkspaceFork[]): Promise<void> {
  return Effect.runPromise(saveForksEffect(forks));
}

export function saveForksEffect(forks: WorkspaceFork[]) {
  return Effect.flatMap(
    Effect.all(
      forks.map((fork) =>
        Effect.map(serializeForkForStorageEffect(fork), (data) => ({ fork, data })),
      ),
    ),
    (rows) =>
      Effect.tryPromise(async () => {
        const db = getClient();
        if (!db) return;

        await db.transaction(async (tx) => {
          await tx.sql`DELETE FROM local_forks`;

          for (const { fork, data } of rows) {
            await tx.sql`
              INSERT INTO local_forks (id, data, created_at)
              VALUES (${fork.id}, ${data}, ${fork.createdAt})
            `;
          }
        });
      }),
  );
}

export async function recordSync(
  agentName: string,
  status: string,
  payload: unknown,
): Promise<void> {
  return Effect.runPromise(recordSyncEffect(agentName, status, payload));
}

export function recordSyncEffect(agentName: string, status: string, payload: unknown) {
  return Effect.tryPromise(async () => {
    const db = getClient();
    if (!db) return;

    let serialized: string;
    try {
      serialized = JSON.stringify(payload);
    } catch (error) {
      serialized = JSON.stringify({
        error: error instanceof Error ? error.message : "Sync payload could not be serialized",
      });
    }

    await db.sql`
      INSERT INTO sync_log (id, agent_name, status, payload, created_at)
      VALUES (${crypto.randomUUID()}, ${agentName}, ${status}, ${serialized}, ${new Date().toISOString()})
    `;
  });
}
