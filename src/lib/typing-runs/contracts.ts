import { Effect, Schema } from "effect";

import { BoundaryDecodeError } from "$lib/effect/errors";

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

const requiredText = (minimum: number, maximum: number) =>
  Schema.Trim.check(Schema.isMinLength(minimum), Schema.isMaxLength(maximum));
const optionalText = (maximum: number) =>
  Schema.optionalKey(Schema.NullOr(Schema.Trim.check(Schema.isMaxLength(maximum))));
const optionalNumber = (minimum: number, maximum: number) =>
  Schema.optionalKey(Schema.NullOr(Schema.Finite.check(Schema.isBetween({ minimum, maximum }))));
const optionalInteger = (minimum: number, maximum: number) =>
  Schema.optionalKey(Schema.NullOr(Schema.Int.check(Schema.isBetween({ minimum, maximum }))));
const optionalBoolean = Schema.optionalKey(Schema.NullOr(Schema.Boolean));
const isoTimestamp = requiredText(1, 80).check(
  Schema.makeFilter((value) =>
    Number.isFinite(Date.parse(value)) ? undefined : "must be an ISO date string",
  ),
);
const optionalIsoTimestamp = Schema.optionalKey(
  Schema.NullOr(
    Schema.Trim.check(Schema.isMaxLength(80)).check(
      Schema.makeFilter((value) =>
        value === "" || Number.isFinite(Date.parse(value))
          ? undefined
          : "must be an ISO date string",
      ),
    ),
  ),
);

export const KeyboardChoiceBoundarySchema = Schema.Struct({
  keyboardId: requiredText(1, 160),
  displayName: requiredText(1, 160),
  profileId: optionalText(160),
  forkId: optionalText(160),
  catalogId: optionalText(160),
  vendorId: optionalInteger(0, 0xffff),
  productId: optionalInteger(0, 0xffff),
  boardName: optionalText(160),
});

export const LayoutChoiceBoundarySchema = Schema.Struct({
  layoutId: requiredText(1, 180),
  displayName: requiredText(1, 160),
  variantId: optionalText(160),
  layerNames: Schema.optionalKey(
    Schema.NullOr(
      Schema.Array(Schema.Trim.check(Schema.isMaxLength(80))).check(Schema.isMaxLength(32)),
    ),
  ),
  layoutHash: optionalText(160),
});

export const PairDeviceRequestBoundarySchema = Schema.Struct({
  code: requiredText(4, 128),
  installId: requiredText(1, 160),
  extensionVersion: requiredText(1, 80),
  label: optionalText(120),
  pairedAt: optionalIsoTimestamp,
});

export const KeyboardChoicesBoundarySchema = Schema.Struct({
  keyboards: Schema.Array(KeyboardChoiceBoundarySchema).check(Schema.isMaxLength(100)),
  layouts: Schema.Array(LayoutChoiceBoundarySchema).check(Schema.isMaxLength(200)),
});

export const MonkeytypeRunCaptureBoundarySchema = Schema.Struct({
  source: Schema.Literals(["monkeytype-extension-dom-v1"]),
  capturedAt: isoTimestamp,
  monkeytypeResultId: optionalText(160),
  monkeytypeTimestamp: optionalNumber(0, 99_999_999_999_999),
  wpm: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 1_000 })),
  rawWpm: optionalNumber(0, 1_500),
  acc: Schema.Finite.check(Schema.isBetween({ minimum: 0, maximum: 100 })),
  consistency: optionalNumber(0, 100),
  testDuration: optionalNumber(0, 86_400),
  mode: optionalText(80),
  mode2: optionalText(80),
  testTypeText: optionalText(240),
  language: optionalText(80),
  difficulty: optionalText(80),
  punctuation: optionalBoolean,
  numbers: optionalBoolean,
  keyboard: KeyboardChoiceBoundarySchema,
  layout: LayoutChoiceBoundarySchema,
  extension: Schema.Struct({
    installId: requiredText(1, 160),
    version: requiredText(1, 80),
    parserVersion: requiredText(1, 80),
  }),
});

export const IngestRunRequestBoundarySchema = Schema.Struct({
  capture: MonkeytypeRunCaptureBoundarySchema,
  idempotencyKey: optionalText(512),
});

export const TaggedRunsFilterBoundarySchema = Schema.UndefinedOr(
  Schema.Struct({
    limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 200 }))),
    keyboardId: optionalText(160),
    layoutId: optionalText(160),
    mode: optionalText(80),
  }),
);

export const TypingRunStatsGroupBySchema = Schema.Literals([
  "keyboard",
  "layout",
  "keyboard-layout",
]);

export const IdempotencyKeySchema = requiredText(1, 512);

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

export const decodePairDeviceRequestEffect = Effect.fn(
  "TypingRunContracts.decodePairDeviceRequest",
)((raw: unknown) =>
  Schema.decodeUnknownEffect(PairDeviceRequestBoundarySchema)(raw).pipe(
    Effect.map(normalizePairDeviceRequest),
    mapBoundaryError("typing-runs.decode-pair-device-request"),
  ),
);

export const decodeKeyboardChoiceEffect = Effect.fn("TypingRunContracts.decodeKeyboardChoice")(
  (raw: unknown) =>
    Schema.decodeUnknownEffect(KeyboardChoiceBoundarySchema)(raw).pipe(
      Effect.map(normalizeKeyboardChoice),
      mapBoundaryError("typing-runs.decode-keyboard-choice"),
    ),
);

export const decodeLayoutChoiceEffect = Effect.fn("TypingRunContracts.decodeLayoutChoice")(
  (raw: unknown) =>
    Schema.decodeUnknownEffect(LayoutChoiceBoundarySchema)(raw).pipe(
      Effect.map(normalizeLayoutChoice),
      mapBoundaryError("typing-runs.decode-layout-choice"),
    ),
);

export const decodeSetKeyboardChoicesRequestEffect = Effect.fn(
  "TypingRunContracts.decodeSetKeyboardChoicesRequest",
)((raw: unknown) =>
  Schema.decodeUnknownEffect(KeyboardChoicesBoundarySchema)(raw).pipe(
    Effect.map(
      (value): SetKeyboardChoicesRequest => ({
        keyboards: value.keyboards.map(normalizeKeyboardChoice),
        layouts: value.layouts.map(normalizeLayoutChoice),
      }),
    ),
    mapBoundaryError("typing-runs.decode-keyboard-choices"),
  ),
);

export const decodeKeyboardChoicesResponseEffect = decodeSetKeyboardChoicesRequestEffect;

export const decodeMonkeytypeRunCaptureEffect = Effect.fn(
  "TypingRunContracts.decodeMonkeytypeRunCapture",
)((raw: unknown) =>
  Schema.decodeUnknownEffect(MonkeytypeRunCaptureBoundarySchema)(raw).pipe(
    Effect.map(normalizeMonkeytypeRunCapture),
    mapBoundaryError("typing-runs.decode-monkeytype-run-capture"),
  ),
);

export const decodeIngestRunRequestEffect = Effect.fn("TypingRunContracts.decodeIngestRunRequest")(
  function* (raw: unknown) {
    const value = yield* Schema.decodeUnknownEffect(IngestRunRequestBoundarySchema)(raw).pipe(
      mapBoundaryError("typing-runs.decode-ingest-run-request"),
    );
    const capture = normalizeMonkeytypeRunCapture(value.capture);
    const idempotencyKey = yield* decodeIdempotencyKeyEffect(
      optionalValue(value.idempotencyKey) ?? idempotencyKeyForCapture(capture),
    );
    return { capture, idempotencyKey } satisfies IngestRunRequest;
  },
);

export const decodeTaggedRunsFilterEffect = Effect.fn("TypingRunContracts.decodeTaggedRunsFilter")(
  (raw: unknown) =>
    Schema.decodeUnknownEffect(TaggedRunsFilterBoundarySchema)(raw).pipe(
      Effect.map(
        (value): TaggedRunsFilter => ({
          limit: value?.limit ?? 50,
          keyboardId: optionalValue(value?.keyboardId),
          layoutId: optionalValue(value?.layoutId),
          mode: optionalValue(value?.mode),
        }),
      ),
      mapBoundaryError("typing-runs.decode-tagged-runs-filter"),
    ),
);

export const decodeTypingRunStatsGroupByEffect = Effect.fn(
  "TypingRunContracts.decodeTypingRunStatsGroupBy",
)((raw: unknown) =>
  Schema.decodeUnknownEffect(TypingRunStatsGroupBySchema)(raw).pipe(
    mapBoundaryError("typing-runs.decode-stats-group"),
  ),
);

export const decodeIdempotencyKeyEffect = Effect.fn("TypingRunContracts.decodeIdempotencyKey")(
  (raw: unknown) =>
    Schema.decodeUnknownEffect(IdempotencyKeySchema)(raw).pipe(
      mapBoundaryError("typing-runs.decode-idempotency-key"),
    ),
);

function normalizePairDeviceRequest(
  value: typeof PairDeviceRequestBoundarySchema.Type,
): PairDeviceRequest {
  return {
    code: value.code,
    installId: value.installId,
    extensionVersion: value.extensionVersion,
    label: optionalValue(value.label),
    pairedAt: optionalValue(value.pairedAt),
  };
}

function normalizeKeyboardChoice(value: typeof KeyboardChoiceBoundarySchema.Type): KeyboardChoice {
  return {
    keyboardId: value.keyboardId,
    displayName: value.displayName,
    profileId: optionalValue(value.profileId),
    forkId: optionalValue(value.forkId),
    catalogId: optionalValue(value.catalogId),
    vendorId: optionalValue(value.vendorId),
    productId: optionalValue(value.productId),
    boardName: optionalValue(value.boardName),
  };
}

function normalizeLayoutChoice(value: typeof LayoutChoiceBoundarySchema.Type): LayoutChoice {
  return {
    layoutId: value.layoutId,
    displayName: value.displayName,
    variantId: optionalValue(value.variantId),
    layerNames: value.layerNames ? [...value.layerNames] : undefined,
    layoutHash: optionalValue(value.layoutHash),
  };
}

function normalizeMonkeytypeRunCapture(
  value: typeof MonkeytypeRunCaptureBoundarySchema.Type,
): MonkeytypeRunCapture {
  return {
    source: value.source,
    capturedAt: value.capturedAt,
    monkeytypeResultId: optionalValue(value.monkeytypeResultId),
    monkeytypeTimestamp: optionalValue(value.monkeytypeTimestamp),
    wpm: value.wpm,
    rawWpm: optionalValue(value.rawWpm),
    acc: value.acc,
    consistency: optionalValue(value.consistency),
    testDuration: optionalValue(value.testDuration),
    mode: optionalValue(value.mode),
    mode2: optionalValue(value.mode2),
    testTypeText: optionalValue(value.testTypeText),
    language: optionalValue(value.language),
    difficulty: optionalValue(value.difficulty),
    punctuation: optionalValue(value.punctuation),
    numbers: optionalValue(value.numbers),
    keyboard: normalizeKeyboardChoice(value.keyboard),
    layout: normalizeLayoutChoice(value.layout),
    extension: value.extension,
  };
}

function mapBoundaryError(operation: string) {
  return Effect.mapError(
    (cause) =>
      new BoundaryDecodeError({
        operation,
        message: `Typing run payload did not match its contract: ${String(cause)}`,
        cause,
      }),
  );
}

function optionalValue<A>(value: A | null | undefined): A | undefined {
  return value === null || value === undefined || value === "" ? undefined : value;
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
