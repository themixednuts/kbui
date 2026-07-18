import { browser } from "$app/environment";
import { Cause, Context, Effect, Layer, ManagedRuntime } from "effect";
import type { SQLocal as SQLocalClient } from "sqlocal";

import { LocalStoreUnavailable, openOpfsDatabaseEffect } from "./local-store-open";

import {
  decodeWorkbenchVersionGraphEffect,
  emptyWorkbenchVersionGraph,
  normalizeWorkbenchVersionGraph,
  type WorkbenchVersionGraph,
} from "$lib/app/workbench-version-graph";

import {
  decodeDeviceProfileFromStorageEffect,
  decodeSavePointFromStorageEffect,
  decodeWorkspaceForkFromStorageEffect,
  encodeDeviceProfileForStorageEffect,
  encodeSavePointForStorageEffect,
  encodeWorkspaceForkForStorageEffect,
  type DeviceProfile,
  type SavePoint,
  type WorkspaceFork,
} from "./schema";
import { platformError, type PlatformError } from "$lib/effect/errors";

interface LocalStoreService {
  readonly db: SQLocalClient;
}

class LocalStore extends Context.Service<LocalStore, LocalStoreService>()("@kbui/LocalStore") {}

export { LocalStoreUnavailable } from "./local-store-open";

const databasePath = "kbui.sqlite3";
const legacyMigrationKey = "kbui.sqlocal.opfs-migration.v1";

type InitStatement = { sql: string; params: unknown[] };
type InitSql = (
  queryTemplate: TemplateStringsArray | string,
  ...params: unknown[]
) => InitStatement;

function schemaStatements(sql: InitSql): InitStatement[] {
  return [
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
    sql`CREATE TABLE IF NOT EXISTS local_save_points (
      id TEXT PRIMARY KEY,
      variant_id TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    sql`CREATE TABLE IF NOT EXISTS workbench_version_meta (
      id TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    sql`CREATE TABLE IF NOT EXISTS sync_log (
      id TEXT PRIMARY KEY,
      agent_name TEXT NOT NULL,
      status TEXT NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
  ];
}

async function storedRowCount(db: SQLocalClient) {
  const [row] = await db.sql<{ count: number }>`
    SELECT
      (SELECT COUNT(*) FROM local_profiles) +
      (SELECT COUNT(*) FROM local_profile_drafts) +
      (SELECT COUNT(*) FROM local_forks) +
      (SELECT COUNT(*) FROM local_save_points) +
      (SELECT COUNT(*) FROM workbench_version_meta) +
      (SELECT COUNT(*) FROM sync_log) AS count
  `;
  return Number(row?.count ?? 0);
}

function hasLegacyLocalStorageDatabase() {
  if (localStorage.getItem(legacyMigrationKey) === "done") return false;
  return Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).some(
    (key) => key?.startsWith("kvvfs-local-") === true,
  );
}

async function migrateLegacyLocalStorageDatabase(
  db: SQLocalClient,
  SQLocal: typeof import("sqlocal").SQLocal,
) {
  if (!hasLegacyLocalStorageDatabase()) {
    localStorage.setItem(legacyMigrationKey, "done");
    return;
  }

  // Never overwrite a database that has already been used on the OPFS path.
  if ((await storedRowCount(db)) > 0) {
    localStorage.setItem(legacyMigrationKey, "done");
    return;
  }

  const legacy = new SQLocal({
    databasePath: "local",
    onInit: schemaStatements,
  });

  try {
    const legacyRows = await storedRowCount(legacy);
    if (legacyRows > 0) {
      await db.overwriteDatabaseFile(await legacy.getDatabaseFile());
      const migratedRows = await storedRowCount(db);
      if (migratedRows !== legacyRows) {
        throw new Error(
          `Local profile migration copied ${migratedRows} of ${legacyRows} stored rows.`,
        );
      }
    }

    // Remove the old KVVFS pages only after OPFS import and verification succeed.
    await legacy.deleteDatabaseFile(undefined, true);
    localStorage.setItem(legacyMigrationKey, "done");
  } catch (error) {
    await legacy.destroy();
    throw error;
  }
}

function openClientEffect(): Effect.Effect<
  SQLocalClient,
  PlatformError | LocalStoreUnavailable,
  import("effect").Scope.Scope
> {
  return Effect.acquireRelease(
    Effect.gen(function* () {
      if (!browser) {
        return yield* Effect.fail(
          new LocalStoreUnavailable({
            reason: "not-browser",
            message: "Local profile storage is only available in the browser.",
          }),
        );
      }
      const { SQLocal } = yield* Effect.tryPromise({
        try: () => import("sqlocal"),
        catch: (cause) => platformError("local-store.open", cause),
      });
      // A file path selects SQLocal's worker-backed OPFS VFS. That keeps
      // SQLite I/O off the UI thread and persists a real database file.
      const db = yield* openOpfsDatabaseEffect({
        createDatabase: async () => new SQLocal({ databasePath, onInit: schemaStatements }),
        isCrossOriginIsolated: () => globalThis.crossOriginIsolated === true,
      });
      yield* Effect.tryPromise({
        try: () => migrateLegacyLocalStorageDatabase(db, SQLocal),
        catch: (cause) => platformError("local-store.open", cause),
      }).pipe(Effect.onError(() => Effect.tryPromise(() => db.destroy()).pipe(Effect.ignore)));
      return db;
    }),
    (db) =>
      Effect.tryPromise({
        try: () => db.destroy(),
        catch: (cause) => platformError("local-store.close", cause),
      }).pipe(Effect.orDie),
  );
}

const localStoreLayer = Layer.effect(
  LocalStore,
  Effect.map(openClientEffect(), (db) => LocalStore.of({ db })),
);
const localStoreRuntime = ManagedRuntime.make(localStoreLayer);

if (import.meta.hot) {
  import.meta.hot.dispose(() => void localStoreRuntime.dispose());
}

function getClient(): Promise<SQLocalClient> {
  return localStoreRuntime.runPromise(Effect.map(LocalStore, ({ db }) => db));
}

function runLocalStoreEffect<A, E>(operation: string, effect: Effect.Effect<A, E>): Promise<A> {
  return localStoreRuntime.runPromise(
    effect.pipe(
      Effect.tapCause((cause) =>
        Effect.sync(() => console.error(`[${operation}]`, Cause.pretty(cause))),
      ),
      Effect.withSpan(operation),
    ),
  );
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

function serializeSavePointForStorageEffect(savePoint: SavePoint) {
  return Effect.flatMap(encodeSavePointForStorageEffect(savePoint), (encoded) =>
    Effect.try({
      try: () => JSON.stringify(encoded),
      catch: (error) =>
        new Error(
          error instanceof Error ? error.message : "Save point could not be serialized for storage",
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

function decodeSavePointRowEffect(raw: string) {
  return Effect.flatMap(parseRowJsonEffect(raw), decodeSavePointFromStorageEffect);
}

export function loadLocalDevice(id?: string): Promise<DeviceProfile | undefined> {
  return runLocalStoreEffect("local-store.load-device", loadLocalDeviceEffect(id));
}

export function loadLocalDeviceEffect(id?: string) {
  return Effect.flatMap(
    Effect.tryPromise(async () => {
      const db = await getClient();

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

export function saveLocalDevice(device: DeviceProfile): Promise<void> {
  return runLocalStoreEffect("local-store.save-device", saveLocalDeviceEffect(device));
}

export function saveLocalDeviceEffect(device: DeviceProfile) {
  if (!device.id) {
    return Effect.fail(new Error("Profile is missing an id; refusing to write."));
  }

  return Effect.flatMap(serializeForStorageEffect(device), (data) =>
    Effect.tryPromise(async () => {
      const db = await getClient();

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

export function loadLocalDraft(id?: string): Promise<DeviceProfile | undefined> {
  return runLocalStoreEffect("local-store.load-draft", loadLocalDraftEffect(id));
}

export function loadLocalDraftEffect(id?: string) {
  return Effect.flatMap(
    Effect.tryPromise(async () => {
      const db = await getClient();

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

export function saveLocalDraft(device: DeviceProfile): Promise<void> {
  return runLocalStoreEffect("local-store.save-draft", saveLocalDraftEffect(device));
}

export function saveLocalDraftEffect(device: DeviceProfile) {
  if (!device.id) {
    return Effect.fail(new Error("Draft is missing an id; refusing to write."));
  }

  return Effect.flatMap(serializeForStorageEffect(device), (data) =>
    Effect.tryPromise(async () => {
      const db = await getClient();

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

export function clearLocalDraft(id: string): Promise<void> {
  return runLocalStoreEffect("local-store.clear-draft", clearLocalDraftEffect(id));
}

export function clearLocalDraftEffect(id: string) {
  return Effect.tryPromise(async () => {
    const db = await getClient();

    await db.sql`DELETE FROM local_profile_drafts WHERE id = ${id}`;
  });
}

export function clearLocalState(): Promise<void> {
  return runLocalStoreEffect("local-store.clear-state", clearLocalStateEffect());
}

export function clearLocalStateEffect() {
  return Effect.tryPromise(async () => {
    const db = await getClient();

    await db.transaction(async (tx) => {
      await tx.sql`DELETE FROM local_profile_drafts`;
      await tx.sql`DELETE FROM local_profiles`;
      await tx.sql`DELETE FROM local_forks`;
      await tx.sql`DELETE FROM local_save_points`;
      await tx.sql`DELETE FROM workbench_version_meta`;
      await tx.sql`DELETE FROM sync_log`;
    });
  });
}

export function createLocalSavePoint(savePoint: SavePoint): Promise<void> {
  return runLocalStoreEffect(
    "local-store.create-save-point",
    createLocalSavePointEffect(savePoint),
  );
}

export function createLocalSavePointEffect(savePoint: SavePoint) {
  if (!savePoint.id) {
    return Effect.fail(new Error("Save point is missing an id; refusing to write."));
  }
  if (!savePoint.variantId) {
    return Effect.fail(new Error("Save point is missing a variant id; refusing to write."));
  }

  return Effect.flatMap(serializeSavePointForStorageEffect(savePoint), (data) =>
    Effect.tryPromise(async () => {
      const db = await getClient();

      await db.sql`
        INSERT INTO local_save_points (id, variant_id, data, created_at)
        VALUES (${savePoint.id}, ${savePoint.variantId}, ${data}, ${savePoint.createdAt})
        ON CONFLICT(id) DO UPDATE SET
          variant_id = excluded.variant_id,
          data = excluded.data,
          created_at = excluded.created_at
      `;
    }),
  );
}

export function listLocalSavePointsByVariant(variantId: string): Promise<SavePoint[]> {
  return runLocalStoreEffect(
    "local-store.list-save-points",
    listLocalSavePointsByVariantEffect(variantId),
  );
}

export function listLocalSavePointsByVariantEffect(variantId: string) {
  return Effect.flatMap(
    Effect.tryPromise(async () => {
      const db = await getClient();

      return db.sql<{
        id: string;
        data: string;
      }>`SELECT id, data FROM local_save_points WHERE variant_id = ${variantId} ORDER BY created_at DESC`;
    }),
    (rows) => Effect.forEach(rows, (row) => decodeSavePointRowEffect(row.data), { concurrency: 8 }),
  );
}

export function getLocalSavePoint(id: string): Promise<SavePoint | undefined> {
  return runLocalStoreEffect("local-store.get-save-point", getLocalSavePointEffect(id));
}

export function getLocalSavePointEffect(id: string) {
  return Effect.flatMap(
    Effect.tryPromise(async () => {
      const db = await getClient();

      const [row] = await db.sql<{
        data: string;
      }>`SELECT data FROM local_save_points WHERE id = ${id} LIMIT 1`;
      return row?.data;
    }),
    (raw) =>
      raw === undefined
        ? Effect.succeed<SavePoint | undefined>(undefined)
        : decodeSavePointRowEffect(raw),
  );
}

export function deleteLocalSavePoint(id: string): Promise<void> {
  return runLocalStoreEffect("local-store.delete-save-point", deleteLocalSavePointEffect(id));
}

export function deleteLocalSavePointEffect(id: string) {
  return Effect.tryPromise(async () => {
    const db = await getClient();

    await db.sql`DELETE FROM local_save_points WHERE id = ${id}`;
  });
}

export function loadForks(): Promise<WorkspaceFork[]> {
  return runLocalStoreEffect("local-store.load-forks", loadForksEffect());
}

export function loadForksEffect() {
  return Effect.flatMap(
    Effect.tryPromise(async () => {
      const db = await getClient();

      return db.sql<{
        id: string;
        data: string;
      }>`SELECT id, data FROM local_forks ORDER BY created_at DESC`;
    }),
    (rows) => Effect.forEach(rows, (row) => decodeForkRowEffect(row.data), { concurrency: 8 }),
  );
}

export function saveForks(forks: WorkspaceFork[]): Promise<void> {
  return runLocalStoreEffect("local-store.save-forks", saveForksEffect(forks));
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
        const db = await getClient();

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

export function loadLocalVersionGraph(): Promise<WorkbenchVersionGraph> {
  return runLocalStoreEffect("local-store.load-version-graph", loadLocalVersionGraphEffect());
}

export function loadLocalVersionGraphEffect() {
  return Effect.gen(function* () {
    const db = yield* Effect.tryPromise(() => getClient());

    const rows = yield* Effect.tryPromise(
      () => db.sql<{ data: string }>`SELECT data FROM local_save_points ORDER BY created_at DESC`,
    );
    const savePoints = yield* Effect.all(
      rows.map((row) =>
        Effect.flatMap(parseRowJsonEffect(row.data), decodeSavePointFromStorageEffect),
      ),
      { concurrency: "unbounded" },
    );
    const forks = yield* loadForksEffect();
    const [metadata] = yield* Effect.tryPromise(
      () =>
        db.sql<{ data: string }>`
        SELECT data FROM workbench_version_meta WHERE id = ${"version-graph"} LIMIT 1
      `,
    );
    const newestCreatedAt = [...forks, ...savePoints]
      .map((item) => item.createdAt)
      .sort()
      .at(-1);
    const rawMetadata = metadata
      ? yield* parseRowJsonEffect(metadata.data)
      : {
          ...emptyWorkbenchVersionGraph(),
          updatedAt: newestCreatedAt ?? new Date(0).toISOString(),
        };

    return yield* decodeWorkbenchVersionGraphEffect({
      ...(rawMetadata as Record<string, unknown>),
      forks,
      savePoints,
    });
  });
}

export function replaceLocalVersionGraph(graph: WorkbenchVersionGraph): Promise<void> {
  return runLocalStoreEffect(
    "local-store.replace-version-graph",
    replaceLocalVersionGraphEffect(graph),
  );
}

export function replaceLocalVersionGraphEffect(input: WorkbenchVersionGraph) {
  const graph = normalizeWorkbenchVersionGraph(input);
  return Effect.gen(function* () {
    const forkRows = yield* Effect.all(
      graph.forks.map((fork) =>
        Effect.map(serializeForkForStorageEffect(fork), (data) => ({ fork, data })),
      ),
      { concurrency: "unbounded" },
    );
    const savePointRows = yield* Effect.all(
      graph.savePoints.map((savePoint) =>
        Effect.map(serializeSavePointForStorageEffect(savePoint), (data) => ({ savePoint, data })),
      ),
      { concurrency: "unbounded" },
    );
    const metadata = yield* Effect.try({
      try: () =>
        JSON.stringify({
          activeVariantId: graph.activeVariantId,
          deletedForkIds: graph.deletedForkIds,
          deletedSavePointIds: graph.deletedSavePointIds,
          revision: graph.revision,
          selectedSavePointId: graph.selectedSavePointId,
          updatedAt: graph.updatedAt,
        }),
      catch: (error) =>
        new Error(
          error instanceof Error ? error.message : "Version metadata could not be encoded.",
        ),
    });

    yield* Effect.tryPromise(async () => {
      const db = await getClient();
      await db.transaction(async (tx) => {
        await tx.sql`DELETE FROM local_forks`;
        await tx.sql`DELETE FROM local_save_points`;
        for (const { fork, data } of forkRows) {
          await tx.sql`
            INSERT INTO local_forks (id, data, created_at)
            VALUES (${fork.id}, ${data}, ${fork.createdAt})
          `;
        }
        for (const { savePoint, data } of savePointRows) {
          await tx.sql`
            INSERT INTO local_save_points (id, variant_id, data, created_at)
            VALUES (${savePoint.id}, ${savePoint.variantId}, ${data}, ${savePoint.createdAt})
          `;
        }
        await tx.sql`
          INSERT INTO workbench_version_meta (id, data, updated_at)
          VALUES (${"version-graph"}, ${metadata}, ${graph.updatedAt})
          ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
        `;
      });
    });
  });
}

export function recordSync(agentName: string, status: string, payload: unknown): Promise<void> {
  return runLocalStoreEffect(
    "local-store.record-sync",
    recordSyncEffect(agentName, status, payload),
  );
}

export function recordSyncEffect(agentName: string, status: string, payload: unknown) {
  return Effect.gen(function* () {
    const serialized = yield* Effect.try({
      try: () => JSON.stringify(payload),
      catch: (cause) => platformError("local-store.serialize-sync-payload", cause),
    });
    const db = yield* Effect.tryPromise({
      try: () => getClient(),
      catch: (cause) => platformError("local-store.get-client", cause),
    });
    yield* Effect.tryPromise({
      try: () => db.sql`
        INSERT INTO sync_log (id, agent_name, status, payload, created_at)
        VALUES (
          ${crypto.randomUUID()}, ${agentName}, ${status}, ${serialized},
          ${new Date().toISOString()}
        )
      `,
      catch: (cause) => platformError("local-store.insert-sync-log", cause),
    });
  });
}
