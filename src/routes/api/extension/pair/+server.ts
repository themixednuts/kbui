import type { RequestHandler } from "./$types";

import {
  extensionError,
  extensionJson,
  extensionOptions,
  readJsonBody,
  ExtensionHttpError,
} from "$lib/server/typing-runs/extension-api";
import { pairExtensionDeviceFromEnvironment } from "$lib/typing-runs/service";

export const OPTIONS: RequestHandler = async ({ request }) => extensionOptions(request);

export const POST: RequestHandler = async ({ request, platform }) => {
  try {
    // TODO(rate-limit): throttle by pairing-code hash and install id once the worker has a shared limiter.
    const body = await readJsonBody(request);
    const result = await pairExtensionDeviceFromEnvironment(platform?.env, body);
    if (!result) throw new ExtensionHttpError(401, "Pairing code is invalid or expired.");
    return extensionJson(request, result);
  } catch (error) {
    return extensionError(request, error, "Extension pairing failed.");
  }
};
