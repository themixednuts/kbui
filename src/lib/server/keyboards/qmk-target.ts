import type { KeyboardCatalogEntry } from "$lib/keyboard/catalog";
import type { FirmwareMetadata, KeyboardKey } from "$lib/keyboard/schema";
import { Deferred, Effect } from "effect";
import { uf2TargetForHardware } from "$lib/keyboard/uf2-families";
import { retryTransient } from "$lib/effect/self-healing";
import { runWorkerEffect } from "$lib/effect/worker-runtime";

type JsonRecord = Record<string, unknown>;

const qmkInfoBase = "https://keyboards.qmk.fm/v1/keyboards";
const qmkCatalogUrl = "https://keyboards.qmk.fm/v1/keyboards.json";
const qmkRepository = "qmk/qmk_firmware";
const qmkDefaultRef = "master";
const qmkCacheTtlMs = 15 * 60 * 1000;

let qmkRefCache: { expiresAt: number; ref: string } | undefined;
let qmkUsbIndexCache:
  | {
      expiresAt: number;
      lastUpdated: string;
      items: Map<string, QmkCatalogRecord[]>;
    }
  | undefined;
type QmkUsbIndex = { lastUpdated: string; items: Map<string, QmkCatalogRecord[]> };

let qmkUsbIndexLoad: Deferred.Deferred<QmkUsbIndex, QmkCatalogFetchError> | undefined;

type QmkCatalogRecord = {
  info: JsonRecord;
  keyboard: string;
};

class QmkCatalogFetchError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "QmkCatalogFetchError";
  }
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

function usbIdentityKey(vendorId: number, productId: number) {
  return `${vendorId.toString(16).padStart(4, "0")}:${productId.toString(16).padStart(4, "0")}`;
}

function retryingJsonRequestEffect<T>(url: string, headers: HeadersInit = {}) {
  const request = Effect.tryPromise({
    try: async () => {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new QmkCatalogFetchError(
          `QMK catalog request returned ${response.status}.`,
          response.status === 408 || response.status === 429 || response.status >= 500,
        );
      }
      return (await response.json()) as T;
    },
    catch: (error) =>
      error instanceof QmkCatalogFetchError
        ? error
        : new QmkCatalogFetchError(
            error instanceof Error ? error.message : "QMK catalog request failed.",
            true,
          ),
  });

  return retryTransient(request);
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

function createQmkUsbIndexEffect() {
  return Effect.gen(function* () {
    const body = yield* retryingJsonRequestEffect<unknown>(qmkCatalogUrl, {
      Accept: "application/json",
      "User-Agent": "kbui-qmk-catalog",
    });
    if (!isRecord(body) || !isRecord(body.keyboards)) {
      return yield* Effect.fail(
        new QmkCatalogFetchError("QMK catalog response was malformed.", false),
      );
    }

    const items = new Map<string, QmkCatalogRecord[]>();
    for (const [keyboard, rawInfo] of Object.entries(body.keyboards)) {
      if (!isRecord(rawInfo) || !isRecord(rawInfo.usb)) continue;
      const vendorId = parseUsbId(rawInfo.usb.vid);
      const productId = parseUsbId(rawInfo.usb.pid);
      if (vendorId === undefined || productId === undefined) continue;
      const key = usbIdentityKey(vendorId, productId);
      const records = items.get(key) ?? [];
      records.push({ info: rawInfo, keyboard });
      items.set(key, records);
    }

    return {
      lastUpdated: typeof body.last_updated === "string" ? body.last_updated : "unknown",
      items,
    } satisfies QmkUsbIndex;
  });
}

function loadQmkUsbIndexEffect() {
  return Effect.suspend(() => {
    if (qmkUsbIndexCache && qmkUsbIndexCache.expiresAt > Date.now()) {
      return Effect.succeed(qmkUsbIndexCache);
    }
    if (qmkUsbIndexLoad) return Deferred.await(qmkUsbIndexLoad);

    const deferred = Deferred.makeUnsafe<QmkUsbIndex, QmkCatalogFetchError>();
    qmkUsbIndexLoad = deferred;
    return Effect.matchEffect(createQmkUsbIndexEffect(), {
      onFailure: (error) =>
        Effect.sync(() => Deferred.doneUnsafe(deferred, Effect.fail(error))).pipe(
          Effect.andThen(Effect.fail(error)),
        ),
      onSuccess: (loaded) =>
        Effect.sync(() => {
          qmkUsbIndexCache = { ...loaded, expiresAt: Date.now() + qmkCacheTtlMs };
          Deferred.doneUnsafe(deferred, Effect.succeed(loaded));
        }).pipe(Effect.as(loaded)),
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (qmkUsbIndexLoad === deferred) qmkUsbIndexLoad = undefined;
        }),
      ),
    );
  });
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

function fetchQmkKeyboardInfoEffect(keyboard: string) {
  const encodedKeyboard = keyboard.split("/").map(encodeURIComponent).join("/");
  const request = Effect.tryPromise({
    try: async () => {
      const response = await fetch(`${qmkInfoBase}/${encodedKeyboard}/info.json`, {
        headers: { Accept: "application/json" },
      });
      if (response.status === 404) return undefined;
      if (!response.ok) {
        throw new QmkCatalogFetchError(
          `QMK keyboard info returned ${response.status}.`,
          response.status === 408 || response.status === 429 || response.status >= 500,
        );
      }

      const body = (await response.json()) as unknown;
      if (!isRecord(body) || !isRecord(body.keyboards)) {
        throw new QmkCatalogFetchError("QMK keyboard info was malformed.", false);
      }
      const info = body.keyboards[keyboard];
      return isRecord(info) ? info : undefined;
    },
    catch: (error) =>
      error instanceof QmkCatalogFetchError
        ? error
        : new QmkCatalogFetchError(
            error instanceof Error ? error.message : "QMK keyboard info request failed.",
            true,
          ),
  });
  return retryTransient(request);
}

function discoverQmkChildKeyboardsEffect(keyboard: string, githubHeaders: HeadersInit) {
  const encodedPath = keyboard.split("/").map(encodeURIComponent).join("/");
  const request = Effect.tryPromise({
    try: async () => {
      const response = await fetch(
        `https://api.github.com/repos/${qmkRepository}/contents/keyboards/${encodedPath}`,
        { headers: githubHeaders },
      );
      if (response.status === 404) return [];
      if (!response.ok) {
        throw new QmkCatalogFetchError(
          `QMK child-keyboard lookup returned ${response.status}.`,
          response.status === 408 || response.status === 429 || response.status >= 500,
        );
      }

      const body = (await response.json()) as unknown;
      if (!Array.isArray(body)) {
        throw new QmkCatalogFetchError("QMK child-keyboard response was malformed.", false);
      }
      return body
        .filter(
          (item): item is JsonRecord =>
            isRecord(item) && item.type === "dir" && typeof item.name === "string",
        )
        .map((item) => `${keyboard}/${item.name as string}`)
        .sort();
    },
    catch: (error) =>
      error instanceof QmkCatalogFetchError
        ? error
        : new QmkCatalogFetchError(
            error instanceof Error ? error.message : "QMK child-keyboard lookup failed.",
            true,
          ),
  });
  return retryTransient(request);
}

function resolvePinnedQmkRefEffect(githubHeaders: HeadersInit) {
  return Effect.suspend(() => {
    if (qmkRefCache && qmkRefCache.expiresAt > Date.now()) {
      return Effect.succeed(qmkRefCache.ref);
    }
    return Effect.gen(function* () {
      const body = yield* retryingJsonRequestEffect<unknown>(
        `https://api.github.com/repos/${qmkRepository}/commits/${qmkDefaultRef}`,
        githubHeaders,
      );
      if (!isRecord(body) || typeof body.sha !== "string" || body.sha.length < 7) {
        return yield* Effect.fail(
          new QmkCatalogFetchError("QMK repository revision response was malformed.", false),
        );
      }
      qmkRefCache = { ref: body.sha, expiresAt: Date.now() + qmkCacheTtlMs };
      return body.sha;
    });
  });
}

/**
 * Resolves a VIA-capable HID device against QMK's complete, generated keyboard
 * catalog. Exact USB IDs are mandatory. When an ID is shared by materially
 * different layouts and the product name cannot disambiguate them, no entry is
 * returned; choosing a wrong matrix or build target would be unsafe.
 */
function resolveQmkKeyboardIdentityEffect(input: {
  productId?: number;
  productName?: string;
  vendorId?: number;
}) {
  return Effect.gen(function* () {
    if (input.vendorId === undefined || input.productId === undefined) return undefined;
    const catalog = yield* loadQmkUsbIndexEffect();
    const matches = catalog.items.get(usbIdentityKey(input.vendorId, input.productId)) ?? [];
    if (matches.length === 0) return undefined;

    const ranked = matches
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
      sourceRevision: catalog.lastUpdated,
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
          ref: yield* resolvePinnedQmkRefEffect({
            Accept: "application/vnd.github+json",
            "User-Agent": "kbui-qmk-catalog",
            "X-GitHub-Api-Version": "2022-11-28",
          }),
          targetConfirmed: topMatches.length === 1,
          uf2FamilyId: uf2?.familyId,
          uf2VolumeLabels: uf2?.volumeLabels,
        },
      },
      priority: 100,
    } satisfies KeyboardCatalogEntry;
  });
}

export function resolveQmkKeyboardIdentity(input: {
  productId?: number;
  productName?: string;
  vendorId?: number;
}): Promise<KeyboardCatalogEntry | undefined> {
  return runWorkerEffect("qmk.resolve-keyboard-identity", resolveQmkKeyboardIdentityEffect(input));
}

function resolveQmkFirmwareMetadataEffect(
  entry: KeyboardCatalogEntry,
  githubHeaders: HeadersInit,
): Effect.Effect<FirmwareMetadata | undefined, QmkCatalogFetchError> {
  return Effect.gen(function* () {
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
          ref: yield* resolvePinnedQmkRefEffect(githubHeaders),
          targetConfirmed: matches.length === 1,
          uf2FamilyId: uf2?.familyId,
          uf2VolumeLabels: uf2?.volumeLabels,
        },
      };
    }

    return undefined;
  });
}

export function resolveQmkFirmwareMetadata(
  entry: KeyboardCatalogEntry,
  githubHeaders: HeadersInit,
): Promise<FirmwareMetadata | undefined> {
  return runWorkerEffect(
    "qmk.resolve-firmware-metadata",
    resolveQmkFirmwareMetadataEffect(entry, githubHeaders),
  );
}
