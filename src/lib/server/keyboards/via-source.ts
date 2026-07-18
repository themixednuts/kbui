import { env } from "$env/dynamic/private";
import { Deferred, Effect } from "effect";

import type { KeyboardCatalogEntry, KeyboardCatalogIndexEntry } from "$lib/keyboard/catalog";
import {
  parseViaDefinition,
  scoreViaDefinitionPath,
  summarizeCatalogEntry,
} from "$lib/keyboard/via-definition";

import { localKeyboardDefinitions } from "./local-defs";
import { resolveQmkFirmwareMetadata } from "./qmk-target";
import { retryTransient } from "$lib/effect/self-healing";
import { runWorkerEffect } from "$lib/effect/worker-runtime";

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
const cacheTtlMs = 15 * 60 * 1000;

class ViaCatalogFetchError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ViaCatalogFetchError";
  }
}

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

let catalogCache:
  | {
      expiresAt: number;
      catalog: KeyboardCatalogResponse<KeyboardCatalogEntry[]>;
    }
  | undefined;
type ViaCatalog = KeyboardCatalogResponse<KeyboardCatalogEntry[]>;

let catalogLoad: Deferred.Deferred<ViaCatalog, ViaCatalogFetchError> | undefined;
const qmkMetadataCache = new Map<
  string,
  { expiresAt: number; metadata: KeyboardCatalogEntry["firmwareMetadata"] }
>();

function now() {
  return Date.now();
}

function githubToken() {
  return env.VIA_GITHUB_TOKEN ?? env.GITHUB_TOKEN;
}

function githubHeaders(): HeadersInit {
  const token = githubToken();

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

function bundledDefinitionRevisionEffect(definition: Record<string, unknown>) {
  return Effect.tryPromise({
    try: () =>
      crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(definition))),
    catch: (cause) =>
      new ViaCatalogFetchError(
        cause instanceof Error ? cause.message : "Bundled definition digest failed.",
        false,
      ),
  }).pipe(
    Effect.map(
      (digest) =>
        `bundled:${Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("")}`,
    ),
  );
}

function fetchViaRevisionEffect() {
  return retryTransient(
    Effect.tryPromise({
      try: async () => {
        const response = await fetch(
          `${githubApiBase}/repos/${viaOwner}/${viaRepo}/commits/${viaBranch}`,
          { headers: githubHeaders() },
        );
        if (!response.ok) {
          throw new ViaCatalogFetchError(
            `VIA catalog revision returned ${response.status}.`,
            response.status === 408 || response.status === 429 || response.status >= 500,
          );
        }
        const body = (await response.json()) as { sha?: unknown };
        if (typeof body.sha !== "string" || body.sha.length < 7) {
          throw new ViaCatalogFetchError("VIA catalog revision response was malformed.", false);
        }
        return body.sha;
      },
      catch: (error) =>
        error instanceof ViaCatalogFetchError
          ? error
          : new ViaCatalogFetchError(
              error instanceof Error ? error.message : "VIA catalog revision request failed.",
              true,
            ),
    }),
  );
}

function fetchViaArchiveEffect(ref: string) {
  return retryTransient(
    Effect.tryPromise({
      try: async () => {
        const response = await fetch(
          `${githubApiBase}/repos/${viaOwner}/${viaRepo}/zipball/${ref}`,
          {
            headers: githubHeaders(),
          },
        );

        if (!response.ok) {
          const body = await response.text();
          throw new ViaCatalogFetchError(
            `GitHub archive API ${response.status}: ${body.slice(0, 400)}`,
            response.status === 408 || response.status === 429 || response.status >= 500,
          );
        }

        return new Uint8Array(await response.arrayBuffer());
      },
      catch: (error) =>
        error instanceof ViaCatalogFetchError
          ? error
          : new ViaCatalogFetchError(
              error instanceof Error ? error.message : "VIA catalog request failed.",
              true,
            ),
    }),
  );
}

/**
 * Fetches the current archive straight from codeload, bypassing the
 * api.github.com REST surface (and its shared unauthenticated rate limit)
 * entirely. Used whenever no GitHub token is configured, and as the fallback
 * when the authenticated revision lookup fails.
 */
function fetchViaArchiveFromCodeloadEffect() {
  return retryTransient(
    Effect.tryPromise({
      try: async () => {
        const response = await fetch(viaCodeloadArchiveUrl, {
          headers: { "User-Agent": "kbui-via-catalog" },
        });

        if (!response.ok) {
          const body = await response.text();
          throw new ViaCatalogFetchError(
            `VIA catalog codeload archive returned ${response.status}: ${body.slice(0, 400)}`,
            response.status === 408 || response.status === 429 || response.status >= 500,
          );
        }

        return new Uint8Array(await response.arrayBuffer());
      },
      catch: (error) =>
        error instanceof ViaCatalogFetchError
          ? error
          : new ViaCatalogFetchError(
              error instanceof Error ? error.message : "VIA catalog codeload archive request failed.",
              true,
            ),
    }),
  );
}

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

function createViaCatalogEffect() {
  return Effect.gen(function* () {
    const { unzipSync } = yield* Effect.tryPromise({
      try: () => import("fflate"),
      catch: (cause) =>
        new ViaCatalogFetchError(
          cause instanceof Error ? cause.message : "Could not load the archive decoder.",
          false,
        ),
    });
    // Only spend the commits API's unauthenticated rate-limit budget when a
    // token is actually configured to raise it. Without one (production has
    // no VIA_GITHUB_TOKEN/GITHUB_TOKEN secret today), or if the authenticated
    // lookup fails transiently, fall back to the tokenless codeload archive
    // and read the resolved commit off its root directory name instead.
    const pinnedRef = githubToken()
      ? yield* Effect.matchEffect(fetchViaRevisionEffect(), {
          onFailure: () => Effect.succeed(undefined),
          onSuccess: (sha) => Effect.succeed(sha),
        })
      : undefined;

    const archiveBytes = pinnedRef
      ? yield* fetchViaArchiveEffect(pinnedRef)
      : yield* fetchViaArchiveFromCodeloadEffect();

    const archive = yield* Effect.try({
      try: () => unzipSync(archiveBytes),
      catch: (cause) =>
        new ViaCatalogFetchError(
          cause instanceof Error ? cause.message : "VIA catalog archive was malformed.",
          false,
        ),
    });
    const ref = pinnedRef ?? deriveRevisionFromArchive(archive) ?? viaBranch;
    const decoder = new TextDecoder();
    const entries: KeyboardCatalogEntry[] = [];

    for (const [archivePath, bytes] of Object.entries(archive)) {
      const sourcePath = archiveDefinitionPath(archivePath);
      if (!sourcePath) continue;

      try {
        const definition = JSON.parse(decoder.decode(bytes)) as unknown;
        const entry = parseViaDefinition(
          sourcePath,
          definition,
          scoreViaDefinitionPath(sourcePath, bytes.byteLength),
        );
        if (entry) entries.push({ ...entry, sourceRevision: ref });
      } catch {
        // Skip malformed or unsupported definitions from the upstream catalog.
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
      refreshedAt: new Date().toISOString(),
      count: entries.length,
      items: entries,
    } satisfies ViaCatalog;
  });
}

function loadViaKeyboardCatalogEffect(): Effect.Effect<ViaCatalog, ViaCatalogFetchError> {
  return Effect.suspend(() => {
    if (catalogCache && catalogCache.expiresAt > now()) return Effect.succeed(catalogCache.catalog);
    if (catalogLoad) return Deferred.await(catalogLoad);

    const deferred = Deferred.makeUnsafe<ViaCatalog, ViaCatalogFetchError>();
    catalogLoad = deferred;
    return Effect.matchEffect(createViaCatalogEffect(), {
      onFailure: (error) =>
        Effect.sync(() => Deferred.doneUnsafe(deferred, Effect.fail(error))).pipe(
          Effect.andThen(Effect.fail(error)),
        ),
      onSuccess: (catalog) =>
        Effect.sync(() => {
          catalogCache = { expiresAt: now() + cacheTtlMs, catalog };
          Deferred.doneUnsafe(deferred, Effect.succeed(catalog));
        }).pipe(Effect.as(catalog)),
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (catalogLoad === deferred) catalogLoad = undefined;
        }),
      ),
    );
  });
}

export function loadViaKeyboardCatalog() {
  return runWorkerEffect("via.catalog.load", loadViaKeyboardCatalogEffect());
}

export function loadViaKeyboardIndex(): Promise<
  KeyboardCatalogResponse<KeyboardCatalogIndexEntry[]>
> {
  return runWorkerEffect(
    "via.catalog.index",
    Effect.map(loadViaKeyboardCatalogEffect(), (catalog) => ({
      source: catalog.source,
      repo: catalog.repo,
      ref: catalog.ref,
      refreshedAt: catalog.refreshedAt,
      count: catalog.count,
      items: catalog.items.map(toIndexEntry),
    })),
  );
}

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
 * (small `info.json` fetches) rather than a large synchronous parse. Any failure
 * degrades to `undefined` so the VIA entry is always returned instead of 503ing
 * the whole connect flow.
 */
function detailFirmwareMetadataEffect(entry: KeyboardCatalogEntry) {
  return Effect.matchEffect(
    Effect.tryPromise({
      try: () => resolveQmkFirmwareMetadata(entry, githubHeaders()),
      catch: (cause) =>
        new ViaCatalogFetchError(
          cause instanceof Error ? cause.message : "QMK target resolution failed.",
          true,
        ),
    }),
    {
      onFailure: () => Effect.succeed(undefined),
      onSuccess: (metadata) => Effect.succeed(metadata),
    },
  );
}

export function loadViaKeyboardDetail(id: string) {
  return runWorkerEffect(
    "via.catalog.detail",
    Effect.gen(function* () {
      const catalog = yield* loadViaKeyboardCatalogEffect();
      const entry = catalog.items.find((item) => item.id === id || item.sourcePath === id);

      if (!entry) {
        return yield* Effect.fail(
          new ViaCatalogFetchError(`Keyboard definition not found: ${id}`, false),
        );
      }

      const cached = qmkMetadataCache.get(entry.id);
      let metadata = cached && cached.expiresAt > now() ? cached.metadata : undefined;
      if (!cached || cached.expiresAt <= now()) {
        metadata = yield* detailFirmwareMetadataEffect(entry);
        qmkMetadataCache.set(entry.id, { expiresAt: now() + cacheTtlMs, metadata });
      }

      return {
        ...entry,
        firmwareMetadata: metadata,
      };
    }),
  );
}

export function loadViaKeyboardDetailInputs() {
  return runWorkerEffect(
    "via.catalog.detail-inputs",
    Effect.map(loadViaKeyboardCatalogEffect(), (catalog) => catalog.items.map((entry) => entry.id)),
  );
}
