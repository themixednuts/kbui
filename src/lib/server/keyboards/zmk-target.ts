import {
  Cache,
  Config,
  Duration,
  Effect,
  Exit,
  Option,
  Redacted,
  Schedule,
  Schema,
  Semaphore,
} from "effect";

import type { FirmwareMetadata } from "$lib/keyboard/schema";
import { uf2TargetForHardware } from "$lib/keyboard/uf2-families";

const zmkOwner = "zmkfirmware";
const zmkRepo = "zmk";
const zmkBranch = "main";
const githubApiBase = "https://api.github.com";
// codeload.github.com serves git archives directly (no api.github.com REST
// call), so it isn't subject to the unauthenticated core API's 60 req/hr rate
// limit that 403s in production, where no GITHUB_TOKEN secret is configured.
// The "legacy.zip" variant nests every file under a `<owner>-<repo>-<shortsha>/`
// root directory, so the resolved commit can be read straight off the archive
// without a commits API call. One archive download also replaces the recursive
// git/trees listing AND the per-file raw.githubusercontent.com fetches: the
// hardware metadata catalog is parsed from the archive contents in memory.
const zmkCodeloadArchiveUrl = `https://codeload.github.com/${zmkOwner}/${zmkRepo}/legacy.zip/refs/heads/${zmkBranch}`;
const githubTokenConfig = Config.option(Config.redacted("GITHUB_TOKEN"));
const zmkFetchRetrySchedule = Schedule.exponential("200 millis").pipe(
  Schedule.jittered,
  Schedule.upTo({ times: 3 }),
);

const zmkRevisionSchema = Schema.Struct({
  sha: Schema.String.check(Schema.isMinLength(7)),
});

type HardwareMeta = {
  exposes: string[];
  id: string;
  name: string;
  path: string;
  requires: string[];
  siblings: string[];
  type: "board" | "shield";
};

type ZmkCatalog = { hardware: HardwareMeta[]; ref: string };
type ZmkCatalogCacheKey = Option.Option<Redacted.Redacted<string>>;

export class ZmkCatalogFetchError extends Schema.TaggedErrorClass<ZmkCatalogFetchError>()(
  "ZmkCatalogFetchError",
  {
    operation: Schema.String,
    message: Schema.String,
    retryable: Schema.Boolean,
    status: Schema.optionalKey(Schema.Int),
    cause: Schema.optionalKey(Schema.Defect()),
  },
) {}

function zmkCatalogFetchError(input: {
  operation: string;
  message: string;
  retryable: boolean;
  status?: number;
  cause?: unknown;
}) {
  return new ZmkCatalogFetchError({
    operation: input.operation,
    message: input.message,
    retryable: input.retryable,
    ...(input.status === undefined ? {} : { status: input.status }),
    ...(input.cause === undefined ? {} : { cause: input.cause }),
  });
}

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function githubHeaders(token: Redacted.Redacted<string>): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${Redacted.value(token)}`,
    "User-Agent": "kbui-zmk-target-resolver",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

const fetchResponseEffect = Effect.fn("ZmkCatalog.fetchResponse")(function* (
  operation: string,
  url: string,
  headers: HeadersInit,
) {
  return yield* Effect.tryPromise({
    try: (signal) => fetch(url, { headers, signal }),
    catch: (cause) =>
      zmkCatalogFetchError({
        operation,
        message: cause instanceof Error ? cause.message : "ZMK catalog request failed.",
        retryable: true,
        cause,
      }),
  });
});

const readResponseTextEffect = Effect.fn("ZmkCatalog.readResponseText")(function* (
  operation: string,
  response: Response,
) {
  return yield* Effect.tryPromise({
    try: () => response.text(),
    catch: (cause) =>
      zmkCatalogFetchError({
        operation,
        message: "Could not read the ZMK catalog error response.",
        retryable: isRetryableStatus(response.status),
        status: response.status,
        cause,
      }),
  });
});

const readResponseJsonEffect = Effect.fn("ZmkCatalog.readResponseJson")(function* (
  operation: string,
  response: Response,
) {
  return yield* Effect.tryPromise({
    try: (): Promise<unknown> => response.json(),
    catch: (cause) =>
      zmkCatalogFetchError({
        operation,
        message: "ZMK catalog revision response was not valid JSON.",
        retryable: false,
        status: response.status,
        cause,
      }),
  });
});

const readResponseBytesEffect = Effect.fn("ZmkCatalog.readResponseBytes")(function* (
  operation: string,
  response: Response,
) {
  const buffer = yield* Effect.tryPromise({
    try: () => response.arrayBuffer(),
    catch: (cause) =>
      zmkCatalogFetchError({
        operation,
        message: "Could not read the ZMK catalog archive response.",
        retryable: true,
        status: response.status,
        cause,
      }),
  });
  return new Uint8Array(buffer);
});

const requireSuccessfulResponseEffect = Effect.fn("ZmkCatalog.requireSuccessfulResponse")(
  function* (operation: string, label: string, response: Response) {
    if (response.ok) return response;

    const body = yield* readResponseTextEffect(`${operation}.readErrorBody`, response);
    return yield* Effect.fail(
      zmkCatalogFetchError({
        operation,
        message: `${label} returned ${response.status}: ${body.slice(0, 400)}`,
        retryable: isRetryableStatus(response.status),
        status: response.status,
      }),
    );
  },
);

function retryZmkFetch<A>(effect: Effect.Effect<A, ZmkCatalogFetchError>) {
  return Effect.retry(effect, {
    schedule: zmkFetchRetrySchedule,
    while: (error) => error.retryable,
  });
}

const fetchZmkRevisionEffect = Effect.fn("ZmkCatalog.fetchRevision")(function* (
  token: Redacted.Redacted<string>,
) {
  const operation = "ZmkCatalog.fetchRevision";
  const response = yield* fetchResponseEffect(
    `${operation}.request`,
    `${githubApiBase}/repos/${zmkOwner}/${zmkRepo}/commits/${zmkBranch}`,
    githubHeaders(token),
  );
  const successful = yield* requireSuccessfulResponseEffect(
    `${operation}.status`,
    "ZMK catalog revision",
    response,
  );
  const body = yield* readResponseJsonEffect(`${operation}.decodeJson`, successful);
  return yield* Schema.decodeUnknownEffect(zmkRevisionSchema)(body).pipe(
    Effect.mapError((cause) =>
      zmkCatalogFetchError({
        operation: `${operation}.decodeResponse`,
        message: "ZMK catalog revision response was malformed.",
        retryable: false,
        status: successful.status,
        cause,
      }),
    ),
  );
});

const fetchZmkArchiveEffect = Effect.fn("ZmkCatalog.fetchArchive")(function* (
  ref: string,
  token: Redacted.Redacted<string>,
) {
  const operation = "ZmkCatalog.fetchArchive";
  const response = yield* fetchResponseEffect(
    `${operation}.request`,
    `${githubApiBase}/repos/${zmkOwner}/${zmkRepo}/zipball/${ref}`,
    githubHeaders(token),
  );
  const successful = yield* requireSuccessfulResponseEffect(
    `${operation}.status`,
    "ZMK catalog archive",
    response,
  );
  return yield* readResponseBytesEffect(`${operation}.readBody`, successful);
});

/**
 * Fetches the current archive straight from codeload, bypassing the
 * api.github.com REST surface (and its shared unauthenticated rate limit)
 * entirely. Used whenever no GitHub token is configured, and as the fallback
 * when the authenticated revision lookup fails.
 */
const fetchZmkArchiveFromCodeloadEffect = Effect.fn("ZmkCatalog.fetchCodeloadArchive")(
  function* () {
    const operation = "ZmkCatalog.fetchCodeloadArchive";
    const response = yield* fetchResponseEffect(`${operation}.request`, zmkCodeloadArchiveUrl, {
      "User-Agent": "kbui-zmk-target-resolver",
    });
    const successful = yield* requireSuccessfulResponseEffect(
      `${operation}.status`,
      "ZMK codeload archive",
      response,
    );
    return yield* readResponseBytesEffect(`${operation}.readBody`, successful);
  },
);

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

function normalized(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(value: string) {
  return new Set(
    normalized(value)
      .split(/\s+/)
      .filter((token) => token.length >= 2),
  );
}

function scalar(yaml: string, key: string) {
  const match = new RegExp(`^${key}:\\s*["']?([^\\n"']+)["']?\\s*$`, "m").exec(yaml);
  return match?.[1]?.trim();
}

function list(yaml: string, key: string) {
  const inline = new RegExp(`^${key}:\\s*\\[([^\\]]*)\\]`, "m").exec(yaml)?.[1];
  if (inline !== undefined) {
    return inline
      .split(",")
      .map((item) => item.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }

  const block = new RegExp(`^${key}:\\s*\\n((?:\\s+-\\s+[^\\n]+\\n?)*)`, "m").exec(yaml)?.[1];
  return (block ?? "")
    .split("\n")
    .map((line) => /^\s+-\s+(.+)$/.exec(line)?.[1]?.trim())
    .filter((item): item is string => Boolean(item));
}

export function parseZmkHardwareMetadata(path: string, yaml: string): HardwareMeta | undefined {
  const id = scalar(yaml, "id");
  const name = scalar(yaml, "name");
  const type = scalar(yaml, "type");
  if (!id || !name || (type !== "board" && type !== "shield")) return undefined;
  return {
    exposes: list(yaml, "exposes"),
    id,
    name,
    path,
    requires: list(yaml, "requires"),
    siblings: list(yaml, "siblings"),
    type,
  };
}

const createZmkCatalogEffect = Effect.fn("ZmkCatalog.create")(function* (
  token: ZmkCatalogCacheKey,
) {
  const { unzipSync } = yield* Effect.tryPromise({
    try: () => import("fflate"),
    catch: (cause) =>
      zmkCatalogFetchError({
        operation: "ZmkCatalog.loadArchiveDecoder",
        message: cause instanceof Error ? cause.message : "Could not load the archive decoder.",
        retryable: false,
        cause,
      }),
  });

  // Only spend the commits API's rate-limit budget when a token is actually
  // configured to raise it. Without one (production has no GITHUB_TOKEN
  // secret today), or if the authenticated lookup fails, fall back to the
  // tokenless codeload archive and read the resolved commit off its root
  // directory name instead.
  const pinnedRef = Option.isSome(token)
    ? yield* retryZmkFetch(fetchZmkRevisionEffect(token.value)).pipe(
        Effect.tapError((error) =>
          Effect.logWarning("ZmkCatalog.revisionLookupFailed").pipe(
            Effect.annotateLogs({ operation: error.operation, status: error.status }),
          ),
        ),
        Effect.catchTag("ZmkCatalogFetchError", () => Effect.succeed(undefined)),
      )
    : undefined;

  const archiveBytes =
    Option.isSome(token) && pinnedRef
      ? yield* retryZmkFetch(fetchZmkArchiveEffect(pinnedRef.sha, token.value))
      : yield* retryZmkFetch(fetchZmkArchiveFromCodeloadEffect());

  // Only the ~150 tiny hardware-metadata files are decompressed; the rest of
  // the multi-megabyte archive (firmware sources, docs) is skipped entirely
  // to stay inside the Workers Free-plan CPU budget.
  const archive = yield* Effect.try({
    try: () => unzipSync(archiveBytes, { filter: (file) => file.name.endsWith(".zmk.yml") }),
    catch: (cause) =>
      zmkCatalogFetchError({
        operation: "ZmkCatalog.unzipArchive",
        message: cause instanceof Error ? cause.message : "ZMK catalog archive was malformed.",
        retryable: false,
        cause,
      }),
  });
  const ref = pinnedRef?.sha ?? deriveRevisionFromArchive(archive) ?? zmkBranch;
  const decoder = new TextDecoder();
  const hardware: HardwareMeta[] = [];
  for (const [archivePath, bytes] of Object.entries(archive)) {
    // Strip the `<owner>-<repo>-<shortsha>/` archive root to recover the
    // in-repo path the matching heuristics score against.
    const separator = archivePath.indexOf("/");
    const path = separator === -1 ? undefined : archivePath.slice(separator + 1);
    if (!path) continue;
    const meta = parseZmkHardwareMetadata(path, decoder.decode(bytes));
    if (meta) hardware.push(meta);
  }
  return { hardware, ref };
});

// The worker module is the lifetime owner. Cache supplies bounded storage,
// concurrent single-flight lookup, Clock-based TTL, and interruption-safe
// waiter completion. The semaphore only guards the one-time Cache allocation;
// it never participates in catalog lookup. Failed loads receive zero TTL.
let zmkCatalogCache: Cache.Cache<ZmkCatalogCacheKey, ZmkCatalog, ZmkCatalogFetchError> | undefined;
const zmkCatalogCacheLock = Semaphore.makeUnsafe(1);

const zmkCatalogCacheEffect = Effect.fn("ZmkCatalog.cache")(function* () {
  if (zmkCatalogCache) return zmkCatalogCache;

  return yield* zmkCatalogCacheLock.withPermits(1)(
    Effect.gen(function* () {
      if (zmkCatalogCache) return zmkCatalogCache;

      const created = yield* Cache.makeWith<ZmkCatalogCacheKey, ZmkCatalog, ZmkCatalogFetchError>(
        createZmkCatalogEffect,
        {
          capacity: 4,
          timeToLive: (exit) => (Exit.isSuccess(exit) ? "1 hour" : Duration.zero),
        },
      );
      zmkCatalogCache = created;
      return created;
    }),
  );
});

const loadZmkCatalogEffect = Effect.fn("ZmkCatalog.load")(function* () {
  const token = yield* githubTokenConfig;
  const cache = yield* zmkCatalogCacheEffect();
  return yield* Cache.get(cache, token);
});

export const invalidateZmkCatalogCacheEffect = Effect.suspend(() =>
  zmkCatalogCacheEffect().pipe(Effect.flatMap(Cache.invalidateAll)),
).pipe(Effect.withSpan("ZmkCatalog.invalidate"));

function pathScore(path: string, identity: string) {
  const identityText = normalized(identity);
  const identityTokens = tokens(identity);
  const pathText = normalized(path.replace(/\.zmk\.yml$/i, ""));
  const pathTokens = tokens(pathText);
  const overlap = Array.from(identityTokens).filter((token) => pathTokens.has(token)).length;
  return Number(pathText.endsWith(identityText)) * 1000 + overlap * 100;
}

function compatibleControllers(meta: HardwareMeta, catalog: ZmkCatalog): HardwareMeta[] {
  if (meta.type === "board") return [meta];
  if (meta.requires.length === 0) return [];

  return catalog.hardware
    .filter(
      (item) =>
        item.type === "board" &&
        item.path.startsWith("app/boards/") &&
        !item.path.includes("/shields/") &&
        !item.path.includes("/interconnects/"),
    )
    .filter((board) => meta.requires.every((requirement) => board.exposes.includes(requirement)))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function targetFor(meta: HardwareMeta, board: HardwareMeta) {
  return {
    board: board.id,
    shields: meta.type === "shield" ? (meta.siblings.length > 0 ? meta.siblings : [meta.id]) : [],
  };
}

function boardIdentityScore(board: HardwareMeta, identity: string) {
  const identityText = normalized(identity);
  const boardId = normalized(board.id.replace(/\/\/zmk$/i, ""));
  const boardName = normalized(board.name);
  return Math.max(
    boardId.length > 0 && identityText.includes(boardId) ? boardId.length : 0,
    boardName.length > 0 && identityText.includes(boardName) ? boardName.length : 0,
  );
}

export const resolveZmkFirmwareMetadataEffect = Effect.fn("ZmkTarget.resolveFirmwareMetadata")(
  function* (input: { deviceName: string; manufacturer?: string }) {
    const identity = `${input.deviceName} ${input.manufacturer ?? ""}`.trim();
    const catalog = yield* loadZmkCatalogEffect();
    const loaded = catalog.hardware
      .map((item) => ({ item, score: pathScore(item.path, identity) }))
      .filter((candidate) => candidate.score > 0)
      .sort(
        (left, right) => right.score - left.score || left.item.path.localeCompare(right.item.path),
      )
      .slice(0, 8)
      .map((candidate) => candidate.item);
    const exact = loaded.filter((item) => {
      const device = normalized(input.deviceName);
      return normalized(item.id) === device || normalized(item.name) === device;
    });
    // Exact IDs stay first, but retain the other high-scoring hardware records so
    // Studio devices and generic profiles can present an explicit target chooser.
    const matches =
      exact.length > 0 ? [...exact, ...loaded.filter((item) => !exact.includes(item))] : loaded;
    const hardware = matches[0];
    if (!hardware) return undefined;
    const compatible = compatibleControllers(hardware, catalog);
    const rankedControllers = compatible
      .map((board) => ({ board, score: boardIdentityScore(board, identity) }))
      .sort(
        (left, right) => right.score - left.score || left.board.id.localeCompare(right.board.id),
      );
    const targets = rankedControllers.map(({ board }) => targetFor(hardware, board));
    const primary = targets[0];
    if (!primary) return undefined;
    const uf2 = uf2TargetForHardware({ board: primary.board });
    const positivelyIdentifiedControllers = rankedControllers.filter(({ score }) => score > 0);
    const targetConfirmed =
      hardware.type === "board" ||
      compatible.length === 1 ||
      positivelyIdentifiedControllers.length === 1;

    return {
      zmk: {
        alternatives: targets.slice(1),
        board: primary.board,
        keymap: hardware.id,
        repository: `${zmkOwner}/${zmkRepo}`,
        ref: catalog.ref,
        shield: primary.shields[0],
        shields: primary.shields,
        targetConfirmed,
        uf2FamilyId: uf2?.familyId,
        uf2VolumeLabels: uf2?.volumeLabels,
      },
    } satisfies FirmwareMetadata;
  },
);

/**
 * Best-effort boundary for the ZMK-BLE connect flow. Catalog outages, provider
 * rejection, malformed archives, and config failures all truthfully degrade to
 * "no metadata" instead of rejecting the remote query.
 */
export const resolveZmkFirmwareMetadataOrUndefinedEffect = Effect.fn(
  "ZmkTarget.resolveFirmwareMetadataOrUndefined",
)(function* (input: { deviceName: string; manufacturer?: string }) {
  return yield* resolveZmkFirmwareMetadataEffect(input).pipe(
    Effect.tapError((error) => Effect.logWarning("ZmkTarget.metadataUnavailable", error)),
    Effect.catch(() => Effect.succeed(undefined)),
  );
});
