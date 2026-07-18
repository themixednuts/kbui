import { Effect } from "effect";

import { platformError } from "$lib/effect/errors";
import { runWorkerEffect } from "$lib/effect/worker-runtime";
import type { RequestHandler } from "./$types";

import {
  extensionError,
  extensionJson,
  extensionOptions,
  readJsonBody,
  requireExtensionPrincipal,
} from "$lib/server/typing-runs/extension-api";
import { ingestTypingRunFromEnvironment } from "$lib/typing-runs/service";

export const OPTIONS: RequestHandler = ({ request }) => extensionOptions(request);

export const POST: RequestHandler = (event) =>
  runWorkerEffect(
    "api.extension.runs",
    Effect.match(
      Effect.gen(function* () {
        // TODO(rate-limit): throttle by user/device and parser version once a shared limiter exists.
        const principal = yield* Effect.tryPromise({
          try: () => requireExtensionPrincipal(event),
          catch: (cause) => cause,
        });
        const body = yield* Effect.tryPromise({
          try: () => readJsonBody(event.request),
          catch: (cause) => cause,
        });
        const result = yield* Effect.tryPromise({
          try: () => ingestTypingRunFromEnvironment(event.platform?.env, principal.userId, body),
          catch: (cause) => platformError("extension.ingest-run", cause),
        });
        return extensionJson(event.request, result);
      }),
      {
        onFailure: (error) => extensionError(event.request, error, "Typing run ingest failed."),
        onSuccess: (response) => response,
      },
    ),
  );
