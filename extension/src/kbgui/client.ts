import type {
  ExtensionSessionResponse,
  IngestRunRequest,
  IngestRunResponse,
  KeyboardChoicesResponse,
  PairDeviceRequest,
  PairDeviceResponse
} from "../contracts";
import { normalizeKeyboardChoicesResponse } from "../contracts";
import { DEFAULT_KBGUI_BASE_URL } from "../storage";

export class KbguiApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function normalizeKbguiBaseUrl(raw: string | undefined | null): string {
  const value = raw?.trim() || DEFAULT_KBGUI_BASE_URL;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("kbui URL must be a valid http(s) origin.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("kbui URL must use http or https.");
  }

  if (url.protocol === "http:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
    throw new Error("Non-local kbui URLs must use https.");
  }

  return url.origin;
}

export async function pairDevice(
  baseUrl: string,
  request: PairDeviceRequest,
  extensionVersion: string,
): Promise<PairDeviceResponse> {
  return fetchJson<PairDeviceResponse>(baseUrl, "/api/extension/pair", extensionVersion, {
    method: "POST",
    body: JSON.stringify(request)
  });
}

export async function getExtensionSession(
  baseUrl: string,
  extensionVersion: string,
): Promise<ExtensionSessionResponse> {
  return fetchJson<ExtensionSessionResponse>(baseUrl, "/api/extension/session", extensionVersion, {
    method: "GET"
  });
}

export async function getKeyboardChoices(
  baseUrl: string,
  extensionVersion: string,
  deviceToken?: string,
): Promise<KeyboardChoicesResponse> {
  const response = await fetchJson<KeyboardChoicesResponse>(
    baseUrl,
    "/api/extension/keyboards",
    extensionVersion,
    {
      method: "GET",
      headers: authHeaders(deviceToken)
    },
  );
  return normalizeKeyboardChoicesResponse(response);
}

export async function postTypingRun(
  baseUrl: string,
  request: IngestRunRequest,
  extensionVersion: string,
  deviceToken?: string,
): Promise<IngestRunResponse> {
  return fetchJson<IngestRunResponse>(baseUrl, "/api/extension/runs", extensionVersion, {
    method: "POST",
    headers: authHeaders(deviceToken),
    body: JSON.stringify(request)
  });
}

async function fetchJson<T>(
  baseUrl: string,
  path: string,
  extensionVersion: string,
  init: RequestInit,
): Promise<T> {
  const url = new URL(path, normalizeKbguiBaseUrl(baseUrl));
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  headers.set("x-kbgui-extension", extensionVersion);
  if (init.body) headers.set("content-type", "application/json");

  const response = await fetch(url, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store"
  });

  const body = await readResponseBody(response);
  if (!response.ok) {
    const message = responseMessage(body) ?? `kbui request failed with HTTP ${response.status}.`;
    throw new KbguiApiError(response.status, message);
  }

  return body as T;
}

function authHeaders(deviceToken: string | undefined): HeadersInit {
  return deviceToken ? { authorization: `Bearer ${deviceToken}` } : {};
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function responseMessage(body: unknown): string | null {
  if (body && typeof body === "object" && "error" in body) {
    const error = (body as { error?: unknown }).error;
    return typeof error === "string" ? error : null;
  }
  return typeof body === "string" ? body : null;
}
