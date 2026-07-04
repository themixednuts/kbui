import type { RequestHandler } from "./$types";

import {
  extensionError,
  extensionJson,
  extensionOptions,
  requireExtensionPrincipal,
} from "$lib/server/typing-runs/extension-api";
import { getKeyboardChoicesFromEnvironment } from "$lib/typing-runs/service";

export const OPTIONS: RequestHandler = async ({ request }) => extensionOptions(request);

export const GET: RequestHandler = async (event) => {
  try {
    const principal = await requireExtensionPrincipal(event);
    const choices = await getKeyboardChoicesFromEnvironment(event.platform?.env, principal.userId);
    return extensionJson(event.request, choices);
  } catch (error) {
    return extensionError(event.request, error, "Keyboard choices lookup failed.");
  }
};
