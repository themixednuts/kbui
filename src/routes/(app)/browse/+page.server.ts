import { Effect } from "effect";

import { platformError } from "$lib/effect/errors";
import { runWorkerEffect } from "$lib/effect/worker-runtime";

import { listCommunityKeymaps } from "./community.remote";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = () =>
  runWorkerEffect(
    "browse.load",
    Effect.map(
      Effect.tryPromise({
        try: () => listCommunityKeymaps({ sort: "likes", limit: 24 }),
        catch: (cause) => platformError("browse.load-community-keymaps", cause),
      }),
      (initialCards) => ({ communityStore: "durable-object-sqlite" as const, initialCards }),
    ),
  );
