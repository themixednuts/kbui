import { describe, expect, it } from "vite-plus/test";

import { workflowRetryDelay } from "./cloudflare-workflow-retry";

describe("Cloudflare Workflow retry delay", () => {
  const delay = workflowRetryDelay({ baseDelayMs: 2_000, maxDelayMs: 300_000 });

  it("uses durable attempt context for exponential spacing", () => {
    expect(delay({ ctx: { attempt: 1 }, error: new Error("network reset") })).toBe(2_000);
    expect(delay({ ctx: { attempt: 4 }, error: new Error("network reset") })).toBe(16_000);
  });

  it("honors provider Retry-After guidance within the configured cap", () => {
    expect(delay({ ctx: { attempt: 1 }, error: new Error("Retry-After: 45") })).toBe(45_000);
    expect(delay({ ctx: { attempt: 1 }, error: new Error("retry-after=900") })).toBe(300_000);
  });

  it("backs off rate limits more aggressively", () => {
    expect(delay({ ctx: { attempt: 1 }, error: new Error("GitHub returned 429") })).toBe(30_000);
  });
});
