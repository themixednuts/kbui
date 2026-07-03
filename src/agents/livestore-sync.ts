import { makeDurableObject } from "@livestore/sync-cf/cf-worker";

/**
 * LiveStoreSyncDO — the per-storeId sync backend.
 *
 * The DO holds the canonical event log in its own SQLite storage and
 * fans pushed events out to every connected WebSocket peer. We don't
 * need to override anything in the body — the `onPush` / `onPull`
 * callbacks let us log activity during the bring-up but the default
 * implementation already handles batching, fan-out, and replay.
 *
 * Auth is enforced one level up at the SvelteKit route (see
 * `routes/api/livestore/+server.ts`) via `validatePayload`. By the time
 * a message reaches `onPush`, the JWT has been verified.
 */
export class LiveStoreSyncDO extends makeDurableObject({
  onPush: async (message) => {
    const count = message.batch?.length ?? 0;
    if (count > 0) {
      console.log(`[LiveStoreSync] onPush batch=${count}`);
    }
  },
  onPull: async (_message) => {
    // Pulls are silent — they're polled continuously.
  },
}) {}
