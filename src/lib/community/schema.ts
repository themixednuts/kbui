import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import type { StoredDeviceProfile } from "$lib/keyboard/schema";

export const communityUser = sqliteTable("community_user", {
  id: text("id").primaryKey(),
  source: text("source", { enum: ["better-auth", "seed", "system"] }).notNull(),
  displayName: text("display_name").notNull(),
  handle: text("handle"),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const communityKeymap = sqliteTable(
  "community_keymap",
  {
    id: text("id").primaryKey(),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => communityUser.id, { onDelete: "restrict" }),

    catalogId: text("catalog_id").notNull(),
    vendorId: integer("vendor_id").notNull(),
    productId: integer("product_id").notNull(),
    boardName: text("board_name").notNull(),
    matrixRows: integer("matrix_rows").notNull(),
    matrixCols: integer("matrix_cols").notNull(),
    keyCount: integer("key_count").notNull(),

    title: text("title").notNull(),
    slug: text("slug").notNull(),
    note: text("note").notNull().default(""),
    tagsJson: text("tags_json", { mode: "json" }).$type<string[]>().notNull(),
    highlightsJson: text("highlights_json", { mode: "json" })
      .$type<Record<string, string>>()
      .notNull(),

    layersCount: integer("layers_count").notNull(),
    likesCount: integer("likes_count").notNull().default(0),
    adoptionsCount: integer("adoptions_count").notNull().default(0),
    reportsCount: integer("reports_count").notNull().default(0),

    source: text("source", { enum: ["official", "community"] })
      .notNull()
      .default("community"),
    visibility: text("visibility", { enum: ["public", "unlisted", "hidden"] })
      .notNull()
      .default("public"),
    moderationState: text("moderation_state", {
      enum: ["ok", "review_pending", "hidden"],
    })
      .notNull()
      .default("ok"),

    payloadFormat: text("payload_format").notNull(),
    payloadJson: text("payload_json", { mode: "json" }).$type<StoredDeviceProfile>().notNull(),
    payloadHash: text("payload_hash").notNull(),

    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("community_keymap_slug_idx").on(table.slug),
    index("community_keymap_catalog_idx").on(table.catalogId),
    index("community_keymap_board_identity_idx").on(table.vendorId, table.productId),
    index("community_keymap_likes_idx").on(table.visibility, table.likesCount),
    index("community_keymap_new_idx").on(table.visibility, table.createdAt),
    index("community_keymap_source_idx").on(table.source),
  ],
);

export const communityKeymapTag = sqliteTable(
  "community_keymap_tag",
  {
    keymapId: text("keymap_id")
      .notNull()
      .references(() => communityKeymap.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.keymapId, table.tag] }),
    index("community_keymap_tag_tag_idx").on(table.tag),
  ],
);

export const communityKeymapLike = sqliteTable(
  "community_keymap_like",
  {
    keymapId: text("keymap_id")
      .notNull()
      .references(() => communityKeymap.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => communityUser.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.keymapId, table.userId] }),
    index("community_keymap_like_user_idx").on(table.userId),
  ],
);

export const communityKeymapAdoption = sqliteTable(
  "community_keymap_adoption",
  {
    keymapId: text("keymap_id")
      .notNull()
      .references(() => communityKeymap.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => communityUser.id, { onDelete: "cascade" }),
    localForkId: text("local_fork_id"),
    adoptedTitle: text("adopted_title"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.keymapId, table.userId] }),
    index("community_keymap_adoption_user_idx").on(table.userId),
  ],
);

export const communityKeymapReport = sqliteTable(
  "community_keymap_report",
  {
    id: text("id").primaryKey(),
    keymapId: text("keymap_id")
      .notNull()
      .references(() => communityKeymap.id, { onDelete: "cascade" }),
    reporterUserId: text("reporter_user_id")
      .notNull()
      .references(() => communityUser.id, { onDelete: "cascade" }),
    reason: text("reason", {
      enum: ["spam", "unsafe", "misleading", "copyright", "harassment", "other"],
    }).notNull(),
    detail: text("detail").notNull().default(""),
    status: text("status", { enum: ["open", "reviewing", "accepted", "rejected"] })
      .notNull()
      .default("open"),
    reviewerUserId: text("reviewer_user_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("community_keymap_report_once_idx").on(table.keymapId, table.reporterUserId),
    index("community_keymap_report_status_idx").on(table.status),
  ],
);

export const communitySeed = sqliteTable("community_seed", {
  id: text("id").primaryKey(),
  version: text("version").notNull(),
  appliedAt: integer("applied_at", { mode: "timestamp_ms" }).notNull(),
});

export type CommunityUser = typeof communityUser.$inferSelect;
export type NewCommunityUser = typeof communityUser.$inferInsert;
export type CommunityKeymap = typeof communityKeymap.$inferSelect;
export type NewCommunityKeymap = typeof communityKeymap.$inferInsert;
export type CommunityKeymapTag = typeof communityKeymapTag.$inferSelect;
export type NewCommunityKeymapTag = typeof communityKeymapTag.$inferInsert;
export type CommunityKeymapLike = typeof communityKeymapLike.$inferSelect;
export type NewCommunityKeymapLike = typeof communityKeymapLike.$inferInsert;
export type CommunityKeymapAdoption = typeof communityKeymapAdoption.$inferSelect;
export type NewCommunityKeymapAdoption = typeof communityKeymapAdoption.$inferInsert;
export type CommunityKeymapReport = typeof communityKeymapReport.$inferSelect;
export type NewCommunityKeymapReport = typeof communityKeymapReport.$inferInsert;
export type CommunitySeed = typeof communitySeed.$inferSelect;
export type NewCommunitySeed = typeof communitySeed.$inferInsert;
