import type {
  GitHubFirmwareAppPermissionSummary,
  GitHubFirmwareAppStatus,
} from "$lib/github-app/types";
import { githubAppInstallationAuthConfigFromEnv } from "$lib/server/github-app/installation-token";

export interface GitHubFirmwareAppEnv {
  BETTER_AUTH_URL?: string;
  GITHUB_APP_ID?: string;
  GITHUB_APP_CLIENT_ID?: string;
  GITHUB_APP_CLIENT_SECRET?: string;
  GITHUB_APP_INSTALL_URL?: string;
  GITHUB_APP_PRIVATE_KEY?: string;
  GITHUB_APP_SLUG?: string;
  GITHUB_APP_TOKEN_SECRET_KEY?: string;
  MONKEYTYPE_SECRET_KEY?: string;
}

export interface GitHubFirmwareAppConfig {
  appName: string;
  appSlug: string | null;
  callbackPath: "/api/auth/firmware/github/callback";
  clientId: string | null;
  clientSecret: string | null;
  configured: boolean;
  installationAuthConfigured: boolean;
  installUrl: string | null;
  permissions: GitHubFirmwareAppPermissionSummary;
  userTokenStorageConfigured: boolean;
}

export const githubFirmwareAppCallbackPath = "/api/auth/firmware/github/callback" as const;
export const githubFirmwareAppSettingsPath = "/settings" as const;

export function githubFirmwareAppConfigFromEnv(
  env: GitHubFirmwareAppEnv | undefined,
): GitHubFirmwareAppConfig {
  const appSlug = clean(env?.GITHUB_APP_SLUG);
  const installUrl =
    clean(env?.GITHUB_APP_INSTALL_URL) ??
    (appSlug ? `https://github.com/apps/${encodeURIComponent(appSlug)}/installations/new` : null);
  const clientId = clean(env?.GITHUB_APP_CLIENT_ID);
  const clientSecret = clean(env?.GITHUB_APP_CLIENT_SECRET);
  const installationAuth = githubAppInstallationAuthConfigFromEnv(env);
  const userTokenStorageConfigured = Boolean(clean(env?.GITHUB_APP_TOKEN_SECRET_KEY));

  return {
    appName: "kbui firmware builder",
    appSlug,
    callbackPath: githubFirmwareAppCallbackPath,
    clientId,
    clientSecret,
    configured: Boolean(installUrl && clientId && clientSecret),
    installationAuthConfigured: installationAuth.configured,
    installUrl,
    permissions: {
      actions: "write",
      administration: "write",
      contents: "write",
      metadata: "read",
      workflows: "write",
    },
    userTokenStorageConfigured,
  };
}

export function githubFirmwareAppInstallUrl(
  config: GitHubFirmwareAppConfig,
  state: string,
): string {
  if (!config.installUrl) {
    throw new Error("GitHub App install URL is not configured.");
  }

  const url = new URL(config.installUrl);
  url.searchParams.set("state", state);
  return url.toString();
}

export function githubFirmwareAppAuthorizeUrl(
  config: GitHubFirmwareAppConfig,
  state: string,
): string {
  if (!config.clientId) {
    throw new Error("GitHub App client ID is not configured.");
  }

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("state", state);
  return url.toString();
}

export function githubFirmwareAppCallbackUrl(
  config: GitHubFirmwareAppConfig,
  requestUrl: string,
): string {
  const origin = configuredOrigin(requestUrl);
  return new URL(config.callbackPath, origin).toString();
}

export function disconnectedGitHubFirmwareAppStatus(
  config: GitHubFirmwareAppConfig,
): GitHubFirmwareAppStatus {
  return {
    appName: config.appName,
    appSlug: config.appSlug,
    configured: config.configured,
    connected: false,
    installUrl: null,
    installation: null,
    message: config.configured
      ? "Install the GitHub App to let kbui maintain a firmware repository."
      : "Configure GITHUB_APP_SLUG, GITHUB_APP_CLIENT_ID, and GITHUB_APP_CLIENT_SECRET.",
    permissions: config.permissions,
    state: config.configured ? "not-connected" : "unconfigured",
    tokenState: "unavailable",
  };
}

function configuredOrigin(requestUrl: string) {
  return new URL(requestUrl).origin;
}

function clean(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
