import { describe, expect, it } from "vitest";

import {
  cacheControlFor,
  isPublicCatalogRequest,
  publicCatalogRemoteQueries,
} from "./http-cache";

const publicPolicy = "public, max-age=60, s-maxage=900, stale-while-revalidate=3600";

function response(status: number, headers: Record<string, string> = {}) {
  return new Response(null, { status, headers });
}

describe("cacheControlFor default-deny", () => {
  it("stamps private, no-store on an unheadered 200 HTML response", () => {
    const result = cacheControlFor(
      "/settings",
      response(200, { "content-type": "text/html; charset=utf-8" }),
    );
    expect(result).toBe("private, no-store");
  });

  it("stamps private, no-store on an unheadered 200 JSON response", () => {
    const result = cacheControlFor(
      "/api/agent/whatever",
      response(200, { "content-type": "application/json" }),
    );
    expect(result).toBe("private, no-store");
  });

  it("leaves a response that already declares Cache-Control untouched", () => {
    const result = cacheControlFor(
      "/whatever",
      response(200, { "cache-control": "private, no-store" }),
    );
    expect(result).toBeUndefined();
  });
});

describe("cacheControlFor catalog allowlist", () => {
  for (const name of publicCatalogRemoteQueries) {
    it(`promotes ${name} 200 responses to the public policy`, () => {
      const result = cacheControlFor(`/_app/remote/1a2b3c/${name}`, response(200));
      expect(result).toBe(publicPolicy);
    });
  }

  it("does not promote a non-200 catalog response", () => {
    const result = cacheControlFor("/_app/remote/1a2b3c/getViaKeyboardIndex", response(500));
    expect(result).toBe("private, no-store");
  });

  it("does not match a personalized remote query name", () => {
    expect(isPublicCatalogRequest("/_app/remote/1a2b3c/listCommunityKeymaps")).toBe(false);
    expect(isPublicCatalogRequest("/_app/remote/1a2b3c/getTypingRuns")).toBe(false);
    expect(cacheControlFor("/_app/remote/1a2b3c/getTypingRuns", response(200))).toBe(
      "private, no-store",
    );
  });
});

describe("isPublicCatalogRequest", () => {
  it("matches a realistic remote-function path", () => {
    expect(isPublicCatalogRequest("/_app/remote/1a2b3c/getViaKeyboardDetail")).toBe(true);
  });

  it("matches even behind a base path (marker anywhere)", () => {
    expect(isPublicCatalogRequest("/kb/_app/remote/deadbeef/resolveZmkTarget")).toBe(true);
  });

  it("rejects a bare marker without a hash segment", () => {
    expect(isPublicCatalogRequest("/_app/remote/getViaKeyboardIndex")).toBe(false);
  });

  it("rejects non-remote paths", () => {
    expect(isPublicCatalogRequest("/settings")).toBe(false);
    expect(isPublicCatalogRequest("/getViaKeyboardIndex")).toBe(false);
  });
});
