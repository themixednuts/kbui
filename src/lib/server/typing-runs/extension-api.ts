import type { ExtensionSafeUser } from "$lib/typing-runs/contracts";
import {
  resolveExtensionDeviceTokenFromEnvironment,
  TYPING_RUNS_REQUIRES_WORKER,
} from "$lib/typing-runs/service";

export interface ExtensionEndpointEvent {
  request: Request;
  url: URL;
  locals: App.Locals;
  platform?: App.Platform;
}

export interface ExtensionPrincipal {
  kind: "device" | "session";
  userId: string;
  user: ExtensionSafeUser | null;
}

export class ExtensionHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function extensionOptions(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}

export function extensionJson(request: Request, body: unknown, status = 200): Response {
  const headers = corsHeaders(request);
  headers.set("content-type", "application/json");
  return Response.json(body, { status, headers });
}

export function extensionError(request: Request, error: unknown, fallback: string): Response {
  if (error instanceof ExtensionHttpError) {
    return extensionJson(request, { error: error.message }, error.status);
  }

  if (error instanceof Error && error.message === TYPING_RUNS_REQUIRES_WORKER) {
    return extensionJson(request, { error: error.message }, 503);
  }

  if (error instanceof Error) {
    return extensionJson(request, { error: error.message || fallback }, 400);
  }

  return extensionJson(request, { error: fallback }, 400);
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ExtensionHttpError(400, "Request body must be valid JSON.");
  }
}

export async function requireExtensionPrincipal(
  event: ExtensionEndpointEvent,
): Promise<ExtensionPrincipal> {
  const authorization = event.request.headers.get("authorization");
  if (authorization) {
    const token = bearerToken(authorization);
    if (!token) throw new ExtensionHttpError(401, "Invalid Authorization header.");
    const userId = await resolveExtensionDeviceTokenFromEnvironment(event.platform?.env, token);
    if (!userId) throw new ExtensionHttpError(401, "Invalid extension device token.");
    return {
      kind: "device",
      userId,
      user: null,
    };
  }

  const user = sessionUser(event.locals.user);
  if (user) {
    return {
      kind: "session",
      userId: user.id,
      user,
    };
  }

  throw new ExtensionHttpError(401, "Extension request requires a paired device token or session.");
}

export function sessionUser(user: App.Locals["user"]): ExtensionSafeUser | null {
  if (!user?.id) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
  };
}

function bearerToken(value: string): string | null {
  const match = value.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token || null;
}

function corsHeaders(request: Request): Headers {
  const headers = new Headers({
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type,x-kbgui-extension",
    "access-control-max-age": "600",
    vary: "Origin",
  });
  const origin = request.headers.get("origin");
  if (origin && allowedCorsOrigin(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("access-control-allow-credentials", "true");
  }
  return headers;
}

function allowedCorsOrigin(origin: string): boolean {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  if (url.protocol === "chrome-extension:" || url.protocol === "moz-extension:") return true;
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}
