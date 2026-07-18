import { env } from "$env/dynamic/private";
import { Effect } from "effect";

import type { FirmwareMetadata } from "$lib/keyboard/schema";
import { uf2TargetForHardware } from "$lib/keyboard/uf2-families";
import { retryTransient } from "$lib/effect/self-healing";
import { runWorkerEffect } from "$lib/effect/worker-runtime";

const zmkOwner = "zmkfirmware";
const zmkRepo = "zmk";
const zmkBranch = "main";
const cacheTtlMs = 60 * 60 * 1000;

type GitTreeEntry = { path?: string; type?: string };
type HardwareMeta = {
  exposes: string[];
  id: string;
  name: string;
  path: string;
  requires: string[];
  siblings: string[];
  type: "board" | "shield";
};

let pathCache: { expiresAt: number; paths: string[]; ref: string } | undefined;
let revisionCache: { expiresAt: number; ref: string } | undefined;

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

function retryingJsonRequestEffect<T>(url: string) {
  const request = Effect.tryPromise({
    try: async () => {
      const response = await fetch(url, { headers: githubHeaders() });
      if (!response.ok) {
        throw new ZmkCatalogFetchError(
          `ZMK catalog request returned ${response.status}.`,
          response.status === 408 || response.status === 429 || response.status >= 500,
        );
      }
      return (await response.json()) as T;
    },
    catch: (error) =>
      error instanceof ZmkCatalogFetchError
        ? error
        : new ZmkCatalogFetchError(
            error instanceof Error ? error.message : "ZMK catalog request failed.",
            true,
          ),
  });

  return retryTransient(request);
}

function zmkRevisionEffect() {
  return Effect.suspend(() => {
    if (revisionCache && revisionCache.expiresAt > Date.now()) {
      return Effect.succeed(revisionCache.ref);
    }
    return Effect.gen(function* () {
      const body = yield* retryingJsonRequestEffect<unknown>(
        `https://api.github.com/repos/${zmkOwner}/${zmkRepo}/commits/${zmkBranch}`,
      );
      if (
        typeof body !== "object" ||
        body === null ||
        !("sha" in body) ||
        typeof body.sha !== "string" ||
        body.sha.length < 7
      ) {
        return yield* Effect.fail(
          new ZmkCatalogFetchError("ZMK catalog revision response was malformed.", false),
        );
      }
      revisionCache = { expiresAt: Date.now() + cacheTtlMs, ref: body.sha };
      return body.sha;
    });
  });
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

function zmkMetadataPathsEffect() {
  return Effect.suspend(() => {
    if (pathCache && pathCache.expiresAt > Date.now()) return Effect.succeed(pathCache);
    return Effect.gen(function* () {
      const ref = yield* zmkRevisionEffect();
      const body = yield* retryingJsonRequestEffect<{ tree?: GitTreeEntry[] }>(
        `https://api.github.com/repos/${zmkOwner}/${zmkRepo}/git/trees/${ref}?recursive=1`,
      );
      const paths = (body.tree ?? [])
        .filter((entry) => entry.type === "blob" && entry.path?.endsWith(".zmk.yml"))
        .map((entry) => entry.path as string);
      pathCache = { expiresAt: Date.now() + cacheTtlMs, paths, ref };
      return pathCache;
    });
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

function loadMetadataEffect(path: string, ref: string) {
  const request = Effect.tryPromise({
    try: async () => {
      const response = await fetch(
        `https://raw.githubusercontent.com/${zmkOwner}/${zmkRepo}/${ref}/${path}`,
      );
      if (response.status === 404) return undefined;
      if (!response.ok) {
        throw new ZmkCatalogFetchError(
          `ZMK hardware metadata returned ${response.status}.`,
          response.status === 408 || response.status === 429 || response.status >= 500,
        );
      }
      return parseZmkHardwareMetadata(path, await response.text());
    },
    catch: (error) =>
      error instanceof ZmkCatalogFetchError
        ? error
        : new ZmkCatalogFetchError(
            error instanceof Error ? error.message : "ZMK hardware metadata request failed.",
            true,
          ),
  });
  return retryTransient(request);
}

function compatibleControllersEffect(
  meta: HardwareMeta,
  catalog: { paths: string[]; ref: string },
) {
  if (meta.type === "board") return Effect.succeed([meta]);
  if (meta.requires.length === 0) return Effect.succeed([]);

  const boardPaths = catalog.paths.filter(
    (path) =>
      path.startsWith("app/boards/") &&
      !path.includes("/shields/") &&
      !path.includes("/interconnects/"),
  );
  return Effect.map(
    Effect.forEach(boardPaths, (path) => loadMetadataEffect(path, catalog.ref), {
      concurrency: 8,
    }),
    (loaded) =>
      loaded
        .filter((item): item is HardwareMeta => item?.type === "board")
        .filter((board) =>
          meta.requires.every((requirement) => board.exposes.includes(requirement)),
        )
        .sort((left, right) => left.id.localeCompare(right.id)),
  );
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
    const catalog = yield* zmkMetadataPathsEffect();
    const rankedPaths = catalog.paths
      .map((path) => ({ path, score: pathScore(path, identity) }))
      .filter((candidate) => candidate.score > 0)
      .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
      .slice(0, 8);
    const loaded = (yield* Effect.forEach(
      rankedPaths,
      ({ path }) => loadMetadataEffect(path, catalog.ref),
      {
        concurrency: 8,
      },
    )).filter((item): item is HardwareMeta => Boolean(item));
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
    const compatible = yield* compatibleControllersEffect(hardware, catalog);
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
  return runWorkerEffect("zmk.resolve-firmware-metadata", resolveZmkFirmwareMetadataEffect(input));
}
