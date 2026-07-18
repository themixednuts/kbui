import { Cache, Context, Effect, Exit, Layer, Schedule, Schema } from "effect";

import type { KeyboardCatalogEntry } from "$lib/keyboard/catalog";
import type { FirmwareMetadata, KeyboardKey } from "$lib/keyboard/schema";
import { uf2TargetForHardware } from "$lib/keyboard/uf2-families";

type JsonRecord = Readonly<Record<string, unknown>>;

const qmkInfoBase = "https://keyboards.qmk.fm/v1/keyboards";
const qmkCatalogUrl = "https://keyboards.qmk.fm/v1/keyboards.json";
const qmkRepository = "qmk/qmk_firmware";
const qmkDefaultRef = "master";
const qmkCacheTtl = "15 minutes";
const qmkFetchRetrySchedule = Schedule.exponential("250 millis").pipe(
  Schedule.jittered,
  Schedule.upTo({ times: 3 }),
);

const JsonRecordSchema = Schema.Record(Schema.String, Schema.Unknown);
export const QmkCatalogRecordSchema = Schema.Struct({
  info: JsonRecordSchema,
  keyboard: Schema.String,
});
export const QmkCatalogRecordsJsonSchema = Schema.fromJsonString(
  Schema.Array(QmkCatalogRecordSchema),
);
export interface QmkCatalogRecord extends Schema.Schema.Type<typeof QmkCatalogRecordSchema> {}

export type QmkUsbIndex = {
  lastUpdated: string;
  items: Map<string, QmkCatalogRecord[]>;
};

export class QmkCatalogFetchError extends Schema.TaggedErrorClass<QmkCatalogFetchError>()(
  "QmkCatalogFetchError",
  {
    operation: Schema.String,
    message: Schema.String,
    retryable: Schema.Boolean,
    status: Schema.optionalKey(Schema.Finite),
    cause: Schema.Defect(),
  },
) {}

interface QmkTargetCacheService {
  readonly loadUsbIndex: () => Effect.Effect<QmkUsbIndex, QmkCatalogFetchError>;
  readonly resolvePinnedRef: (githubToken?: string) => Effect.Effect<string, QmkCatalogFetchError>;
}

export class QmkTargetCache extends Context.Service<QmkTargetCache, QmkTargetCacheService>()(
  "@kbui/QmkTargetCache",
) {}

/** GitHub API headers used for QMK repository-revision lookups. */
export function qmkGithubHeaders(token?: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "kbui-qmk-catalog",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function qmkCatalogFetchError(
  operation: string,
  cause: unknown,
  options: { message?: string; retryable: boolean; status?: number },
) {
  return new QmkCatalogFetchError({
    operation,
    message: options.message ?? (cause instanceof Error ? cause.message : String(cause)),
    retryable: options.retryable,
    ...(options.status === undefined ? {} : { status: options.status }),
    cause,
  });
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseUsbId(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value !== "string") return undefined;
  const parsed = Number.parseInt(value, value.toLowerCase().startsWith("0x") ? 16 : 10);
  return Number.isInteger(parsed) ? parsed : undefined;
}

export function usbIdentityKey(vendorId: number, productId: number) {
  return `${vendorId.toString(16).padStart(4, "0")}:${productId.toString(16).padStart(4, "0")}`;
}

const readErrorBodyEffect = Effect.fn("qmk.read-error-body")(function* (response: Response) {
  return yield* Effect.tryPromise({
    try: () => response.text(),
    catch: (cause) => qmkCatalogFetchError("qmk.read-error-body", cause, { retryable: false }),
  }).pipe(Effect.orElseSucceed(() => ""));
});

const requestResponseEffect = Effect.fn("qmk.request-response")(function* (
  url: string,
  headers: HeadersInit,
  operation: string,
  allowNotFound = false,
) {
  const attempt = Effect.gen(function* () {
    const response = yield* Effect.tryPromise({
      try: (signal) => fetch(url, { headers, signal }),
      catch: (cause) => qmkCatalogFetchError(operation, cause, { retryable: true }),
    });

    if (response.ok || (allowNotFound && response.status === 404)) return response;

    const body = yield* readErrorBodyEffect(response);
    return yield* Effect.fail(
      qmkCatalogFetchError(operation, response.status, {
        message: `QMK request returned ${response.status}${body ? `: ${body.slice(0, 400)}` : "."}`,
        retryable: response.status === 408 || response.status === 429 || response.status >= 500,
        status: response.status,
      }),
    );
  });

  return yield* Effect.retry(attempt, {
    schedule: qmkFetchRetrySchedule,
    while: (error) => error.retryable,
  });
});

const requestJsonEffect = Effect.fn("qmk.request-json")(function* (
  url: string,
  headers: HeadersInit,
  operation: string,
  allowNotFound = false,
) {
  const response = yield* requestResponseEffect(url, headers, operation, allowNotFound);
  if (allowNotFound && response.status === 404) return undefined;

  return yield* Effect.tryPromise({
    try: () => response.json(),
    catch: (cause) => qmkCatalogFetchError(`${operation}.decode-json`, cause, { retryable: false }),
  });
});

function decodeQmkResponseEffect<
  S extends Schema.Constraint & { readonly DecodingServices: never },
>(schema: S, value: unknown, operation: string): Effect.Effect<S["Type"], QmkCatalogFetchError> {
  return Schema.decodeUnknownEffect(schema)(value).pipe(
    Effect.mapError((cause) =>
      qmkCatalogFetchError(operation, cause, {
        message: `QMK response for ${operation} was malformed.`,
        retryable: false,
      }),
    ),
  );
}

function matrixToken(row: number, col: number) {
  return `${row},${col}`;
}

function matrixSetForKeys(keys: KeyboardKey[]) {
  return new Set(keys.map((key) => matrixToken(key.row, key.col)));
}

function matrixSetForLayout(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  const result = new Set<string>();

  for (const item of value) {
    if (!isRecord(item) || !Array.isArray(item.matrix) || item.matrix.length < 2) return undefined;
    const [row, col] = item.matrix;
    if (typeof row !== "number" || typeof col !== "number") return undefined;
    result.add(matrixToken(row, col));
  }

  return result;
}

function setsEqual(left: Set<string>, right: Set<string>) {
  return left.size === right.size && Array.from(left).every((item) => right.has(item));
}

function qmkLayoutEntries(info: JsonRecord) {
  if (!isRecord(info.layouts)) return [];

  return Object.entries(info.layouts)
    .map(([name, value]) => ({
      layout: isRecord(value) && Array.isArray(value.layout) ? value.layout : undefined,
      name,
    }))
    .filter(
      (candidate): candidate is { layout: unknown[]; name: string } =>
        candidate.layout !== undefined,
    )
    .sort(
      (left, right) =>
        Number(right.name === "LAYOUT") - Number(left.name === "LAYOUT") ||
        right.layout.length - left.layout.length ||
        left.name.length - right.name.length ||
        left.name.localeCompare(right.name),
    );
}

function keysFromQmkLayout(layout: unknown[]) {
  const keys: KeyboardKey[] = [];
  const seen = new Set<string>();

  for (const item of layout) {
    if (!isRecord(item) || !Array.isArray(item.matrix) || item.matrix.length < 2) continue;
    const [row, col] = item.matrix;
    if (typeof row !== "number" || typeof col !== "number") continue;
    const id = `k${row}-${col}`;
    if (seen.has(id)) continue;
    seen.add(id);

    keys.push({
      id,
      label: `R${row}C${col}`,
      row,
      col,
      x: typeof item.x === "number" ? item.x : col,
      y: typeof item.y === "number" ? item.y : row,
      width: typeof item.w === "number" ? item.w : 1,
      height: typeof item.h === "number" ? item.h : 1,
      rotation: typeof item.r === "number" && item.r !== 0 ? item.r : undefined,
    });
  }

  return keys;
}

function normalizedIdentity(value = "") {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stringField(record: JsonRecord, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function qmkIdentityScore(record: QmkCatalogRecord, productName?: string) {
  const product = normalizedIdentity(productName);
  if (!product) return 0;
  const name = normalizedIdentity(
    `${stringField(record.info, "keyboard_name")} ${stringField(record.info, "manufacturer")} ${record.keyboard}`,
  );
  const keyboardName = normalizedIdentity(stringField(record.info, "keyboard_name"));
  if (name === product) return 10_000;
  if (name.includes(product) || (keyboardName.length > 0 && product.includes(keyboardName))) {
    return 5_000;
  }
  const productTokens = new Set(product.split(/\s+/).filter((token) => token.length >= 2));
  const nameTokens = new Set(name.split(/\s+/));
  return Array.from(productTokens).filter((token) => nameTokens.has(token)).length * 100;
}

function qmkLayoutSignature(record: QmkCatalogRecord) {
  const layout = qmkLayoutEntries(record.info)[0]?.layout;
  if (!layout) return "";
  return keysFromQmkLayout(layout)
    .map((key) => `${key.row},${key.col}`)
    .sort()
    .join(";");
}

const QmkCatalogResponseSchema = Schema.Struct({
  keyboards: Schema.Record(Schema.String, JsonRecordSchema),
  last_updated: Schema.optionalKey(Schema.String),
});

/**
 * Builds the reduced QMK USB index with one multi-megabyte catalog fetch and
 * parse. Production invokes this only from the QMK index Agent's scheduled
 * alarm, never from the request path.
 */
export const createQmkUsbIndexEffect = Effect.fn("qmk.build-usb-index")(function* () {
  const json = yield* requestJsonEffect(
    qmkCatalogUrl,
    {
      Accept: "application/json",
      "User-Agent": "kbui-qmk-catalog",
    },
    "qmk.fetch-catalog",
  );
  const body = yield* decodeQmkResponseEffect(QmkCatalogResponseSchema, json, "qmk.decode-catalog");

  const items = new Map<string, QmkCatalogRecord[]>();
  for (const [keyboard, rawInfo] of Object.entries(body.keyboards)) {
    if (!isRecord(rawInfo.usb)) continue;
    const vendorId = parseUsbId(rawInfo.usb.vid);
    const productId = parseUsbId(rawInfo.usb.pid);
    if (vendorId === undefined || productId === undefined) continue;
    const key = usbIdentityKey(vendorId, productId);
    const records = items.get(key) ?? [];
    records.push({ info: rawInfo, keyboard });
    items.set(key, records);
  }

  return {
    lastUpdated: body.last_updated ?? "unknown",
    items,
  } satisfies QmkUsbIndex;
});

function loadQmkUsbIndexEffect() {
  return Effect.flatMap(QmkTargetCache, (cache) => cache.loadUsbIndex());
}

export function resolveQmkLayout(keys: KeyboardKey[], keyboardInfo: unknown) {
  if (!isRecord(keyboardInfo) || !isRecord(keyboardInfo.layouts)) return undefined;
  const expected = matrixSetForKeys(keys);

  return Object.entries(keyboardInfo.layouts)
    .map(([name, value]) => ({
      name,
      matrix: isRecord(value) ? matrixSetForLayout(value.layout) : undefined,
    }))
    .filter(
      (candidate): candidate is { name: string; matrix: Set<string> } =>
        candidate.matrix !== undefined && setsEqual(expected, candidate.matrix),
    )
    .sort(
      (left, right) =>
        Number(right.name === "LAYOUT") - Number(left.name === "LAYOUT") ||
        left.name.length - right.name.length ||
        left.name.localeCompare(right.name),
    )[0]?.name;
}

export function qmkKeyboardCandidates(entry: Pick<KeyboardCatalogEntry, "id" | "sourcePath">) {
  const source = entry.id || entry.sourcePath;
  const segments = source
    .replace(/^v3\//i, "")
    .replace(/\.json$/i, "")
    .toLowerCase()
    .split("/")
    .filter(Boolean);
  const candidates: string[] = [];

  for (const start of [0, 1, 2]) {
    for (let end = segments.length; end > start; end -= 1) {
      const candidate = segments.slice(start, end).join("/");
      if (candidate && !candidates.includes(candidate)) candidates.push(candidate);
    }
  }

  return candidates.slice(0, 18);
}

const QmkKeyboardInfoResponseSchema = Schema.Struct({
  keyboards: Schema.Record(Schema.String, JsonRecordSchema),
});
const QmkChildKeyboardSchema = Schema.Struct({
  name: Schema.String,
  type: Schema.String,
});
const QmkRepositoryRefSchema = Schema.Struct({
  sha: Schema.String.check(Schema.isMinLength(7)),
});

const fetchQmkKeyboardInfoEffect = Effect.fn("qmk.fetch-keyboard-info")(function* (
  keyboard: string,
) {
  const encodedKeyboard = keyboard.split("/").map(encodeURIComponent).join("/");
  const json = yield* requestJsonEffect(
    `${qmkInfoBase}/${encodedKeyboard}/info.json`,
    { Accept: "application/json" },
    "qmk.fetch-keyboard-info",
    true,
  );
  if (json === undefined) return undefined;

  const body = yield* decodeQmkResponseEffect(
    QmkKeyboardInfoResponseSchema,
    json,
    "qmk.decode-keyboard-info",
  );
  return body.keyboards[keyboard];
});

const discoverQmkChildKeyboardsEffect = Effect.fn("qmk.discover-child-keyboards")(function* (
  keyboard: string,
  githubHeaders: HeadersInit,
) {
  const encodedPath = keyboard.split("/").map(encodeURIComponent).join("/");
  const json = yield* requestJsonEffect(
    `https://api.github.com/repos/${qmkRepository}/contents/keyboards/${encodedPath}`,
    githubHeaders,
    "qmk.discover-child-keyboards",
    true,
  );
  if (json === undefined) return [];

  const body = yield* decodeQmkResponseEffect(
    Schema.Array(QmkChildKeyboardSchema),
    json,
    "qmk.decode-child-keyboards",
  );
  return body
    .filter((item) => item.type === "dir")
    .map((item) => `${keyboard}/${item.name}`)
    .sort();
});

const fetchPinnedQmkRefEffect = Effect.fn("qmk.fetch-repository-ref")(function* (
  githubToken?: string,
) {
  const json = yield* requestJsonEffect(
    `https://api.github.com/repos/${qmkRepository}/commits/${qmkDefaultRef}`,
    qmkGithubHeaders(githubToken),
    "qmk.fetch-repository-ref",
  );
  const body = yield* decodeQmkResponseEffect(
    QmkRepositoryRefSchema,
    json,
    "qmk.decode-repository-ref",
  );
  return body.sha;
});

export const qmkTargetCacheLayer = Layer.effect(
  QmkTargetCache,
  Effect.gen(function* () {
    const usbIndexCache = yield* Cache.makeWith((_key: string) => createQmkUsbIndexEffect(), {
      capacity: 1,
      timeToLive: (exit) => (Exit.isSuccess(exit) ? qmkCacheTtl : "0 millis"),
    });
    const refCache = yield* Cache.makeWith(
      (githubToken: string) => fetchPinnedQmkRefEffect(githubToken || undefined),
      {
        capacity: 4,
        timeToLive: (exit) => (Exit.isSuccess(exit) ? qmkCacheTtl : "0 millis"),
      },
    );

    return QmkTargetCache.of({
      loadUsbIndex: Effect.fn("QmkTargetCache.loadUsbIndex")(function* () {
        return yield* Cache.get(usbIndexCache, "catalog");
      }),
      resolvePinnedRef: Effect.fn("QmkTargetCache.resolvePinnedRef")(function* (
        githubToken?: string,
      ) {
        return yield* Cache.get(refCache, githubToken ?? "");
      }),
    });
  }),
);

export const resolvePinnedQmkRefEffect = Effect.fn("qmk.resolve-repository-ref")(function* (
  githubToken?: string,
) {
  const cache = yield* QmkTargetCache;
  return yield* cache.resolvePinnedRef(githubToken);
});

/**
 * Pure, CPU-cheap resolution of a VIA-capable HID device against the QMK
 * catalog records already reduced to a single USB identity. This deliberately
 * takes the pre-fetched `records`, the pinned `ref`, and the catalog
 * `dataVersion` as arguments so it performs NO network I/O and no multi-megabyte
 * parse — it only ranks the handful of records that share this exact USB id.
 *
 * Exact USB IDs are mandatory (the caller keys `records` by them). When an ID is
 * shared by materially different layouts and the product name cannot
 * disambiguate them, no entry is returned; choosing a wrong matrix or build
 * target would be unsafe.
 *
 * This is what {@link QmkIndexAgent} calls per request against its persisted DO
 * SQLite index, keeping the request path off the heavy `keyboards.json` build.
 */
export function resolveQmkIdentityFromRecords(
  records: ReadonlyArray<QmkCatalogRecord>,
  input: { productId?: number; productName?: string; vendorId?: number },
  ref: string,
  dataVersion: string,
): KeyboardCatalogEntry | undefined {
  if (input.vendorId === undefined || input.productId === undefined) return undefined;
  if (records.length === 0) return undefined;

  const ranked = records
    .map((record) => ({ record, score: qmkIdentityScore(record, input.productName) }))
    .sort(
      (left, right) =>
        right.score - left.score || left.record.keyboard.localeCompare(right.record.keyboard),
    );
  const topScore = ranked[0]?.score ?? 0;
  const topMatches = ranked.filter((candidate) => candidate.score === topScore);
  const signatures = new Set(topMatches.map(({ record }) => qmkLayoutSignature(record)));
  if (signatures.size !== 1 || signatures.has("")) return undefined;

  const primary = topMatches[0]?.record;
  const selectedLayout = primary ? qmkLayoutEntries(primary.info)[0] : undefined;
  if (!primary || !selectedLayout) return undefined;
  const keys = keysFromQmkLayout(selectedLayout.layout);
  if (keys.length === 0) return undefined;

  const matrixSize = isRecord(primary.info.matrix_size) ? primary.info.matrix_size : undefined;
  const rows =
    typeof matrixSize?.rows === "number"
      ? matrixSize.rows
      : Math.max(...keys.map((key) => key.row + 1));
  const cols =
    typeof matrixSize?.cols === "number"
      ? matrixSize.cols
      : Math.max(...keys.map((key) => key.col + 1));
  const alternatives = topMatches.slice(1).map(({ record }) => ({
    keyboard: record.keyboard,
    layout: qmkLayoutEntries(record.info)[0]?.name ?? selectedLayout.name,
  }));
  const processor =
    stringField(primary.info, "processor") ||
    stringField(primary.info, "development_board") ||
    undefined;
  const bootloader = stringField(primary.info, "bootloader") || undefined;
  const uf2 = uf2TargetForHardware({ bootloader, processor });

  return {
    id: `qmk/${primary.keyboard}`,
    name:
      typeof primary.info.keyboard_name === "string"
        ? primary.info.keyboard_name
        : (primary.keyboard.split("/").at(-1) ?? primary.keyboard),
    vendor:
      typeof primary.info.manufacturer === "string"
        ? primary.info.manufacturer
        : (primary.keyboard.split("/")[0] ?? "QMK"),
    source: "qmk-api",
    sourcePath: primary.keyboard,
    sourceRevision: dataVersion,
    vendorId: input.vendorId,
    productId: input.productId,
    matrix: { rows, cols },
    layout: {
      width: Math.max(...keys.map((key) => (key.x ?? key.col) + (key.width ?? 1))),
      height: Math.max(...keys.map((key) => (key.y ?? key.row) + (key.height ?? 1))),
      keyCount: keys.length,
    },
    keys,
    combos: [],
    defaultLayers: [],
    capabilities: ["keymap", "layers", "settings", "firmware"],
    firmwareMetadata: {
      qmk: {
        alternatives: alternatives.length > 0 ? alternatives : undefined,
        bootloader,
        keyboard: primary.keyboard,
        layout: selectedLayout.name,
        keyOrder: keys.map((key) => key.id),
        processor,
        repository: qmkRepository,
        ref,
        targetConfirmed: topMatches.length === 1,
        uf2FamilyId: uf2?.familyId,
        uf2VolumeLabels: uf2?.volumeLabels,
      },
    },
    priority: 100,
  } satisfies KeyboardCatalogEntry;
}

/**
 * Resolves a VIA-capable HID device against QMK's complete, generated keyboard
 * catalog, building the multi-megabyte USB index in-process. This is the heavy
 * path (it exceeds the Cloudflare free-plan CPU budget when run per request) and
 * is used for local dev / tests and by {@link QmkIndexAgent}'s background build.
 * Production request traffic goes through the DO-persisted index instead.
 */
export const resolveQmkKeyboardIdentityEffect = Effect.fn("qmk.resolve-keyboard-identity")(
  function* (input: { productId?: number; productName?: string; vendorId?: number }) {
    if (input.vendorId === undefined || input.productId === undefined) return undefined;
    const catalog = yield* loadQmkUsbIndexEffect();
    const records = catalog.items.get(usbIdentityKey(input.vendorId, input.productId)) ?? [];
    if (records.length === 0) return undefined;

    // The pinned ref is best-effort: an unauthenticated commits-API rate
    // limit must not discard a resolved USB-identity match. Fall back to the
    // default branch ref, same as QmkIndexAgent.buildIndex.
    const ref = yield* resolvePinnedQmkRefEffect().pipe(
      Effect.tapError((error) =>
        Effect.logInfo("QMK repository ref unavailable; using default branch").pipe(
          Effect.annotateLogs({ operation: error.operation, status: error.status }),
        ),
      ),
      Effect.catchTag("QmkCatalogFetchError", () => Effect.succeed(qmkDefaultRef)),
    );
    return resolveQmkIdentityFromRecords(records, input, ref, catalog.lastUpdated);
  },
);

export const resolveQmkFirmwareMetadataEffect = Effect.fn("qmk.resolve-firmware-metadata")(
  function* (entry: KeyboardCatalogEntry, githubToken?: string) {
    const githubHeaders = qmkGithubHeaders(githubToken);
    const candidates = qmkKeyboardCandidates(entry);
    const matches: Array<{ info: JsonRecord; keyboard: string; layout: string }> = [];

    for (const keyboard of candidates) {
      const info = yield* fetchQmkKeyboardInfoEffect(keyboard);
      if (!info) continue;

      const layout = resolveQmkLayout(entry.keys, info);
      if (!layout) continue;

      matches.push({ info, keyboard, layout });
    }

    if (matches.length === 0) {
      for (const parent of candidates) {
        const children = yield* discoverQmkChildKeyboardsEffect(parent, githubHeaders);
        if (children.length === 0) continue;

        for (const keyboard of children) {
          const info = yield* fetchQmkKeyboardInfoEffect(keyboard);
          if (!info) continue;
          const layout = resolveQmkLayout(entry.keys, info);
          if (layout) matches.push({ info, keyboard, layout });
        }

        if (matches.length > 0) break;
      }
    }

    const primary = matches[0];
    if (primary) {
      const alternatives = matches.slice(1);
      const processor =
        stringField(primary.info, "processor") ||
        stringField(primary.info, "development_board") ||
        undefined;
      const bootloader = stringField(primary.info, "bootloader") || undefined;
      const uf2 = uf2TargetForHardware({ bootloader, processor });

      return {
        qmk: {
          alternatives:
            alternatives.length > 0
              ? alternatives.map(({ keyboard, layout }) => ({ keyboard, layout }))
              : undefined,
          bootloader,
          keyboard: primary.keyboard,
          layout: primary.layout,
          keyOrder: entry.keys.map((key) => key.id),
          processor,
          repository: qmkRepository,
          // Best-effort: a resolved match (found via the unauthenticated
          // keyboards.qmk.fm info.json lookups above) must not be discarded
          // just because the commits-API ref lookup hits the unauthenticated
          // rate limit. Fall back to the default branch ref, same as
          // QmkIndexAgent.buildIndex and resolveQmkKeyboardIdentityEffect.
          ref: yield* resolvePinnedQmkRefEffect(githubToken).pipe(
            Effect.tapError((error) =>
              Effect.logInfo("QMK repository ref unavailable; using default branch").pipe(
                Effect.annotateLogs({ operation: error.operation, status: error.status }),
              ),
            ),
            Effect.catchTag("QmkCatalogFetchError", () => Effect.succeed(qmkDefaultRef)),
          ),
          targetConfirmed: matches.length === 1,
          uf2FamilyId: uf2?.familyId,
          uf2VolumeLabels: uf2?.volumeLabels,
        },
      } satisfies FirmwareMetadata;
    }

    return undefined;
  },
);
