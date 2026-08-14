import { Effect, Schema } from "effect";

import {
  identityFromUrl,
  isMonkeytypeResultsUrl,
  monkeytypeIdentityMessage,
  readJsonIdentity,
} from "./result-id";

class MonkeytypeBridgeError extends Schema.TaggedErrorClass<MonkeytypeBridgeError>()(
  "MonkeytypeBridgeError",
  {
    operation: Schema.String,
    message: Schema.String,
  },
) {}

export function installMonkeytypeResultBridge(targetWindow: Window = window): () => void {
  const originalFetch = targetWindow.fetch.bind(targetWindow);
  const originalOpen = targetWindow.XMLHttpRequest.prototype.open;
  const originalSend = targetWindow.XMLHttpRequest.prototype.send;

  targetWindow.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    const requestBody = typeof init?.body === "string" ? init.body : null;
    if (url && isMonkeytypeResultsUrl(url)) {
      publishIdentity(targetWindow, requestBody, url);
    }
    return originalFetch(input, init).then((response) => {
      if (url && isMonkeytypeResultsUrl(url)) {
        void Effect.runPromise(publishIdentityFromResponse(targetWindow, response, url));
      }
      return response;
    });
  };

  targetWindow.XMLHttpRequest.prototype.open = function open(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ) {
    (this as XMLHttpRequest & { __kbguiUrl?: string }).__kbguiUrl = String(url);
    return originalOpen.call(this, method, url, async ?? true, username, password);
  };

  targetWindow.XMLHttpRequest.prototype.send = function send(
    this: XMLHttpRequest,
    body?: Document | XMLHttpRequestBodyInit | null,
  ) {
    const url = (this as XMLHttpRequest & { __kbguiUrl?: string }).__kbguiUrl;
    if (url && isMonkeytypeResultsUrl(url) && typeof body === "string") {
      publishIdentity(targetWindow, body, url);
    }
    this.addEventListener("load", () => {
      if (url && isMonkeytypeResultsUrl(url)) {
        publishIdentity(targetWindow, this.responseText, url);
      }
    });
    return originalSend.call(this, body);
  };

  return () => {
    targetWindow.fetch = originalFetch;
    targetWindow.XMLHttpRequest.prototype.open = originalOpen;
    targetWindow.XMLHttpRequest.prototype.send = originalSend;
  };
}

function publishIdentityFromResponse(targetWindow: Window, response: Response, url: string) {
  return Effect.tryPromise({
    try: () => response.clone().text(),
    catch: (cause) =>
      new MonkeytypeBridgeError({
        operation: "monkeytype-bridge.read-response",
        message: cause instanceof Error ? cause.message : String(cause),
      }),
  }).pipe(
    Effect.tap((text) => Effect.sync(() => publishIdentity(targetWindow, text, url))),
    Effect.tapError((error) =>
      Effect.sync(() => {
        console.warn("kbgui monkeytype bridge could not read a results response", error.message);
      }),
    ),
    Effect.ignore,
  );
}

function publishIdentity(targetWindow: Window, rawBody: string | null, url: string) {
  const fromUrl = identityFromUrl(url);
  const fromBody = rawBody ? readJsonIdentity(rawBody) : null;
  const identity = fromBody ?? fromUrl;
  if (!identity) return;
  targetWindow.postMessage(monkeytypeIdentityMessage(identity), "*");
}

function requestUrl(input: RequestInfo | URL): string | null {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  return null;
}
