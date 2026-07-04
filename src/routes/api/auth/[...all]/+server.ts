import { dev } from "$app/environment";
import type { RequestHandler } from "./$types";

const authAgentName = "global-auth";

const handleAuth: RequestHandler = async ({ request, platform }) => {
  if (dev) {
    return Response.json(
      {
        error:
          "AuthAgent is unavailable in plain Vite dev. Use `vp run dev:worker` for Wrangler-backed agent bindings.",
      },
      { status: 503 },
    );
  }

  if (!platform?.env.AuthAgent) {
    return Response.json(
      {
        error: "AuthAgent binding is only available through Wrangler/Cloudflare.",
      },
      { status: 503 },
    );
  }

  const id = platform.env.AuthAgent.idFromName(authAgentName);
  const agent = platform.env.AuthAgent.get(id);
  const init: RequestInit = {
    headers: request.headers,
    method: request.method,
    // CRITICAL: without this, agent.fetch follows redirects INSIDE the
    // worker. better-auth issues a 302 after a successful OAuth callback
    // (Location: callbackURL like "/") — that inner-follow re-hits the
    // AuthAgent with a path it doesn't own ("/"), turning a successful
    // sign-in into a 404 at the browser. With `manual`, the 302 bubbles
    // up to the browser, which follows it as a real navigation.
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = request.body;
  }

  try {
    return await agent.fetch(request.url, init);
  } catch {
    return Response.json(
      {
        error:
          "AuthAgent is unavailable in this local dev server. Use `vp run dev:worker` for Wrangler-backed agent bindings.",
      },
      { status: 503 },
    );
  }
};

export const GET = handleAuth;
export const POST = handleAuth;
