import { Effect } from "effect";

import { runWorkerEffect } from "$lib/effect/worker-runtime";
import type { RequestHandler } from "./$types";

import {
  extensionError,
  extensionJson,
  extensionOptions,
  getExtensionKeyboardChoicesEffect,
} from "$lib/server/typing-runs/extension-api";

export const OPTIONS: RequestHandler = ({ request }) => extensionOptions(request);

export const GET: RequestHandler = (event) =>
  runWorkerEffect(
    "api.extension.keyboards",
    Effect.match(
      Effect.gen(function* () {
        const choices = yield* getExtensionKeyboardChoicesEffect(event);
        return extensionJson(event.request, choices);
      }),
      {
        onFailure: (error) =>
          extensionError(event.request, error, "Keyboard choices lookup failed."),
        onSuccess: (response) => response,
      },
    ),
  );
