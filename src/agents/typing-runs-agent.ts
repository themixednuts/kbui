import { Agent, type AgentContext } from "agents";
import { and, desc, eq, isNull } from "drizzle-orm";
import { drizzle, type DrizzleSqliteDODatabase } from "drizzle-orm/durable-sqlite";

import {
  idempotencyKeyForCapture,
  normalizeIdempotencyKey,
  normalizeMonkeytypeRunCapture,
  normalizeSetKeyboardChoicesRequest,
  normalizeTaggedRunsFilter,
  normalizeTypingRunStatsGroupBy,
  type CreatePairingTokenMeta,
  type CreatePairingTokenResponse,
  type ExtensionDeviceDto,
  type IngestRunResponse,
  type KeyboardChoice,
  type KeyboardChoicesResponse,
  type LayoutChoice,
  type MonkeytypeRunCapture,
  type TaggedRun,
  type TypingRunStatsGroup,
  type TypingRunStatsGroupBy,
} from "$lib/typing-runs/contracts";
import {
  extensionDevice,
  extensionPairingToken,
  typingRunChoiceSync,
  typingRunTag,
  type ExtensionDevice,
  type NewExtensionDevice,
  type NewTypingRunTag,
  type TypingRunTag,
} from "$lib/typing-runs/schema";

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

  onStart() {
    console.log("[TypingRunsAgent] onStart - ensuring extension ingest tables");
    this.ensureTables();
    this.setState({ bootedAt: new Date().toISOString() });
  }

  async createPairingToken(
    userId: string,
    meta: CreatePairingTokenMeta = {},
  ): Promise<CreatePairingTokenResponse> {
    await this.ensureReady();
    const user = normalizeUserId(userId);
    const createdAt = dateFromOptionalIso(meta.createdAt);
    const expiresAt = new Date(createdAt.getTime() + PAIRING_TOKEN_TTL_SECONDS * 1000);
    const code = randomPairingCode();
    const tokenHash = await sha256Hex(normalizePairingCode(code));

    await this.#db.insert(extensionPairingToken).values({
      tokenHash,
      userId: user,
      createdAt,
      expiresAt,
      consumedAt: null,
      deviceId: null,
    });

    return {
      code,
      expiresAt: expiresAt.toISOString(),
      ttlSeconds: PAIRING_TOKEN_TTL_SECONDS,
    };
  }

  async pairDevice(
    code: string,
    install: {
      installId: string;
      extensionVersion: string;
      label?: string;
      pairedAt?: string;
    },
  ): Promise<{ deviceToken: string; userId: string; device: ExtensionDeviceDto } | null> {
    await this.ensureReady();
    const tokenHash = await sha256Hex(normalizePairingCode(code));
    const now = dateFromOptionalIso(install.pairedAt);
    const deviceToken = randomDeviceToken();
    const deviceTokenHash = await sha256Hex(deviceToken);
    const deviceId = `extdev_${randomBase64Url(18)}`;
    const label = install.label?.trim() || "Monkeytype tagger";
    let result: { deviceToken: string; userId: string; device: ExtensionDeviceDto } | null = null;

    this.#db.transaction((tx) => {
      const [pairing] = tx
        .select()
        .from(extensionPairingToken)
        .where(eq(extensionPairingToken.tokenHash, tokenHash))
        .limit(1)
        .all();

      if (!pairing) return;
      if (pairing.consumedAt) return;
      if (dateFromDb(pairing.expiresAt).getTime() <= now.getTime()) return;

      const device: NewExtensionDevice = {
        id: deviceId,
        userId: pairing.userId,
        tokenHash: deviceTokenHash,
        label,
        installId: install.installId.trim(),
        extensionVersion: install.extensionVersion.trim(),
        createdAt: now,
        lastSeenAt: now,
        revokedAt: null,
      };

      tx.insert(extensionDevice).values(device).run();
      tx.update(extensionPairingToken)
        .set({
          consumedAt: now,
          deviceId,
        })
        .where(eq(extensionPairingToken.tokenHash, tokenHash))
        .run();

      result = {
        deviceToken,
        userId: pairing.userId,
        device: deviceToDto(device),
      };
    });

    return result;
  }

  async resolveDeviceToken(token: string): Promise<string | null> {
    await this.ensureReady();
    const tokenHash = await sha256Hex(token.trim());
    const [device] = await this.#db
      .select()
      .from(extensionDevice)
      .where(and(eq(extensionDevice.tokenHash, tokenHash), isNull(extensionDevice.revokedAt)))
      .limit(1);

    if (!device) return null;

    await this.#db
      .update(extensionDevice)
      .set({ lastSeenAt: new Date() })
      .where(eq(extensionDevice.id, device.id));

    return device.userId;
  }

  async listDevices(userId: string): Promise<ExtensionDeviceDto[]> {
    await this.ensureReady();
    const user = normalizeUserId(userId);
    const rows = await this.#db
      .select()
      .from(extensionDevice)
      .where(eq(extensionDevice.userId, user))
      .orderBy(desc(extensionDevice.createdAt));

    return rows.map(deviceToDto);
  }

  async revokeDevice(userId: string, id: string): Promise<void> {
    await this.ensureReady();
    const user = normalizeUserId(userId);
    const deviceId = nonEmpty(id, "Extension device id");
    await this.#db
      .update(extensionDevice)
      .set({ revokedAt: new Date() })
      .where(and(eq(extensionDevice.userId, user), eq(extensionDevice.id, deviceId)));
  }

  async setKeyboardChoices(userId: string, rawChoices: unknown): Promise<void> {
    await this.ensureReady();
    const user = normalizeUserId(userId);
    const choices = normalizeSetKeyboardChoicesRequest(rawChoices);
    const now = new Date();

    await this.#db
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
      });
  }

  async getKeyboardChoices(userId: string): Promise<KeyboardChoicesResponse> {
    await this.ensureReady();
    const user = normalizeUserId(userId);
    const [row] = await this.#db
      .select()
      .from(typingRunChoiceSync)
      .where(eq(typingRunChoiceSync.userId, user))
      .limit(1);

    return {
      keyboards: parseChoiceArray(row?.keyboardsJson, normalizeKeyboardChoiceFallback),
      layouts: parseChoiceArray(row?.layoutsJson, normalizeLayoutChoiceFallback),
    };
  }

  async ingestRun(userId: string, rawCapture: IngestibleCapture): Promise<IngestRunResponse> {
    await this.ensureReady();
    const user = normalizeUserId(userId);
    const capture = normalizeMonkeytypeRunCapture(rawCapture);
    const idempotencyKey = normalizeIdempotencyKey(
      rawCapture.idempotencyKey ?? idempotencyKeyForCapture(capture),
    );

    const [existing] = await this.#db
      .select({
        correlationState: typingRunTag.correlationState,
      })
      .from(typingRunTag)
      .where(and(eq(typingRunTag.userId, user), eq(typingRunTag.idempotencyKey, idempotencyKey)))
      .limit(1);

    if (existing) {
      return {
        status: "duplicate",
        correlationState: existing.correlationState,
      };
    }

    const now = new Date();
    const capturedAt = dateFromIso(capture.capturedAt, "capturedAt");
    const extensionDeviceId = await this.findDeviceIdForInstall(user, capture.extension.installId);
    const row: NewTypingRunTag = {
      id: `run_${(await sha256Hex(`${user}:${idempotencyKey}`)).slice(0, 32)}`,
      userId: user,
      source: capture.source,
      idempotencyKey,
      monkeytypeResultId: capture.monkeytypeResultId ?? null,
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
      correlationState: "pending",
      correlationConfidence: null,
      rawCaptureJson: capture,
      createdAt: now,
      updatedAt: now,
    };

    await this.#db.insert(typingRunTag).values(row);

    return {
      status: "stored",
      correlationState: "pending",
    };
  }

  async listTaggedRuns(userId: string, rawFilter: unknown = {}): Promise<TaggedRun[]> {
    await this.ensureReady();
    const user = normalizeUserId(userId);
    const filter = normalizeTaggedRunsFilter(rawFilter);
    const conditions = [eq(typingRunTag.userId, user)];

    if (filter.keyboardId) conditions.push(eq(typingRunTag.keyboardId, filter.keyboardId));
    if (filter.layoutId) conditions.push(eq(typingRunTag.layoutId, filter.layoutId));
    if (filter.mode) conditions.push(eq(typingRunTag.mode, filter.mode));

    const rows = await this.#db
      .select()
      .from(typingRunTag)
      .where(and(...conditions))
      .orderBy(desc(typingRunTag.capturedAt))
      .limit(filter.limit ?? 50);

    return rows.map(runToDto);
  }

  async getStats(userId: string, rawGroupBy: unknown): Promise<TypingRunStatsGroup[]> {
    await this.ensureReady();
    const user = normalizeUserId(userId);
    const groupBy = normalizeTypingRunStatsGroupBy(rawGroupBy);
    const rows = await this.#db
      .select()
      .from(typingRunTag)
      .where(eq(typingRunTag.userId, user))
      .orderBy(desc(typingRunTag.capturedAt));

    return aggregateStats(rows, groupBy);
  }

  private async ensureReady() {
    this.ensureTables();
  }

  private async findDeviceIdForInstall(userId: string, installId: string): Promise<string | null> {
    const [device] = await this.#db
      .select({ id: extensionDevice.id })
      .from(extensionDevice)
      .where(
        and(
          eq(extensionDevice.userId, userId),
          eq(extensionDevice.installId, installId),
          isNull(extensionDevice.revokedAt),
        ),
      )
      .limit(1);

    return device?.id ?? null;
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

function parseChoiceArray<T>(value: unknown, normalize: (value: unknown) => T | null): T[] {
  const source = typeof value === "string" ? parseJson(value) : value;
  if (!Array.isArray(source)) return [];
  return source.map(normalize).filter((item): item is T => item !== null);
}

function normalizeKeyboardChoiceFallback(value: unknown): KeyboardChoice | null {
  try {
    const choices = normalizeSetKeyboardChoicesRequest({ keyboards: [value], layouts: [] });
    return choices.keyboards[0] ?? null;
  } catch {
    return null;
  }
}

function normalizeLayoutChoiceFallback(value: unknown): LayoutChoice | null {
  try {
    const choices = normalizeSetKeyboardChoicesRequest({ keyboards: [], layouts: [value] });
    return choices.layouts[0] ?? null;
  } catch {
    return null;
  }
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
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

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
