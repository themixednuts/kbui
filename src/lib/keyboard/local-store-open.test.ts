import { describe, expect, it } from "vite-plus/test";
import { Effect } from "effect";

import { PlatformError } from "$lib/effect/errors";
import { LocalStoreUnavailable, openOpfsDatabaseEffect } from "./local-store-open";

interface FakeDatabase {
  readonly storageType: string;
  readonly destroyed: boolean;
  getDatabaseInfo(): Promise<{ storageType?: string }>;
  destroy(): Promise<void>;
}

function makeFactory(storageTypes: string[]) {
  const created: FakeDatabase[] = [];
  const createDatabase = async (): Promise<FakeDatabase> => {
    const storageType = storageTypes[Math.min(created.length, storageTypes.length - 1)];
    const db = {
      storageType,
      destroyed: false,
      getDatabaseInfo: async () => ({ storageType }),
      destroy: async () => {
        (db as { destroyed: boolean }).destroyed = true;
      },
    };
    created.push(db);
    return db;
  };
  return { created, createDatabase };
}

const fastRetry = { baseRetryDelay: "1 millis", maxRetries: 3 } as const;

describe("openOpfsDatabaseEffect", () => {
  it("returns the database when the first attempt lands on OPFS", async () => {
    const { created, createDatabase } = makeFactory(["opfs"]);

    const db = await Effect.runPromise(
      openOpfsDatabaseEffect({ createDatabase, isCrossOriginIsolated: () => true, ...fastRetry }),
    );

    expect(created).toHaveLength(1);
    expect(db).toBe(created[0]);
    expect(db.destroyed).toBe(false);
  });

  it("retries transient lock contention with a fresh client and succeeds", async () => {
    const { created, createDatabase } = makeFactory(["memory", "memory", "opfs"]);

    const db = await Effect.runPromise(
      openOpfsDatabaseEffect({ createDatabase, isCrossOriginIsolated: () => true, ...fastRetry }),
    );

    expect(created).toHaveLength(3);
    expect(db).toBe(created[2]);
    expect(created[0].destroyed).toBe(true);
    expect(created[1].destroyed).toBe(true);
    expect(created[2].destroyed).toBe(false);
  });

  it("reports a storage lock once retries are exhausted, without blaming isolation", async () => {
    const { created, createDatabase } = makeFactory(["memory"]);

    const error = await Effect.runPromise(
      Effect.flip(
        openOpfsDatabaseEffect({ createDatabase, isCrossOriginIsolated: () => true, ...fastRetry }),
      ),
    );

    expect(created).toHaveLength(4);
    expect(created.every((db) => db.destroyed)).toBe(true);
    expect(error).toBeInstanceOf(LocalStoreUnavailable);
    expect(error).toMatchObject({ reason: "storage-lock" });
    expect(error.message).not.toMatch(/isolat/i);
    expect(error.message).toMatch(/locked/i);
  });

  it("fails immediately when the page is not cross-origin isolated", async () => {
    const { created, createDatabase } = makeFactory(["memory"]);

    const error = await Effect.runPromise(
      Effect.flip(
        openOpfsDatabaseEffect({ createDatabase, isCrossOriginIsolated: () => false, ...fastRetry }),
      ),
    );

    expect(created).toHaveLength(1);
    expect(error).toBeInstanceOf(LocalStoreUnavailable);
    expect(error).toMatchObject({ reason: "missing-isolation" });
    expect(error.message).toMatch(/cross-origin isolated/i);
  });

  it("does not retry unexpected open failures", async () => {
    let attempts = 0;
    const createDatabase = async (): Promise<FakeDatabase> => {
      attempts += 1;
      throw new Error("worker exploded");
    };

    const error = await Effect.runPromise(
      Effect.flip(
        openOpfsDatabaseEffect({ createDatabase, isCrossOriginIsolated: () => true, ...fastRetry }),
      ),
    );

    expect(attempts).toBe(1);
    expect(error).toBeInstanceOf(PlatformError);
    expect(error).toMatchObject({ operation: "local-store.open", message: "worker exploded" });
  });
});
