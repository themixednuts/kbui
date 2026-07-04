import type { RequestHandler } from "./$types";

import {
  extensionError,
  extensionJson,
  extensionOptions,
  sessionUser,
} from "$lib/server/typing-runs/extension-api";
import type { ExtensionSessionResponse } from "$lib/typing-runs/contracts";
import { getKeyboardChoicesFromEnvironment } from "$lib/typing-runs/service";

export const OPTIONS: RequestHandler = async ({ request }) => extensionOptions(request);

export const GET: RequestHandler = async ({ request, locals, platform }) => {
  try {
    const user = sessionUser(locals.user);
    if (!user) {
      const anonymous: ExtensionSessionResponse = {
        canUse: false,
        user: null,
        choices: { keyboards: [], layouts: [] },
      };
      return extensionJson(request, anonymous);
    }

    const choices = await getKeyboardChoicesFromEnvironment(platform?.env, user.id);
    const response: ExtensionSessionResponse = {
      canUse: true,
      user,
      choices,
    };
    return extensionJson(request, response);
  } catch (error) {
    return extensionError(request, error, "Extension session lookup failed.");
  }
};
