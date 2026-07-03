import { env } from "$env/dynamic/private";

import type { KeyboardCatalogEntry, KeyboardCatalogIndexEntry } from "$lib/keyboard/catalog";
import {
  parseViaDefinition,
  scoreViaDefinitionPath,
  summarizeCatalogEntry,
} from "$lib/keyboard/via-definition";

import { localKeyboardDefinitions } from "./local-defs";

const viaOwner = "the-via";
const viaRepo = "keyboards";
const viaRef = "master";
const viaRepoName = `${viaOwner}/${viaRepo}`;
const githubApiBase = "https://api.github.com";
const cacheTtlMs = 15 * 60 * 1000;

type ViaSourceMeta = {
  source: "github-api";
  repo: string;
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
let catalogPromise: Promise<KeyboardCatalogResponse<KeyboardCatalogEntry[]>> | undefined;

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

async function fetchViaArchive() {
  const response = await fetch(`${githubApiBase}/repos/${viaOwner}/${viaRepo}/zipball/${viaRef}`, {
    headers: githubHeaders(),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`GitHub archive API ${response.status}: ${body.slice(0, 400)}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

async function createViaCatalog(): Promise<KeyboardCatalogResponse<KeyboardCatalogEntry[]>> {
  const { unzipSync } = await import("fflate");
  const archive = unzipSync(await fetchViaArchive());
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
      if (entry) entries.push(entry);
    } catch {
      // Skip malformed or unsupported definitions from the upstream catalog.
    }
  }

  // Splice in local overrides. They use the same parser so their KLE layouts
  // get the same x/y/rotation treatment as upstream entries.
  for (const local of localKeyboardDefinitions) {
    const entry = parseViaDefinition(local.sourcePath, local.json, local.priority);
    if (entry) entries.push(entry);
  }

  entries.sort(
    (left, right) => right.priority - left.priority || left.name.localeCompare(right.name),
  );

  return {
    source: "github-api",
    repo: viaRepoName,
    count: entries.length,
    items: entries,
  };
}

export async function loadViaKeyboardCatalog() {
  if (catalogCache && catalogCache.expiresAt > now()) return catalogCache.catalog;

  catalogPromise ??= createViaCatalog().finally(() => {
    catalogPromise = undefined;
  });

  const catalog = await catalogPromise;
  catalogCache = { expiresAt: now() + cacheTtlMs, catalog };
  return catalog;
}

export async function loadViaKeyboardIndex(): Promise<
  KeyboardCatalogResponse<KeyboardCatalogIndexEntry[]>
> {
  const catalog = await loadViaKeyboardCatalog();

  return {
    source: catalog.source,
    repo: catalog.repo,
    count: catalog.count,
    items: catalog.items.map(toIndexEntry),
  };
}

export async function loadViaKeyboardDetail(id: string) {
  const catalog = await loadViaKeyboardCatalog();
  const entry = catalog.items.find((item) => item.id === id || item.sourcePath === id);

  if (!entry) {
    throw new Error(`Keyboard definition not found: ${id}`);
  }

  return entry;
}

export async function loadViaKeyboardDetailInputs() {
  const catalog = await loadViaKeyboardCatalog();
  return catalog.items.map((entry) => entry.id);
}
