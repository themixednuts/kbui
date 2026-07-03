/**
 * Canonical naming for LiveStore storeIds.
 *
 * Each signed-in user gets one store. The DO sync server keys its event
 * log by storeId, so a stable per-user namespace ("user:<id>") keeps
 * isolation clear and lets the SvelteKit `/api/livestore` route verify
 * that a request's JWT `sub` matches the requested store.
 */

const PREFIX = "user:";

/** Build a storeId from a better-auth user id. */
export const storeIdForUser = (userId: string): string => `${PREFIX}${userId}`;

/** Recover the user id from a storeId, or `null` if the format is wrong. */
export const userIdFromStoreId = (storeId: string): string | null =>
  storeId.startsWith(PREFIX) ? storeId.slice(PREFIX.length) : null;
