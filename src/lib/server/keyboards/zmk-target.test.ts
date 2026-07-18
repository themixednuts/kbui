import { strToU8, zipSync } from "fflate";
import { ConfigProvider, Effect, Fiber } from "effect";
import { TestClock } from "effect/testing";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  invalidateZmkCatalogCacheEffect,
  parseZmkHardwareMetadata,
  resolveZmkFirmwareMetadataEffect,
  resolveZmkFirmwareMetadataOrUndefinedEffect,
} from "./zmk-target";

function zmkConfigLayer(token?: string) {
  return ConfigProvider.layer(
    ConfigProvider.fromUnknown(token === undefined ? {} : { GITHUB_TOKEN: token }),
  );
}

function requestUrl(input: RequestInfo | URL) {
  return typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
}

describe("ZMK hardware target resolution", () => {
  it("reads official shield metadata including split siblings", () => {
    expect(
      parseZmkHardwareMetadata(
        "app/boards/shields/corne/corne.zmk.yml",
        `file_format: "1"
id: corne
name: Corne
type: shield
requires: [pro_micro]
siblings:
  - corne_left
  - corne_right
`,
      ),
    ).toEqual({
      exposes: [],
      id: "corne",
      name: "Corne",
      path: "app/boards/shields/corne/corne.zmk.yml",
      requires: ["pro_micro"],
      siblings: ["corne_left", "corne_right"],
      type: "shield",
    });
  });

  it("reads the official interconnects exposed by controller boards", () => {
    expect(
      parseZmkHardwareMetadata(
        "app/boards/nicekeyboards/nice_nano/nice_nano.zmk.yml",
        `file_format: "1"
id: nice_nano//zmk
name: nice!nano
type: board
exposes: [pro_micro]
`,
      ),
    ).toMatchObject({
      exposes: ["pro_micro"],
      id: "nice_nano//zmk",
      type: "board",
    });
  });
});

const niceNanoYaml = `file_format: "1"
id: nice_nano//zmk
name: nice!nano
type: board
exposes: [pro_micro]
`;

const corneYaml = `file_format: "1"
id: corne
name: Corne
type: shield
requires: [pro_micro]
siblings:
  - corne_left
  - corne_right
`;

// GitHub archives nest every file under a `<owner>-<repo>-<shortsha>/` root
// directory. Include a non-metadata file to prove the resolver only reads the
// `.zmk.yml` entries out of the archive.
function zmkZipball(root: string) {
  return zipSync({
    [`${root}/app/boards/nicekeyboards/nice_nano/nice_nano.zmk.yml`]: strToU8(niceNanoYaml),
    [`${root}/app/boards/shields/corne/corne.zmk.yml`]: strToU8(corneYaml),
    [`${root}/app/src/main.c`]: strToU8("int main(void) { return 0; }\n"),
  });
}

describe("resolveZmkFirmwareMetadataEffect", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("without a GitHub token, resolves targets from codeload and never calls the REST API", async () => {
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      requestedUrls.push(url);

      if (url.startsWith("https://codeload.github.com/zmkfirmware/zmk/legacy.zip/")) {
        return new Response(zmkZipball("zmkfirmware-zmk-abc1234"), { status: 200 });
      }
      if (url.includes("api.github.com")) {
        throw new Error(`regression: unauthenticated ZMK resolver hit the GitHub REST API: ${url}`);
      }
      if (url.includes("raw.githubusercontent.com")) {
        throw new Error(`regression: ZMK resolver fetched metadata file-by-file: ${url}`);
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const metadata = await Effect.runPromise(
      Effect.gen(function* () {
        yield* invalidateZmkCatalogCacheEffect;
        return yield* resolveZmkFirmwareMetadataEffect({ deviceName: "Corne" });
      }).pipe(Effect.provide(zmkConfigLayer())),
    );

    expect(metadata?.zmk).toMatchObject({
      board: "nice_nano//zmk",
      keymap: "corne",
      repository: "zmkfirmware/zmk",
      // The commit sha is read off the archive's `zmkfirmware-zmk-<sha>/` root
      // directory instead of a separate (rate-limited) commits API call.
      ref: "abc1234",
      shield: "corne_left",
      shields: ["corne_left", "corne_right"],
      targetConfirmed: true,
    });
    expect(requestedUrls.some((url) => url.includes("api.github.com"))).toBe(false);
    expect(requestedUrls.some((url) => url.includes("raw.githubusercontent.com"))).toBe(false);
  });

  it("keeps provider failures typed in the core Effect", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("forbidden", { status: 403 })),
    );

    const error = await Effect.runPromise(
      Effect.gen(function* () {
        yield* invalidateZmkCatalogCacheEffect;
        return yield* Effect.flip(resolveZmkFirmwareMetadataEffect({ deviceName: "Corne" }));
      }).pipe(Effect.provide(zmkConfigLayer())),
    );

    expect(error).toMatchObject({
      _tag: "ZmkCatalogFetchError",
      operation: "ZmkCatalog.fetchCodeloadArchive.status",
      retryable: false,
      status: 403,
    });
  });

  it("degrades to undefined only at the best-effort boundary", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("forbidden", { status: 403 })),
    );

    const metadata = await Effect.runPromise(
      Effect.gen(function* () {
        yield* invalidateZmkCatalogCacheEffect;
        return yield* resolveZmkFirmwareMetadataOrUndefinedEffect({ deviceName: "Corne" });
      }).pipe(Effect.provide(zmkConfigLayer())),
    );

    expect(metadata).toBeUndefined();
  });

  it("bounds transient fetch retries using TestClock", async () => {
    const fetchMock = vi.fn(async () => new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const metadata = await Effect.runPromise(
      Effect.gen(function* () {
        yield* invalidateZmkCatalogCacheEffect;
        const fiber = yield* resolveZmkFirmwareMetadataOrUndefinedEffect({
          deviceName: "Corne",
        }).pipe(Effect.forkChild);

        while (fetchMock.mock.calls.length === 0) yield* Effect.yieldNow;
        yield* TestClock.adjust("10 seconds");
        return yield* Fiber.join(fiber);
      }).pipe(Effect.provide(zmkConfigLayer()), Effect.provide(TestClock.layer())),
    );

    expect(metadata).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("resolves undefined for hardware the catalog does not know", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = requestUrl(input);
        if (url.startsWith("https://codeload.github.com/zmkfirmware/zmk/legacy.zip/")) {
          return new Response(zmkZipball("zmkfirmware-zmk-abc1234"), { status: 200 });
        }
        return new Response("not found", { status: 404 });
      }),
    );

    const metadata = await Effect.runPromise(
      Effect.gen(function* () {
        yield* invalidateZmkCatalogCacheEffect;
        return yield* resolveZmkFirmwareMetadataEffect({
          deviceName: "Completely Unknown Device 9000",
        });
      }).pipe(Effect.provide(zmkConfigLayer())),
    );

    expect(metadata).toBeUndefined();
  });

  it("reads the GitHub token from Config and fetches the pinned zipball", async () => {
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      requestedUrls.push(url);

      if (url === "https://api.github.com/repos/zmkfirmware/zmk/commits/main") {
        expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer test-token");
        return new Response(JSON.stringify({ sha: "abcdef0123456789" }), { status: 200 });
      }
      if (url === "https://api.github.com/repos/zmkfirmware/zmk/zipball/abcdef0123456789") {
        return new Response(zmkZipball("zmkfirmware-zmk-abcdef0"), { status: 200 });
      }
      if (url.startsWith("https://codeload.github.com/")) {
        throw new Error(`regression: authenticated ZMK resolver fell back to codeload: ${url}`);
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const metadata = await Effect.runPromise(
      Effect.gen(function* () {
        yield* invalidateZmkCatalogCacheEffect;
        return yield* resolveZmkFirmwareMetadataEffect({ deviceName: "Corne" });
      }).pipe(Effect.provide(zmkConfigLayer("test-token"))),
    );

    expect(metadata?.zmk?.ref).toBe("abcdef0123456789");
    expect(
      requestedUrls.some(
        (url) => url === "https://api.github.com/repos/zmkfirmware/zmk/commits/main",
      ),
    ).toBe(true);
  });

  it("does not retry a malformed revision body before falling back to codeload", async () => {
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = requestUrl(input);
      requestedUrls.push(url);

      if (url === "https://api.github.com/repos/zmkfirmware/zmk/commits/main") {
        return new Response("not-json", { status: 200 });
      }
      if (url.startsWith("https://codeload.github.com/zmkfirmware/zmk/legacy.zip/")) {
        return new Response(zmkZipball("zmkfirmware-zmk-fedcba9"), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const metadata = await Effect.runPromise(
      Effect.gen(function* () {
        yield* invalidateZmkCatalogCacheEffect;
        return yield* resolveZmkFirmwareMetadataEffect({ deviceName: "Corne" });
      }).pipe(Effect.provide(zmkConfigLayer("test-token"))),
    );

    expect(metadata?.zmk?.ref).toBe("fedcba9");
    expect(
      requestedUrls.filter(
        (url) => url === "https://api.github.com/repos/zmkfirmware/zmk/commits/main",
      ),
    ).toHaveLength(1);
  });

  it("coalesces concurrent catalog loads", async () => {
    const fetchMock = vi.fn(
      async () => new Response(zmkZipball("zmkfirmware-zmk-abc1234"), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const results = await Effect.runPromise(
      Effect.gen(function* () {
        yield* invalidateZmkCatalogCacheEffect;
        return yield* Effect.all(
          [
            resolveZmkFirmwareMetadataEffect({ deviceName: "Corne" }),
            resolveZmkFirmwareMetadataEffect({ deviceName: "Corne" }),
          ],
          { concurrency: "unbounded" },
        );
      }).pipe(Effect.provide(zmkConfigLayer())),
    );

    expect(results[0]?.zmk?.ref).toBe("abc1234");
    expect(results[1]?.zmk?.ref).toBe("abc1234");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("expires the successful catalog after one hour using TestClock", async () => {
    const fetchMock = vi.fn(
      async () => new Response(zmkZipball("zmkfirmware-zmk-abc1234"), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* invalidateZmkCatalogCacheEffect;
        yield* resolveZmkFirmwareMetadataEffect({ deviceName: "Corne" });
        yield* TestClock.adjust("59 minutes");
        yield* resolveZmkFirmwareMetadataEffect({ deviceName: "Corne" });
        expect(fetchMock).toHaveBeenCalledTimes(1);

        yield* TestClock.adjust("2 minutes");
        yield* resolveZmkFirmwareMetadataEffect({ deviceName: "Corne" });
        expect(fetchMock).toHaveBeenCalledTimes(2);
      }).pipe(Effect.provide(zmkConfigLayer()), Effect.provide(TestClock.layer())),
    );
  });
});
