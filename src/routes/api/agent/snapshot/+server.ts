import { Effect } from "effect";

import type { RequestHandler } from "./$types";

function normalizeAgentName(input: string) {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._:-]/g, "-")
      .slice(0, 128) || "local-dev"
  );
}

// Lock writes to the authenticated user's namespace. The DO name is
// derived from `locals.user.id` (set by hooks.server.ts via the AuthAgent
// session lookup) — that's the only thing the client trusts; a `userId`
// in the request body is ignored to prevent cross-account writes.
export const POST: RequestHandler = ({ request, platform, locals }) =>
  Effect.runPromise(
    Effect.tryPromise(async () => {
      if (!locals.user) {
        return Response.json(
          { synced: false, reason: "Sign in to sync workbench state." },
          { status: 401 },
        );
      }

      const userId = normalizeAgentName(locals.user.id);
      const body = await request.json();

      if (!platform?.env.UserWorkbenchAgent) {
        return Response.json(
          {
            synced: false,
            agentName: userId,
            reason: "UserWorkbenchAgent binding is only available through Wrangler/Cloudflare.",
          },
          { status: 202 },
        );
      }

      const agentId = platform.env.UserWorkbenchAgent.idFromName(userId);
      const agent = platform.env.UserWorkbenchAgent.get(agentId);

      const snapshot = await agent.saveSnapshot({
        userId,
        profile: body.profile,
        changes: body.changes ?? [],
      });

      return Response.json({
        synced: true,
        agentName: userId,
        snapshot,
      });
    }),
  );

// Restore the latest snapshot for the signed-in user. Returns `null`
// when nothing has been saved yet so the client can fall back to its
// local default.
export const GET: RequestHandler = ({ platform, locals }) =>
  Effect.runPromise(
    Effect.tryPromise(async () => {
      if (!locals.user) {
        return Response.json(
          { error: "Sign in to load workbench state." },
          { status: 401 },
        );
      }

      const userId = normalizeAgentName(locals.user.id);

      if (!platform?.env.UserWorkbenchAgent) {
        return Response.json(
          { agentName: userId, snapshot: null, reason: "Binding unavailable." },
          { status: 202 },
        );
      }

      const agentId = platform.env.UserWorkbenchAgent.idFromName(userId);
      const agent = platform.env.UserWorkbenchAgent.get(agentId);
      const snapshot = await agent.getSnapshot();

      return Response.json({ agentName: userId, snapshot });
    }),
  );
