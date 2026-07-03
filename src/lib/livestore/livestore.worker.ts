/**
 * Klakson LiveStore leader worker.
 *
 * Vite bundles this file as a dedicated Web Worker (via `?worker` import).
 * It boots the leader-side LiveStore runtime — the bit that owns the
 * OPFS-backed SQLite db, runs materializers, and shuttles events to/from
 * the sync backend. Browser tabs talk to this worker via the shared
 * worker; the shared worker is what gets fanned-out events.
 */
import { makeWorker } from "@livestore/adapter-web/worker";
import { makeWsSync } from "@livestore/sync-cf/client";

import { schema } from "./schema.ts";

makeWorker({
  schema,
  sync: {
    backend: makeWsSync({
      // Same-origin: the sync server is mounted at `/api/livestore` of
      // the SvelteKit worker. The protocol gets upgraded to `wss://`
      // automatically by `makeWsSync`.
      url: `${self.location.origin}/api/livestore`,
    }),
    // Long-tail polling fallback (the WS implementation handles
    // reconnects, but `initialSyncOptions.timeout` puts an upper bound
    // on how long boot waits for the first pull before showing local
    // state.)
    initialSyncOptions: { _tag: "Blocking", timeout: 5000 },
  },
});
