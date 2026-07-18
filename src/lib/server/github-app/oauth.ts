import { Effect, Schema } from "effect";

import { platformError } from "$lib/effect/errors";
import { runWorkerEffect } from "$lib/effect/worker-runtime";
import {
  GITHUB_REST_ACCEPT,
  GITHUB_REST_API_BASE_URL,
  GITHUB_REST_API_VERSION,
  GITHUB_REST_USER_AGENT,
} from "$lib/server/github/client";

export interface GitHubAppOAuthClientOptions {
  apiBaseUrl?: string;
  fetchImpl?: typeof fetch;
  oauthBaseUrl?: string;
}

export interface ExchangeGitHubAppUserCodeRequest {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri?: string;
}

export interface RefreshGitHubAppUserTokenRequest {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface GitHubAppUserToken {
  accessToken: string;
  expiresIn: number | null;
  refreshToken: string | null;
  refreshTokenExpiresIn: number | null;
  tokenType: string;
}

export interface GitHubAppUserInstallation {
  account: {
    login: string;
    type: string;
  } | null;
  id: number;
  repository_selection: string | null;
  target_type: string | null;
}

export interface ListGitHubAppUserInstallationsResponse {
  installations: GitHubAppUserInstallation[];
  total_count: number;
}

const defaultFetch = (input: RequestInfo | URL, init?: RequestInit) =>
  globalThis.fetch(input, init);

const userTokenSchema = Schema.Struct({
  access_token: Schema.String,
  expires_in: Schema.optionalKey(Schema.Number),
  refresh_token: Schema.optionalKey(Schema.String),
  refresh_token_expires_in: Schema.optionalKey(Schema.Number),
  token_type: Schema.String,
});

const installationsSchema = Schema.Struct({
  installations: Schema.Array(
    Schema.Struct({
      account: Schema.NullOr(Schema.Struct({ login: Schema.String, type: Schema.String })),
      id: Schema.Number,
      repository_selection: Schema.NullOr(Schema.String),
      target_type: Schema.NullOr(Schema.String),
    }),
  ),
  total_count: Schema.Number,
});

export class GitHubAppOAuthClient {
  readonly #apiBaseUrl: string;
  readonly #fetchImpl: typeof fetch;
  readonly #oauthBaseUrl: string;

  constructor(options: GitHubAppOAuthClientOptions = {}) {
    this.#apiBaseUrl = trimTrailingSlash(options.apiBaseUrl ?? GITHUB_REST_API_BASE_URL);
    this.#fetchImpl = options.fetchImpl ?? defaultFetch;
    this.#oauthBaseUrl = trimTrailingSlash(options.oauthBaseUrl ?? "https://github.com");
  }

  exchangeUserCode(request: ExchangeGitHubAppUserCodeRequest): Promise<GitHubAppUserToken> {
    const requestBody = new URLSearchParams({
      client_id: request.clientId,
      client_secret: request.clientSecret,
      code: request.code,
    });
    if (request.redirectUri) requestBody.set("redirect_uri", request.redirectUri);

    return runWorkerEffect(
      "github-app.exchange-user-code",
      this.userTokenRequestEffect(`${this.#oauthBaseUrl}/login/oauth/access_token`, requestBody),
    );
  }

  refreshUserToken(request: RefreshGitHubAppUserTokenRequest): Promise<GitHubAppUserToken> {
    const requestBody = new URLSearchParams({
      client_id: request.clientId,
      client_secret: request.clientSecret,
      grant_type: "refresh_token",
      refresh_token: request.refreshToken,
    });

    return runWorkerEffect(
      "github-app.refresh-user-token",
      this.userTokenRequestEffect(`${this.#oauthBaseUrl}/login/oauth/access_token`, requestBody),
    );
  }

  listUserInstallations(token: string): Promise<ListGitHubAppUserInstallationsResponse> {
    return runWorkerEffect(
      "github-app.list-user-installations",
      Effect.gen({ self: this }, function* () {
        const response = yield* Effect.tryPromise({
          try: () =>
            this.#fetchImpl(`${this.#apiBaseUrl}/user/installations`, {
              headers: {
                Accept: GITHUB_REST_ACCEPT,
                Authorization: `Bearer ${token}`,
                "User-Agent": GITHUB_REST_USER_AGENT,
                "X-GitHub-Api-Version": GITHUB_REST_API_VERSION,
              },
              method: "GET",
            }),
          catch: (cause) => platformError("github-app.list-user-installations", cause),
        });
        const body = yield* Effect.tryPromise({
          try: () => response.json(),
          catch: (cause) => platformError("github-app.decode-installations", cause),
        });
        if (!response.ok) {
          return yield* Effect.fail(
            platformError("github-app.list-user-installations", githubOAuthErrorMessage(body)),
          );
        }
        const decoded = yield* Schema.decodeUnknownEffect(installationsSchema)(body);
        return {
          installations: decoded.installations.map((installation) => ({
            ...installation,
            account: installation.account ? { ...installation.account } : null,
          })),
          total_count: decoded.total_count,
        };
      }),
    );
  }

  private userTokenRequestEffect(url: string, requestBody: URLSearchParams) {
    return Effect.gen({ self: this }, function* () {
      const response = yield* Effect.tryPromise({
        try: () =>
          this.#fetchImpl(url, {
            body: requestBody,
            headers: {
              Accept: "application/json",
              "Content-Type": "application/x-www-form-urlencoded",
              "User-Agent": GITHUB_REST_USER_AGENT,
            },
            method: "POST",
          }),
        catch: (cause) => platformError("github-app.user-token-request", cause),
      });
      const body = yield* Effect.tryPromise({
        try: () => response.json(),
        catch: (cause) => platformError("github-app.decode-user-token", cause),
      });
      if (!response.ok) {
        return yield* Effect.fail(
          platformError("github-app.user-token-request", githubOAuthErrorMessage(body)),
        );
      }
      const decoded = yield* Schema.decodeUnknownEffect(userTokenSchema)(body);
      return {
        accessToken: decoded.access_token,
        expiresIn: decoded.expires_in ?? null,
        refreshToken: decoded.refresh_token ?? null,
        refreshTokenExpiresIn: decoded.refresh_token_expires_in ?? null,
        tokenType: decoded.token_type,
      } satisfies GitHubAppUserToken;
    });
  }
}

function githubOAuthErrorMessage(body: unknown) {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    for (const field of ["error_description", "message", "error"]) {
      const value = record[field];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return "GitHub App authorization failed.";
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}
