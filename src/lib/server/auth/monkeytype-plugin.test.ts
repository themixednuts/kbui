import { betterAuth } from "better-auth";
import { memoryAdapter } from "better-auth/adapters/memory";
import { describe, expect, it } from "vite-plus/test";

import { DEFAULT_MONKEYTYPE_MODE, DEFAULT_MONKEYTYPE_MODE2 } from "$lib/monkeytype/types";
import { monkeytypePlugin } from "./monkeytype-plugin";

describe("Monkeytype better-auth plugin", () => {
  it("rejects unauthenticated status callers", async () => {
    const auth = createTestAuth();
    const response = await auth.handler(new Request("http://localhost/api/auth/monkeytype/status"));

    expect(response.status).toBe(401);
  });

  it("returns connection status without encrypted ApeKey fields", async () => {
    const auth = createTestAuth();
    const { cookie, userId } = await signIn(auth);
    const context = await auth.$context;
    const summary = {
      wpm: 98,
      accuracy: 96.4,
      consistency: 82,
      tests: 1240,
      pb: 121,
      mode: DEFAULT_MONKEYTYPE_MODE,
      mode2: DEFAULT_MONKEYTYPE_MODE2,
      resultCount: 1,
      generatedAt: "2026-07-04T12:00:00.000Z",
      stale: false,
      error: null,
    };

    await context.adapter.create({
      model: "monkeytypeConnection",
      data: {
        userId,
        apeKeyCiphertext: "encrypted-key-ciphertext",
        apeKeyIv: "encrypted-key-iv",
        username: "monkey_user",
        mode: DEFAULT_MONKEYTYPE_MODE,
        mode2: DEFAULT_MONKEYTYPE_MODE2,
        summaryJson: JSON.stringify(summary),
        lastSyncedAt: new Date("2026-07-04T12:00:00.000Z"),
        rateLimitResetAt: null,
        createdAt: new Date("2026-07-04T12:00:00.000Z"),
        updatedAt: new Date("2026-07-04T12:00:00.000Z"),
      },
    });

    const response = await auth.handler(
      new Request("http://localhost/api/auth/monkeytype/status", {
        headers: { cookie },
      }),
    );
    const body = (await response.json()) as Record<string, unknown>;
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.connected).toBe(true);
    expect(body.username).toBe("monkey_user");
    expect(serialized).not.toContain("encrypted-key-ciphertext");
    expect(serialized).not.toContain("encrypted-key-iv");
    expect(serialized).not.toContain("apeKey");
    expect(serialized).not.toContain("ApeKey");
  });

  it("returns a setup error instead of 500 when the encryption secret is missing", async () => {
    const auth = createTestAuth({ secretKey: "" });
    const { cookie } = await signIn(auth);

    const response = await auth.handler(
      new Request("http://localhost/api/auth/monkeytype/connect", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify({
          apeKey: "local-test-ape-key",
        }),
      }),
    );
    const body = (await response.json()) as { code?: string; message?: string };

    expect(response.status).toBe(503);
    expect(body.code).toBe("MONKEYTYPE_SECRET_NOT_CONFIGURED");
    expect(body.message).toContain("MONKEYTYPE_SECRET_KEY");
  });
});

function createTestAuth({ secretKey = testSecret() }: { secretKey?: string } = {}) {
  return betterAuth({
    baseURL: "http://localhost",
    secret: "better-auth-secret-for-monkeytype-plugin-tests",
    database: memoryAdapter({
      user: [],
      session: [],
      account: [],
      verification: [],
      monkeytypeConnection: [],
    }),
    emailAndPassword: { enabled: true },
    rateLimit: { enabled: false },
    plugins: [
      monkeytypePlugin({
        secretKey,
        nowMs: () => new Date("2026-07-04T13:00:00.000Z").getTime(),
      }),
    ],
  });
}

async function signIn(auth: ReturnType<typeof createTestAuth>) {
  const signUp = await auth.handler(
    new Request("http://localhost/api/auth/sign-up/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Test User",
        email: "test@example.com",
        password: "test-password-123",
      }),
    }),
  );
  expect(signUp.status).toBe(200);

  const signInResponse = await auth.handler(
    new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "test@example.com",
        password: "test-password-123",
      }),
    }),
  );
  expect(signInResponse.status).toBe(200);

  const body = (await signInResponse.json()) as { user: { id: string } };
  const setCookie = signInResponse.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0];
  expect(cookie).toContain("better-auth.session_token=");

  return {
    cookie,
    userId: body.user.id,
  };
}

function testSecret() {
  const bytes = new Uint8Array(32);
  bytes.fill(9);
  return btoa(String.fromCharCode(...bytes));
}
