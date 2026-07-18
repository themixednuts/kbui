import { Effect } from "effect";

import { platformError } from "$lib/effect/errors";
import { runWorkerEffect } from "$lib/effect/worker-runtime";
import type { RequestHandler } from "./$types";

import {
  extensionError,
  extensionJson,
  extensionOptions,
  readJsonBody,
  ExtensionHttpError,
} from "$lib/server/typing-runs/extension-api";
import { pairExtensionDeviceFromEnvironment } from "$lib/typing-runs/service";

export const OPTIONS: RequestHandler = ({ request }) => extensionOptions(request);

export const POST: RequestHandler = ({ request, platform }) =>
  runWorkerEffect(
    "api.extension.pair",
    Effect.match(
      Effect.gen(function* () {
        // TODO(rate-limit): throttle by pairing-code hash and install id once the worker has a shared limiter.
        const body = yield* Effect.tryPromise({
          try: () => readJsonBody(request),
          catch: (cause) => cause,
        });
        const result = yield* Effect.tryPromise({
          try: () => pairExtensionDeviceFromEnvironment(platform?.env, body),
          catch: (cause) => platformError("extension.pair", cause),
        });
        if (!result) {
          return yield* Effect.fail(
            new ExtensionHttpError(401, "Pairing code is invalid or expired."),
          );
        }
        return extensionJson(request, result);
      }),
      {
        onFailure: (error) => extensionError(request, error, "Extension pairing failed."),
        onSuccess: (response) => response,
      },
    ),
  );
