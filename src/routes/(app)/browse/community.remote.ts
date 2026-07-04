import { getRequestEvent, query } from "$app/server";

import {
  getCommunityKeymapFromEnvironment,
  listCommunityKeymapsFromEnvironment,
} from "$lib/community/service";

export const listCommunityKeymaps = query("unchecked", async (rawInput: unknown) => {
  const event = getRequestEvent();
  return listCommunityKeymapsFromEnvironment(event.platform?.env, rawInput, event.locals.user?.id);
});

export const getCommunityKeymap = query("unchecked", async (rawId: unknown) => {
  const event = getRequestEvent();
  return getCommunityKeymapFromEnvironment(event.platform?.env, rawId, event.locals.user?.id);
});
