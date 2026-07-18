import { describe, expect, it } from "vite-plus/test";

import {
  decryptGitHubAppUserAccessToken,
  decryptGitHubAppUserRefreshToken,
  encryptGitHubAppUserToken,
  githubAppUserTokenSecretFor,
  githubAppUserTokenSecretsFor,
} from "./user-token-store";

const secret = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";

describe("GitHub App user token storage", () => {
  it("encrypts user and refresh tokens with expiry metadata", async () => {
    const encrypted = await encryptGitHubAppUserToken(
      {
        accessToken: "ghu_user_access",
        expiresIn: 28800,
        refreshToken: "ghr_refresh",
        refreshTokenExpiresIn: 15897600,
        tokenType: "bearer",
      },
      secret,
      new Date("2026-07-06T12:00:00.000Z").getTime(),
    );

    expect(encrypted.accessTokenCiphertext).not.toContain("ghu_user_access");
    expect(encrypted.refreshTokenCiphertext).not.toContain("ghr_refresh");
    expect(encrypted.accessTokenExpiresAt?.toISOString()).toBe("2026-07-06T20:00:00.000Z");
    expect(encrypted.refreshTokenExpiresAt?.toISOString()).toBe("2027-01-06T12:00:00.000Z");
    await expect(
      decryptGitHubAppUserAccessToken(
        {
          accessTokenCiphertext: encrypted.accessTokenCiphertext ?? "",
          accessTokenIv: encrypted.accessTokenIv ?? "",
        },
        secret,
      ),
    ).resolves.toBe("ghu_user_access");
    await expect(
      decryptGitHubAppUserRefreshToken(
        {
          refreshTokenCiphertext: encrypted.refreshTokenCiphertext ?? "",
          refreshTokenIv: encrypted.refreshTokenIv ?? "",
        },
        secret,
      ),
    ).resolves.toBe("ghr_refresh");
  });

  it("uses only the GitHub-specific token secret", () => {
    expect(
      githubAppUserTokenSecretFor({
        GITHUB_APP_TOKEN_SECRET_KEY: secret,
      }),
    ).toBe(secret);
    expect(
      githubAppUserTokenSecretFor({
        GITHUB_APP_TOKEN_SECRET_KEY: undefined,
      }),
    ).toBeNull();
  });

  it("does not treat the Monkeytype integration key as GitHub token storage", () => {
    expect(
      githubAppUserTokenSecretsFor({
        GITHUB_APP_TOKEN_SECRET_KEY: undefined,
      }),
    ).toEqual([]);
  });
});
