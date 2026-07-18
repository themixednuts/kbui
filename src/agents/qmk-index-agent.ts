import { Agent } from "agents";
import { Effect } from "effect";

import type { KeyboardCatalogEntry } from "$lib/keyboard/catalog";
import { platformError } from "$lib/effect/errors";
import { runWorkerEffect } from "$lib/effect/worker-runtime";
import { QMK_INDEX_AGENT_NAME } from "$lib/server/keyboards/qmk-index-name";
import {
  buildQmkUsbIndex,
  qmkGithubHeaders,
  resolveQmkIdentityFromRecords,
  resolveQmkRepositoryRef,
  usbIdentityKey,
  type QmkCatalogRecord,
} from "$lib/server/keyboards/qmk-target";

/**
 * Persistent, precomputed QMK USB-identity index backed by Durable Object
 * SQLite.
 *
 * The multi-megabyte `keyboards.json` parse that powers QMK identity resolution
 * exceeds the Cloudflare free-plan CPU budget when run per request (the
 * `resolveKeyboardIdentity` query used to 503 with "Worker exceeded CPU time
 * limit"). This agent moves that heavy build OFF the request path:
 *
 *  - `resolveIdentity` reads a single reduced row (the records that share one
 *    exact USB id) and runs the CPU-cheap {@link resolveQmkIdentityFromRecords}.
 *    On a cold miss it returns `undefined` immediately and schedules the build.
 *  - `buildIndex` runs in a scheduled DO alarm — a separate invocation with its
 *    own CPU budget — fetches and parses `keyboards.json` once, resolves the
 *    pinned repository ref, and persists the reduced per-USB-id index.
 *
 * A cold `undefined` is acceptable UX: with the client's graceful degradation
 * the keyboard still connects from its VIA definition, and QMK build-target
 * metadata arrives on a later visit once the index is warm.
 */

export type QmkIndexStatus = "empty" | "building" | "ready" | "failed";

export interface QmkIndexAgentState {
  status: QmkIndexStatus;
  dataVersion: string | null;
  builtAt: string | null;
  entryCount: number;
  updatedAt: string;
}

// Rebuild in the background once the persisted index is older than this. Still
// serves the (stale) index while the refresh runs so the request path never
// blocks on the heavy build.
const REBUILD_AFTER_MS = 24 * 60 * 60 * 1000;

export { QMK_INDEX_AGENT_NAME };

interface QmkIndexMetaRow {
  status: QmkIndexStatus;
  data_version: string | null;
  ref: string | null;
  built_at: string | null;
  updated_at: string;
}

export class QmkIndexAgent extends Agent<Cloudflare.Env, QmkIndexAgentState> {
  static options = { sendIdentityOnConnect: false };

  initialState: QmkIndexAgentState = {
    status: "empty",
    dataVersion: null,
    builtAt: null,
    entryCount: 0,
    updatedAt: new Date(0).toISOString(),
  };

  onStart(): Promise<void> {
    return runWorkerEffect(
      "qmk-index.initialize",
      Effect.sync(() => {
        this.ensureTables();
        this.refreshState();
      }),
    );
  }

  /**
   * CPU-cheap, request-path resolution. Never runs the heavy `keyboards.json`
   * build: it either answers from the persisted index or returns `undefined`
   * after ensuring a background build is scheduled.
   */
  resolveIdentity(input: {
    productId?: number;
    productName?: string;
    vendorId?: number;
  }): Promise<KeyboardCatalogEntry | undefined> {
    return runWorkerEffect(
      "qmk-index.resolve",
      Effect.gen({ self: this }, function* () {
        yield* Effect.sync(() => this.ensureTables());
        if (input.vendorId === undefined || input.productId === undefined) return undefined;

        const meta = this.meta();
        if (!meta || meta.status !== "ready" || !meta.data_version) {
          // Cold miss: kick off the build and degrade to undefined now.
          yield* this.ensureBuildScheduledEffect(meta);
          return undefined;
        }

        // Serve the persisted index; refresh in the background when stale.
        if (this.isStale(meta)) yield* this.ensureBuildScheduledEffect(meta);

        const usbKey = usbIdentityKey(input.vendorId, input.productId);
        const row = this.sql<{ records: string }>`
          SELECT records FROM qmk_usb_index WHERE usb_key = ${usbKey} LIMIT 1
        `[0];
        if (!row) return undefined;

        const records = yield* Effect.try({
          try: () => JSON.parse(row.records) as QmkCatalogRecord[],
          catch: (cause) => platformError("qmk-index.parse-records", cause),
        });
        return resolveQmkIdentityFromRecords(
          records,
          input,
          meta.ref ?? "master",
          meta.data_version,
        );
      }),
    );
  }

  /**
   * Scheduled DO-alarm callback that performs the heavy build. Runs as its own
   * invocation, so the multi-megabyte parse gets a fresh CPU budget instead of
   * sharing the request's. Rethrows on failure so the Agents runtime retries the
   * alarm with exponential backoff.
   */
  buildIndex(): Promise<void> {
    return runWorkerEffect(
      "qmk-index.build",
      Effect.gen({ self: this }, function* () {
        yield* Effect.sync(() => this.ensureTables());

        const index = yield* Effect.tryPromise({
          try: () => buildQmkUsbIndex(),
          catch: (cause) => platformError("qmk-index.build-usb-index", cause),
        });

        // The repository ref is best-effort: a GitHub rate-limit must not throw
        // away a freshly built index. Fall back to the default branch ref.
        const ref = yield* Effect.tryPromise({
          try: () => resolveQmkRepositoryRef(qmkGithubHeaders(this.githubToken())),
          catch: (cause) => platformError("qmk-index.resolve-ref", cause),
        }).pipe(Effect.catch(() => Effect.succeed("master")));

        yield* Effect.sync(() => this.persistIndex(index.lastUpdated, ref, index.items));
      }).pipe(
        Effect.tapError(() =>
          Effect.sync(() => {
            this.setMetaStatus("failed");
          }),
        ),
      ),
    );
  }

  private ensureBuildScheduledEffect(meta: QmkIndexMetaRow | undefined) {
    return Effect.gen({ self: this }, function* () {
      // A build is already in flight (either pending its alarm or being retried
      // by the Agents runtime). Don't stack duplicate schedules.
      if (meta?.status === "building") return;

      yield* Effect.sync(() => this.setMetaStatus("building"));
      yield* Effect.tryPromise({
        try: () => this.schedule(0, "buildIndex", undefined, { idempotent: true }),
        catch: (cause) => platformError("qmk-index.schedule-build", cause),
      });
    });
  }

  private isStale(meta: QmkIndexMetaRow) {
    if (!meta.built_at) return true;
    const builtAt = Date.parse(meta.built_at);
    return Number.isNaN(builtAt) || Date.now() - builtAt > REBUILD_AFTER_MS;
  }

  private githubToken(): string | undefined {
    const env = this.env as unknown as Record<string, unknown>;
    const token = env.VIA_GITHUB_TOKEN ?? env.GITHUB_TOKEN;
    return typeof token === "string" && token.length > 0 ? token : undefined;
  }

  private meta(): QmkIndexMetaRow | undefined {
    return this.sql<QmkIndexMetaRow>`
      SELECT status, data_version, ref, built_at, updated_at
      FROM qmk_index_meta WHERE id = 1 LIMIT 1
    `[0];
  }

  private setMetaStatus(status: QmkIndexStatus) {
    const updatedAt = new Date().toISOString();
    void this.sql`
      INSERT INTO qmk_index_meta (id, status, updated_at)
      VALUES (1, ${status}, ${updatedAt})
      ON CONFLICT(id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at
    `;
    this.refreshState();
  }

  private persistIndex(
    dataVersion: string,
    ref: string,
    items: Map<string, QmkCatalogRecord[]>,
  ) {
    void this.sql`DELETE FROM qmk_usb_index`;
    for (const [usbKey, records] of items) {
      void this.sql`
        INSERT INTO qmk_usb_index (usb_key, records)
        VALUES (${usbKey}, ${JSON.stringify(records)})
        ON CONFLICT(usb_key) DO UPDATE SET records = excluded.records
      `;
    }
    const updatedAt = new Date().toISOString();
    void this.sql`
      INSERT INTO qmk_index_meta (id, status, data_version, ref, built_at, updated_at)
      VALUES (1, ${"ready"}, ${dataVersion}, ${ref}, ${updatedAt}, ${updatedAt})
      ON CONFLICT(id) DO UPDATE SET
        status = excluded.status,
        data_version = excluded.data_version,
        ref = excluded.ref,
        built_at = excluded.built_at,
        updated_at = excluded.updated_at
    `;
    this.refreshState();
  }

  private refreshState() {
    const meta = this.meta();
    const count =
      this.sql<{ count: number }>`SELECT COUNT(*) AS count FROM qmk_usb_index`[0]?.count ?? 0;
    this.setState({
      status: meta?.status ?? "empty",
      dataVersion: meta?.data_version ?? null,
      builtAt: meta?.built_at ?? null,
      entryCount: count,
      updatedAt: meta?.updated_at ?? new Date().toISOString(),
    });
  }

  private ensureTables() {
    void this.sql`
      CREATE TABLE IF NOT EXISTS qmk_usb_index (
        usb_key TEXT PRIMARY KEY,
        records TEXT NOT NULL
      )
    `;
    void this.sql`
      CREATE TABLE IF NOT EXISTS qmk_index_meta (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        status TEXT NOT NULL,
        data_version TEXT,
        ref TEXT,
        built_at TEXT,
        updated_at TEXT NOT NULL
      )
    `;
  }
}
