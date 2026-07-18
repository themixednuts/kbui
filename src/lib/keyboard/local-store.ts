import { browser } from "$app/environment";
import { Context, Effect, Layer, Schema, Scope } from "effect";
import type { SQLocal as SQLocalClient } from "sqlocal";

import { LocalStoreUnavailable, openOpfsDatabaseEffect } from "./local-store-open";

import {
  decodeWorkbenchVersionGraphEffect,
  emptyWorkbenchVersionGraph,
  normalizeWorkbenchVersionGraph,
  type WorkbenchVersionGraph,
} from "$lib/app/workbench-version-graph";
import { BoundaryDecodeError, platformError, type PlatformError } from "$lib/effect/errors";

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

export interface LocalStoreService {
  readonly db: Effect.Effect<SQLocalClient, PlatformError | LocalStoreUnavailable>;
}

export class LocalStore extends Context.Service<LocalStore, LocalStoreService>()(
  "@kbui/LocalStore",
) {}

export class LocalStoreDataError extends Schema.TaggedErrorClass<LocalStoreDataError>()(
  "LocalStoreDataError",
  {
    operation: Schema.String,
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

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

function storedRowCountEffect(db: SQLocalClient, operation: string) {
  return Effect.tryPromise({
    try: async () => {
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
    },
    catch: (cause) => platformError(operation, cause),
  });
}

const hasLegacyLocalStorageDatabaseEffect = Effect.fn("LocalStore.hasLegacyLocalStorageDatabase")(
  function* () {
    return yield* Effect.try({
      try: () => {
        if (localStorage.getItem(legacyMigrationKey) === "done") return false;
        return Array.from({ length: localStorage.length }, (_, index) =>
          localStorage.key(index),
        ).some((key) => key?.startsWith("kvvfs-local-") === true);
      },
      catch: (cause) => platformError("local-store.migrate.inspect-legacy", cause),
    });
  },
);

const markLegacyMigrationCompleteEffect = Effect.fn("LocalStore.markLegacyMigrationComplete")(
  function* () {
    yield* Effect.try({
      try: () => localStorage.setItem(legacyMigrationKey, "done"),
      catch: (cause) => platformError("local-store.migrate.mark-complete", cause),
    });
  },
);

function closeClientEffect(db: SQLocalClient) {
  return Effect.tryPromise({
    try: () => db.destroy(),
    catch: (cause) => platformError("local-store.close", cause),
  });
}

const migrateLegacyLocalStorageDatabaseEffect = Effect.fn(
  "LocalStore.migrateLegacyLocalStorageDatabase",
)(function* (db: SQLocalClient, SQLocal: typeof import("sqlocal").SQLocal) {
  if (!(yield* hasLegacyLocalStorageDatabaseEffect())) {
    yield* markLegacyMigrationCompleteEffect();
    return;
  }

  // Never overwrite a database that has already been used on the OPFS path.
  if ((yield* storedRowCountEffect(db, "local-store.migrate.count-destination")) > 0) {
    yield* markLegacyMigrationCompleteEffect();
    return;
  }

  yield* Effect.acquireUseRelease(
    Effect.try({
      try: () =>
        new SQLocal({
          databasePath: "local",
          onInit: schemaStatements,
        }),
      catch: (cause) => platformError("local-store.migrate.open-legacy", cause),
    }),
    (legacy) =>
      Effect.gen(function* () {
        const legacyRows = yield* storedRowCountEffect(legacy, "local-store.migrate.count-legacy");
        if (legacyRows > 0) {
          const databaseFile = yield* Effect.tryPromise({
            try: () => legacy.getDatabaseFile(),
            catch: (cause) => platformError("local-store.migrate.export-legacy", cause),
          });
          yield* Effect.tryPromise({
            try: () => db.overwriteDatabaseFile(databaseFile),
            catch: (cause) => platformError("local-store.migrate.import-opfs", cause),
          });
          const migratedRows = yield* storedRowCountEffect(
            db,
            "local-store.migrate.verify-destination",
          );
          if (migratedRows !== legacyRows) {
            return yield* Effect.fail(
              platformError(
                "local-store.migrate.verify-destination",
                new Error(
                  `Local profile migration copied ${migratedRows} of ${legacyRows} stored rows.`,
                ),
              ),
            );
          }
        }

        // Remove the old KVVFS pages only after OPFS import and verification succeed.
        yield* Effect.tryPromise({
          try: () => legacy.deleteDatabaseFile(undefined, true),
          catch: (cause) => platformError("local-store.migrate.delete-legacy", cause),
        });
        yield* markLegacyMigrationCompleteEffect();
      }),
    (legacy) =>
      closeClientEffect(legacy).pipe(
        Effect.tapError((error) => Effect.logDebug("LocalStore.legacy_close_failed", error)),
        Effect.ignore,
      ),
  );
});

function openClientEffect(): Effect.Effect<
  SQLocalClient,
  PlatformError | LocalStoreUnavailable,
  Scope.Scope
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
      const db = yield* openOpfsDatabaseEffect({
        // A file path selects SQLocal's worker-backed OPFS VFS. That keeps
        // SQLite I/O off the UI thread and persists a real database file.
        open: Effect.try({
          try: () => new SQLocal({ databasePath, onInit: schemaStatements }),
          catch: (cause) => platformError("local-store.open", cause),
        }),
        storageType: (client) =>
          Effect.tryPromise({
            try: async () => (await client.getDatabaseInfo()).storageType,
            catch: (cause) => platformError("local-store.open", cause),
          }),
        close: closeClientEffect,
        crossOriginIsolated: Effect.sync(() => globalThis.crossOriginIsolated === true),
      });
      yield* migrateLegacyLocalStorageDatabaseEffect(db, SQLocal).pipe(
        Effect.onError(() => closeClientEffect(db).pipe(Effect.ignore)),
      );
      return db;
    }),
    (db) => closeClientEffect(db).pipe(Effect.orDie),
  );
}

export const localStoreLayer = Layer.effect(
  LocalStore,
  Effect.gen(function* () {
    const scope = yield* Effect.scope;
    const db = yield* Effect.cached(
      openClientEffect().pipe(Effect.provideService(Scope.Scope, scope)),
    );
    return LocalStore.of({ db });
  }),
);

function useDatabaseEffect<A>(
  operation: string,
  use: (db: SQLocalClient) => PromiseLike<A>,
): Effect.Effect<A, PlatformError | LocalStoreUnavailable, LocalStore> {
  return Effect.gen(function* () {
    const store = yield* LocalStore;
    const db = yield* store.db;
    return yield* Effect.tryPromise({
      try: () => use(db),
      catch: (cause) => platformError(operation, cause),
    });
  }).pipe(Effect.withSpan(operation));
}

function parseRowJsonEffect(raw: string) {
  return Effect.try({
    try: () => JSON.parse(raw) as unknown,
    catch: (cause) =>
      new BoundaryDecodeError({
        operation: "local-store.parse-row-json",
        message: cause instanceof Error ? cause.message : "Stored row is not valid JSON",
        cause,
      }),
  });
}

function localStoreDataError(operation: string, message: string, cause: unknown) {
  return new LocalStoreDataError({ operation, message, cause });
}

function serializeForStorageEffect(device: DeviceProfile) {
  return Effect.flatMap(encodeDeviceProfileForStorageEffect(device), (encoded) =>
    Effect.try({
      try: () => JSON.stringify(encoded),
      catch: (cause) =>
        localStoreDataError(
          "local-store.serialize-profile",
          cause instanceof Error ? cause.message : "Profile could not be serialized for storage",
          cause,
        ),
    }),
  );
}

function serializeForkForStorageEffect(fork: WorkspaceFork) {
  return Effect.flatMap(encodeWorkspaceForkForStorageEffect(fork), (encoded) =>
    Effect.try({
      try: () => JSON.stringify(encoded),
      catch: (cause) =>
        localStoreDataError(
          "local-store.serialize-fork",
          cause instanceof Error ? cause.message : "Fork could not be serialized for storage",
          cause,
        ),
    }),
  );
}

function serializeSavePointForStorageEffect(savePoint: SavePoint) {
  return Effect.flatMap(encodeSavePointForStorageEffect(savePoint), (encoded) =>
    Effect.try({
      try: () => JSON.stringify(encoded),
      catch: (cause) =>
        localStoreDataError(
          "local-store.serialize-save-point",
          cause instanceof Error ? cause.message : "Save point could not be serialized for storage",
          cause,
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

export const loadLocalDeviceEffect = Effect.fn("LocalStore.loadDevice")(function* (id?: string) {
  const raw = yield* useDatabaseEffect("local-store.load-device", async (db) => {
    if (id) {
      const [row] = await db.sql<{ data: string }>`
        SELECT data FROM local_profiles WHERE id = ${id} LIMIT 1
      `;
      return row?.data;
    }

    const [row] = await db.sql<{ data: string }>`
      SELECT data FROM local_profiles ORDER BY updated_at DESC LIMIT 1
    `;
    return row?.data;
  });

  return raw === undefined ? undefined : yield* decodeProfileRowEffect(raw);
});

export const saveLocalDeviceEffect = Effect.fn("LocalStore.saveDevice")(function* (
  device: DeviceProfile,
) {
  if (!device.id) {
    return yield* Effect.fail(
      localStoreDataError(
        "local-store.save-device",
        "Profile is missing an id; refusing to write.",
        device,
      ),
    );
  }

  const data = yield* serializeForStorageEffect(device);
  const updatedAt = new Date().toISOString();
  yield* useDatabaseEffect(
    "local-store.save-device",
    (db) => db.sql`
    INSERT INTO local_profiles (id, data, updated_at)
    VALUES (${device.id}, ${data}, ${updatedAt})
    ON CONFLICT(id) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at
  `,
  );
});

export const loadLocalDraftEffect = Effect.fn("LocalStore.loadDraft")(function* (id?: string) {
  const raw = yield* useDatabaseEffect("local-store.load-draft", async (db) => {
    if (id) {
      const [row] = await db.sql<{ data: string }>`
        SELECT data FROM local_profile_drafts WHERE id = ${id} LIMIT 1
      `;
      return row?.data;
    }

    const [row] = await db.sql<{ data: string }>`
      SELECT data FROM local_profile_drafts ORDER BY updated_at DESC LIMIT 1
    `;
    return row?.data;
  });

  return raw === undefined ? undefined : yield* decodeProfileRowEffect(raw);
});

export const saveLocalDraftEffect = Effect.fn("LocalStore.saveDraft")(function* (
  device: DeviceProfile,
) {
  if (!device.id) {
    return yield* Effect.fail(
      localStoreDataError(
        "local-store.save-draft",
        "Draft is missing an id; refusing to write.",
        device,
      ),
    );
  }

  const data = yield* serializeForStorageEffect(device);
  const updatedAt = new Date().toISOString();
  yield* useDatabaseEffect(
    "local-store.save-draft",
    (db) => db.sql`
    INSERT INTO local_profile_drafts (id, data, updated_at)
    VALUES (${device.id}, ${data}, ${updatedAt})
    ON CONFLICT(id) DO UPDATE SET
      data = excluded.data,
      updated_at = excluded.updated_at
  `,
  );
});

export const clearLocalDraftEffect = Effect.fn("LocalStore.clearDraft")(function* (id: string) {
  yield* useDatabaseEffect(
    "local-store.clear-draft",
    (db) => db.sql`DELETE FROM local_profile_drafts WHERE id = ${id}`,
  );
});

export const clearLocalStateEffect = Effect.fn("LocalStore.clearState")(function* () {
  yield* useDatabaseEffect("local-store.clear-state", (db) =>
    db.transaction(async (tx) => {
      await tx.sql`DELETE FROM local_profile_drafts`;
      await tx.sql`DELETE FROM local_profiles`;
      await tx.sql`DELETE FROM local_forks`;
      await tx.sql`DELETE FROM local_save_points`;
      await tx.sql`DELETE FROM workbench_version_meta`;
      await tx.sql`DELETE FROM sync_log`;
    }),
  );
});

export const createLocalSavePointEffect = Effect.fn("LocalStore.createSavePoint")(function* (
  savePoint: SavePoint,
) {
  if (!savePoint.id) {
    return yield* Effect.fail(
      localStoreDataError(
        "local-store.create-save-point",
        "Save point is missing an id; refusing to write.",
        savePoint,
      ),
    );
  }
  if (!savePoint.variantId) {
    return yield* Effect.fail(
      localStoreDataError(
        "local-store.create-save-point",
        "Save point is missing a variant id; refusing to write.",
        savePoint,
      ),
    );
  }

  const data = yield* serializeSavePointForStorageEffect(savePoint);
  yield* useDatabaseEffect(
    "local-store.create-save-point",
    (db) => db.sql`
    INSERT INTO local_save_points (id, variant_id, data, created_at)
    VALUES (${savePoint.id}, ${savePoint.variantId}, ${data}, ${savePoint.createdAt})
    ON CONFLICT(id) DO UPDATE SET
      variant_id = excluded.variant_id,
      data = excluded.data,
      created_at = excluded.created_at
  `,
  );
});

export const listLocalSavePointsByVariantEffect = Effect.fn("LocalStore.listSavePointsByVariant")(
  function* (variantId: string) {
    const rows = yield* useDatabaseEffect(
      "local-store.list-save-points",
      (db) =>
        db.sql<{ id: string; data: string }>`
      SELECT id, data FROM local_save_points
      WHERE variant_id = ${variantId}
      ORDER BY created_at DESC
    `,
    );
    return yield* Effect.forEach(rows, (row) => decodeSavePointRowEffect(row.data), {
      concurrency: 8,
    });
  },
);

export const getLocalSavePointEffect = Effect.fn("LocalStore.getSavePoint")(function* (id: string) {
  const raw = yield* useDatabaseEffect("local-store.get-save-point", async (db) => {
    const [row] = await db.sql<{ data: string }>`
      SELECT data FROM local_save_points WHERE id = ${id} LIMIT 1
    `;
    return row?.data;
  });
  return raw === undefined ? undefined : yield* decodeSavePointRowEffect(raw);
});

export const deleteLocalSavePointEffect = Effect.fn("LocalStore.deleteSavePoint")(function* (
  id: string,
) {
  yield* useDatabaseEffect(
    "local-store.delete-save-point",
    (db) => db.sql`DELETE FROM local_save_points WHERE id = ${id}`,
  );
});

export const loadForksEffect = Effect.fn("LocalStore.loadForks")(function* () {
  const rows = yield* useDatabaseEffect(
    "local-store.load-forks",
    (db) =>
      db.sql<{ id: string; data: string }>`
      SELECT id, data FROM local_forks ORDER BY created_at DESC
    `,
  );
  return yield* Effect.forEach(rows, (row) => decodeForkRowEffect(row.data), {
    concurrency: 8,
  });
});

export const saveForksEffect = Effect.fn("LocalStore.saveForks")(function* (
  forks: WorkspaceFork[],
) {
  const rows = yield* Effect.all(
    forks.map((fork) =>
      Effect.map(serializeForkForStorageEffect(fork), (data) => ({ fork, data })),
    ),
  );

  yield* useDatabaseEffect("local-store.save-forks", (db) =>
    db.transaction(async (tx) => {
      await tx.sql`DELETE FROM local_forks`;
      for (const { fork, data } of rows) {
        await tx.sql`
          INSERT INTO local_forks (id, data, created_at)
          VALUES (${fork.id}, ${data}, ${fork.createdAt})
        `;
      }
    }),
  );
});

export const loadLocalVersionGraphEffect = Effect.fn("LocalStore.loadVersionGraph")(function* () {
  const rows = yield* useDatabaseEffect(
    "local-store.load-version-graph.save-points",
    (db) =>
      db.sql<{ data: string }>`
        SELECT data FROM local_save_points ORDER BY created_at DESC
      `,
  );
  const savePoints = yield* Effect.all(
    rows.map((row) =>
      Effect.flatMap(parseRowJsonEffect(row.data), decodeSavePointFromStorageEffect),
    ),
    { concurrency: "unbounded" },
  );
  const forks = yield* loadForksEffect();
  const metadata = yield* useDatabaseEffect(
    "local-store.load-version-graph.metadata",
    async (db) => {
      const [row] = await db.sql<{ data: string }>`
          SELECT data FROM workbench_version_meta WHERE id = ${"version-graph"} LIMIT 1
        `;
      return row?.data;
    },
  );
  const newestCreatedAt = [...forks, ...savePoints]
    .map((item) => item.createdAt)
    .sort()
    .at(-1);
  const rawMetadata = metadata
    ? yield* parseRowJsonEffect(metadata)
    : {
        ...emptyWorkbenchVersionGraph(),
        updatedAt: newestCreatedAt ?? new Date(0).toISOString(),
      };

  if (!rawMetadata || typeof rawMetadata !== "object" || Array.isArray(rawMetadata)) {
    return yield* Effect.fail(
      new BoundaryDecodeError({
        operation: "local-store.decode-version-graph-metadata",
        message: "Stored version graph metadata must be an object.",
        cause: rawMetadata,
      }),
    );
  }

  return yield* decodeWorkbenchVersionGraphEffect({
    ...rawMetadata,
    forks,
    savePoints,
  });
});

export const replaceLocalVersionGraphEffect = Effect.fn("LocalStore.replaceVersionGraph")(
  function* (input: WorkbenchVersionGraph) {
    const graph = normalizeWorkbenchVersionGraph(input);
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
      catch: (cause) =>
        localStoreDataError(
          "local-store.serialize-version-graph-metadata",
          cause instanceof Error ? cause.message : "Version metadata could not be encoded.",
          cause,
        ),
    });

    yield* useDatabaseEffect("local-store.replace-version-graph", (db) =>
      db.transaction(async (tx) => {
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
      }),
    );
  },
);

export const recordSyncEffect = Effect.fn("LocalStore.recordSync")(function* (
  agentName: string,
  status: string,
  payload: unknown,
) {
  const serialized = yield* Effect.try({
    try: () => JSON.stringify(payload),
    catch: (cause) => platformError("local-store.serialize-sync-payload", cause),
  });
  yield* useDatabaseEffect(
    "local-store.insert-sync-log",
    (db) => db.sql`
    INSERT INTO sync_log (id, agent_name, status, payload, created_at)
    VALUES (
      ${crypto.randomUUID()}, ${agentName}, ${status}, ${serialized},
      ${new Date().toISOString()}
    )
  `,
  );
});
