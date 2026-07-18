import { Effect } from "effect";

import type { KeyboardCatalogEntry } from "$lib/keyboard/catalog";
import { platformError } from "$lib/effect/errors";
import { runWorkerEffect } from "$lib/effect/worker-runtime";

import { QMK_INDEX_AGENT_NAME } from "./qmk-index-name";
import { resolveQmkKeyboardIdentity } from "./qmk-target";

type KeyboardIdentityInput = {
  productId?: number;
  productName?: string;
  vendorId?: number;
};

/**
 * Resolves a QMK build target for a connected keyboard.
 *
 * In the Cloudflare Worker runtime this routes through {@link QmkIndexAgent} so
 * the multi-megabyte `keyboards.json` parse stays OFF the request path (it
 * exceeds the free-plan CPU budget and used to 503 this query). The DO answers
 * from its persisted index or returns `undefined` on a cold miss while it builds
 * asynchronously. Any DO failure also degrades to `undefined` so a keyboard can
 * still connect from its VIA definition.
 *
 * Without the binding (local `vp run dev` / tests) it falls back to the
 * in-process resolver, which is fine off the free-plan Worker.
 */
export function resolveKeyboardIdentityFromEnvironment(
  env: Cloudflare.Env | undefined,
  input: KeyboardIdentityInput,
): Promise<KeyboardCatalogEntry | undefined> {
  const namespace = env?.QmkIndexAgent;
  if (!namespace) {
    return resolveQmkKeyboardIdentity(input);
  }

  return runWorkerEffect(
    "qmk-identity.resolve-from-environment",
    Effect.tryPromise({
      try: () => {
        const id = namespace.idFromName(QMK_INDEX_AGENT_NAME);
        return namespace.get(id).resolveIdentity(input);
      },
      catch: (cause) => platformError("qmk-identity.resolve-from-environment", cause),
    }).pipe(Effect.catch(() => Effect.succeed(undefined))),
  );
}
