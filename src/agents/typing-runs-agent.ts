import { Agent, type AgentContext } from "agents";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";
import { Effect, Schema } from "effect";

import { correlateCapture } from "$lib/typing-runs/correlation";
import {
  decodeIdempotencyKeyEffect,
  decodeKeyboardChoiceEffect,
  decodeLayoutChoiceEffect,
  decodeMonkeytypeRunCaptureEffect,
  decodeSetKeyboardChoicesRequestEffect,
  decodeTaggedRunsFilterEffect,
  decodeTypingRunStatsGroupByEffect,
  idempotencyKeyForCapture,
  type CreatePairingTokenMeta,
  type CreatePairingTokenResponse,
  type ExtensionDeviceDto,
  type IngestRunResponse,
  type KeyboardChoicesResponse,
  type MonkeytypeRunCapture,
  type TaggedRun,
  type TypingRunStatsGroup,
  type TypingRunStatsGroupBy,
} from "$lib/typing-runs/contracts";
import {
  normalizeMonkeytypeResults,
  type NormalizedMonkeytypeResult,
} from "$lib/typing-runs/monkeytype-results";
import { consumeRateLimitBucket, type RateLimitSpec } from "$lib/typing-runs/rate-limit";
import {
  extensionDevice,
  extensionPairingToken,
  extensionRateBucket,
  monkeytypeResult,
  typingRunChoiceSync,
  typingRunTag,
  type ExtensionDevice,
  type MonkeytypeResultRow,
  type NewExtensionDevice,
  type NewTypingRunTag,
  type TypingRunTag,
} from "$lib/typing-runs/schema";
import { platformError } from "$lib/effect/errors";
import { runWorkerEffect } from "$lib/effect/worker-runtime";

interface TypingRunsState {
  bootedAt: string;
}

type IngestibleCapture = MonkeytypeRunCapture & { idempotencyKey?: string };

const PAIRING_TOKEN_TTL_SECONDS = 10 * 60;

export class TypingRunsAgent extends Agent<Cloudflare.Env, TypingRunsState> {
  initialState: TypingRunsState = {
    bootedAt: "1970-01-01T00:00:00.000Z",
  };

  readonly #agentCtx: AgentContext;
  readonly #db: DrizzleSqliteDODatabase;

  constructor(ctx: AgentContext, env: Cloudflare.Env) {
    super(ctx, env);
    this.#agentCtx = ctx;
    this.#db = drizzle(this.#agentCtx.storage, { logger: true });
  }

  onStart(): Promise<void> {
    return runWorkerEffect(
      "typing-runs.start",
      Effect.sync(() => {
        this.ensureTables();
        this.setState({ bootedAt: new Date().toISOString() });
      }),
    );
  }

  createPairingToken(
    userId: string,
    meta: CreatePairingTokenMeta = {},
  ): Promise<CreatePairingTokenResponse> {
    return runWorkerEffect(
      "typing-runs.create-pairing-token",
      Effect.gen({ self: this }, function* () {
        yield* this.ensureReadyEffect();
        const { code, createdAt, expiresAt, user } = yield* Effect.try({
          try: () => {
            const user = normalizeUserId(userId);
            const createdAt = dateFromOptionalIso(meta.createdAt);
            return {
              user,
              createdAt,
              expiresAt: new Date(createdAt.getTime() + PAIRING_TOKEN_TTL_SECONDS * 1000),
              code: randomPairingCode(),
            };
          },
          catch: (cause) => platformError("typing-runs.create-pairing-token-input", cause),
        });
        const tokenHash = yield* sha256HexEffect(normalizePairingCode(code));
        yield* this.databaseEffect("create-pairing-token", () =>
          this.#db.insert(extensionPairingToken).values({
            tokenHash,
            userId: user,
            createdAt,
            expiresAt,
            consumedAt: null,
            deviceId: null,
          }),
        );
        return {
          code,
          expiresAt: expiresAt.toISOString(),
          ttlSeconds: PAIRING_TOKEN_TTL_SECONDS,
        };
      }),
    );
  }

  pairDevice(
    code: string,
    install: {
      installId: string;
      extensionVersion: string;
      label?: string;
      pairedAt?: string;
    },
  ): Promise<{ deviceToken: string; userId: string; device: ExtensionDeviceDto } | null> {
    return runWorkerEffect(
      "typing-runs.pair-device",
      Effect.gen({ self: this }, function* () {
        yield* this.ensureReadyEffect();
        const normalized = yield* Effect.try({
          try: () => ({
            code: normalizePairingCode(code),
            now: dateFromOptionalIso(install.pairedAt),
            deviceToken: randomDeviceToken(),
            deviceId: `extdev_${randomBase64Url(18)}`,
            label: install.label?.trim() || "Monkeytype tagger",
          }),
          catch: (cause) => platformError("typing-runs.pair-device-input", cause),
        });
        const [tokenHash, deviceTokenHash] = yield* Effect.all(
          [sha256HexEffect(normalized.code), sha256HexEffect(normalized.deviceToken)],
          { concurrency: 2 },
        );
        let result: { deviceToken: string; userId: string; device: ExtensionDeviceDto } | null =
          null;
        yield* Effect.try({
          try: () =>
            this.#db.transaction((tx) => {
              const [pairing] = tx
                .select()
                .from(extensionPairingToken)
                .where(eq(extensionPairingToken.tokenHash, tokenHash))
                .limit(1)
                .all();

              if (!pairing) return;
              if (pairing.consumedAt) return;
              if (dateFromDb(pairing.expiresAt).getTime() <= normalized.now.getTime()) return;

              const device: NewExtensionDevice = {
                id: normalized.deviceId,
                userId: pairing.userId,
                tokenHash: deviceTokenHash,
                label: normalized.label,
                installId: install.installId.trim(),
                extensionVersion: install.extensionVersion.trim(),
                createdAt: normalized.now,
                lastSeenAt: normalized.now,
                revokedAt: null,
              };

              tx.insert(extensionDevice).values(device).run();
              tx.update(extensionPairingToken)
                .set({
                  consumedAt: normalized.now,
                  deviceId: normalized.deviceId,
                })
                .where(eq(extensionPairingToken.tokenHash, tokenHash))
                .run();

              result = {
                deviceToken: normalized.deviceToken,
                userId: pairing.userId,
                device: deviceToDto(device),
              };
            }),
          catch: (cause) => platformError("typing-runs.pair-device-transaction", cause),
        });
        return result;
      }),
    );
  }

  resolveDeviceToken(token: string): Promise<string | null> {
    return runWorkerEffect(
      "typing-runs.resolve-device-token",
      Effect.gen({ self: this }, function* () {
        yield* this.ensureReadyEffect();
        const tokenHash = yield* sha256HexEffect(token.trim());
        const [device] = yield* this.databaseEffect("resolve-device-token", () =>
          this.#db
            .select()
            .from(extensionDevice)
            .where(and(eq(extensionDevice.tokenHash, tokenHash), isNull(extensionDevice.revokedAt)))
            .limit(1),
        );
        if (!device) return null;
        yield* this.databaseEffect("touch-device", () =>
          this.#db
            .update(extensionDevice)
            .set({ lastSeenAt: new Date() })
            .where(eq(extensionDevice.id, device.id)),
        );
        return device.userId;
      }),
    );
  }

  listDevices(userId: string): Promise<ExtensionDeviceDto[]> {
    return runWorkerEffect(
      "typing-runs.list-devices",
      Effect.gen({ self: this }, function* () {
        yield* this.ensureReadyEffect();
        const user = yield* normalizeEffect("user-id", () => normalizeUserId(userId));
        const rows = yield* this.databaseEffect("list-devices", () =>
          this.#db
            .select()
            .from(extensionDevice)
            .where(eq(extensionDevice.userId, user))
            .orderBy(desc(extensionDevice.createdAt)),
        );
        return rows.map(deviceToDto);
      }),
    );
  }

  revokeDevice(userId: string, id: string): Promise<void> {
    return runWorkerEffect(
      "typing-runs.revoke-device",
      Effect.gen({ self: this }, function* () {
        yield* this.ensureReadyEffect();
        const [user, deviceId] = yield* Effect.all([
          normalizeEffect("user-id", () => normalizeUserId(userId)),
          normalizeEffect("device-id", () => nonEmpty(id, "Extension device id")),
        ]);
        yield* this.databaseEffect("revoke-device", () =>
          this.#db
            .update(extensionDevice)
            .set({ revokedAt: new Date() })
            .where(and(eq(extensionDevice.userId, user), eq(extensionDevice.id, deviceId))),
        );
      }),
    );
  }

  setKeyboardChoices(userId: string, rawChoices: unknown): Promise<void> {
    return runWorkerEffect(
      "typing-runs.set-keyboard-choices",
      Effect.gen({ self: this }, function* () {
        yield* this.ensureReadyEffect();
        const [user, choices] = yield* Effect.all([
          normalizeEffect("user-id", () => normalizeUserId(userId)),
          decodeSetKeyboardChoicesRequestEffect(rawChoices),
        ]);
        const now = new Date();
        yield* this.databaseEffect("set-keyboard-choices", () =>
          this.#db
            .insert(typingRunChoiceSync)
            .values({
              userId: user,
              keyboardsJson: choices.keyboards,
              layoutsJson: choices.layouts,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: typingRunChoiceSync.userId,
              set: {
                keyboardsJson: choices.keyboards,
                layoutsJson: choices.layouts,
                updatedAt: now,
              },
            }),
        );
      }),
    );
  }

  getKeyboardChoices(userId: string): Promise<KeyboardChoicesResponse> {
    return runWorkerEffect(
      "typing-runs.get-keyboard-choices",
      Effect.gen({ self: this }, function* () {
        yield* this.ensureReadyEffect();
        const user = yield* normalizeEffect("user-id", () => normalizeUserId(userId));
        const [row] = yield* this.databaseEffect("get-keyboard-choices", () =>
          this.#db
            .select()
            .from(typingRunChoiceSync)
            .where(eq(typingRunChoiceSync.userId, user))
            .limit(1),
        );
        const [keyboards, layouts] = yield* Effect.all([
          parseChoiceArrayEffect(row?.keyboardsJson, decodeKeyboardChoiceEffect),
          parseChoiceArrayEffect(row?.layoutsJson, decodeLayoutChoiceEffect),
        ]);
        return { keyboards, layouts };
      }),
    );
  }

  ingestRun(userId: string, rawCapture: IngestibleCapture): Promise<IngestRunResponse> {
    return runWorkerEffect(
      "typing-runs.ingest-run",
      Effect.gen({ self: this }, function* () {
        yield* this.ensureReadyEffect();
        const [user, capture] = yield* Effect.all([
          normalizeEffect("user-id", () => normalizeUserId(userId)),
          decodeMonkeytypeRunCaptureEffect(rawCapture),
        ]);
        const idempotencyKey = yield* decodeIdempotencyKeyEffect(
          rawCapture.idempotencyKey ?? idempotencyKeyForCapture(capture),
        );
        const capturedAt = yield* normalizeEffect("captured-at", () =>
          dateFromIso(capture.capturedAt, "capturedAt"),
        );
        const [existing] = yield* this.databaseEffect("find-run", () =>
          this.#db
            .select({ correlationState: typingRunTag.correlationState })
            .from(typingRunTag)
            .where(
              and(eq(typingRunTag.userId, user), eq(typingRunTag.idempotencyKey, idempotencyKey)),
            )
            .limit(1),
        );
        if (existing) {
          return { status: "duplicate", correlationState: existing.correlationState } as const;
        }

        const now = new Date();
        const [extensionDeviceId, runHash, storedResults] = yield* Effect.all([
          this.findDeviceIdForInstallEffect(user, capture.extension.installId),
          sha256HexEffect(`${user}:${idempotencyKey}`),
          this.listNormalizedResultsEffect(user),
        ]);
        const decision = correlateCapture(capture, storedResults);
        const row: NewTypingRunTag = {
          id: `run_${runHash.slice(0, 32)}`,
          userId: user,
          source: capture.source,
          idempotencyKey,
          monkeytypeResultId: decision.monkeytypeResultId ?? capture.monkeytypeResultId ?? null,
          monkeytypeTimestampMs: monkeytypeTimestampMs(capture.monkeytypeTimestamp),
          capturedAt,
          receivedAt: now,
          wpm: capture.wpm,
          rawWpm: capture.rawWpm ?? null,
          acc: capture.acc,
          consistency: capture.consistency ?? null,
          testDuration: capture.testDuration ?? null,
          mode: capture.mode ?? null,
          mode2: capture.mode2 ?? null,
          language: capture.language ?? null,
          difficulty: capture.difficulty ?? null,
          punctuation: capture.punctuation ?? null,
          numbers: capture.numbers ?? null,
          keyboardId: capture.keyboard.keyboardId,
          keyboardProfileId: capture.keyboard.profileId ?? null,
          keyboardForkId: capture.keyboard.forkId ?? null,
          keyboardName: capture.keyboard.displayName,
          catalogId: capture.keyboard.catalogId ?? null,
          vendorId: capture.keyboard.vendorId ?? null,
          productId: capture.keyboard.productId ?? null,
          boardName: capture.keyboard.boardName ?? null,
          layoutId: capture.layout.layoutId,
          layoutVariantId: capture.layout.variantId ?? null,
          layoutName: capture.layout.displayName,
          layoutHash: capture.layout.layoutHash ?? null,
          extensionDeviceId,
          correlationState: decision.state,
          correlationConfidence: decision.confidence,
          rawCaptureJson: capture,
          createdAt: now,
          updatedAt: now,
        };

        yield* this.databaseEffect("insert-run", () => this.#db.insert(typingRunTag).values(row));
        return { status: "stored", correlationState: decision.state } as const;
      }),
    );
  }

  listTaggedRuns(userId: string, rawFilter: unknown = {}): Promise<TaggedRun[]> {
    return runWorkerEffect(
      "typing-runs.list-tagged-runs",
      Effect.gen({ self: this }, function* () {
        yield* this.ensureReadyEffect();
        const [user, filter] = yield* Effect.all([
          normalizeEffect("user-id", () => normalizeUserId(userId)),
          decodeTaggedRunsFilterEffect(rawFilter),
        ]);
        const conditions = [eq(typingRunTag.userId, user)];

        if (filter.keyboardId) conditions.push(eq(typingRunTag.keyboardId, filter.keyboardId));
        if (filter.layoutId) conditions.push(eq(typingRunTag.layoutId, filter.layoutId));
        if (filter.mode) conditions.push(eq(typingRunTag.mode, filter.mode));

        const rows = yield* this.databaseEffect("list-tagged-runs", () =>
          this.#db
            .select()
            .from(typingRunTag)
            .where(and(...conditions))
            .orderBy(desc(typingRunTag.capturedAt))
            .limit(filter.limit ?? 50),
        );
        return rows.map(runToDto);
      }),
    );
  }

  getStats(userId: string, rawGroupBy: unknown): Promise<TypingRunStatsGroup[]> {
    return runWorkerEffect(
      "typing-runs.get-stats",
      Effect.gen({ self: this }, function* () {
        yield* this.ensureReadyEffect();
        const [user, groupBy] = yield* Effect.all([
          normalizeEffect("user-id", () => normalizeUserId(userId)),
          decodeTypingRunStatsGroupByEffect(rawGroupBy),
        ]);
        const rows = yield* this.databaseEffect("get-stats", () =>
          this.#db
            .select()
            .from(typingRunTag)
            .where(eq(typingRunTag.userId, user))
            .orderBy(desc(typingRunTag.capturedAt)),
        );
        return aggregateStats(rows, groupBy);
      }),
    );
  }

  consumeRateLimit(
    key: string,
    spec: RateLimitSpec,
    nowMs = Date.now(),
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    return runWorkerEffect(
      "typing-runs.consume-rate-limit",
      Effect.gen({ self: this }, function* () {
        yield* this.ensureReadyEffect();
        const bucketKey = yield* normalizeEffect("rate-limit-key", () =>
          nonEmpty(key, "Rate limit key"),
        );
        const [existing] = yield* this.databaseEffect("load-rate-bucket", () =>
          this.#db
            .select()
            .from(extensionRateBucket)
            .where(eq(extensionRateBucket.bucketKey, bucketKey))
            .limit(1),
        );
        const decision = consumeRateLimitBucket(
          existing ? { windowStartedAt: existing.windowStartedAt, count: existing.count } : null,
          nowMs,
          spec,
        );
        yield* this.databaseEffect("save-rate-bucket", () =>
          this.#db
            .insert(extensionRateBucket)
            .values({
              bucketKey,
              windowStartedAt: decision.bucket.windowStartedAt,
              count: decision.bucket.count,
            })
            .onConflictDoUpdate({
              target: extensionRateBucket.bucketKey,
              set: {
                windowStartedAt: decision.bucket.windowStartedAt,
                count: decision.bucket.count,
              },
            }),
        );
        return {
          allowed: decision.allowed,
          retryAfterSeconds: decision.retryAfterSeconds,
        };
      }),
    );
  }

  upsertMonkeytypeResults(
    userId: string,
    payload: unknown,
    syncedAtMs = Date.now(),
  ): Promise<number> {
    return runWorkerEffect(
      "typing-runs.upsert-monkeytype-results",
      Effect.gen({ self: this }, function* () {
        yield* this.ensureReadyEffect();
        const user = yield* normalizeEffect("user-id", () => normalizeUserId(userId));
        const rows = yield* normalizeEffect("monkeytype-results", () =>
          normalizeMonkeytypeResults(payload, syncedAtMs),
        );
        for (const row of rows) {
          yield* this.databaseEffect("upsert-monkeytype-result", () =>
            this.#db
              .insert(monkeytypeResult)
              .values({
                id: row.id,
                userId: user,
                timestampMs: row.timestampMs,
                wpm: row.wpm,
                rawWpm: row.rawWpm,
                acc: row.acc,
                consistency: row.consistency,
                testDuration: row.testDuration,
                mode: row.mode,
                mode2: row.mode2,
                payloadJson: row.payload,
                syncedAt: new Date(row.syncedAtMs),
              })
              .onConflictDoUpdate({
                target: [monkeytypeResult.userId, monkeytypeResult.id],
                set: {
                  timestampMs: row.timestampMs,
                  wpm: row.wpm,
                  rawWpm: row.rawWpm,
                  acc: row.acc,
                  consistency: row.consistency,
                  testDuration: row.testDuration,
                  mode: row.mode,
                  mode2: row.mode2,
                  payloadJson: row.payload,
                  syncedAt: new Date(row.syncedAtMs),
                },
              }),
          );
        }
        yield* this.retryPendingCorrelationEffect(user);
        return rows.length;
      }),
    );
  }

  retryPendingCorrelation(userId: string): Promise<number> {
    return runWorkerEffect(
      "typing-runs.retry-pending-correlation",
      Effect.gen({ self: this }, function* () {
        yield* this.ensureReadyEffect();
        const user = yield* normalizeEffect("user-id", () => normalizeUserId(userId));
        return yield* this.retryPendingCorrelationEffect(user);
      }),
    );
  }

  private ensureReadyEffect() {
    return Effect.sync(() => this.ensureTables()).pipe(
      Effect.withSpan("TypingRunsAgent.ensureReady"),
    );
  }

  private findDeviceIdForInstallEffect(userId: string, installId: string) {
    return Effect.map(
      this.databaseEffect("find-device-for-install", () =>
        this.#db
          .select({ id: extensionDevice.id })
          .from(extensionDevice)
          .where(
            and(
              eq(extensionDevice.userId, userId),
              eq(extensionDevice.installId, installId),
              isNull(extensionDevice.revokedAt),
            ),
          )
          .limit(1),
      ),
      ([device]) => device?.id ?? null,
    );
  }

  private listNormalizedResultsEffect(userId: string) {
    return Effect.map(
      this.databaseEffect("list-monkeytype-results", () =>
        this.#db.select().from(monkeytypeResult).where(eq(monkeytypeResult.userId, userId)),
      ),
      (rows) => rows.map(resultRowToNormalized),
    );
  }

  private retryPendingCorrelationEffect(userId: string) {
    return Effect.gen({ self: this }, function* () {
      const [tags, results] = yield* Effect.all([
        this.databaseEffect("list-pending-tags", () =>
          this.#db
            .select()
            .from(typingRunTag)
            .where(
              and(
                eq(typingRunTag.userId, userId),
                inArray(typingRunTag.correlationState, ["pending", "unmatched"]),
              ),
            ),
        ),
        this.listNormalizedResultsEffect(userId),
      ]);
      let updated = 0;
      for (const tag of tags) {
        const capture: MonkeytypeRunCapture = {
          ...tag.rawCaptureJson,
          monkeytypeResultId:
            tag.rawCaptureJson.monkeytypeResultId ?? tag.monkeytypeResultId ?? undefined,
        };
        const decision = correlateCapture(capture, results, { hasFreshSync: results.length > 0 });
        if (
          decision.state === tag.correlationState &&
          decision.confidence === tag.correlationConfidence &&
          (decision.monkeytypeResultId ?? null) === tag.monkeytypeResultId
        ) {
          continue;
        }
        yield* this.databaseEffect("update-correlation", () =>
          this.#db
            .update(typingRunTag)
            .set({
              correlationState: decision.state,
              correlationConfidence: decision.confidence,
              monkeytypeResultId: decision.monkeytypeResultId ?? tag.monkeytypeResultId,
              updatedAt: new Date(),
            })
            .where(eq(typingRunTag.id, tag.id)),
        );
        updated += 1;
      }
      return updated;
    });
  }

  private databaseEffect<A>(operation: string, task: () => PromiseLike<A>) {
    return Effect.tryPromise({
      try: () => task(),
      catch: (cause) => platformError(`typing-runs.database.${operation}`, cause),
    });
  }

  private ensureTables() {
    void this.sql`
      CREATE TABLE IF NOT EXISTS extension_device (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        label TEXT,
        install_id TEXT,
        extension_version TEXT,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER,
        revoked_at INTEGER
      )
    `;
    void this
      .sql`CREATE INDEX IF NOT EXISTS extension_device_user_idx ON extension_device (user_id)`;
    void this.sql`
      CREATE INDEX IF NOT EXISTS extension_device_install_idx
      ON extension_device (user_id, install_id)
    `;

    void this.sql`
      CREATE TABLE IF NOT EXISTS extension_pairing_token (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        consumed_at INTEGER,
        device_id TEXT
      )
    `;
    void this.sql`
      CREATE INDEX IF NOT EXISTS extension_pairing_token_user_idx
      ON extension_pairing_token (user_id)
    `;
    void this.sql`
      CREATE INDEX IF NOT EXISTS extension_pairing_token_expires_idx
      ON extension_pairing_token (expires_at)
    `;

    void this.sql`
      CREATE TABLE IF NOT EXISTS typing_run_tag (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        source TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        monkeytype_result_id TEXT,
        monkeytype_timestamp_ms INTEGER,
        captured_at INTEGER NOT NULL,
        received_at INTEGER NOT NULL,
        wpm REAL NOT NULL,
        raw_wpm REAL,
        acc REAL NOT NULL,
        consistency REAL,
        test_duration REAL,
        mode TEXT,
        mode2 TEXT,
        language TEXT,
        difficulty TEXT,
        punctuation INTEGER,
        numbers INTEGER,
        keyboard_id TEXT NOT NULL,
        keyboard_profile_id TEXT,
        keyboard_fork_id TEXT,
        keyboard_name TEXT NOT NULL,
        catalog_id TEXT,
        vendor_id INTEGER,
        product_id INTEGER,
        board_name TEXT,
        layout_id TEXT NOT NULL,
        layout_variant_id TEXT,
        layout_name TEXT NOT NULL,
        layout_hash TEXT,
        extension_device_id TEXT,
        correlation_state TEXT NOT NULL DEFAULT 'pending',
        correlation_confidence REAL,
        raw_capture_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `;
    void this.sql`
      CREATE UNIQUE INDEX IF NOT EXISTS typing_run_tag_user_idempotency_idx
      ON typing_run_tag (user_id, idempotency_key)
    `;
    void this.sql`
      CREATE INDEX IF NOT EXISTS typing_run_tag_monkeytype_result_idx
      ON typing_run_tag (user_id, monkeytype_result_id)
    `;
    void this.sql`
      CREATE INDEX IF NOT EXISTS typing_run_tag_captured_at_idx
      ON typing_run_tag (user_id, captured_at)
    `;
    void this.sql`
      CREATE INDEX IF NOT EXISTS typing_run_tag_keyboard_layout_idx
      ON typing_run_tag (user_id, keyboard_id, layout_id)
    `;
    void this.sql`
      CREATE INDEX IF NOT EXISTS typing_run_tag_correlation_state_idx
      ON typing_run_tag (user_id, correlation_state)
    `;

    void this.sql`
      CREATE TABLE IF NOT EXISTS typing_run_choice_sync (
        user_id TEXT PRIMARY KEY,
        keyboards_json TEXT NOT NULL,
        layouts_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `;

    void this.sql`
      CREATE TABLE IF NOT EXISTS monkeytype_result (
        id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        timestamp_ms INTEGER NOT NULL,
        wpm REAL NOT NULL,
        raw_wpm REAL,
        acc REAL NOT NULL,
        consistency REAL,
        test_duration REAL,
        mode TEXT,
        mode2 TEXT,
        payload_json TEXT NOT NULL,
        synced_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, id)
      )
    `;
    void this.sql`
      CREATE INDEX IF NOT EXISTS monkeytype_result_user_timestamp_idx
      ON monkeytype_result (user_id, timestamp_ms)
    `;

    void this.sql`
      CREATE TABLE IF NOT EXISTS extension_rate_bucket (
        bucket_key TEXT PRIMARY KEY,
        window_started_at INTEGER NOT NULL,
        count INTEGER NOT NULL
      )
    `;
  }
}

function deviceToDto(device: ExtensionDevice | NewExtensionDevice): ExtensionDeviceDto {
  return {
    id: device.id,
    label: device.label ?? null,
    installId: device.installId ?? null,
    extensionVersion: device.extensionVersion ?? null,
    createdAt: isoFromDbDate(device.createdAt),
    lastSeenAt: device.lastSeenAt ? isoFromDbDate(device.lastSeenAt) : null,
    revokedAt: device.revokedAt ? isoFromDbDate(device.revokedAt) : null,
  };
}

function runToDto(row: TypingRunTag): TaggedRun {
  return {
    id: row.id,
    userId: row.userId,
    source: row.source,
    idempotencyKey: row.idempotencyKey,
    monkeytypeResultId: row.monkeytypeResultId,
    monkeytypeTimestampMs: row.monkeytypeTimestampMs,
    capturedAt: isoFromDbDate(row.capturedAt),
    receivedAt: isoFromDbDate(row.receivedAt),
    wpm: row.wpm,
    rawWpm: row.rawWpm,
    acc: row.acc,
    consistency: row.consistency,
    testDuration: row.testDuration,
    mode: row.mode,
    mode2: row.mode2,
    language: row.language,
    difficulty: row.difficulty,
    punctuation: row.punctuation,
    numbers: row.numbers,
    keyboard: {
      keyboardId: row.keyboardId,
      displayName: row.keyboardName,
      profileId: row.keyboardProfileId ?? undefined,
      forkId: row.keyboardForkId ?? undefined,
      catalogId: row.catalogId ?? undefined,
      vendorId: row.vendorId ?? undefined,
      productId: row.productId ?? undefined,
      boardName: row.boardName ?? undefined,
    },
    layout: {
      layoutId: row.layoutId,
      displayName: row.layoutName,
      variantId: row.layoutVariantId ?? undefined,
      layoutHash: row.layoutHash ?? undefined,
    },
    extensionDeviceId: row.extensionDeviceId,
    correlationState: row.correlationState,
    correlationConfidence: row.correlationConfidence,
    createdAt: isoFromDbDate(row.createdAt),
    updatedAt: isoFromDbDate(row.updatedAt),
  };
}

function aggregateStats(
  rows: TypingRunTag[],
  groupBy: TypingRunStatsGroupBy,
): TypingRunStatsGroup[] {
  const groups = new Map<
    string,
    {
      key: string;
      label: string;
      keyboardId?: string;
      layoutId?: string;
      runs: number;
      totalWpm: number;
      totalAcc: number;
      latestCapturedAt: string | null;
    }
  >();

  for (const row of rows) {
    const group = groupKey(row, groupBy);
    const current =
      groups.get(group.key) ??
      groups
        .set(group.key, {
          ...group,
          runs: 0,
          totalWpm: 0,
          totalAcc: 0,
          latestCapturedAt: null,
        })
        .get(group.key)!;

    current.runs += 1;
    current.totalWpm += row.wpm;
    current.totalAcc += row.acc;
    const capturedAt = isoFromDbDate(row.capturedAt);
    if (!current.latestCapturedAt || capturedAt > current.latestCapturedAt) {
      current.latestCapturedAt = capturedAt;
    }
  }

  return [...groups.values()].map((group) => ({
    key: group.key,
    label: group.label,
    keyboardId: group.keyboardId,
    layoutId: group.layoutId,
    runs: group.runs,
    averageWpm: group.totalWpm / group.runs,
    averageAcc: group.totalAcc / group.runs,
    latestCapturedAt: group.latestCapturedAt,
  }));
}

function groupKey(
  row: Pick<TypingRunTag, "keyboardId" | "keyboardName" | "layoutId" | "layoutName">,
  groupBy: TypingRunStatsGroupBy,
) {
  if (groupBy === "keyboard") {
    return {
      key: row.keyboardId,
      label: row.keyboardName,
      keyboardId: row.keyboardId,
    };
  }
  if (groupBy === "layout") {
    return {
      key: row.layoutId,
      label: row.layoutName,
      layoutId: row.layoutId,
    };
  }
  return {
    key: `${row.keyboardId}:${row.layoutId}`,
    label: `${row.keyboardName} / ${row.layoutName}`,
    keyboardId: row.keyboardId,
    layoutId: row.layoutId,
  };
}

function normalizeEffect<A>(operation: string, normalize: () => A) {
  return Effect.try({
    try: normalize,
    catch: (cause) => platformError(`typing-runs.normalize.${operation}`, cause),
  });
}

function parseChoiceArrayEffect<T, E>(
  value: unknown,
  decode: (value: unknown) => Effect.Effect<T, E>,
) {
  return Effect.gen(function* () {
    const source =
      typeof value === "string"
        ? yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(value)
        : (value ?? []);
    if (!Array.isArray(source)) {
      return yield* Effect.fail(
        platformError("typing-runs.decode-choice-array", "Stored choices are not an array."),
      );
    }
    return yield* Effect.forEach(source, decode);
  });
}

function normalizeUserId(userId: string): string {
  return nonEmpty(userId, "User id");
}

function nonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required.`);
  return trimmed;
}

function randomPairingCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const chars = [...bytes].map((byte) => alphabet[byte % alphabet.length]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8).join("")}`;
}

function normalizePairingCode(code: string): string {
  return nonEmpty(code, "Pairing code")
    .replace(/[\s-]+/g, "")
    .toUpperCase();
}

function randomDeviceToken(): string {
  return `kbgui_dt_${randomBase64Url(32)}`;
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

function sha256HexEffect(value: string) {
  return Effect.map(
    Effect.tryPromise({
      try: () => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
      catch: (cause) => platformError("typing-runs.sha256", cause),
    }),
    (digest) =>
      [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
  );
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function dateFromOptionalIso(value: string | undefined): Date {
  return value ? dateFromIso(value, "timestamp") : new Date();
}

function dateFromIso(value: string, label: string): Date {
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) throw new Error(`${label} must be an ISO date string.`);
  return new Date(millis);
}

function dateFromDb(value: Date | number | string): Date {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  return new Date(value);
}

function isoFromDbDate(value: Date | number | string): string {
  return dateFromDb(value).toISOString();
}

function monkeytypeTimestampMs(value: number | undefined): number | null {
  if (value === undefined) return null;
  return value < 10_000_000_000 ? Math.round(value * 1000) : Math.round(value);
}

function resultRowToNormalized(row: MonkeytypeResultRow): NormalizedMonkeytypeResult {
  return {
    id: row.id,
    timestampMs: row.timestampMs,
    wpm: row.wpm,
    rawWpm: row.rawWpm,
    acc: row.acc,
    consistency: row.consistency,
    testDuration: row.testDuration,
    mode: row.mode,
    mode2: row.mode2,
    syncedAtMs: dateFromDb(row.syncedAt).getTime(),
    payload: row.payloadJson,
  };
}
