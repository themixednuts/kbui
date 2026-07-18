import { Effect } from "effect";

import type { KeyboardCatalogEntry } from "$lib/keyboard/catalog";
import { platformError } from "$lib/effect/errors";
import { runWorkerEffect } from "$lib/effect/worker-runtime";

import { QMK_INDEX_AGENT_NAME } from "./qmk-index-name";
import { resolveQmkKeyboardIdentityEffect } from "./qmk-target";

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
export const resolveKeyboardIdentityFromEnvironmentEffect = Effect.fn(
  "qmk-identity.resolve-from-environment",
)(function* (env: Cloudflare.Env | undefined, input: KeyboardIdentityInput) {
  const namespace = env?.QmkIndexAgent;
  if (!namespace) return yield* resolveQmkKeyboardIdentityEffect(input);

  return yield* Effect.tryPromise({
    try: () => {
      const id = namespace.idFromName(QMK_INDEX_AGENT_NAME);
      return namespace.get(id).resolveIdentity(input);
    },
    catch: (cause) => platformError("qmk-identity.resolve-from-environment", cause),
  }).pipe(
    Effect.tapError((error) =>
      Effect.logWarning("QMK identity agent call failed; returning no match").pipe(
        Effect.annotateLogs({ operation: error.operation }),
      ),
    ),
    Effect.catchTag("PlatformError", () => Effect.succeed(undefined)),
  );
});

export function resolveKeyboardIdentityFromEnvironment(
  env: Cloudflare.Env | undefined,
  input: KeyboardIdentityInput,
): Promise<KeyboardCatalogEntry | undefined> {
  return runWorkerEffect(
    "qmk-identity.resolve-from-environment",
    resolveKeyboardIdentityFromEnvironmentEffect(env, input),
  );
}
