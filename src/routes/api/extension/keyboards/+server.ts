import { Effect } from "effect";

import { platformError } from "$lib/effect/errors";
import { runWorkerEffect } from "$lib/effect/worker-runtime";
import type { RequestHandler } from "./$types";

import {
  extensionError,
  extensionJson,
  extensionOptions,
  requireExtensionPrincipal,
} from "$lib/server/typing-runs/extension-api";
import { getKeyboardChoicesFromEnvironment } from "$lib/typing-runs/service";

export const OPTIONS: RequestHandler = ({ request }) => extensionOptions(request);

export const GET: RequestHandler = (event) =>
  runWorkerEffect(
    "api.extension.keyboards",
    Effect.match(
      Effect.gen(function* () {
        const principal = yield* Effect.tryPromise({
          try: () => requireExtensionPrincipal(event),
          catch: (cause) => cause,
        });
        const choices = yield* Effect.tryPromise({
          try: () => getKeyboardChoicesFromEnvironment(event.platform?.env, principal.userId),
          catch: (cause) => platformError("extension.get-keyboard-choices", cause),
        });
        return extensionJson(event.request, choices);
      }),
      {
        onFailure: (error) =>
          extensionError(event.request, error, "Keyboard choices lookup failed."),
        onSuccess: (response) => response,
      },
    ),
  );
