import { Effect, Schema } from "effect";

import { platformError } from "$lib/effect/errors";
import { runWorkerEffect } from "$lib/effect/worker-runtime";
import {
  GITHUB_REST_ACCEPT,
  GITHUB_REST_API_BASE_URL,
  GITHUB_REST_API_VERSION,
  GITHUB_REST_USER_AGENT,
} from "$lib/server/github/client";

export interface GitHubAppInstallationAuthEnv {
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
}

export interface GitHubAppInstallationAuthConfig {
  appId: string | null;
  privateKey: string | null;
  configured: boolean;
}

export interface CreateGitHubAppJwtOptions {
  appId: string;
  cryptoProvider?: Pick<Crypto, "subtle">;
  nowMs?: () => number;
  privateKey: string;
}

export interface GitHubAppInstallationTokenClientOptions {
  apiBaseUrl?: string;
  apiVersion?: string;
  createJwt?: (request: CreateGitHubAppJwtOptions) => Promise<string>;
  cryptoProvider?: Pick<Crypto, "subtle">;
  fetchImpl?: typeof fetch;
  nowMs?: () => number;
}

export interface CreateInstallationAccessTokenRequest {
  installationId: string;
  permissions?: Partial<Record<GitHubInstallationAccessTokenPermission, "read" | "write">>;
  repositories?: string[];
  repositoryIds?: number[];
}

export type GitHubInstallationAccessTokenPermission =
  | "actions"
  | "administration"
  | "contents"
  | "metadata"
  | "workflows";

export interface GitHubAppInstallationAccessToken {
  expiresAt: string;
  permissions: Record<string, string>;
  repositories: Array<{ full_name: string; id: number; name: string }> | null;
  repositorySelection: string | null;
  token: string;
}

const defaultFetch = (input: RequestInfo | URL, init?: RequestInit) =>
  globalThis.fetch(input, init);

const installationTokenResponseSchema = Schema.Struct({
  expires_at: Schema.String,
  permissions: Schema.Record(Schema.String, Schema.String),
  repositories: Schema.NullOr(
    Schema.Array(
      Schema.Struct({
        full_name: Schema.String,
        id: Schema.Number,
        name: Schema.String,
      }),
    ),
  ),
  repository_selection: Schema.NullOr(Schema.String),
  token: Schema.String,
});

export function githubAppInstallationAuthConfigFromEnv(
  env: GitHubAppInstallationAuthEnv | undefined,
): GitHubAppInstallationAuthConfig {
  const appId = clean(env?.GITHUB_APP_ID);
  const privateKey = normalizeGitHubAppPrivateKey(env?.GITHUB_APP_PRIVATE_KEY);
  return {
    appId,
    privateKey,
    configured: Boolean(appId && privateKey),
  };
}

export class GitHubAppInstallationTokenClient {
  readonly #apiBaseUrl: string;
  readonly #apiVersion: string;
  readonly #createJwt: (request: CreateGitHubAppJwtOptions) => Promise<string>;
  readonly #cryptoProvider: Pick<Crypto, "subtle">;
  readonly #fetchImpl: typeof fetch;
  readonly #nowMs: () => number;

  constructor(options: GitHubAppInstallationTokenClientOptions = {}) {
    this.#apiBaseUrl = trimTrailingSlash(options.apiBaseUrl ?? GITHUB_REST_API_BASE_URL);
    this.#apiVersion = options.apiVersion ?? GITHUB_REST_API_VERSION;
    this.#createJwt = options.createJwt ?? createGitHubAppJwt;
    this.#cryptoProvider = options.cryptoProvider ?? globalThis.crypto;
    this.#fetchImpl = options.fetchImpl ?? defaultFetch;
    this.#nowMs = options.nowMs ?? (() => Date.now());
  }

  createInstallationAccessToken(
    config: GitHubAppInstallationAuthConfig,
    request: CreateInstallationAccessTokenRequest,
  ): Promise<GitHubAppInstallationAccessToken> {
    return runWorkerEffect(
      "github-app.create-installation-token",
      Effect.gen({ self: this }, function* () {
        if (!config.appId || !config.privateKey) {
          return yield* Effect.fail(
            platformError(
              "github-app.create-installation-token",
              "GitHub App ID and private key are required to create installation tokens.",
            ),
          );
        }
        const jwt = yield* Effect.tryPromise({
          try: () =>
            this.#createJwt({
              appId: config.appId!,
              cryptoProvider: this.#cryptoProvider,
              nowMs: this.#nowMs,
              privateKey: config.privateKey!,
            }),
          catch: (cause) => platformError("github-app.create-jwt", cause),
        });
        const body = installationTokenRequestBody(request);
        const encodedBody = body
          ? yield* Schema.encodeEffect(Schema.UnknownFromJsonString)(body)
          : undefined;
        const response = yield* Effect.tryPromise({
          try: () =>
            this.#fetchImpl(
              `${this.#apiBaseUrl}/app/installations/${encodeURIComponent(
                request.installationId,
              )}/access_tokens`,
              {
                body: encodedBody,
                headers: {
                  Accept: GITHUB_REST_ACCEPT,
                  Authorization: `Bearer ${jwt}`,
                  ...(body ? { "Content-Type": "application/json" } : {}),
                  "User-Agent": GITHUB_REST_USER_AGENT,
                  "X-GitHub-Api-Version": this.#apiVersion,
                },
                method: "POST",
              },
            ),
          catch: (cause) => platformError("github-app.request-installation-token", cause),
        });
        const responseBody = yield* Effect.tryPromise({
          try: () => response.json(),
          catch: (cause) => platformError("github-app.decode-installation-token-json", cause),
        });
        if (!response.ok) {
          return yield* Effect.fail(
            platformError(
              "github-app.request-installation-token",
              githubAppTokenErrorMessage(responseBody),
            ),
          );
        }
        const decoded = yield* Schema.decodeUnknownEffect(installationTokenResponseSchema)(
          responseBody,
        );
        return {
          expiresAt: decoded.expires_at,
          permissions: { ...decoded.permissions },
          repositories: decoded.repositories ? [...decoded.repositories] : null,
          repositorySelection: decoded.repository_selection,
          token: decoded.token,
        };
      }),
    );
  }
}

export function createGitHubAppJwt({
  appId,
  cryptoProvider = globalThis.crypto,
  nowMs = () => Date.now(),
  privateKey,
}: CreateGitHubAppJwtOptions) {
  return runWorkerEffect(
    "github-app.create-jwt",
    Effect.gen(function* () {
      const issuedAt = Math.floor(nowMs() / 1000) - 60;
      const payload = { iat: issuedAt, exp: issuedAt + 10 * 60, iss: appId };
      const header = { alg: "RS256", typ: "JWT" };
      const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
      const key = yield* Effect.tryPromise({
        try: () => importPkcs8PrivateKey(privateKey, cryptoProvider),
        catch: (cause) => platformError("github-app.import-private-key", cause),
      });
      const signature = yield* Effect.tryPromise({
        try: () =>
          cryptoProvider.subtle.sign(
            "RSASSA-PKCS1-v1_5",
            key,
            new TextEncoder().encode(signingInput),
          ),
        catch: (cause) => platformError("github-app.sign-jwt", cause),
      });
      return `${signingInput}.${base64UrlBytes(new Uint8Array(signature))}`;
    }),
  );
}

export function normalizeGitHubAppPrivateKey(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\\n/g, "\n");
}

function installationTokenRequestBody(request: CreateInstallationAccessTokenRequest) {
  const body: Record<string, unknown> = {};
  if (request.permissions) body.permissions = request.permissions;
  if (request.repositories) body.repositories = request.repositories;
  if (request.repositoryIds) body.repository_ids = request.repositoryIds;
  return Object.keys(body).length > 0 ? body : null;
}

async function importPkcs8PrivateKey(privateKey: string, cryptoProvider: Pick<Crypto, "subtle">) {
  const keyBytes = pemToPrivateKeyBytes(privateKey);
  return cryptoProvider.subtle.importKey(
    "pkcs8",
    keyBytes,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );
}

function pemToPrivateKeyBytes(privateKey: string) {
  const keyBytes = pemToBytes(privateKey);
  return privateKey.includes("BEGIN RSA PRIVATE KEY")
    ? wrapPkcs1RsaPrivateKeyAsPkcs8(keyBytes)
    : keyBytes;
}

function pemToBytes(privateKey: string) {
  const body = privateKey
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function wrapPkcs1RsaPrivateKeyAsPkcs8(pkcs1Key: Uint8Array) {
  return derSequence([
    new Uint8Array([0x02, 0x01, 0x00]),
    derSequence([
      new Uint8Array([0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01]),
      new Uint8Array([0x05, 0x00]),
    ]),
    derValue(0x04, pkcs1Key),
  ]);
}

function derSequence(parts: Uint8Array[]) {
  return derValue(0x30, concatBytes(parts));
}

function derValue(tag: number, value: Uint8Array) {
  return concatBytes([new Uint8Array([tag]), derLength(value.byteLength), value]);
}

function derLength(length: number) {
  if (length < 0x80) return new Uint8Array([length]);
  const bytes: number[] = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>= 8;
  }
  return new Uint8Array([0x80 | bytes.length, ...bytes]);
}

function concatBytes(parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.byteLength;
  }
  return bytes;
}

function base64UrlJson(value: unknown) {
  return base64UrlBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlBytes(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function githubAppTokenErrorMessage(body: unknown) {
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return "GitHub App installation token request failed.";
}

function clean(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}
