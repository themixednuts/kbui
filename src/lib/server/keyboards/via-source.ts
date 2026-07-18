import { unzipSync } from "fflate";
import { Cache, Clock, Config, Duration, Effect, Exit, Option, Schedule, Schema } from "effect";

import type { KeyboardCatalogEntry, KeyboardCatalogIndexEntry } from "$lib/keyboard/catalog";
import {
  parseViaDefinition,
  scoreViaDefinitionPath,
  summarizeCatalogEntry,
} from "$lib/keyboard/via-definition";

import { localKeyboardDefinitions } from "./local-defs";
import { QmkTargetCache, resolveQmkFirmwareMetadataEffect } from "./qmk-target";

const viaOwner = "the-via";
const viaRepo = "keyboards";
const viaBranch = "master";
const viaRepoName = `${viaOwner}/${viaRepo}`;
const githubApiBase = "https://api.github.com";
// codeload.github.com serves git archives directly (no api.github.com REST
// call), so it isn't subject to the unauthenticated core API's 60 req/hr
// rate limit that made this catalog 403 in production. The "legacy.zip"
// variant additionally nests every file under a `<owner>-<repo>-<shortsha>/`
// root directory (same naming as the api.github.com zipball endpoint, which
// actually redirects to this same codeload URL), so the resolved commit can
// be read straight off the archive without ever calling the commits API.
const viaCodeloadArchiveUrl = `https://codeload.github.com/${viaOwner}/${viaRepo}/legacy.zip/refs/heads/${viaBranch}`;
const viaCacheTtl = Duration.minutes(15);
const viaRequestRetrySchedule = Schedule.exponential("250 millis").pipe(
  Schedule.upTo({ times: 3 }),
);
const catalogCacheKey = "catalog";

const ViaRevisionResponse = Schema.Struct({ sha: Schema.String });
const ViaRevisionResponseJson = Schema.fromJsonString(ViaRevisionResponse);

export class ViaCatalogFetchError extends Schema.TaggedErrorClass<ViaCatalogFetchError>()(
  "ViaCatalogFetchError",
  {
    operation: Schema.String,
    message: Schema.String,
    retryable: Schema.Boolean,
    status: Schema.optionalKey(Schema.Finite),
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}

export class ViaKeyboardNotFoundError extends Schema.TaggedErrorClass<ViaKeyboardNotFoundError>()(
  "ViaKeyboardNotFoundError",
  {
    id: Schema.String,
    message: Schema.String,
  },
) {}

type ViaSourceMeta = {
  source: "github-api";
  repo: string;
  ref: string;
  refreshedAt: string;
};

export type KeyboardCatalogResponse<T> = ViaSourceMeta & {
  count: number;
  items: T;
};

type ViaCatalog = KeyboardCatalogResponse<KeyboardCatalogEntry[]>;
type ViaCatalogError = ViaCatalogFetchError | Config.ConfigError;
type DetailMetadata = KeyboardCatalogEntry["firmwareMetadata"];
type DetailMetadataResult = {
  metadata: DetailMetadata;
  cacheable: boolean;
};

let catalogCache: Cache.Cache<string, ViaCatalog, ViaCatalogError> | undefined;
let detailMetadataCache:
  | Cache.Cache<KeyboardCatalogEntry, DetailMetadataResult, Config.ConfigError>
  | undefined;

export const readViaGithubTokenEffect = Effect.fn("via.config.github-token")(function* () {
  const viaToken = yield* Config.option(Config.string("VIA_GITHUB_TOKEN"));
  if (Option.isSome(viaToken)) return viaToken.value;
  return Option.getOrUndefined(yield* Config.option(Config.string("GITHUB_TOKEN")));
});

function githubHeaders(token?: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "kbui-via-catalog",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function archiveDefinitionPath(path: string) {
  const marker = "/v3/";
  const index = path.indexOf(marker);
  if (index === -1 || !path.endsWith(".json")) return undefined;
  return path.slice(index + 1);
}

function toIndexEntry(entry: KeyboardCatalogEntry): KeyboardCatalogIndexEntry {
  return summarizeCatalogEntry(entry);
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function messageFromCause(cause: unknown, fallback: string) {
  return cause instanceof Error ? cause.message : fallback;
}

const fetchResponseEffect = Effect.fn("via.http.fetch")(function* (
  operation: string,
  url: string,
  headers: HeadersInit,
) {
  return yield* Effect.tryPromise({
    try: (signal) => fetch(url, { headers, signal }),
    catch: (cause) =>
      new ViaCatalogFetchError({
        operation,
        message: messageFromCause(cause, "VIA catalog request failed."),
        retryable: true,
        cause,
      }),
  }).pipe(
    Effect.timeout("20 seconds"),
    Effect.mapError((error) =>
      error instanceof ViaCatalogFetchError
        ? error
        : new ViaCatalogFetchError({
            operation,
            message: "VIA catalog request timed out.",
            retryable: true,
            cause: error,
          }),
    ),
  );
});

const readResponseTextEffect = Effect.fn("via.http.read-text")(function* (
  operation: string,
  response: Response,
) {
  return yield* Effect.tryPromise({
    try: () => response.text(),
    catch: (cause) =>
      new ViaCatalogFetchError({
        operation,
        message: messageFromCause(cause, "Could not read the VIA catalog response."),
        retryable: true,
        cause,
      }),
  }).pipe(
    Effect.timeout("20 seconds"),
    Effect.mapError((error) =>
      error instanceof ViaCatalogFetchError
        ? error
        : new ViaCatalogFetchError({
            operation,
            message: "Reading the VIA catalog response timed out.",
            retryable: true,
            cause: error,
          }),
    ),
  );
});

const readResponseBytesEffect = Effect.fn("via.http.read-bytes")(function* (
  operation: string,
  response: Response,
) {
  const buffer = yield* Effect.tryPromise({
    try: () => response.arrayBuffer(),
    catch: (cause) =>
      new ViaCatalogFetchError({
        operation,
        message: messageFromCause(cause, "Could not read the VIA catalog archive."),
        retryable: true,
        cause,
      }),
  }).pipe(
    Effect.timeout("20 seconds"),
    Effect.mapError((error) =>
      error instanceof ViaCatalogFetchError
        ? error
        : new ViaCatalogFetchError({
            operation,
            message: "Reading the VIA catalog archive timed out.",
            retryable: true,
            cause: error,
          }),
    ),
  );
  return new Uint8Array(buffer);
});

const decodeViaRevisionEffect = Effect.fn("via.revision.decode")(function* (text: string) {
  const body = yield* Schema.decodeUnknownEffect(ViaRevisionResponseJson)(text).pipe(
    Effect.mapError(
      (cause) =>
        new ViaCatalogFetchError({
          operation: "via.revision.decode",
          message: "VIA catalog revision response was malformed.",
          retryable: false,
          cause,
        }),
    ),
  );
  if (body.sha.length < 7) {
    return yield* Effect.fail(
      new ViaCatalogFetchError({
        operation: "via.revision.decode",
        message: "VIA catalog revision response was malformed.",
        retryable: false,
      }),
    );
  }
  return body.sha;
});

const fetchViaRevisionAttemptEffect = Effect.fn("via.revision.fetch-attempt")(function* (
  token: string,
) {
  const operation = "via.revision.fetch";
  const response = yield* fetchResponseEffect(
    operation,
    `${githubApiBase}/repos/${viaOwner}/${viaRepo}/commits/${viaBranch}`,
    githubHeaders(token),
  );
  const text = yield* readResponseTextEffect(operation, response);
  if (!response.ok) {
    return yield* Effect.fail(
      new ViaCatalogFetchError({
        operation,
        message: `VIA catalog revision returned ${response.status}: ${text.slice(0, 400)}`,
        retryable: isRetryableStatus(response.status),
        status: response.status,
      }),
    );
  }
  return yield* decodeViaRevisionEffect(text);
});

export const fetchViaRevisionEffect = Effect.fn("via.revision.fetch")((token: string) =>
  Effect.retry(fetchViaRevisionAttemptEffect(token), {
    schedule: viaRequestRetrySchedule,
    while: (error) => error.retryable,
  }),
);

const fetchViaArchiveAttemptEffect = Effect.fn("via.archive.fetch-attempt")(function* (
  operation: string,
  url: string,
  headers: HeadersInit,
) {
  const response = yield* fetchResponseEffect(operation, url, headers);
  if (!response.ok) {
    const body = yield* readResponseTextEffect(operation, response);
    return yield* Effect.fail(
      new ViaCatalogFetchError({
        operation,
        message: `VIA catalog archive returned ${response.status}: ${body.slice(0, 400)}`,
        retryable: isRetryableStatus(response.status),
        status: response.status,
      }),
    );
  }
  return yield* readResponseBytesEffect(operation, response);
});

const fetchViaArchiveAtEffect = Effect.fn("via.archive.fetch")(
  (operation: string, url: string, headers: HeadersInit) =>
    Effect.retry(fetchViaArchiveAttemptEffect(operation, url, headers), {
      schedule: viaRequestRetrySchedule,
      while: (error) => error.retryable,
    }),
);

export const fetchViaArchiveEffect = Effect.fn("via.archive.github")((ref: string, token: string) =>
  fetchViaArchiveAtEffect(
    "via.archive.github",
    `${githubApiBase}/repos/${viaOwner}/${viaRepo}/zipball/${ref}`,
    githubHeaders(token),
  ),
);

export const fetchViaArchiveFromCodeloadEffect = Effect.fn("via.archive.codeload")(() =>
  fetchViaArchiveAtEffect("via.archive.codeload", viaCodeloadArchiveUrl, {
    "User-Agent": "kbui-via-catalog",
  }),
);

const selectViaArchiveEffect = Effect.fn("via.archive.select")(function* (
  token: string | undefined,
) {
  if (token) {
    const revision = yield* Effect.result(fetchViaRevisionEffect(token));
    if (revision._tag === "Success") {
      const archive = yield* Effect.result(fetchViaArchiveEffect(revision.success, token));
      if (archive._tag === "Success") {
        return { bytes: archive.success, pinnedRef: revision.success };
      }
    }
  }

  return { bytes: yield* fetchViaArchiveFromCodeloadEffect(), pinnedRef: undefined };
});

/**
 * Recovers the resolved commit from an unzipped archive's root directory
 * name (`<owner>-<repo>-<shortsha>/...`) instead of a separate commits API
 * call. Falls back to the branch name if the archive layout ever changes.
 */
function deriveRevisionFromArchive(archive: Record<string, Uint8Array>): string | undefined {
  for (const path of Object.keys(archive)) {
    const root = path.split("/", 1)[0];
    const match = root ? /-([0-9a-f]{7,40})$/i.exec(root) : null;
    if (match) return match[1];
  }
  return undefined;
}

const bundledDefinitionRevisionEffect = Effect.fn("via.bundled-definition.digest")(function* (
  definition: Record<string, unknown>,
) {
  const digest = yield* Effect.tryPromise({
    try: () =>
      crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(definition))),
    catch: (cause) =>
      new ViaCatalogFetchError({
        operation: "via.bundled-definition.digest",
        message: messageFromCause(cause, "Bundled definition digest failed."),
        retryable: false,
        cause,
      }),
  });
  return `bundled:${Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")}`;
});

export const createViaCatalogEffect = Effect.fn("via.catalog.create")(function* () {
  const token = yield* readViaGithubTokenEffect();
  const { bytes: archiveBytes, pinnedRef } = yield* selectViaArchiveEffect(token);
  const archive = yield* Effect.try({
    try: () => unzipSync(archiveBytes),
    catch: (cause) =>
      new ViaCatalogFetchError({
        operation: "via.archive.decode",
        message: messageFromCause(cause, "VIA catalog archive was malformed."),
        retryable: false,
        cause,
      }),
  });
  const ref = pinnedRef ?? deriveRevisionFromArchive(archive) ?? viaBranch;
  const decoder = new TextDecoder();
  const entries: KeyboardCatalogEntry[] = [];

  for (const [archivePath, bytes] of Object.entries(archive)) {
    const sourcePath = archiveDefinitionPath(archivePath);
    if (!sourcePath) continue;

    const decoded = Schema.decodeUnknownResult(Schema.UnknownFromJsonString)(decoder.decode(bytes));
    if (decoded._tag === "Failure") continue;
    try {
      const entry = parseViaDefinition(
        sourcePath,
        decoded.success,
        scoreViaDefinitionPath(sourcePath, bytes.byteLength),
      );
      if (entry) entries.push({ ...entry, sourceRevision: ref });
    } catch {
      // Skip definitions whose JSON is valid but whose unsupported shape makes
      // the upstream parser reject them. One bad community file must not hide
      // the rest of the catalog.
    }
  }

  // Splice in local overrides. They use the same parser so their KLE layouts
  // get the same x/y/rotation treatment as upstream entries.
  for (const local of localKeyboardDefinitions) {
    const entry = parseViaDefinition(local.sourcePath, local.json, local.priority);
    if (entry) {
      entries.push({
        ...entry,
        sourceRevision: yield* bundledDefinitionRevisionEffect(local.json),
      });
    }
  }

  entries.sort(
    (left, right) => right.priority - left.priority || left.name.localeCompare(right.name),
  );

  return {
    source: "github-api",
    repo: viaRepoName,
    ref,
    refreshedAt: new Date(yield* Clock.currentTimeMillis).toISOString(),
    count: entries.length,
    items: entries,
  } satisfies ViaCatalog;
});

const catalogCacheEffect = Effect.fn("via.catalog.cache")(function* () {
  if (catalogCache) return catalogCache;

  const created = yield* Cache.makeWith<string, ViaCatalog, ViaCatalogError>(
    () => createViaCatalogEffect(),
    {
      capacity: 1,
      timeToLive: (exit) => (Exit.isSuccess(exit) ? viaCacheTtl : Duration.zero),
    },
  );
  if (!catalogCache) catalogCache = created;
  return catalogCache;
});

export const loadViaKeyboardCatalogEffect = Effect.fn("via.catalog.load")(function* () {
  const cache = yield* catalogCacheEffect();
  return yield* Cache.get(cache, catalogCacheKey);
});

export const loadViaKeyboardIndexEffect = Effect.fn("via.catalog.index")(function* () {
  const catalog = yield* loadViaKeyboardCatalogEffect();
  return {
    source: catalog.source,
    repo: catalog.repo,
    ref: catalog.ref,
    refreshedAt: catalog.refreshedAt,
    count: catalog.count,
    items: catalog.items.map(toIndexEntry),
  } satisfies KeyboardCatalogResponse<KeyboardCatalogIndexEntry[]>;
});

/**
 * Best-effort QMK build-target metadata for a single VIA detail response.
 *
 * This deliberately does NOT resolve the USB-identity target here. The connect
 * flow resolves the exact QMK target through the dedicated
 * `resolveKeyboardIdentity` query (a separate Worker invocation with its own CPU
 * budget) and `withResolvedQmkTarget` treats that as authoritative, so rebuilding
 * the multi-megabyte QMK USB index inside the detail request was both redundant
 * and the reason `getViaKeyboardDetail` exceeded the Worker CPU limit: it stacked
 * that parse on top of the full VIA-catalog build in a single request.
 *
 * Only the cheap, path-based QMK match is kept — it is what the Settings
 * firmware-target picker reads from `firmwareMetadata.qmk`, and it is I/O bound
 * (small `info.json` fetches) rather than a large synchronous parse. A failed
 * lookup degrades to `undefined` but receives a zero cache TTL so a transient QMK
 * outage cannot poison the detail cache for 15 minutes.
 */
const detailFirmwareMetadataEffect = Effect.fn("via.detail.firmware-metadata")(function* (
  entry: KeyboardCatalogEntry,
) {
  const token = yield* readViaGithubTokenEffect();
  const resolved = yield* Effect.result(resolveQmkFirmwareMetadataEffect(entry, token));
  const result: DetailMetadataResult =
    resolved._tag === "Success"
      ? { metadata: resolved.success, cacheable: true }
      : { metadata: undefined, cacheable: false };
  return result;
});

const detailMetadataCacheEffect = Effect.fn("via.detail.metadata-cache")(function* () {
  if (detailMetadataCache) return detailMetadataCache;

  const created = yield* Cache.makeWith<
    KeyboardCatalogEntry,
    DetailMetadataResult,
    Config.ConfigError,
    QmkTargetCache
  >(detailFirmwareMetadataEffect, {
    capacity: 256,
    timeToLive: (exit) =>
      Exit.isSuccess(exit) && exit.value.cacheable ? viaCacheTtl : Duration.zero,
  });
  if (!detailMetadataCache) detailMetadataCache = created;
  return detailMetadataCache;
});

export const loadViaKeyboardDetailEffect = Effect.fn("via.catalog.detail")(function* (id: string) {
  const catalog = yield* loadViaKeyboardCatalogEffect();
  const entry = catalog.items.find((item) => item.id === id || item.sourcePath === id);

  if (!entry) {
    return yield* Effect.fail(
      new ViaKeyboardNotFoundError({
        id,
        message: `Keyboard definition not found: ${id}`,
      }),
    );
  }

  const cache = yield* detailMetadataCacheEffect();
  const metadata = yield* Cache.get(cache, entry);
  return {
    ...entry,
    firmwareMetadata: metadata.metadata,
  };
});

export const loadViaKeyboardDetailInputsEffect = Effect.fn("via.catalog.detail-inputs")(
  function* () {
    const catalog = yield* loadViaKeyboardCatalogEffect();
    return catalog.items.map((entry) => entry.id);
  },
);
