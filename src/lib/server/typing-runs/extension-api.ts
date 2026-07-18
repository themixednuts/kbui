import { Effect } from "effect";

import { platformError } from "$lib/effect/errors";
import { runWorkerEffect } from "$lib/effect/worker-runtime";
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

export function readJsonBody(request: Request): Promise<unknown> {
  return runWorkerEffect(
    "extension.read-json-body",
    Effect.tryPromise({
      try: () => request.json(),
      catch: () => new ExtensionHttpError(400, "Request body must be valid JSON."),
    }),
  );
}

export function requireExtensionPrincipal(
  event: ExtensionEndpointEvent,
): Promise<ExtensionPrincipal> {
  return runWorkerEffect(
    "extension.require-principal",
    Effect.gen(function* () {
      const authorization = event.request.headers.get("authorization");
      if (authorization) {
        const token = bearerToken(authorization);
        if (!token) {
          return yield* Effect.fail(new ExtensionHttpError(401, "Invalid Authorization header."));
        }
        const userId = yield* Effect.tryPromise({
          try: () => resolveExtensionDeviceTokenFromEnvironment(event.platform?.env, token),
          catch: (cause) => platformError("extension.resolve-device-token", cause),
        });
        if (!userId) {
          return yield* Effect.fail(new ExtensionHttpError(401, "Invalid extension device token."));
        }
        return { kind: "device", userId, user: null } as const;
      }

      const user = sessionUser(event.locals.user);
      if (user) return { kind: "session", userId: user.id, user } as const;
      return yield* Effect.fail(
        new ExtensionHttpError(401, "Extension request requires a paired device token or session."),
      );
    }),
  );
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
  if (!URL.canParse(origin)) return false;
  const url = new URL(origin);

  if (url.protocol === "chrome-extension:" || url.protocol === "moz-extension:") return true;
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}
