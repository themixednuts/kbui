import { query } from "$app/server";

import { loadViaKeyboardDetail, loadViaKeyboardIndex } from "$lib/server/keyboards/via-source";
import { keyboardIdentityInput, viaKeyboardIdInput } from "$lib/server/remote-input";
import { zmkTargetInput } from "$lib/server/remote-input";
import { resolveZmkFirmwareMetadata } from "$lib/server/keyboards/zmk-target";
import { resolveQmkKeyboardIdentity } from "$lib/server/keyboards/qmk-target";

// Keyboard definitions are an upstream, versioned data source. Keeping this as
// a runtime query lets the catalog refresh itself without requiring a new app
// deployment whenever VIA publishes a board definition.
export const getViaKeyboardIndex = query(() => loadViaKeyboardIndex());

export const getViaKeyboardDetail = query(viaKeyboardIdInput, (id: string) =>
  loadViaKeyboardDetail(id),
);

export const resolveKeyboardIdentity = query(keyboardIdentityInput, resolveQmkKeyboardIdentity);

export const resolveZmkTarget = query(zmkTargetInput, resolveZmkFirmwareMetadata);
