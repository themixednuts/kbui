import { Effect } from "effect";

import { runWorkerEffect } from "$lib/effect/worker-runtime";
import type { RequestHandler } from "./$types";

import {
  extensionError,
  extensionJson,
  extensionOptions,
  ingestExtensionRunEffect,
} from "$lib/server/typing-runs/extension-api";

export const OPTIONS: RequestHandler = ({ request }) => extensionOptions(request);

export const POST: RequestHandler = (event) =>
  runWorkerEffect(
    "api.extension.runs",
    Effect.match(
      Effect.gen(function* () {
        const result = yield* ingestExtensionRunEffect(event);
        return extensionJson(event.request, result);
      }),
      {
        onFailure: (error) => extensionError(event.request, error, "Typing run ingest failed."),
        onSuccess: (response) => response,
      },
    ),
  );
