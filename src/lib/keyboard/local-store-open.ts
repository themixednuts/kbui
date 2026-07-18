import { Effect, Schedule, Schema } from "effect";

import { platformError, type PlatformError } from "$lib/effect/errors";

export class LocalStoreUnavailable extends Schema.TaggedErrorClass<LocalStoreUnavailable>()(
  "LocalStoreUnavailable",
  {
    message: Schema.String,
    reason: Schema.Literals(["not-browser", "missing-isolation", "storage-lock"]),
  },
) {}

/**
 * OPFS sync access handles are exclusive. During a reload the outgoing page's
 * database worker can still hold the handle when the incoming page opens its
 * own, and SQLocal reacts by silently falling back to in-memory storage. That
 * contention clears as soon as the old worker is torn down, so it is modeled
 * as its own retryable error instead of a hard `LocalStoreUnavailable`.
 */
class OpfsLockContention extends Schema.TaggedErrorClass<OpfsLockContention>()(
  "OpfsLockContention",
  { message: Schema.String },
) {}

interface OpfsDatabase {
  getDatabaseInfo(): Promise<{ storageType?: string }>;
  destroy(): Promise<void>;
}

export interface OpenOpfsDatabaseOptions<Db extends OpfsDatabase> {
  /** Must build a fresh client: SQLocal pins itself to `:memory:` after a failed OPFS init. */
  readonly createDatabase: () => Promise<Db>;
  readonly isCrossOriginIsolated: () => boolean;
  readonly baseRetryDelay?: import("effect").Duration.Input;
  readonly maxRetries?: number;
}

/**
 * Opens a SQLocal database and verifies it landed on OPFS-backed storage.
 * Lock contention (cross-origin isolated, but the handle is briefly held by
 * another session) is retried with exponential backoff; missing isolation
 * headers fail immediately since no retry can fix them.
 */
export function openOpfsDatabaseEffect<Db extends OpfsDatabase>({
  createDatabase,
  isCrossOriginIsolated,
  baseRetryDelay = "150 millis",
  maxRetries = 5,
}: OpenOpfsDatabaseOptions<Db>): Effect.Effect<Db, LocalStoreUnavailable | PlatformError> {
  const discard = (db: Db) => Effect.tryPromise(() => db.destroy()).pipe(Effect.ignore);

  const attemptOpen = Effect.gen(function* () {
    const db = yield* Effect.tryPromise({
      try: createDatabase,
      catch: (cause) => platformError("local-store.open", cause),
    });
    const info = yield* Effect.tryPromise({
      try: () => db.getDatabaseInfo(),
      catch: (cause) => platformError("local-store.open", cause),
    }).pipe(Effect.onError(() => discard(db)));
    if (info.storageType === "opfs") return db;

    // SQLocal already swapped this client to the in-memory driver, so it
    // can never reach OPFS again; discard it before deciding why it failed.
    yield* discard(db);
    if (!isCrossOriginIsolated()) {
      return yield* Effect.fail(
        new LocalStoreUnavailable({
          reason: "missing-isolation",
          message:
            "Local profile storage requires OPFS, but this page is not cross-origin isolated. Check the COOP/COEP response headers.",
        }),
      );
    }
    return yield* Effect.fail(
      new OpfsLockContention({
        message: "The OPFS database handle is held by another session.",
      }),
    );
  });

  return attemptOpen.pipe(
    Effect.retry({
      schedule: Schedule.jittered(Schedule.exponential(baseRetryDelay)),
      times: maxRetries,
      while: (error) => error._tag === "OpfsLockContention",
    }),
    Effect.catchTag("OpfsLockContention", () =>
      Effect.fail(
        new LocalStoreUnavailable({
          reason: "storage-lock",
          message:
            "Local profile storage is temporarily locked by another session (usually a tab that is still closing or reloading). Close other app tabs or retry in a moment.",
        }),
      ),
    ),
  );
}
