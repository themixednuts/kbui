import { Effect } from "effect";

import { runWorkerEffect } from "$lib/effect/worker-runtime";
import type { RequestHandler } from "./$types";

import {
  extensionError,
  extensionJson,
  extensionOptions,
  pairExtensionDeviceEffect,
} from "$lib/server/typing-runs/extension-api";

export const OPTIONS: RequestHandler = ({ request }) => extensionOptions(request);

export const POST: RequestHandler = (event) =>
  runWorkerEffect(
    "api.extension.pair",
    Effect.match(
      Effect.gen(function* () {
        // TODO(rate-limit): throttle by pairing-code hash and install id once the worker has a shared limiter.
        const result = yield* pairExtensionDeviceEffect(event);
        return extensionJson(event.request, result);
      }),
      {
        onFailure: (error) => extensionError(event.request, error, "Extension pairing failed."),
        onSuccess: (response) => response,
      },
    ),
  );
