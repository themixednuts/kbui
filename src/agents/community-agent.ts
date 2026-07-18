import { Agent, type AgentContext } from "agents";
import { and, desc, eq, inArray, like, ne, or, sql, type SQL } from "drizzle-orm";
import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { Effect, Schema } from "effect";

import {
  communityKeymap,
  communityKeymapAdoption,
  communityKeymapLike,
  communityKeymapReport,
  communityKeymapTag,
  communitySeed,
  communityUser,
} from "$lib/community/schema";
import { mutationCountDelta } from "$lib/community/mutations";
import {
  COMMUNITY_SEED_APPLIED_AT,
  COMMUNITY_SEED_ID,
  COMMUNITY_SEED_VERSION,
  communitySeedAuthors,
  communitySeedKeymaps,
  type CommunitySeedKeymap,
} from "$lib/community/seed-maps";
import {
  COMMUNITY_PAYLOAD_FORMAT,
  communityListLimit,
  communityListSort,
  normalizeCommunityAdoptInput,
  normalizeCommunityKeymapId,
  normalizeCommunityListInput,
  normalizeCommunityMutationUser,
  normalizeCommunityReportInput,
  type CommunityKeymapCard,
  type CommunityKeymapDetail,
  type CommunityKeymapListInput,
  type CommunityKeymapSource,
  type CommunityMutationUser,
} from "$lib/community/types";
import { decodeCommunityStoredProfileEffect } from "$lib/community/payload";
import { platformError } from "$lib/effect/errors";
import { runWorkerEffect } from "$lib/effect/worker-runtime";

interface CommunityState {
  seedVersion: string;
  seededAt: string;
}

interface CommunityDbRow {
  id: string;
  title: string;
  catalogId: string;
  vendorId: number;
  productId: number;
  boardName: string;
  matrixRows: number;
  matrixCols: number;
  keyCount: number;
  tagsJson: unknown;
  highlightsJson: unknown;
  layersCount: number;
  likesCount: number;
  adoptionsCount: number;
  source: string | null;
  note: string;
  createdAt: Date | number | string;
  updatedAt: Date | number | string;
  authorId: string;
  authorHandle: string | null;
  authorDisplayName: string;
  authorImage: string | null;
}

type CommunityWriteDb = Pick<DrizzleSqliteDODatabase, "delete" | "insert" | "select" | "update">;

export class CommunityKeymapUnavailableError extends Schema.TaggedErrorClass<CommunityKeymapUnavailableError>()(
  "CommunityKeymapUnavailableError",
  {
    id: Schema.String,
    message: Schema.String,
  },
) {}

function communityTransactionError(operation: string, cause: unknown) {
  return cause instanceof CommunityKeymapUnavailableError
    ? cause
    : platformError(`community.${operation}-transaction`, cause);
}

export class CommunityAgent extends Agent<Cloudflare.Env, CommunityState> {
  initialState: CommunityState = {
    seedVersion: "",
    seededAt: "1970-01-01T00:00:00.000Z",
  };

  readonly #agentCtx: AgentContext;
  readonly #db: DrizzleSqliteDODatabase;

  constructor(ctx: AgentContext, env: Cloudflare.Env) {
    super(ctx, env);
    this.#agentCtx = ctx;
    this.#db = drizzle(this.#agentCtx.storage, { logger: true });
  }

  onStart(): Promise<void> {
    return runWorkerEffect("community.start", this.ensureReadyEffect());
  }

  listKeymaps(
    rawInput: CommunityKeymapListInput = {},
    viewerId?: string,
  ): Promise<CommunityKeymapCard[]> {
    return runWorkerEffect(
      "community.list-keymaps",
      Effect.gen({ self: this }, function* () {
        yield* this.ensureReadyEffect();
        const input = yield* Effect.try({
          try: () => normalizeCommunityListInput(rawInput),
          catch: (cause) => platformError("community.normalize-list-input", cause),
        });
        const rows = yield* this.selectCardsEffect(input);
        const viewerState = yield* this.viewerStateEffect(
          rows.map((row) => row.id),
          viewerId,
        );
        return rows.map((row) => rowToCard(row, viewerState));
      }),
    );
  }

  getKeymap(rawId: string, viewerId?: string): Promise<CommunityKeymapDetail | null> {
    return runWorkerEffect(
      "community.get-keymap",
      Effect.andThen(this.ensureReadyEffect(), this.getKeymapEffect(rawId, viewerId)),
    );
  }

  like(rawId: string, rawUser: CommunityMutationUser): Promise<void> {
    return runWorkerEffect(
      "community.like",
      Effect.gen({ self: this }, function* () {
        yield* this.ensureReadyEffect();
        const id = yield* Effect.try({
          try: () => normalizeCommunityKeymapId(rawId),
          catch: (cause) => platformError("community.normalize-keymap-id", cause),
        });
        const user = yield* Effect.try({
          try: () => normalizeCommunityMutationUser(rawUser),
          catch: (cause) => platformError("community.normalize-user", cause),
        });
        const now = new Date();
        yield* Effect.try({
          try: () =>
            this.#db.transaction((tx) => {
              const keymap = this.assertVisibleKeymap(tx, id);
              this.upsertCommunityUser(tx, user, now);

              const inserted = tx
                .insert(communityKeymapLike)
                .values({
                  keymapId: keymap.id,
                  userId: user.id,
                  createdAt: now,
                })
                .onConflictDoNothing({
                  target: [communityKeymapLike.keymapId, communityKeymapLike.userId],
                })
                .returning({ keymapId: communityKeymapLike.keymapId })
                .all();
              const delta = mutationCountDelta(inserted.length > 0, 1);
              if (delta === 0) return;

              tx.update(communityKeymap)
                .set({
                  likesCount: sql`${communityKeymap.likesCount} + ${delta}`,
                })
                .where(eq(communityKeymap.id, keymap.id))
                .run();
            }),
          catch: (cause) => communityTransactionError("like", cause),
        });
      }),
    );
  }

  unlike(rawId: string, rawUser: CommunityMutationUser): Promise<void> {
    return runWorkerEffect(
      "community.unlike",
      Effect.gen({ self: this }, function* () {
        yield* this.ensureReadyEffect();
        const id = yield* Effect.try({
          try: () => normalizeCommunityKeymapId(rawId),
          catch: (cause) => platformError("community.normalize-keymap-id", cause),
        });
        const user = yield* Effect.try({
          try: () => normalizeCommunityMutationUser(rawUser),
          catch: (cause) => platformError("community.normalize-user", cause),
        });
        yield* Effect.try({
          try: () =>
            this.#db.transaction((tx) => {
              this.assertVisibleKeymap(tx, id);
              const deleted = tx
                .delete(communityKeymapLike)
                .where(
                  and(
                    eq(communityKeymapLike.keymapId, id),
                    eq(communityKeymapLike.userId, user.id),
                  ),
                )
                .returning({ keymapId: communityKeymapLike.keymapId })
                .all();
              const delta = mutationCountDelta(deleted.length > 0, -1);
              if (delta === 0) return;

              tx.update(communityKeymap)
                .set({
                  likesCount: sql`max(0, ${communityKeymap.likesCount} + ${delta})`,
                })
                .where(eq(communityKeymap.id, id))
                .run();
            }),
          catch: (cause) => communityTransactionError("unlike", cause),
        });
      }),
    );
  }

  adopt(rawInput: unknown, rawUser: CommunityMutationUser): Promise<CommunityKeymapDetail> {
    return runWorkerEffect(
      "community.adopt",
      Effect.gen({ self: this }, function* () {
        yield* this.ensureReadyEffect();
        const input = yield* Effect.try({
          try: () => normalizeCommunityAdoptInput(rawInput),
          catch: (cause) => platformError("community.normalize-adopt-input", cause),
        });
        const user = yield* Effect.try({
          try: () => normalizeCommunityMutationUser(rawUser),
          catch: (cause) => platformError("community.normalize-user", cause),
        });
        const now = new Date();
        yield* Effect.try({
          try: () =>
            this.#db.transaction((tx) => {
              const keymap = this.assertVisibleKeymap(tx, input.keymapId);
              this.upsertCommunityUser(tx, user, now);

              const inserted = tx
                .insert(communityKeymapAdoption)
                .values({
                  keymapId: keymap.id,
                  userId: user.id,
                  localForkId: input.localForkId,
                  adoptedTitle: keymap.title,
                  createdAt: now,
                  updatedAt: now,
                })
                .onConflictDoNothing({
                  target: [communityKeymapAdoption.keymapId, communityKeymapAdoption.userId],
                })
                .returning({ keymapId: communityKeymapAdoption.keymapId })
                .all();
              const delta = mutationCountDelta(inserted.length > 0, 1);

              if (delta === 0) {
                tx.update(communityKeymapAdoption)
                  .set({
                    localForkId: input.localForkId,
                    adoptedTitle: keymap.title,
                    updatedAt: now,
                  })
                  .where(
                    and(
                      eq(communityKeymapAdoption.keymapId, keymap.id),
                      eq(communityKeymapAdoption.userId, user.id),
                    ),
                  )
                  .run();
                return;
              }

              tx.update(communityKeymap)
                .set({
                  adoptionsCount: sql`${communityKeymap.adoptionsCount} + ${delta}`,
                })
                .where(eq(communityKeymap.id, keymap.id))
                .run();
            }),
          catch: (cause) => communityTransactionError("adopt", cause),
        });
        const detail = yield* this.getKeymapEffect(input.keymapId, user.id);
        if (!detail) {
          return yield* Effect.fail(
            platformError("community.adopt", "Community keymap is no longer available."),
          );
        }
        return detail;
      }),
    );
  }

  report(rawInput: unknown, rawUser: CommunityMutationUser): Promise<void> {
    return runWorkerEffect(
      "community.report",
      Effect.gen({ self: this }, function* () {
        yield* this.ensureReadyEffect();
        const input = yield* Effect.try({
          try: () => normalizeCommunityReportInput(rawInput),
          catch: (cause) => platformError("community.normalize-report-input", cause),
        });
        const user = yield* Effect.try({
          try: () => normalizeCommunityMutationUser(rawUser),
          catch: (cause) => platformError("community.normalize-user", cause),
        });
        const now = new Date();
        const detail = input.detail ?? "";
        yield* Effect.try({
          try: () =>
            this.#db.transaction((tx) => {
              const keymap = this.assertVisibleKeymap(tx, input.keymapId);
              this.upsertCommunityUser(tx, user, now);

              const inserted = tx
                .insert(communityKeymapReport)
                .values({
                  id: reportIdFor(keymap.id, user.id),
                  keymapId: keymap.id,
                  reporterUserId: user.id,
                  reason: input.reason,
                  detail,
                  status: "open",
                  reviewerUserId: null,
                  createdAt: now,
                  updatedAt: now,
                })
                .onConflictDoNothing({
                  target: [communityKeymapReport.keymapId, communityKeymapReport.reporterUserId],
                })
                .returning({ id: communityKeymapReport.id })
                .all();
              const delta = mutationCountDelta(inserted.length > 0, 1);

              if (delta === 0) {
                tx.update(communityKeymapReport)
                  .set({
                    reason: input.reason,
                    detail,
                    status: "open",
                    updatedAt: now,
                  })
                  .where(
                    and(
                      eq(communityKeymapReport.keymapId, keymap.id),
                      eq(communityKeymapReport.reporterUserId, user.id),
                    ),
                  )
                  .run();
              }

              tx.update(communityKeymap)
                .set(
                  delta === 0
                    ? { moderationState: "review_pending" }
                    : {
                        reportsCount: sql`${communityKeymap.reportsCount} + ${delta}`,
                        moderationState: "review_pending",
                      },
                )
                .where(eq(communityKeymap.id, keymap.id))
                .run();
            }),
          catch: (cause) => communityTransactionError("report", cause),
        });
      }),
    );
  }

  private ensureReadyEffect() {
    return Effect.gen({ self: this }, function* () {
      yield* Effect.sync(() => this.ensureTables());
      if (this.state.seedVersion !== COMMUNITY_SEED_VERSION) {
        yield* this.ensureSeedEffect();
      }
    }).pipe(Effect.withSpan("CommunityAgent.ensureReady"));
  }

  private ensureSeedEffect() {
    return Effect.gen({ self: this }, function* () {
      const resetSeedMetrics = yield* this.shouldResetSeedMetricsEffect();

      for (const author of communitySeedAuthors) {
        yield* this.databaseEffect("seed-author", () =>
          this.#db
            .insert(communityUser)
            .values({
              id: author.id,
              source: "seed",
              displayName: author.displayName,
              handle: author.handle ?? null,
              image: author.image ?? null,
              createdAt: dateFromIso(COMMUNITY_SEED_APPLIED_AT),
              updatedAt: dateFromIso(COMMUNITY_SEED_APPLIED_AT),
            })
            .onConflictDoUpdate({
              target: communityUser.id,
              set: {
                source: "seed",
                displayName: author.displayName,
                handle: author.handle ?? null,
                image: author.image ?? null,
                updatedAt: dateFromIso(COMMUNITY_SEED_APPLIED_AT),
              },
            }),
        );
      }

      for (const seed of communitySeedKeymaps) {
        const values = keymapValues(seed);
        yield* this.databaseEffect("seed-keymap", () =>
          this.#db
            .insert(communityKeymap)
            .values(values)
            .onConflictDoUpdate({
              target: communityKeymap.id,
              set: keymapUpdateValues(seed, { resetMetrics: resetSeedMetrics }),
            }),
        );

        yield* this.databaseEffect("seed-tags", () =>
          this.#db
            .insert(communityKeymapTag)
            .values(seed.tags.map((tag) => ({ keymapId: seed.id, tag })))
            .onConflictDoNothing(),
        );
      }

      yield* this.databaseEffect("seed-version", () =>
        this.#db
          .insert(communitySeed)
          .values({
            id: COMMUNITY_SEED_ID,
            version: COMMUNITY_SEED_VERSION,
            appliedAt: dateFromIso(COMMUNITY_SEED_APPLIED_AT),
          })
          .onConflictDoUpdate({
            target: communitySeed.id,
            set: {
              version: COMMUNITY_SEED_VERSION,
              appliedAt: dateFromIso(COMMUNITY_SEED_APPLIED_AT),
            },
          }),
      );

      yield* Effect.sync(() => {
        this.setState({
          seedVersion: COMMUNITY_SEED_VERSION,
          seededAt: COMMUNITY_SEED_APPLIED_AT,
        });
      });
      yield* Effect.logInfo(`Seeded ${communitySeedKeymaps.length} community keymap(s)`);
    }).pipe(Effect.withSpan("CommunityAgent.ensureSeed"));
  }

  private shouldResetSeedMetricsEffect() {
    return Effect.map(
      this.databaseEffect("read-seed-version", () =>
        this.#db
          .select({ version: communitySeed.version })
          .from(communitySeed)
          .where(eq(communitySeed.id, COMMUNITY_SEED_ID))
          .limit(1),
      ),
      (rows) => rows[0]?.version !== COMMUNITY_SEED_VERSION,
    );
  }

  private selectCardsEffect(input: CommunityKeymapListInput) {
    const conditions: SQL[] = [
      ne(communityKeymap.visibility, "hidden"),
      ne(communityKeymap.moderationState, "hidden"),
    ];

    if (input.tag) {
      conditions.push(sql`
        EXISTS (
          SELECT 1
          FROM ${communityKeymapTag}
          WHERE ${communityKeymapTag.keymapId} = ${communityKeymap.id}
            AND ${communityKeymapTag.tag} = ${input.tag}
        )
      `);
    }
    if (input.officialOnly) conditions.push(eq(communityKeymap.source, "official"));
    if (input.compatibleWithCatalogId) {
      conditions.push(eq(communityKeymap.catalogId, input.compatibleWithCatalogId));
    } else {
      if (input.vendorId !== undefined)
        conditions.push(eq(communityKeymap.vendorId, input.vendorId));
      if (input.productId !== undefined) {
        conditions.push(eq(communityKeymap.productId, input.productId));
      }
    }
    if (input.search) {
      const pattern = `%${input.search}%`;
      conditions.push(
        or(
          like(communityKeymap.title, pattern),
          like(communityKeymap.note, pattern),
          like(communityKeymap.boardName, pattern),
          like(communityUser.displayName, pattern),
          like(communityUser.handle, pattern),
          sql`${communityKeymap.tagsJson} LIKE ${pattern}`,
        )!,
      );
    }

    const query = this.#db
      .select(cardSelection)
      .from(communityKeymap)
      .innerJoin(communityUser, eq(communityKeymap.authorUserId, communityUser.id))
      .where(and(...conditions))
      .$dynamic();

    const sort = communityListSort(input);
    const ordered =
      sort === "new"
        ? query.orderBy(desc(communityKeymap.createdAt), desc(communityKeymap.likesCount))
        : sort === "adoptions"
          ? query.orderBy(
              desc(communityKeymap.adoptionsCount),
              desc(communityKeymap.likesCount),
              desc(communityKeymap.updatedAt),
            )
          : query.orderBy(
              desc(communityKeymap.likesCount),
              desc(communityKeymap.adoptionsCount),
              desc(communityKeymap.updatedAt),
            );

    return this.databaseEffect("select-cards", () => ordered.limit(communityListLimit(input)));
  }

  private viewerStateEffect(ids: string[], viewerId?: string) {
    if (!viewerId || ids.length === 0) {
      return Effect.succeed({ liked: new Set<string>(), adopted: new Set<string>() });
    }

    return Effect.all(
      [
        this.databaseEffect("viewer-likes", () =>
          this.#db
            .select({ keymapId: communityKeymapLike.keymapId })
            .from(communityKeymapLike)
            .where(
              and(
                eq(communityKeymapLike.userId, viewerId),
                inArray(communityKeymapLike.keymapId, ids),
              ),
            ),
        ),
        this.databaseEffect("viewer-adoptions", () =>
          this.#db
            .select({ keymapId: communityKeymapAdoption.keymapId })
            .from(communityKeymapAdoption)
            .where(
              and(
                eq(communityKeymapAdoption.userId, viewerId),
                inArray(communityKeymapAdoption.keymapId, ids),
              ),
            ),
        ),
      ],
      { concurrency: 2 },
    ).pipe(
      Effect.map(([likes, adoptions]) => ({
        liked: new Set(likes.map((likeRow) => likeRow.keymapId)),
        adopted: new Set(adoptions.map((adoptionRow) => adoptionRow.keymapId)),
      })),
    );
  }

  private getKeymapEffect(rawId: string, viewerId?: string) {
    return Effect.gen({ self: this }, function* () {
      const id = yield* Effect.try({
        try: () => normalizeCommunityKeymapId(rawId),
        catch: (cause) => platformError("community.normalize-keymap-id", cause),
      });
      const rows = yield* this.databaseEffect("get-keymap", () =>
        this.#db
          .select(detailSelection)
          .from(communityKeymap)
          .innerJoin(communityUser, eq(communityKeymap.authorUserId, communityUser.id))
          .where(
            and(
              eq(communityKeymap.id, id),
              ne(communityKeymap.visibility, "hidden"),
              ne(communityKeymap.moderationState, "hidden"),
            ),
          )
          .limit(1),
      );
      const row = rows[0];
      if (!row) return null;
      const [viewerState, profile] = yield* Effect.all([
        this.viewerStateEffect([row.id], viewerId),
        decodeCommunityStoredProfileEffect(row.payloadJson),
      ]);
      return {
        ...rowToCard(row, viewerState),
        payloadFormat: COMMUNITY_PAYLOAD_FORMAT,
        profile,
        payloadHash: row.payloadHash,
      } satisfies CommunityKeymapDetail;
    });
  }

  private databaseEffect<A>(operation: string, task: () => PromiseLike<A>) {
    return Effect.tryPromise({
      try: () => task(),
      catch: (cause) => platformError(`community.database.${operation}`, cause),
    });
  }

  private assertVisibleKeymap(db: CommunityWriteDb, id: string): { id: string; title: string } {
    const [keymap] = db
      .select({ id: communityKeymap.id, title: communityKeymap.title })
      .from(communityKeymap)
      .where(
        and(
          eq(communityKeymap.id, id),
          ne(communityKeymap.visibility, "hidden"),
          ne(communityKeymap.moderationState, "hidden"),
        ),
      )
      .limit(1)
      .all();

    if (!keymap) {
      throw new CommunityKeymapUnavailableError({
        id,
        message: "Community keymap is not available.",
      });
    }
    return keymap;
  }

  private upsertCommunityUser(db: CommunityWriteDb, user: CommunityMutationUser, now: Date): void {
    const displayName = displayNameForUser(user);
    const handle = handleForUser(user);

    db.insert(communityUser)
      .values({
        id: user.id,
        source: "better-auth",
        displayName,
        handle,
        image: user.image ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: communityUser.id,
        set: {
          source: "better-auth",
          displayName,
          handle,
          image: user.image ?? null,
          updatedAt: now,
        },
      })
      .run();
  }

  private ensureTables() {
    void this.sql`
      CREATE TABLE IF NOT EXISTS community_user (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        display_name TEXT NOT NULL,
        handle TEXT,
        image TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `;

    void this.sql`
      CREATE TABLE IF NOT EXISTS community_keymap (
        id TEXT PRIMARY KEY,
        author_user_id TEXT NOT NULL REFERENCES community_user(id) ON DELETE RESTRICT,
        catalog_id TEXT NOT NULL,
        vendor_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        board_name TEXT NOT NULL,
        matrix_rows INTEGER NOT NULL,
        matrix_cols INTEGER NOT NULL,
        key_count INTEGER NOT NULL,
        title TEXT NOT NULL,
        slug TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        tags_json TEXT NOT NULL,
        highlights_json TEXT NOT NULL,
        layers_count INTEGER NOT NULL,
        likes_count INTEGER NOT NULL DEFAULT 0,
        adoptions_count INTEGER NOT NULL DEFAULT 0,
        reports_count INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'community',
        visibility TEXT NOT NULL DEFAULT 'public',
        moderation_state TEXT NOT NULL DEFAULT 'ok',
        payload_format TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `;

    void this
      .sql`CREATE UNIQUE INDEX IF NOT EXISTS community_keymap_slug_idx ON community_keymap (slug)`;
    void this
      .sql`CREATE INDEX IF NOT EXISTS community_keymap_catalog_idx ON community_keymap (catalog_id)`;
    void this.sql`
      CREATE INDEX IF NOT EXISTS community_keymap_board_identity_idx
      ON community_keymap (vendor_id, product_id)
    `;
    void this.sql`
      CREATE INDEX IF NOT EXISTS community_keymap_likes_idx
      ON community_keymap (visibility, likes_count)
    `;
    void this.sql`
      CREATE INDEX IF NOT EXISTS community_keymap_new_idx
      ON community_keymap (visibility, created_at)
    `;
    this.ensureCommunityKeymapSourceColumn();
    void this
      .sql`CREATE INDEX IF NOT EXISTS community_keymap_source_idx ON community_keymap (source)`;

    void this.sql`
      CREATE TABLE IF NOT EXISTS community_keymap_tag (
        keymap_id TEXT NOT NULL REFERENCES community_keymap(id) ON DELETE CASCADE,
        tag TEXT NOT NULL,
        PRIMARY KEY (keymap_id, tag)
      )
    `;
    void this.sql`
      CREATE INDEX IF NOT EXISTS community_keymap_tag_tag_idx
      ON community_keymap_tag (tag)
    `;

    void this.sql`
      CREATE TABLE IF NOT EXISTS community_keymap_like (
        keymap_id TEXT NOT NULL REFERENCES community_keymap(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES community_user(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (keymap_id, user_id)
      )
    `;
    void this.sql`
      CREATE INDEX IF NOT EXISTS community_keymap_like_user_idx
      ON community_keymap_like (user_id)
    `;

    void this.sql`
      CREATE TABLE IF NOT EXISTS community_keymap_adoption (
        keymap_id TEXT NOT NULL REFERENCES community_keymap(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES community_user(id) ON DELETE CASCADE,
        local_fork_id TEXT,
        adopted_title TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (keymap_id, user_id)
      )
    `;
    void this.sql`
      CREATE INDEX IF NOT EXISTS community_keymap_adoption_user_idx
      ON community_keymap_adoption (user_id)
    `;

    void this.sql`
      CREATE TABLE IF NOT EXISTS community_keymap_report (
        id TEXT PRIMARY KEY,
        keymap_id TEXT NOT NULL REFERENCES community_keymap(id) ON DELETE CASCADE,
        reporter_user_id TEXT NOT NULL REFERENCES community_user(id) ON DELETE CASCADE,
        reason TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'open',
        reviewer_user_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `;
    void this.sql`
      CREATE UNIQUE INDEX IF NOT EXISTS community_keymap_report_once_idx
      ON community_keymap_report (keymap_id, reporter_user_id)
    `;
    void this.sql`
      CREATE INDEX IF NOT EXISTS community_keymap_report_status_idx
      ON community_keymap_report (status)
    `;

    void this.sql`
      CREATE TABLE IF NOT EXISTS community_seed (
        id TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        applied_at INTEGER NOT NULL
      )
    `;
  }

  private ensureCommunityKeymapSourceColumn() {
    try {
      void this
        .sql`ALTER TABLE community_keymap ADD COLUMN source TEXT NOT NULL DEFAULT 'community'`;
    } catch (error) {
      if (!isDuplicateColumnError(error)) throw error;
    }
  }
}

const cardSelection = {
  id: communityKeymap.id,
  title: communityKeymap.title,
  catalogId: communityKeymap.catalogId,
  vendorId: communityKeymap.vendorId,
  productId: communityKeymap.productId,
  boardName: communityKeymap.boardName,
  matrixRows: communityKeymap.matrixRows,
  matrixCols: communityKeymap.matrixCols,
  keyCount: communityKeymap.keyCount,
  tagsJson: communityKeymap.tagsJson,
  highlightsJson: communityKeymap.highlightsJson,
  layersCount: communityKeymap.layersCount,
  likesCount: communityKeymap.likesCount,
  adoptionsCount: communityKeymap.adoptionsCount,
  source: communityKeymap.source,
  note: communityKeymap.note,
  createdAt: communityKeymap.createdAt,
  updatedAt: communityKeymap.updatedAt,
  authorId: communityUser.id,
  authorHandle: communityUser.handle,
  authorDisplayName: communityUser.displayName,
  authorImage: communityUser.image,
};

const detailSelection = {
  ...cardSelection,
  payloadFormat: communityKeymap.payloadFormat,
  payloadJson: communityKeymap.payloadJson,
  payloadHash: communityKeymap.payloadHash,
};

function keymapValues(seed: CommunitySeedKeymap) {
  return {
    id: seed.id,
    authorUserId: seed.author.id,
    catalogId: seed.catalogId,
    vendorId: seed.vendorId,
    productId: seed.productId,
    boardName: seed.boardName,
    matrixRows: seed.matrixRows,
    matrixCols: seed.matrixCols,
    keyCount: seed.keyCount,
    title: seed.title,
    slug: seed.slug,
    note: seed.note,
    tagsJson: seed.tags,
    highlightsJson: seed.highlights,
    layersCount: seed.layersCount,
    likesCount: seed.likesCount,
    adoptionsCount: seed.adoptionsCount,
    reportsCount: seed.reportsCount,
    source: seed.source,
    visibility: seed.visibility,
    moderationState: seed.moderationState,
    payloadFormat: seed.payloadFormat,
    payloadJson: seed.profile,
    payloadHash: seed.payloadHash,
    createdAt: dateFromIso(seed.createdAt),
    updatedAt: dateFromIso(seed.updatedAt),
  };
}

function keymapUpdateValues(seed: CommunitySeedKeymap, options: { resetMetrics: boolean }) {
  const { id: _id, likesCount, adoptionsCount, reportsCount, ...values } = keymapValues(seed);
  if (options.resetMetrics) {
    return { ...values, likesCount, adoptionsCount, reportsCount };
  }
  return values;
}

function rowToCard(
  row: CommunityDbRow,
  viewerState: { liked: Set<string>; adopted: Set<string> },
): CommunityKeymapCard {
  return {
    id: row.id,
    title: row.title,
    source: communityKeymapSourceFromDb(row.source),
    author: {
      id: row.authorId,
      handle: row.authorHandle ?? undefined,
      displayName: row.authorDisplayName,
      image: row.authorImage ?? undefined,
    },
    catalogId: row.catalogId,
    vendorId: row.vendorId,
    productId: row.productId,
    matrixRows: row.matrixRows,
    matrixCols: row.matrixCols,
    keyCount: row.keyCount,
    boardName: row.boardName,
    tags: parseStringArray(row.tagsJson),
    layersCount: row.layersCount,
    likesCount: row.likesCount,
    adoptionsCount: row.adoptionsCount,
    note: row.note,
    highlights: parseStringRecord(row.highlightsJson),
    createdAt: isoFromDbDate(row.createdAt),
    updatedAt: isoFromDbDate(row.updatedAt),
    likedByViewer: viewerState.liked.has(row.id),
    adoptedByViewer: viewerState.adopted.has(row.id),
  };
}

function communityKeymapSourceFromDb(value: CommunityDbRow["source"]): CommunityKeymapSource {
  return value === "official" ? "official" : "community";
}

function isDuplicateColumnError(error: unknown): boolean {
  return error instanceof Error && /duplicate column name/i.test(error.message);
}

function dateFromIso(value: string): Date {
  return new Date(value);
}

function isoFromDbDate(value: Date | number | string): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  return new Date(value).toISOString();
}

function parseStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") {
    try {
      return parseStringArray(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return [];
}

function parseStringRecord(value: unknown): Record<string, string> {
  if (typeof value === "string") {
    try {
      return parseStringRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === "string" && typeof entry[1] === "string",
    ),
  );
}

function displayNameForUser(user: CommunityMutationUser): string {
  return user.name?.trim() || user.email?.split("@")[0]?.trim() || "GitHub user";
}

function handleForUser(user: CommunityMutationUser): string | null {
  return githubHandleFromEmail(user.email) ?? githubHandleFrom(user.name);
}

function githubHandleFromEmail(email: string | null | undefined): string | null {
  const candidate = email?.trim();
  if (!candidate) return null;

  const noreply = candidate.match(/^(?:\d+\+)?([a-zA-Z0-9-]+)@users\.noreply\.github\.com$/);
  if (noreply?.[1]) return githubHandleFrom(noreply[1]);

  return githubHandleFrom(candidate.split("@")[0]);
}

function githubHandleFrom(value: string | null | undefined): string | null {
  const candidate = value?.trim();
  if (!candidate) return null;
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(candidate)) return null;
  return candidate;
}

function reportIdFor(keymapId: string, userId: string): string {
  return `report:${keymapId}:${userId}`;
}
