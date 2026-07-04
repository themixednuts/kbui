export const TYPING_RUNS_AGENT_NAME = "global-typing-runs";

export type MonkeytypeRunSource = "monkeytype-extension-dom-v1";
export type CorrelationState = "pending" | "matched" | "ambiguous" | "unmatched";

export interface KeyboardChoice {
  keyboardId: string;
  displayName: string;
  profileId?: string;
  forkId?: string;
  catalogId?: string;
  vendorId?: number;
  productId?: number;
  boardName?: string;
}

export interface LayoutChoice {
  layoutId: string;
  displayName: string;
  variantId?: string;
  layerNames?: string[];
  layoutHash?: string;
}

export interface MonkeytypeRunCapture {
  source: MonkeytypeRunSource;
  capturedAt: string;
  monkeytypeResultId?: string;
  monkeytypeTimestamp?: number;

  wpm: number;
  rawWpm?: number;
  acc: number;
  consistency?: number;
  testDuration?: number;
  mode?: string;
  mode2?: string;
  testTypeText?: string;
  language?: string;
  difficulty?: string;
  punctuation?: boolean;
  numbers?: boolean;

  keyboard: KeyboardChoice;
  layout: LayoutChoice;
  extension: {
    installId: string;
    version: string;
    parserVersion: string;
  };
}

export interface ExtensionSafeUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export interface CreatePairingTokenMeta {
  createdAt?: string;
  label?: string;
}

export interface CreatePairingTokenResponse {
  code: string;
  expiresAt: string;
  ttlSeconds: number;
}

export interface PairDeviceRequest {
  code: string;
  installId: string;
  extensionVersion: string;
  label?: string;
  pairedAt?: string;
}

export interface ExtensionDeviceDto {
  id: string;
  label: string | null;
  installId: string | null;
  extensionVersion: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
}

export interface PairDeviceResponse {
  deviceToken: string;
  userId: string;
  device: ExtensionDeviceDto;
}

export interface KeyboardChoicesResponse {
  keyboards: KeyboardChoice[];
  layouts: LayoutChoice[];
}

export interface SetKeyboardChoicesRequest extends KeyboardChoicesResponse {}

export interface ExtensionSessionResponse {
  canUse: boolean;
  user: ExtensionSafeUser | null;
  choices: KeyboardChoicesResponse;
}

export interface IngestRunRequest {
  capture: MonkeytypeRunCapture;
  idempotencyKey?: string;
}

export interface IngestRunResponse {
  status: "stored" | "duplicate";
  correlationState: CorrelationState;
}

export interface TaggedRun {
  id: string;
  userId: string;
  source: MonkeytypeRunSource;
  idempotencyKey: string;
  monkeytypeResultId: string | null;
  monkeytypeTimestampMs: number | null;
  capturedAt: string;
  receivedAt: string;
  wpm: number;
  rawWpm: number | null;
  acc: number;
  consistency: number | null;
  testDuration: number | null;
  mode: string | null;
  mode2: string | null;
  language: string | null;
  difficulty: string | null;
  punctuation: boolean | null;
  numbers: boolean | null;
  keyboard: KeyboardChoice;
  layout: LayoutChoice;
  extensionDeviceId: string | null;
  correlationState: CorrelationState;
  correlationConfidence: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaggedRunsFilter {
  limit?: number;
  keyboardId?: string;
  layoutId?: string;
  mode?: string;
}

export type TypingRunStatsGroupBy = "keyboard" | "layout" | "keyboard-layout";

export interface TypingRunStatsGroup {
  key: string;
  label: string;
  keyboardId?: string;
  layoutId?: string;
  runs: number;
  averageWpm: number;
  averageAcc: number;
  latestCapturedAt: string | null;
}

export const runIdempotencyKeySpec = {
  version: "monkeytype-run-dom-v1",
  directResultFormat: "monkeytype-result:<monkeytypeResultId>",
  domFallbackFields: [
    "source",
    "capturedAt",
    "extension.installId",
    "extension.parserVersion",
    "mode",
    "mode2",
    "wpm",
    "acc",
    "keyboard.keyboardId",
    "layout.layoutId",
  ],
} as const;

export function idempotencyKeyForCapture(capture: MonkeytypeRunCapture): string {
  if (capture.monkeytypeResultId) {
    return compactKeyPart(`monkeytype-result:${capture.monkeytypeResultId}`);
  }

  const parts = [
    capture.source,
    capture.capturedAt,
    capture.extension.installId,
    capture.extension.parserVersion,
    capture.mode ?? "",
    capture.mode2 ?? "",
    decimalPart(capture.wpm),
    decimalPart(capture.acc),
    capture.keyboard.keyboardId,
    capture.layout.layoutId,
  ];

  return compactKeyPart(`dom:${parts.map((part) => part.replace(/\|/g, "/")).join("|")}`);
}

export function normalizePairDeviceRequest(raw: unknown): PairDeviceRequest {
  const value = requireRecord(raw, "Pair request");
  return {
    code: requiredString(value, "code", 4, 128),
    installId: requiredString(value, "installId", 1, 160),
    extensionVersion: requiredString(value, "extensionVersion", 1, 80),
    label: optionalString(value, "label", 120),
    pairedAt: optionalIsoString(value, "pairedAt"),
  };
}

export function normalizeSetKeyboardChoicesRequest(raw: unknown): SetKeyboardChoicesRequest {
  const value = requireRecord(raw, "Keyboard choices");
  const keyboards = arrayField(value, "keyboards", 100).map(normalizeKeyboardChoice);
  const layouts = arrayField(value, "layouts", 200).map(normalizeLayoutChoice);

  return { keyboards, layouts };
}

export function normalizeKeyboardChoicesResponse(raw: unknown): KeyboardChoicesResponse {
  return normalizeSetKeyboardChoicesRequest(raw);
}

export function normalizeIngestRunRequest(raw: unknown): IngestRunRequest {
  const value = requireRecord(raw, "Run ingest request");
  const capture = normalizeMonkeytypeRunCapture(value.capture);
  const explicitKey = optionalString(value, "idempotencyKey", 512);
  const idempotencyKey = explicitKey?.trim() || idempotencyKeyForCapture(capture);

  return {
    capture,
    idempotencyKey: normalizeIdempotencyKey(idempotencyKey),
  };
}

export function normalizeMonkeytypeRunCapture(raw: unknown): MonkeytypeRunCapture {
  const value = requireRecord(raw, "Monkeytype run capture");
  const extension = requireRecord(value.extension, "Extension metadata");

  return {
    source: literal(value.source, "source", "monkeytype-extension-dom-v1"),
    capturedAt: requiredIsoString(value, "capturedAt"),
    monkeytypeResultId: optionalString(value, "monkeytypeResultId", 160),
    monkeytypeTimestamp: optionalNumber(value, "monkeytypeTimestamp", 0, 99_999_999_999_999),
    wpm: requiredNumber(value, "wpm", 0, 1_000),
    rawWpm: optionalNumber(value, "rawWpm", 0, 1_500),
    acc: requiredNumber(value, "acc", 0, 100),
    consistency: optionalNumber(value, "consistency", 0, 100),
    testDuration: optionalNumber(value, "testDuration", 0, 86_400),
    mode: optionalString(value, "mode", 80),
    mode2: optionalString(value, "mode2", 80),
    testTypeText: optionalString(value, "testTypeText", 240),
    language: optionalString(value, "language", 80),
    difficulty: optionalString(value, "difficulty", 80),
    punctuation: optionalBoolean(value, "punctuation"),
    numbers: optionalBoolean(value, "numbers"),
    keyboard: normalizeKeyboardChoice(value.keyboard),
    layout: normalizeLayoutChoice(value.layout),
    extension: {
      installId: requiredString(extension, "installId", 1, 160),
      version: requiredString(extension, "version", 1, 80),
      parserVersion: requiredString(extension, "parserVersion", 1, 80),
    },
  };
}

export function normalizeTaggedRunsFilter(raw: unknown): TaggedRunsFilter {
  const value = raw === undefined ? {} : requireRecord(raw, "Tagged runs filter");
  const limit = optionalInteger(value, "limit", 1, 200);
  return {
    limit: limit ?? 50,
    keyboardId: optionalString(value, "keyboardId", 160),
    layoutId: optionalString(value, "layoutId", 160),
    mode: optionalString(value, "mode", 80),
  };
}

export function normalizeTypingRunStatsGroupBy(raw: unknown): TypingRunStatsGroupBy {
  if (raw === "keyboard" || raw === "layout" || raw === "keyboard-layout") return raw;
  throw new Error("Stats groupBy must be keyboard, layout, or keyboard-layout.");
}

export function normalizeIdempotencyKey(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error("Run idempotency key is required.");
  if (normalized.length > 512) throw new Error("Run idempotency key is too long.");
  return normalized;
}

function normalizeKeyboardChoice(raw: unknown): KeyboardChoice {
  const value = requireRecord(raw, "Keyboard choice");
  return {
    keyboardId: requiredString(value, "keyboardId", 1, 160),
    displayName: requiredString(value, "displayName", 1, 160),
    profileId: optionalString(value, "profileId", 160),
    forkId: optionalString(value, "forkId", 160),
    catalogId: optionalString(value, "catalogId", 160),
    vendorId: optionalInteger(value, "vendorId", 0, 0xffff),
    productId: optionalInteger(value, "productId", 0, 0xffff),
    boardName: optionalString(value, "boardName", 160),
  };
}

function normalizeLayoutChoice(raw: unknown): LayoutChoice {
  const value = requireRecord(raw, "Layout choice");
  return {
    layoutId: requiredString(value, "layoutId", 1, 180),
    displayName: requiredString(value, "displayName", 1, 160),
    variantId: optionalString(value, "variantId", 160),
    layerNames: optionalStringArray(value, "layerNames", 32, 80),
    layoutHash: optionalString(value, "layoutHash", 160),
  };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function arrayField(value: Record<string, unknown>, key: string, max: number): unknown[] {
  const field = value[key];
  if (!Array.isArray(field)) throw new Error(`${key} must be an array.`);
  if (field.length > max) throw new Error(`${key} has too many items.`);
  return field;
}

function requiredString(
  value: Record<string, unknown>,
  key: string,
  minLength: number,
  maxLength: number,
): string {
  const field = value[key];
  if (typeof field !== "string") throw new Error(`${key} must be a string.`);
  const trimmed = field.trim();
  if (trimmed.length < minLength) throw new Error(`${key} is required.`);
  if (trimmed.length > maxLength) throw new Error(`${key} is too long.`);
  return trimmed;
}

function optionalString(
  value: Record<string, unknown>,
  key: string,
  maxLength: number,
): string | undefined {
  const field = value[key];
  if (field === undefined || field === null) return undefined;
  if (typeof field !== "string") throw new Error(`${key} must be a string.`);
  const trimmed = field.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > maxLength) throw new Error(`${key} is too long.`);
  return trimmed;
}

function requiredIsoString(value: Record<string, unknown>, key: string): string {
  const field = requiredString(value, key, 1, 80);
  if (!Number.isFinite(Date.parse(field))) throw new Error(`${key} must be an ISO date string.`);
  return field;
}

function optionalIsoString(value: Record<string, unknown>, key: string): string | undefined {
  const field = optionalString(value, key, 80);
  if (field === undefined) return undefined;
  if (!Number.isFinite(Date.parse(field))) throw new Error(`${key} must be an ISO date string.`);
  return field;
}

function requiredNumber(
  value: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
): number {
  const field = value[key];
  if (typeof field !== "number" || !Number.isFinite(field)) {
    throw new Error(`${key} must be a finite number.`);
  }
  if (field < min || field > max) throw new Error(`${key} is out of range.`);
  return field;
}

function optionalNumber(
  value: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
): number | undefined {
  const field = value[key];
  if (field === undefined || field === null) return undefined;
  if (typeof field !== "number" || !Number.isFinite(field)) {
    throw new Error(`${key} must be a finite number.`);
  }
  if (field < min || field > max) throw new Error(`${key} is out of range.`);
  return field;
}

function optionalInteger(
  value: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
): number | undefined {
  const field = optionalNumber(value, key, min, max);
  if (field === undefined) return undefined;
  if (!Number.isInteger(field)) throw new Error(`${key} must be an integer.`);
  return field;
}

function optionalBoolean(value: Record<string, unknown>, key: string): boolean | undefined {
  const field = value[key];
  if (field === undefined || field === null) return undefined;
  if (typeof field !== "boolean") throw new Error(`${key} must be a boolean.`);
  return field;
}

function optionalStringArray(
  value: Record<string, unknown>,
  key: string,
  maxItems: number,
  maxLength: number,
): string[] | undefined {
  const field = value[key];
  if (field === undefined || field === null) return undefined;
  if (!Array.isArray(field)) throw new Error(`${key} must be an array.`);
  if (field.length > maxItems) throw new Error(`${key} has too many items.`);
  return field.map((item, index) => {
    if (typeof item !== "string") throw new Error(`${key}[${index}] must be a string.`);
    const trimmed = item.trim();
    if (trimmed.length > maxLength) throw new Error(`${key}[${index}] is too long.`);
    return trimmed;
  });
}

function literal<T extends string>(value: unknown, key: string, expected: T): T {
  if (value !== expected) throw new Error(`${key} must be ${expected}.`);
  return expected;
}

function compactKeyPart(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^a-zA-Z0-9:._|@/-]/g, "_")
    .slice(0, 512);
}

function decimalPart(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/0+$/g, "");
}
