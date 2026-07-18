import { describe, expect, it } from "vitest";

import { canonicalLoopbackUrl } from "./canonical-origin";

describe("canonicalLoopbackUrl", () => {
  it("redirects alternate local hosts to the configured auth origin", () => {
    const redirectUrl = canonicalLoopbackUrl(
      new URL("http://localhost:8787/settings?tab=auth"),
      "http://127.0.0.1:8787",
    );

    expect(redirectUrl?.toString()).toBe("http://127.0.0.1:8787/settings?tab=auth");
  });

  it("keeps the configured origin in place", () => {
    const redirectUrl = canonicalLoopbackUrl(
      new URL("http://127.0.0.1:8787/settings"),
      "http://127.0.0.1:8787",
    );

    expect(redirectUrl).toBeNull();
  });
});
