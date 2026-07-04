import type { RequestHandler } from "./$types";

import {
  extensionError,
  extensionJson,
  extensionOptions,
  readJsonBody,
  requireExtensionPrincipal,
} from "$lib/server/typing-runs/extension-api";
import { ingestTypingRunFromEnvironment } from "$lib/typing-runs/service";

export const OPTIONS: RequestHandler = async ({ request }) => extensionOptions(request);

export const POST: RequestHandler = async (event) => {
  try {
    // TODO(rate-limit): throttle by user/device and parser version once a shared limiter exists.
    const principal = await requireExtensionPrincipal(event);
    const body = await readJsonBody(event.request);
    const result = await ingestTypingRunFromEnvironment(
      event.platform?.env,
      principal.userId,
      body,
    );
    return extensionJson(event.request, result);
  } catch (error) {
    return extensionError(event.request, error, "Typing run ingest failed.");
  }
};
