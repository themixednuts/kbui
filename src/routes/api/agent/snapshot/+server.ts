import { Effect, Schema } from "effect";

import { platformError } from "$lib/effect/errors";
import { runWorkerEffect } from "$lib/effect/worker-runtime";
import { decodeDeviceProfileFromStorageEffect } from "$lib/keyboard/schema";
import type { RequestHandler } from "./$types";

const snapshotBodySchema = Schema.Struct({
  profile: Schema.Unknown,
  changes: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        after: Schema.String,
        before: Schema.String,
        id: Schema.String,
        kind: Schema.Literals([
          "binding",
          "macro",
          "combo",
          "tapDance",
          "setting",
          "lighting",
          "metadata",
        ]),
        path: Schema.String,
        scope: Schema.String,
        staged: Schema.Boolean,
      }),
    ),
  ),
});

function normalizeAgentName(input: string) {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._:-]/g, "-")
      .slice(0, 128) || "local-dev"
  );
}

export const POST: RequestHandler = ({ request, platform, locals }) =>
  runWorkerEffect(
    "api.agent.snapshot.save",
    Effect.gen(function* () {
      if (!locals.user) {
        return Response.json(
          { synced: false, reason: "Sign in to sync workbench state." },
          { status: 401 },
        );
      }

      const userId = normalizeAgentName(locals.user.id);
      const rawBody = yield* Effect.tryPromise({
        try: () => request.json(),
        catch: (cause) => platformError("snapshot.read-request-json", cause),
      }).pipe(Effect.result);
      if (rawBody._tag === "Failure") {
        return Response.json(
          { synced: false, reason: "Invalid workbench snapshot." },
          { status: 400 },
        );
      }
      const body = yield* Schema.decodeUnknownEffect(snapshotBodySchema)(rawBody.success).pipe(
        Effect.result,
      );
      if (body._tag === "Failure") {
        return Response.json(
          { synced: false, reason: "Invalid workbench snapshot." },
          { status: 400 },
        );
      }
      const profile = yield* decodeDeviceProfileFromStorageEffect(body.success.profile).pipe(
        Effect.result,
      );
      if (profile._tag === "Failure") {
        return Response.json(
          { synced: false, reason: "Invalid keyboard profile." },
          { status: 400 },
        );
      }

      if (!platform?.env.UserWorkbenchAgent) {
        return Response.json(
          {
            synced: false,
            agentName: userId,
            reason: "UserWorkbenchAgent binding is only available through Wrangler/Cloudflare.",
          },
          { status: 503 },
        );
      }

      const agent = platform.env.UserWorkbenchAgent.getByName(userId);
      const snapshot = yield* Effect.tryPromise({
        try: () =>
          agent.saveSnapshot({
            userId,
            profile: profile.success,
            changes: [...(body.success.changes ?? [])],
          }),
        catch: (cause) => platformError("snapshot.save-agent-state", cause),
      });

      return Response.json({ synced: true, agentName: userId, snapshot });
    }),
  );

export const GET: RequestHandler = ({ platform, locals }) =>
  runWorkerEffect(
    "api.agent.snapshot.load",
    Effect.gen(function* () {
      if (!locals.user) {
        return Response.json({ error: "Sign in to load workbench state." }, { status: 401 });
      }

      const userId = normalizeAgentName(locals.user.id);
      if (!platform?.env.UserWorkbenchAgent) {
        return Response.json(
          { agentName: userId, snapshot: null, reason: "Binding unavailable." },
          { status: 503 },
        );
      }

      const snapshot = yield* Effect.tryPromise({
        try: () => platform.env.UserWorkbenchAgent.getByName(userId).getSnapshot(),
        catch: (cause) => platformError("snapshot.load-agent-state", cause),
      });
      return Response.json({ agentName: userId, snapshot });
    }),
  );
