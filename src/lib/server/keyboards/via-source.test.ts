import { strToU8, zipSync } from "fflate";
import { ConfigProvider, Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { QmkTargetCache, qmkTargetCacheLayer } from "./qmk-target";

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

function requestUrl(input: RequestInfo | URL) {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

// Each test needs a fresh module instance because via-source.ts owns isolate-
// local Effect Cache handles for the catalog and detail metadata.
async function freshViaSource() {
  vi.resetModules();
  return import("./via-source");
}

function provideConfig<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  values: Record<string, string | undefined> = {},
) {
  return effect.pipe(
    Effect.provideService(ConfigProvider.ConfigProvider, ConfigProvider.fromUnknown(values)),
  );
}

function runViaEffect<A, E>(
  effect: Effect.Effect<A, E, QmkTargetCache>,
  values: Record<string, string | undefined> = {},
) {
  return Effect.runPromise(provideConfig(effect, values).pipe(Effect.provide(qmkTargetCacheLayer)));
}

describe("VIA catalog source", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the VIA entry without building the QMK USB index and retries failed QMK metadata on the next request", async () => {
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
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

    const { loadViaKeyboardDetailEffect } = await freshViaSource();
    const first = await runViaEffect(loadViaKeyboardDetailEffect("test/board"));
    const second = await runViaEffect(loadViaKeyboardDetailEffect("test/board"));

    expect(first.id).toBe("test/board");
    expect(first.name).toBe("Test Board");
    expect(first.keys).toHaveLength(2);
    // QMK resolution failed, but the VIA entry is still returned with no metadata.
    expect(first.firmwareMetadata).toBeUndefined();
    expect(second.firmwareMetadata).toBeUndefined();
    // Failed metadata has a zero cache TTL, so the next detail request gets a
    // real retry instead of a 15-minute negative cache entry.
    expect(
      requestedUrls.filter((url) => url.includes("keyboards.qmk.fm/v1/keyboards/")),
    ).toHaveLength(2);
    // The expensive USB-index catalog was never requested.
    expect(requestedUrls.some((url) => url.includes("keyboards.qmk.fm/v1/keyboards.json"))).toBe(
      false,
    );
  });

  it("without a GitHub token, fetches the archive from codeload and derives the revision from its root directory", async () => {
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      requestedUrls.push(url);

      if (url.startsWith("https://codeload.github.com/the-via/keyboards/legacy.zip/")) {
        return new Response(viaZipball("the-via-keyboards-abc1234"), { status: 200 });
      }
      // Production has no VIA_GITHUB_TOKEN/GITHUB_TOKEN secret, so the
      // unauthenticated core API's shared 60 req/hr limit routinely 403s. The
      // tokenless catalog build must never touch api.github.com at all.
      if (url.includes("api.github.com")) {
        throw new Error(
          `regression: unauthenticated catalog build hit the GitHub REST API: ${url}`,
        );
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

    const { loadViaKeyboardDetailEffect } = await freshViaSource();
    const detail = await runViaEffect(loadViaKeyboardDetailEffect("test/board"));

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
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
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

    const { loadViaKeyboardDetailEffect } = await freshViaSource();
    const detail = await runViaEffect(loadViaKeyboardDetailEffect("test/board"), {
      VIA_GITHUB_TOKEN: "test-token",
    });

    expect(detail.sourceRevision).toBe("pinnedsha1234567");
    expect(
      requestedUrls.some(
        (url) => url === "https://api.github.com/repos/the-via/keyboards/commits/master",
      ),
    ).toBe(true);
  });

  it("falls back to the codeload archive when the authenticated revision lookup fails", async () => {
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      requestedUrls.push(url);

      if (url === "https://api.github.com/repos/the-via/keyboards/commits/master") {
        // A permanent failure is not retried, and codeload is a truthful
        // tokenless fallback for the current branch archive.
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

    const { loadViaKeyboardDetailEffect } = await freshViaSource();
    const detail = await runViaEffect(loadViaKeyboardDetailEffect("test/board"), {
      VIA_GITHUB_TOKEN: "test-token",
    });

    expect(detail.sourceRevision).toBe("fedcba9");
    expect(
      requestedUrls.filter(
        (url) => url === "https://api.github.com/repos/the-via/keyboards/commits/master",
      ),
    ).toHaveLength(1);
  });

  it("bounds retries, leaves failures uncached, and succeeds on the next load", async () => {
    let attempts = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (!url.startsWith("https://codeload.github.com/the-via/keyboards/legacy.zip/")) {
        return new Response("not found", { status: 404 });
      }
      attempts += 1;
      return attempts <= 4
        ? new Response("temporarily unavailable", { status: 503 })
        : new Response(viaZipball("the-via-keyboards-bead123"), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { loadViaKeyboardCatalogEffect, ViaCatalogFetchError } = await freshViaSource();
    const load = provideConfig(loadViaKeyboardCatalogEffect());
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const firstFiber = yield* Effect.forkChild(Effect.result(load));
        yield* TestClock.adjust("5 minutes");
        const first = yield* Fiber.join(firstFiber);
        const second = yield* load;
        return { first, second };
      }).pipe(Effect.provide(TestClock.layer())),
    );

    expect(result.first._tag).toBe("Failure");
    if (result.first._tag === "Failure") {
      expect(result.first.failure).toBeInstanceOf(ViaCatalogFetchError);
    }
    expect(attempts).toBe(5);
    expect(result.second.ref).toBe("bead123");
  });

  it("deduplicates concurrent catalog loads and refreshes only after the TTL", async () => {
    let archiveRequests = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      if (!url.startsWith("https://codeload.github.com/the-via/keyboards/legacy.zip/")) {
        return new Response("not found", { status: 404 });
      }
      archiveRequests += 1;
      const root =
        archiveRequests === 1 ? "the-via-keyboards-abc1234" : "the-via-keyboards-def5678";
      return new Response(viaZipball(root), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { loadViaKeyboardCatalogEffect } = await freshViaSource();
    const load = provideConfig(loadViaKeyboardCatalogEffect());
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const [first, concurrent] = yield* Effect.all([load, load], { concurrency: 2 });
        yield* TestClock.adjust("14 minutes");
        const beforeExpiry = yield* load;
        yield* TestClock.adjust("2 minutes");
        const afterExpiry = yield* load;
        return { first, concurrent, beforeExpiry, afterExpiry };
      }).pipe(Effect.provide(TestClock.layer())),
    );

    expect(result.first.ref).toBe("abc1234");
    expect(result.concurrent.ref).toBe("abc1234");
    expect(result.beforeExpiry.ref).toBe("abc1234");
    expect(result.afterExpiry.ref).toBe("def5678");
    expect(archiveRequests).toBe(2);
  });
});
