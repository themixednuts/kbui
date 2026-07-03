import { prerender } from "$app/server";

import {
  loadViaKeyboardDetail,
  loadViaKeyboardDetailInputs,
  loadViaKeyboardIndex,
} from "$lib/server/keyboards/via-source";

export const getViaKeyboardIndex = prerender(async () => loadViaKeyboardIndex());

export const getViaKeyboardDetail = prerender(
  "unchecked",
  async (id: string) => loadViaKeyboardDetail(id),
  {
    inputs: loadViaKeyboardDetailInputs,
  },
);
