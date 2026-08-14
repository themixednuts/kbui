import {
  identityFromUrl,
  isMonkeytypeResultsUrl,
  monkeytypeIdentityMessage,
  readMonkeytypeResultIdentity,
} from "./result-id";

export function installMonkeytypeResultBridge(targetWindow: Window = window): () => void {
  const originalFetch = targetWindow.fetch.bind(targetWindow);
  const originalOpen = targetWindow.XMLHttpRequest.prototype.open;
  const originalSend = targetWindow.XMLHttpRequest.prototype.send;

  targetWindow.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);
    const requestBody = typeof init?.body === "string" ? init.body : null;
    if (url && isMonkeytypeResultsUrl(url)) {
      publishIdentity(targetWindow, requestBody, url);
    }
    const response = await originalFetch(input, init);
    if (url && isMonkeytypeResultsUrl(url)) {
      void response
        .clone()
        .text()
        .then((text) => publishIdentity(targetWindow, text, url))
        .catch(() => undefined);
    }
    return response;
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

function publishIdentity(targetWindow: Window, rawBody: string | null, url: string) {
  const fromUrl = identityFromUrl(url);
  const fromBody = rawBody ? readJsonIdentity(rawBody) : null;
  const identity = fromBody ?? fromUrl;
  if (!identity) return;
  targetWindow.postMessage(monkeytypeIdentityMessage(identity), "*");
}

function readJsonIdentity(raw: string) {
  try {
    return readMonkeytypeResultIdentity(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

function requestUrl(input: RequestInfo | URL): string | null {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (typeof Request !== "undefined" && input instanceof Request) return input.url;
  return null;
}
