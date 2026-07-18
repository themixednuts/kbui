import { env } from "$env/dynamic/private";
import { Deferred, Effect } from "effect";

import type { FirmwareMetadata } from "$lib/keyboard/schema";
import { uf2TargetForHardware } from "$lib/keyboard/uf2-families";
import { retryTransient } from "$lib/effect/self-healing";
import { runWorkerEffect } from "$lib/effect/worker-runtime";

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
const cacheTtlMs = 60 * 60 * 1000;

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

let catalogCache: { catalog: ZmkCatalog; expiresAt: number } | undefined;
let catalogLoad: Deferred.Deferred<ZmkCatalog, ZmkCatalogFetchError> | undefined;

class ZmkCatalogFetchError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ZmkCatalogFetchError";
  }
}

function githubHeaders(): HeadersInit {
  const token = env.GITHUB_TOKEN;
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "kbui-zmk-target-resolver",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function fetchZmkRevisionEffect() {
  return retryTransient(
    Effect.tryPromise({
      try: async () => {
        const response = await fetch(
          `${githubApiBase}/repos/${zmkOwner}/${zmkRepo}/commits/${zmkBranch}`,
          { headers: githubHeaders() },
        );
        if (!response.ok) {
          throw new ZmkCatalogFetchError(
            `ZMK catalog revision returned ${response.status}.`,
            response.status === 408 || response.status === 429 || response.status >= 500,
          );
        }
        const body = (await response.json()) as { sha?: unknown };
        if (typeof body.sha !== "string" || body.sha.length < 7) {
          throw new ZmkCatalogFetchError("ZMK catalog revision response was malformed.", false);
        }
        return body.sha;
      },
      catch: (error) =>
        error instanceof ZmkCatalogFetchError
          ? error
          : new ZmkCatalogFetchError(
              error instanceof Error ? error.message : "ZMK catalog revision request failed.",
              true,
            ),
    }),
  );
}

function fetchZmkArchiveEffect(ref: string) {
  return retryTransient(
    Effect.tryPromise({
      try: async () => {
        const response = await fetch(`${githubApiBase}/repos/${zmkOwner}/${zmkRepo}/zipball/${ref}`, {
          headers: githubHeaders(),
        });
        if (!response.ok) {
          const body = await response.text();
          throw new ZmkCatalogFetchError(
            `ZMK catalog archive returned ${response.status}: ${body.slice(0, 400)}`,
            response.status === 408 || response.status === 429 || response.status >= 500,
          );
        }
        return new Uint8Array(await response.arrayBuffer());
      },
      catch: (error) =>
        error instanceof ZmkCatalogFetchError
          ? error
          : new ZmkCatalogFetchError(
              error instanceof Error ? error.message : "ZMK catalog archive request failed.",
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
function fetchZmkArchiveFromCodeloadEffect() {
  return retryTransient(
    Effect.tryPromise({
      try: async () => {
        const response = await fetch(zmkCodeloadArchiveUrl, {
          headers: { "User-Agent": "kbui-zmk-target-resolver" },
        });
        if (!response.ok) {
          const body = await response.text();
          throw new ZmkCatalogFetchError(
            `ZMK codeload archive returned ${response.status}: ${body.slice(0, 400)}`,
            response.status === 408 || response.status === 429 || response.status >= 500,
          );
        }
        return new Uint8Array(await response.arrayBuffer());
      },
      catch: (error) =>
        error instanceof ZmkCatalogFetchError
          ? error
          : new ZmkCatalogFetchError(
              error instanceof Error ? error.message : "ZMK codeload archive request failed.",
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

function createZmkCatalogEffect(): Effect.Effect<ZmkCatalog, ZmkCatalogFetchError> {
  return Effect.gen(function* () {
    const { unzipSync } = yield* Effect.tryPromise({
      try: () => import("fflate"),
      catch: (cause) =>
        new ZmkCatalogFetchError(
          cause instanceof Error ? cause.message : "Could not load the archive decoder.",
          false,
        ),
    });
    // Only spend the commits API's rate-limit budget when a token is actually
    // configured to raise it. Without one (production has no GITHUB_TOKEN
    // secret today), or if the authenticated lookup fails, fall back to the
    // tokenless codeload archive and read the resolved commit off its root
    // directory name instead.
    const pinnedRef = env.GITHUB_TOKEN
      ? yield* Effect.matchEffect(fetchZmkRevisionEffect(), {
          onFailure: () => Effect.succeed(undefined),
          onSuccess: (sha) => Effect.succeed(sha),
        })
      : undefined;

    const archiveBytes = pinnedRef
      ? yield* fetchZmkArchiveEffect(pinnedRef)
      : yield* fetchZmkArchiveFromCodeloadEffect();

    // Only the ~150 tiny hardware-metadata files are decompressed; the rest of
    // the multi-megabyte archive (firmware sources, docs) is skipped entirely
    // to stay inside the Workers Free-plan CPU budget.
    const archive = yield* Effect.try({
      try: () => unzipSync(archiveBytes, { filter: (file) => file.name.endsWith(".zmk.yml") }),
      catch: (cause) =>
        new ZmkCatalogFetchError(
          cause instanceof Error ? cause.message : "ZMK catalog archive was malformed.",
          false,
        ),
    });
    const ref = pinnedRef ?? deriveRevisionFromArchive(archive) ?? zmkBranch;
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
}

function loadZmkCatalogEffect(): Effect.Effect<ZmkCatalog, ZmkCatalogFetchError> {
  return Effect.suspend(() => {
    if (catalogCache && catalogCache.expiresAt > Date.now()) {
      return Effect.succeed(catalogCache.catalog);
    }
    if (catalogLoad) return Deferred.await(catalogLoad);

    const deferred = Deferred.makeUnsafe<ZmkCatalog, ZmkCatalogFetchError>();
    catalogLoad = deferred;
    return Effect.matchEffect(createZmkCatalogEffect(), {
      onFailure: (error) =>
        Effect.sync(() => Deferred.doneUnsafe(deferred, Effect.fail(error))).pipe(
          Effect.andThen(Effect.fail(error)),
        ),
      onSuccess: (catalog) =>
        Effect.sync(() => {
          catalogCache = { catalog, expiresAt: Date.now() + cacheTtlMs };
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

function resolveZmkFirmwareMetadataEffect(input: {
  deviceName: string;
  manufacturer?: string;
}): Effect.Effect<FirmwareMetadata | undefined, ZmkCatalogFetchError> {
  return Effect.gen(function* () {
    const identity = `${input.deviceName} ${input.manufacturer ?? ""}`.trim();
    const catalog = yield* loadZmkCatalogEffect();
    const loaded = catalog.hardware
      .map((item) => ({ item, score: pathScore(item.path, identity) }))
      .filter((candidate) => candidate.score > 0)
      .sort(
        (left, right) =>
          right.score - left.score || left.item.path.localeCompare(right.item.path),
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
    };
  });
}

export function resolveZmkFirmwareMetadata(input: {
  deviceName: string;
  manufacturer?: string;
}): Promise<FirmwareMetadata | undefined> {
  // Best-effort: the ZMK-BLE connect flow must never hard-fail just because
  // the hardware-metadata lookup couldn't run (rate limit, outage, malformed
  // archive). Any failure degrades to "no metadata", matching the VIA/QMK
  // detail paths.
  return runWorkerEffect(
    "zmk.resolve-firmware-metadata",
    Effect.matchEffect(resolveZmkFirmwareMetadataEffect(input), {
      onFailure: () => Effect.succeed(undefined),
      onSuccess: (metadata) => Effect.succeed(metadata),
    }),
  );
}
