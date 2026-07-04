import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

import type {
  KeyboardChoice,
  LayoutChoice,
  MonkeytypeRunCapture,
  MonkeytypeRunSource,
  CorrelationState,
} from "$lib/typing-runs/contracts";

export const extensionDevice = sqliteTable(
  "extension_device",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    label: text("label"),
    installId: text("install_id"),
    extensionVersion: text("extension_version"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }),
    revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    uniqueIndex("extension_device_token_hash_idx").on(table.tokenHash),
    index("extension_device_user_idx").on(table.userId),
    index("extension_device_install_idx").on(table.userId, table.installId),
  ],
);

export const extensionPairingToken = sqliteTable(
  "extension_pairing_token",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    consumedAt: integer("consumed_at", { mode: "timestamp_ms" }),
    deviceId: text("device_id"),
  },
  (table) => [
    index("extension_pairing_token_user_idx").on(table.userId),
    index("extension_pairing_token_expires_idx").on(table.expiresAt),
  ],
);

export const typingRunTag = sqliteTable(
  "typing_run_tag",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    source: text("source").$type<MonkeytypeRunSource>().notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    monkeytypeResultId: text("monkeytype_result_id"),
    monkeytypeTimestampMs: integer("monkeytype_timestamp_ms"),
    capturedAt: integer("captured_at", { mode: "timestamp_ms" }).notNull(),
    receivedAt: integer("received_at", { mode: "timestamp_ms" }).notNull(),

    wpm: real("wpm").notNull(),
    rawWpm: real("raw_wpm"),
    acc: real("acc").notNull(),
    consistency: real("consistency"),
    testDuration: real("test_duration"),
    mode: text("mode"),
    mode2: text("mode2"),
    language: text("language"),
    difficulty: text("difficulty"),
    punctuation: integer("punctuation", { mode: "boolean" }),
    numbers: integer("numbers", { mode: "boolean" }),

    keyboardId: text("keyboard_id").notNull(),
    keyboardProfileId: text("keyboard_profile_id"),
    keyboardForkId: text("keyboard_fork_id"),
    keyboardName: text("keyboard_name").notNull(),
    catalogId: text("catalog_id"),
    vendorId: integer("vendor_id"),
    productId: integer("product_id"),
    boardName: text("board_name"),

    layoutId: text("layout_id").notNull(),
    layoutVariantId: text("layout_variant_id"),
    layoutName: text("layout_name").notNull(),
    layoutHash: text("layout_hash"),

    extensionDeviceId: text("extension_device_id"),
    correlationState: text("correlation_state")
      .$type<CorrelationState>()
      .notNull()
      .default("pending"),
    correlationConfidence: real("correlation_confidence"),
    rawCaptureJson: text("raw_capture_json", { mode: "json" })
      .$type<MonkeytypeRunCapture>()
      .notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("typing_run_tag_user_idempotency_idx").on(table.userId, table.idempotencyKey),
    index("typing_run_tag_monkeytype_result_idx").on(table.userId, table.monkeytypeResultId),
    index("typing_run_tag_captured_at_idx").on(table.userId, table.capturedAt),
    index("typing_run_tag_keyboard_layout_idx").on(table.userId, table.keyboardId, table.layoutId),
    index("typing_run_tag_correlation_state_idx").on(table.userId, table.correlationState),
  ],
);

export const typingRunChoiceSync = sqliteTable("typing_run_choice_sync", {
  userId: text("user_id").primaryKey(),
  keyboardsJson: text("keyboards_json", { mode: "json" }).$type<KeyboardChoice[]>().notNull(),
  layoutsJson: text("layouts_json", { mode: "json" }).$type<LayoutChoice[]>().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export type ExtensionDevice = typeof extensionDevice.$inferSelect;
export type NewExtensionDevice = typeof extensionDevice.$inferInsert;
export type ExtensionPairingToken = typeof extensionPairingToken.$inferSelect;
export type NewExtensionPairingToken = typeof extensionPairingToken.$inferInsert;
export type TypingRunTag = typeof typingRunTag.$inferSelect;
export type NewTypingRunTag = typeof typingRunTag.$inferInsert;
export type TypingRunChoiceSync = typeof typingRunChoiceSync.$inferSelect;
export type NewTypingRunChoiceSync = typeof typingRunChoiceSync.$inferInsert;
