import { describe, expect, it } from "vitest";

import {
  githubFirmwareAppAuthorizeUrl,
  githubFirmwareAppConfigFromEnv,
  githubFirmwareAppInstallUrl,
} from "./config";

describe("GitHub firmware app config", () => {
  it("builds an install URL from the configured app slug and state", () => {
    const config = githubFirmwareAppConfigFromEnv({
      GITHUB_APP_CLIENT_ID: "Iv1.client",
      GITHUB_APP_CLIENT_SECRET: "secret",
      GITHUB_APP_SLUG: "kbui-firmware",
    });

    expect(config.configured).toBe(true);
    expect(config.permissions.administration).toBe("write");
    expect(githubFirmwareAppInstallUrl(config, "state-123")).toBe(
      "https://github.com/apps/kbui-firmware/installations/new?state=state-123",
    );
  });

  it("uses an explicit install URL when provided", () => {
    const config = githubFirmwareAppConfigFromEnv({
      GITHUB_APP_CLIENT_ID: "Iv1.client",
      GITHUB_APP_CLIENT_SECRET: "secret",
      GITHUB_APP_INSTALL_URL: "https://github.com/apps/custom/installations/new?target_id=1",
    });

    expect(githubFirmwareAppInstallUrl(config, "state-456")).toBe(
      "https://github.com/apps/custom/installations/new?target_id=1&state=state-456",
    );
  });

  it("builds the user authorization URL for existing installations", () => {
    const config = githubFirmwareAppConfigFromEnv({
      GITHUB_APP_CLIENT_ID: "Iv1.client",
      GITHUB_APP_CLIENT_SECRET: "secret",
      GITHUB_APP_SLUG: "kbui-firmware",
    });

    const url = new URL(githubFirmwareAppAuthorizeUrl(config, "state-789"));

    expect(url.origin + url.pathname).toBe("https://github.com/login/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("Iv1.client");
    expect(url.searchParams.get("prompt")).toBe("select_account");
    expect(url.searchParams.get("redirect_uri")).toBeNull();
    expect(url.searchParams.get("state")).toBe("state-789");
  });

  it("reports installation-token and user-token storage configuration separately", () => {
    const config = githubFirmwareAppConfigFromEnv({
      GITHUB_APP_CLIENT_ID: "Iv1.client",
      GITHUB_APP_CLIENT_SECRET: "secret",
      GITHUB_APP_ID: "4232738",
      GITHUB_APP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
      GITHUB_APP_SLUG: "kbui-firmware",
      GITHUB_APP_TOKEN_SECRET_KEY: "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
    });

    expect(config.configured).toBe(true);
    expect(config.installationAuthConfigured).toBe(true);
    expect(config.userTokenStorageConfigured).toBe(true);
  });
});
