import { describe, expect, it } from "vite-plus/test";

import {
  createGitHubAppJwt,
  GitHubAppInstallationTokenClient,
  githubAppInstallationAuthConfigFromEnv,
  normalizeGitHubAppPrivateKey,
} from "./installation-token";

describe("GitHub App installation tokens", () => {
  it("requests a scoped installation token with an app JWT", async () => {
    const calls: Array<[RequestInfo | URL, RequestInit | undefined]> = [];
    const fetchMock = async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push([input, init]);
      return Response.json({
        token: "ghs_installation_token",
        expires_at: "2026-07-06T13:00:00Z",
        repository_selection: "selected",
        permissions: {
          actions: "write",
          contents: "write",
        },
        repositories: [
          {
            id: 1,
            name: "kbui-firmware",
            full_name: "themixednuts/kbui-firmware",
          },
        ],
      });
    };
    const client = new GitHubAppInstallationTokenClient({
      createJwt: async () => "app.jwt",
      fetchImpl: fetchMock,
    });

    const token = await client.createInstallationAccessToken(
      {
        appId: "4232738",
        configured: true,
        privateKey: "private-key",
      },
      {
        installationId: "144856631",
        permissions: {
          actions: "write",
          contents: "write",
          workflows: "write",
        },
        repositories: ["kbui-firmware"],
      },
    );

    const [input, init] = calls[0] ?? [];
    expect(requestUrl(input)).toBe(
      "https://api.github.com/app/installations/144856631/access_tokens",
    );
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer app.jwt",
    });
    expect(requestBodyJson(init?.body)).toEqual({
      permissions: {
        actions: "write",
        contents: "write",
        workflows: "write",
      },
      repositories: ["kbui-firmware"],
    });
    expect(token.token).toBe("ghs_installation_token");
    expect(token.repositories?.[0]?.full_name).toBe("themixednuts/kbui-firmware");
  });

  it("normalizes escaped PEM values from .dev.vars", () => {
    expect(
      normalizeGitHubAppPrivateKey("-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----"),
    ).toBe("-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----");
    expect(
      githubAppInstallationAuthConfigFromEnv({
        GITHUB_APP_ID: "4232738",
        GITHUB_APP_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----",
      }),
    ).toMatchObject({
      appId: "4232738",
      configured: true,
    });
  });

  it("creates a signed JWT with the GitHub App ID as issuer", async () => {
    const keyPair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    const pkcs8 = await crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
    const privateKey = pkcs8ToPem(new Uint8Array(pkcs8));

    const jwt = await createGitHubAppJwt({
      appId: "4232738",
      nowMs: () => new Date("2026-07-06T12:00:00.000Z").getTime(),
      privateKey,
    });
    const [header, payload, signature] = jwt.split(".");

    expect(JSON.parse(base64UrlDecode(header ?? ""))).toMatchObject({
      alg: "RS256",
      typ: "JWT",
    });
    expect(JSON.parse(base64UrlDecode(payload ?? ""))).toMatchObject({
      exp: 1783339740,
      iat: 1783339140,
      iss: "4232738",
    });
    expect(signature?.length).toBeGreaterThan(40);
  });

  it("accepts GitHub App PEM downloads that use RSA PRIVATE KEY headers", async () => {
    const { generateKeyPairSync } = await import("node:crypto");
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicExponent: 0x10001,
    });
    const pkcs1Pem = privateKey.export({
      format: "pem",
      type: "pkcs1",
    }) as string;

    const jwt = await createGitHubAppJwt({
      appId: "4232738",
      nowMs: () => new Date("2026-07-06T12:00:00.000Z").getTime(),
      privateKey: pkcs1Pem,
    });

    expect(pkcs1Pem).toContain("BEGIN RSA PRIVATE KEY");
    expect(jwt.split(".")).toHaveLength(3);
  });
});

function pkcs8ToPem(bytes: Uint8Array) {
  const base64 = bytesToBase64(bytes);
  const lines = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----`;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

function requestUrl(input: RequestInfo | URL | undefined) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input?.url ?? "";
}

function requestBodyJson(body: BodyInit | null | undefined) {
  expect(typeof body).toBe("string");
  return JSON.parse(body as string) as unknown;
}
