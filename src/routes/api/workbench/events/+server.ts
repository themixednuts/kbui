import { error } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ locals, platform, request }) => {
  if (!locals.user?.id) error(401, "Sign in with GitHub to synchronize version history.");
  if (!platform?.env.UserWorkbenchAgent) {
    error(503, "Version history synchronization requires the Cloudflare worker runtime.");
  }
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    error(426, "Upgrade to WebSocket to synchronize version history.");
  }

  const headers = new Headers(request.headers);
  headers.set("x-kbui-user-id", locals.user.id);
  return platform.env.UserWorkbenchAgent.getByName(locals.user.id).fetch(
    new Request(request, { headers }),
  );
};
