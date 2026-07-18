import { Effect } from "effect";

import { platformError } from "$lib/effect/errors";
import { runWorkerEffect } from "$lib/effect/worker-runtime";
import type { RequestHandler } from "./$types";

import {
  extensionError,
  extensionJson,
  extensionOptions,
  sessionUser,
} from "$lib/server/typing-runs/extension-api";
import type { ExtensionSessionResponse } from "$lib/typing-runs/contracts";
import { getKeyboardChoicesFromEnvironment } from "$lib/typing-runs/service";

export const OPTIONS: RequestHandler = ({ request }) => extensionOptions(request);

export const GET: RequestHandler = ({ request, locals, platform }) =>
  runWorkerEffect(
    "api.extension.session",
    Effect.match(
      Effect.gen(function* () {
        const user = sessionUser(locals.user);
        if (!user) {
          const anonymous: ExtensionSessionResponse = {
            canUse: false,
            user: null,
            choices: { keyboards: [], layouts: [] },
          };
          return extensionJson(request, anonymous);
        }

        const choices = yield* Effect.tryPromise({
          try: () => getKeyboardChoicesFromEnvironment(platform?.env, user.id),
          catch: (cause) => platformError("extension.session.choices", cause),
        });
        const response: ExtensionSessionResponse = {
          canUse: true,
          user,
          choices,
        };
        return extensionJson(request, response);
      }),
      {
        onFailure: (error) => extensionError(request, error, "Extension session lookup failed."),
        onSuccess: (response) => response,
      },
    ),
  );
