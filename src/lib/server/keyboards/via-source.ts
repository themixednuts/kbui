import { env } from "$env/dynamic/private";
import { Deferred, Effect } from "effect";

import type { KeyboardCatalogEntry, KeyboardCatalogIndexEntry } from "$lib/keyboard/catalog";
import {
  parseViaDefinition,
  scoreViaDefinitionPath,
  summarizeCatalogEntry,
} from "$lib/keyboard/via-definition";

import { localKeyboardDefinitions } from "./local-defs";
import { resolveQmkFirmwareMetadata, resolveQmkKeyboardIdentity } from "./qmk-target";
import { retryTransient } from "$lib/effect/self-healing";
import { runWorkerEffect } from "$lib/effect/worker-runtime";

const viaOwner = "the-via";
const viaRepo = "keyboards";
const viaBranch = "master";
const viaRepoName = `${viaOwner}/${viaRepo}`;
const githubApiBase = "https://api.github.com";
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
    const ref = yield* fetchViaRevisionEffect();
    const archiveBytes = yield* fetchViaArchiveEffect(ref);
    const archive = yield* Effect.try({
      try: () => unzipSync(archiveBytes),
      catch: (cause) =>
        new ViaCatalogFetchError(
          cause instanceof Error ? cause.message : "VIA catalog archive was malformed.",
          false,
        ),
    });
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
        const identityEntry =
          entry.vendorId !== undefined && entry.productId !== undefined
            ? yield* Effect.tryPromise({
                try: () =>
                  resolveQmkKeyboardIdentity({
                    productId: entry.productId,
                    productName: entry.name,
                    vendorId: entry.vendorId,
                  }),
                catch: (cause) =>
                  new ViaCatalogFetchError(
                    cause instanceof Error ? cause.message : "QMK identity resolution failed.",
                    true,
                  ),
              })
            : undefined;
        metadata = identityEntry?.firmwareMetadata;
        if (!metadata?.qmk) {
          metadata = yield* Effect.tryPromise({
            try: () => resolveQmkFirmwareMetadata(entry, githubHeaders()),
            catch: (cause) =>
              new ViaCatalogFetchError(
                cause instanceof Error ? cause.message : "QMK target resolution failed.",
                true,
              ),
          });
        }
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
