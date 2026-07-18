import { getRequestEvent, query } from "$app/server";
import { ConfigProvider, Effect } from "effect";

import { runWorkerEffect } from "$lib/effect/worker-runtime";
import { resolveKeyboardIdentityFromEnvironment } from "$lib/server/keyboards/qmk-identity-service";
import {
  loadViaKeyboardDetailEffect,
  loadViaKeyboardIndexEffect,
} from "$lib/server/keyboards/via-source";
import { resolveZmkFirmwareMetadataOrUndefinedEffect } from "$lib/server/keyboards/zmk-target";
import {
  keyboardIdentityInput,
  viaKeyboardIdInput,
  zmkTargetInput,
} from "$lib/server/remote-input";

function requestConfigProvider() {
  const platformEnv = getRequestEvent().platform?.env;
  return platformEnv
    ? ConfigProvider.orElse(ConfigProvider.fromUnknown(platformEnv), ConfigProvider.fromEnv())
    : ConfigProvider.fromEnv();
}

// Keyboard definitions are an upstream, versioned data source. Keeping this as
// a runtime query lets the catalog refresh itself without requiring a new app
// deployment whenever VIA publishes a board definition.
export const getViaKeyboardIndex = query(() =>
  runWorkerEffect(
    "via.catalog.index",
    loadViaKeyboardIndexEffect().pipe(
      Effect.provideService(ConfigProvider.ConfigProvider, requestConfigProvider()),
    ),
  ),
);

export const getViaKeyboardDetail = query(viaKeyboardIdInput, (id: string) =>
  runWorkerEffect(
    "via.catalog.detail",
    loadViaKeyboardDetailEffect(id).pipe(
      Effect.provideService(ConfigProvider.ConfigProvider, requestConfigProvider()),
    ),
  ),
);

export const resolveKeyboardIdentity = query(keyboardIdentityInput, (input) =>
  resolveKeyboardIdentityFromEnvironment(getRequestEvent().platform?.env, input),
);

export const resolveZmkTarget = query(zmkTargetInput, (input) =>
  runWorkerEffect(
    "zmk.resolve-firmware-metadata",
    resolveZmkFirmwareMetadataOrUndefinedEffect(input).pipe(
      Effect.provideService(ConfigProvider.ConfigProvider, requestConfigProvider()),
    ),
  ),
);
