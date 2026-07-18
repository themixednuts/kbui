import { base64Url } from "@better-auth/utils/base64";
import { createHMAC } from "@better-auth/utils/hmac";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { readSessionFromCookieCache } from "./session-cookie";

const secret = "test-better-auth-secret-value";
const secureCookieName = "__Secure-better-auth.session_data";
const env = { BETTER_AUTH_SECRET: secret, BETTER_AUTH_URL: "https://kb.example" };

function requestWithCookie(cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new Request("https://kb.example/", { headers });
}

function run(request: Request) {
  return Effect.runPromise(readSessionFromCookieCache(request, env));
}

/** Mirrors better-auth's compact `setCookieCache` encoding (index.mjs). */
async function encodeCompactCookie(
  sessionData: { session: unknown; user: unknown },
  expiresAt: number,
  signature: string,
) {
  return base64Url.encode(JSON.stringify({ session: sessionData, expiresAt, signature }), {
    padding: false,
  });
}

describe("readSessionFromCookieCache", () => {
  it("returns null when the request carries no cookie header", async () => {
    expect(await run(requestWithCookie())).toBeNull();
  });

  it("returns null for a forged session_data cookie (bad signature)", async () => {
    const sessionData = {
      session: { id: "sess_forged", userId: "user_forged" },
      user: { id: "user_forged" },
    };
    const value = await encodeCompactCookie(
      sessionData,
      Date.now() + 60_000,
      "this-is-not-a-valid-hmac-signature",
    );
    expect(await run(requestWithCookie(`${secureCookieName}=${value}`))).toBeNull();
  });

  it("verifies and returns a validly-signed session snapshot", async () => {
    const sessionData = {
      session: {
        id: "sess_valid",
        userId: "user_valid",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      user: { id: "user_valid", email: "user@example.com" },
    };
    const expiresAt = Date.now() + 60_000;
    const signature = await createHMAC("SHA-256", "base64urlnopad").sign(
      secret,
      JSON.stringify({ ...sessionData, expiresAt }),
    );
    const value = await encodeCompactCookie(sessionData, expiresAt, signature);

    const result = await run(requestWithCookie(`${secureCookieName}=${value}`));
    expect(result).not.toBeNull();
    expect(result?.user?.id).toBe("user_valid");
    expect(result?.session?.id).toBe("sess_valid");
  });
});
