import { describe, expect, it } from "vitest";

import { GitHubAppOAuthClient } from "./oauth";

describe("GitHub App OAuth client", () => {
  it("exchanges a callback code for a user token", async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const fetchMock = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push([input, init]);
      return Response.json({
        access_token: "ghu_token",
        expires_in: 28800,
        refresh_token: "ghr_refresh",
        refresh_token_expires_in: 15897600,
        token_type: "bearer",
      });
    };
    const client = new GitHubAppOAuthClient({ fetchImpl: fetchMock });

    const token = await client.exchangeUserCode({
      clientId: "Iv1.client",
      clientSecret: "secret",
      code: "code-123",
      redirectUri: "http://127.0.0.1:8787/api/auth/firmware/github/callback",
    });

    expect(token.accessToken).toBe("ghu_token");
    const [, init] = calls[0] ?? [];
    expect(init?.method).toBe("POST");
    const body = init?.body as URLSearchParams;
    expect(body.get("code")).toBe("code-123");
  });

  it("lists installations visible to the GitHub App user token", async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const fetchMock = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push([input, init]);
      return Response.json({
        total_count: 1,
        installations: [
          {
            id: 42,
            account: { login: "jonfonts", type: "User" },
            repository_selection: "selected",
            target_type: "User",
          },
        ],
      });
    };
    const client = new GitHubAppOAuthClient({ fetchImpl: fetchMock });

    const result = await client.listUserInstallations("ghu_token");

    expect(result.installations[0]?.account?.login).toBe("jonfonts");
    expect(calls[0]?.[1]?.headers).toMatchObject({
      Authorization: "Bearer ghu_token",
    });
  });

  it("refreshes an expiring GitHub App user token", async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const fetchMock = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push([input, init]);
      return Response.json({
        access_token: "ghu_refreshed",
        expires_in: 28800,
        refresh_token: "ghr_next",
        refresh_token_expires_in: 15897600,
        token_type: "bearer",
      });
    };
    const client = new GitHubAppOAuthClient({ fetchImpl: fetchMock });

    const token = await client.refreshUserToken({
      clientId: "Iv1.client",
      clientSecret: "secret",
      refreshToken: "ghr_old",
    });

    const [, init] = calls[0] ?? [];
    const body = init?.body as URLSearchParams;
    expect(token.accessToken).toBe("ghu_refreshed");
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("ghr_old");
  });
});
