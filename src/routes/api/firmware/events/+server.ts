import { error } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ locals, platform, request }) => {
  if (!locals.user?.id) error(401, "Sign in with GitHub to receive firmware build events.");
  if (!platform?.env.FirmwareBuildAgent) {
    error(503, "Firmware build events require the Cloudflare worker runtime.");
  }
  if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
    error(426, "Upgrade to WebSocket to receive firmware build events.");
  }

  return platform.env.FirmwareBuildAgent.getByName(locals.user.id).fetch(request);
};
