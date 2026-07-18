import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

// $env/dynamic/private is a virtual SvelteKit module; mock it directly so each
// test can configure (or omit) a GitHub token explicitly instead of depending
// on ambient process.env state.
const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("$env/dynamic/private", () => ({ env: mockEnv }));

// Minimal VIA v3 definition: one keymap row producing two keys plus the
// mandatory USB identity. parseViaDefinition ignores anything else.
const viaDefinition = {
  name: "Test Board",
  vendorId: "0x1234",
  productId: "0x5678",
  matrix: { rows: 1, cols: 2 },
  layouts: { keymap: [["0,0", "0,1"]] },
};

// GitHub archives nest every file under a `<repo>-<ref>/` root directory.
// archiveDefinitionPath keys off the `/v3/` marker, so the definition lands at
// catalog id "test/board".
function viaZipball(root: string) {
  return zipSync({
    [`${root}/v3/test/board.json`]: strToU8(JSON.stringify(viaDefinition)),
  });
}

// Each test needs a fresh module instance because via-source.ts memoizes the
// catalog build (and its resolved ref) at module scope.
async function freshViaSource() {
  vi.resetModules();
  return import("./via-source");
}

describe("loadViaKeyboardDetail", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete mockEnv.VIA_GITHUB_TOKEN;
    delete mockEnv.GITHUB_TOKEN;
  });

  it("returns the VIA entry without building the QMK USB index and degrades QMK metadata gracefully", async () => {
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      requestedUrls.push(url);

      if (url.startsWith("https://codeload.github.com/the-via/keyboards/legacy.zip/")) {
        return new Response(viaZipball("the-via-keyboards-abc1234"), { status: 200 });
      }
      // The QMK USB index (keyboards.json) must never be fetched from the detail
      // path — that multi-megabyte parse is what pushed the request over the CPU
      // limit. Fail loudly if the code regresses and requests it.
      if (url.includes("keyboards.qmk.fm/v1/keyboards.json")) {
        throw new Error("regression: detail path rebuilt the QMK USB index");
      }
      // Path-based QMK info lookups return a malformed body -> a non-retryable
      // parse error, exercising the graceful-degradation path.
      if (url.includes("keyboards.qmk.fm/v1/keyboards/")) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { loadViaKeyboardDetail } = await freshViaSource();
    const detail = await loadViaKeyboardDetail("test/board");

    expect(detail.id).toBe("test/board");
    expect(detail.name).toBe("Test Board");
    expect(detail.keys).toHaveLength(2);
    // QMK resolution failed, but the VIA entry is still returned with no metadata.
    expect(detail.firmwareMetadata).toBeUndefined();
    // The expensive USB-index catalog was never requested.
    expect(requestedUrls.some((url) => url.includes("keyboards.qmk.fm/v1/keyboards.json"))).toBe(
      false,
    );
  });

  it("without a GitHub token, fetches the archive from codeload and derives the revision from its root directory", async () => {
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      requestedUrls.push(url);

      if (url.startsWith("https://codeload.github.com/the-via/keyboards/legacy.zip/")) {
        return new Response(viaZipball("the-via-keyboards-abc1234"), { status: 200 });
      }
      // Production has no VIA_GITHUB_TOKEN/GITHUB_TOKEN secret, so the
      // unauthenticated core API's shared 60 req/hr limit routinely 403s. The
      // tokenless catalog build must never touch api.github.com at all.
      if (url.includes("api.github.com")) {
        throw new Error(`regression: unauthenticated catalog build hit the GitHub REST API: ${url}`);
      }
      if (url.includes("keyboards.qmk.fm/v1/keyboards.json")) {
        throw new Error("regression: detail path rebuilt the QMK USB index");
      }
      if (url.includes("keyboards.qmk.fm/v1/keyboards/")) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { loadViaKeyboardDetail } = await freshViaSource();
    const detail = await loadViaKeyboardDetail("test/board");

    expect(detail.id).toBe("test/board");
    // The commit sha is read off the archive's `the-via-keyboards-<sha>/` root
    // directory instead of a separate (rate-limited) commits API call.
    expect(detail.sourceRevision).toBe("abc1234");
    expect(
      requestedUrls.some((url) =>
        url.startsWith("https://codeload.github.com/the-via/keyboards/legacy.zip/"),
      ),
    ).toBe(true);
    expect(requestedUrls.some((url) => url.includes("api.github.com"))).toBe(false);
  });

  it("with a GitHub token configured, resolves the revision via the commits API and fetches the pinned zipball", async () => {
    mockEnv.VIA_GITHUB_TOKEN = "test-token";
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      requestedUrls.push(url);

      if (url === "https://api.github.com/repos/the-via/keyboards/commits/master") {
        const headers = init?.headers as Record<string, string> | undefined;
        expect(headers?.Authorization).toBe("Bearer test-token");
        return new Response(JSON.stringify({ sha: "pinnedsha1234567" }), { status: 200 });
      }
      if (url === "https://api.github.com/repos/the-via/keyboards/zipball/pinnedsha1234567") {
        return new Response(viaZipball("the-via-keyboards-pinnedsha"), { status: 200 });
      }
      if (url.startsWith("https://codeload.github.com/")) {
        throw new Error(`regression: authenticated catalog build fell back to codeload: ${url}`);
      }
      if (url.includes("keyboards.qmk.fm/v1/keyboards.json")) {
        throw new Error("regression: detail path rebuilt the QMK USB index");
      }
      if (url.includes("keyboards.qmk.fm/v1/keyboards/")) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { loadViaKeyboardDetail } = await freshViaSource();
    const detail = await loadViaKeyboardDetail("test/board");

    expect(detail.sourceRevision).toBe("pinnedsha1234567");
    expect(
      requestedUrls.some(
        (url) => url === "https://api.github.com/repos/the-via/keyboards/commits/master",
      ),
    ).toBe(true);
  });

  it("falls back to the codeload archive when the authenticated revision lookup fails", async () => {
    mockEnv.VIA_GITHUB_TOKEN = "test-token";
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      requestedUrls.push(url);

      if (url === "https://api.github.com/repos/the-via/keyboards/commits/master") {
        // A rate-limited (non-retryable) failure of the commits API call.
        return new Response("forbidden", { status: 403 });
      }
      if (url.startsWith("https://codeload.github.com/the-via/keyboards/legacy.zip/")) {
        return new Response(viaZipball("the-via-keyboards-fedcba9"), { status: 200 });
      }
      if (url.startsWith("https://api.github.com/repos/the-via/keyboards/zipball/")) {
        throw new Error("regression: fetched the authenticated zipball without a resolved ref");
      }
      if (url.includes("keyboards.qmk.fm/v1/keyboards.json")) {
        throw new Error("regression: detail path rebuilt the QMK USB index");
      }
      if (url.includes("keyboards.qmk.fm/v1/keyboards/")) {
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { loadViaKeyboardDetail } = await freshViaSource();
    const detail = await loadViaKeyboardDetail("test/board");

    expect(detail.sourceRevision).toBe("fedcba9");
  });
});
