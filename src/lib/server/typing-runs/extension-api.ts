import { Effect, Schema } from "effect";

import { PlatformError } from "$lib/effect/errors";
import type { ExtensionSafeUser, ExtensionSessionResponse } from "$lib/typing-runs/contracts";
import {
  decodeIngestRunRequestEffect as decodeIngestRunRequestBoundaryEffect,
  decodePairDeviceRequestEffect as decodePairDeviceRequestBoundaryEffect,
} from "$lib/typing-runs/contracts";
import {
  consumeExtensionRateLimitFromEnvironmentEffect,
  getKeyboardChoicesFromEnvironmentEffect,
  ingestTypingRunFromEnvironmentEffect,
  pairExtensionDeviceFromEnvironmentEffect,
  resolveExtensionDeviceTokenFromEnvironmentEffect,
  TYPING_RUNS_REQUIRES_WORKER,
} from "$lib/typing-runs/service";
import {
  EXTENSION_PAIR_CODE_LIMIT,
  EXTENSION_PAIR_INSTALL_LIMIT,
  EXTENSION_RUN_DEVICE_LIMIT,
  EXTENSION_RUN_PARSER_LIMIT,
  pairCodeRateLimitKey,
  pairInstallRateLimitKey,
  runDeviceRateLimitKey,
  runParserRateLimitKey,
} from "$lib/typing-runs/rate-limit";

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

export class ExtensionHttpError extends Schema.TaggedErrorClass<ExtensionHttpError>()(
  "ExtensionHttpError",
  {
    status: Schema.Int,
    message: Schema.String,
    retryAfterSeconds: Schema.optionalKey(Schema.Int),
  },
) {}

export function extensionOptions(request: Request): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}

export function extensionJson(
  request: Request,
  body: unknown,
  status = 200,
  extraHeaders?: HeadersInit,
): Response {
  const headers = corsHeaders(request);
  headers.set("content-type", "application/json");
  if (extraHeaders) {
    new Headers(extraHeaders).forEach((value, key) => {
      headers.set(key, value);
    });
  }
  return Response.json(body, { status, headers });
}

export function extensionError(request: Request, error: unknown, fallback: string): Response {
  if (error instanceof ExtensionHttpError) {
    const extra =
      error.retryAfterSeconds === undefined
        ? undefined
        : { "retry-after": String(error.retryAfterSeconds) };
    return extensionJson(request, { error: error.message }, error.status, extra);
  }

  if (
    (error instanceof PlatformError || error instanceof Error) &&
    error.message === TYPING_RUNS_REQUIRES_WORKER
  ) {
    return extensionJson(request, { error: error.message }, 503);
  }

  if (error instanceof Error) {
    return extensionJson(request, { error: error.message || fallback }, 400);
  }

  return extensionJson(request, { error: fallback }, 400);
}

export const readJsonBodyEffect = Effect.fn("ExtensionApi.readJsonBody")(function* (
  request: Request,
) {
  return yield* Effect.tryPromise({
    try: () => request.json(),
    catch: () =>
      new ExtensionHttpError({ status: 400, message: "Request body must be valid JSON." }),
  });
});

export const requireExtensionPrincipalEffect = Effect.fn("ExtensionApi.requirePrincipal")(
  function* (event: ExtensionEndpointEvent) {
    const authorization = event.request.headers.get("authorization");
    if (authorization) {
      const token = bearerToken(authorization);
      if (!token) {
        return yield* Effect.fail(
          new ExtensionHttpError({ status: 401, message: "Invalid Authorization header." }),
        );
      }
      const userId = yield* resolveExtensionDeviceTokenFromEnvironmentEffect(
        event.platform?.env,
        token,
      );
      if (!userId) {
        return yield* Effect.fail(
          new ExtensionHttpError({ status: 401, message: "Invalid extension device token." }),
        );
      }
      const principal: ExtensionPrincipal = { kind: "device", userId, user: null };
      return principal;
    }

    const user = sessionUser(event.locals.user);
    if (user) {
      const principal: ExtensionPrincipal = { kind: "session", userId: user.id, user };
      return principal;
    }
    return yield* Effect.fail(
      new ExtensionHttpError({
        status: 401,
        message: "Extension request requires a paired device token or session.",
      }),
    );
  },
);

export const getExtensionKeyboardChoicesEffect = Effect.fn("ExtensionApi.getKeyboardChoices")(
  function* (event: ExtensionEndpointEvent) {
    const principal = yield* requireExtensionPrincipalEffect(event);
    return yield* getKeyboardChoicesFromEnvironmentEffect(event.platform?.env, principal.userId);
  },
);

export const pairExtensionDeviceEffect = Effect.fn("ExtensionApi.pairDevice")(function* (
  event: ExtensionEndpointEvent,
) {
  const rawBody = yield* readJsonBodyEffect(event.request);
  const input = yield* decodePairDeviceRequestEffect(rawBody);
  const codeHash = yield* sha256HexEffect(input.code);
  yield* requireRateLimitEffect(
    event,
    pairInstallRateLimitKey(input.installId),
    EXTENSION_PAIR_INSTALL_LIMIT,
  );
  yield* requireRateLimitEffect(event, pairCodeRateLimitKey(codeHash), EXTENSION_PAIR_CODE_LIMIT);
  const result = yield* pairExtensionDeviceFromEnvironmentEffect(event.platform?.env, input);
  if (!result) {
    return yield* Effect.fail(
      new ExtensionHttpError({ status: 401, message: "Pairing code is invalid or expired." }),
    );
  }
  return result;
});

export const ingestExtensionRunEffect = Effect.fn("ExtensionApi.ingestRun")(function* (
  event: ExtensionEndpointEvent,
) {
  const principal = yield* requireExtensionPrincipalEffect(event);
  const rawBody = yield* readJsonBodyEffect(event.request);
  const input = yield* decodeIngestRunRequestEffect(rawBody);
  const deviceKey = input.capture.extension.installId || principal.kind;
  yield* requireRateLimitEffect(
    event,
    runDeviceRateLimitKey(principal.userId, deviceKey),
    EXTENSION_RUN_DEVICE_LIMIT,
  );
  yield* requireRateLimitEffect(
    event,
    runParserRateLimitKey(principal.userId, input.capture.extension.parserVersion),
    EXTENSION_RUN_PARSER_LIMIT,
  );
  return yield* ingestTypingRunFromEnvironmentEffect(event.platform?.env, principal.userId, input);
});

export const getExtensionSessionEffect = Effect.fn("ExtensionApi.getSession")(function* (
  event: ExtensionEndpointEvent,
) {
  const user = sessionUser(event.locals.user);
  if (!user) {
    const anonymous: ExtensionSessionResponse = {
      canUse: false,
      user: null,
      choices: { keyboards: [], layouts: [] },
    };
    return anonymous;
  }

  const choices = yield* getKeyboardChoicesFromEnvironmentEffect(event.platform?.env, user.id);
  const response: ExtensionSessionResponse = {
    canUse: true,
    user,
    choices,
  };
  return response;
});

export function sessionUser(user: App.Locals["user"]): ExtensionSafeUser | null {
  if (!user?.id) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    image: user.image,
  };
}

const decodePairDeviceRequestEffect = Effect.fn("ExtensionApi.decodePairDeviceRequest")(
  (rawInput: unknown) =>
    decodePairDeviceRequestBoundaryEffect(rawInput).pipe(
      Effect.mapError(
        () => new ExtensionHttpError({ status: 400, message: "Pair request is invalid." }),
      ),
    ),
);

const decodeIngestRunRequestEffect = Effect.fn("ExtensionApi.decodeIngestRunRequest")(
  (rawInput: unknown) =>
    decodeIngestRunRequestBoundaryEffect(rawInput).pipe(
      Effect.mapError(
        () => new ExtensionHttpError({ status: 400, message: "Typing run request is invalid." }),
      ),
    ),
);

function bearerToken(value: string): string | null {
  const match = value.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token || null;
}

const requireRateLimitEffect = Effect.fn("ExtensionApi.requireRateLimit")(function* (
  event: ExtensionEndpointEvent,
  key: string,
  spec: { limit: number; windowMs: number },
) {
  const decision = yield* consumeExtensionRateLimitFromEnvironmentEffect(
    event.platform?.env,
    key,
    spec,
  );
  if (decision.allowed) return;
  return yield* Effect.fail(
    new ExtensionHttpError({
      status: 429,
      message: "Too many extension requests. Retry later.",
      retryAfterSeconds: decision.retryAfterSeconds,
    }),
  );
});

function sha256HexEffect(value: string) {
  return Effect.map(
    Effect.tryPromise({
      try: () => crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
      catch: () => new ExtensionHttpError({ status: 500, message: "Could not hash pairing code." }),
    }),
    (digest) =>
      [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
  );
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
