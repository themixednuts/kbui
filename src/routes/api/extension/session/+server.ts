import { Effect } from "effect";

import { runWorkerEffect } from "$lib/effect/worker-runtime";
import type { RequestHandler } from "./$types";

import {
  extensionError,
  extensionJson,
  extensionOptions,
  getExtensionSessionEffect,
} from "$lib/server/typing-runs/extension-api";

export const OPTIONS: RequestHandler = ({ request }) => extensionOptions(request);

export const GET: RequestHandler = (event) =>
  runWorkerEffect(
    "api.extension.session",
    Effect.match(
      Effect.gen(function* () {
        const session = yield* getExtensionSessionEffect(event);
        return extensionJson(event.request, session);
      }),
      {
        onFailure: (error) =>
          extensionError(event.request, error, "Extension session lookup failed."),
        onSuccess: (response) => response,
      },
    ),
  );
