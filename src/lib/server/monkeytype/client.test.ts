import { describe, expect, it } from "vite-plus/test";

import {
  MonkeytypeApiClient,
  monkeytypeErrorFromResponse,
  readMonkeytypeRateLimit,
} from "./client";

describe("Monkeytype API client", () => {
  it("sends ApeKey authorization only from the server client", async () => {
    let authorization: string | null = null;
    const client = new MonkeytypeApiClient({
      nowMs: () => 1_000,
      fetchImpl: async (_url, init) => {
        authorization = new Headers(init?.headers).get("authorization");
        return Response.json({ data: { completedTests: 1 } });
      },
    });

    await client.stats("test-ape-key");

    expect(authorization).toBe("ApeKey test-ape-key");
  });

  it("normalizes ApeKey error codes and rate-limit reset headers", () => {
    const headers = new Headers({
      "x-ratelimit-limit": "60",
      "x-ratelimit-remaining": "0",
      "x-ratelimit-reset": "60",
    });
    const rateLimit = readMonkeytypeRateLimit(headers, 1_000);
    const invalid = monkeytypeErrorFromResponse(470, { message: "invalid" }, rateLimit);
    const limited = monkeytypeErrorFromResponse(479, { message: "limited" }, rateLimit);

    expect(rateLimit).toMatchObject({
      limit: 60,
      remaining: 0,
      rawReset: "60",
    });
    expect(rateLimit.resetAt).toBe("1970-01-01T00:01:01.000Z");
    expect(invalid.code).toBe("MONKEYTYPE_INVALID_APE_KEY");
    expect(invalid.status).toBe(470);
    expect(limited.code).toBe("MONKEYTYPE_APE_KEY_RATE_LIMITED");
  });
});
