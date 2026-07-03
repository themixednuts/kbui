/**
 * Client-side LiveStore factory.
 *
 * Constructs the persisted browser adapter (OPFS + a dedicated worker +
 * a shared worker) wired to our sync-cf backend. Callers do this once
 * per signed-in user inside `onMount` — the adapter cannot construct on
 * the server because it touches `globalThis.SharedWorker` and OPFS.
 */
import { createStore } from "@livestore/svelte";
import { makePersistedAdapter, type WebAdapterOptions } from "@livestore/adapter-web";
import LiveStoreSharedWorker from "@livestore/adapter-web/shared-worker?sharedworker";
import LiveStoreWorker from "./livestore.worker.ts?worker";

import { schema, type KlaksonSchema } from "./schema.ts";
import { storeIdForUser } from "./store-id.ts";

export type ClientStoreOptions = {
  /** better-auth user id; becomes the storeId namespace. */
  userId: string;
  /** Bearer token issued by better-auth's `jwt` plugin. The DO sync
   *  server validates this against the JWKS endpoint. */
  authToken: string;
};

export const createKlaksonStore = (options: ClientStoreOptions) => {
  const storage = { type: "opfs" } as unknown as WebAdapterOptions["storage"];
  const adapter = makePersistedAdapter({
    storage,
    worker: LiveStoreWorker,
    sharedWorker: LiveStoreSharedWorker,
  });

  return createStore<KlaksonSchema>({
    adapter,
    schema,
    storeId: storeIdForUser(options.userId),
    syncPayload: { authToken: options.authToken },
  });
};
