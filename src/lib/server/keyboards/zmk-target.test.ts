import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { parseZmkHardwareMetadata } from "./zmk-target";

// $env/dynamic/private is a virtual SvelteKit module; mock it directly so each
// test can configure (or omit) a GitHub token explicitly instead of depending
// on ambient process.env state.
const mockEnv = vi.hoisted(() => ({}) as Record<string, string | undefined>);
vi.mock("$env/dynamic/private", () => ({ env: mockEnv }));

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

// Each test needs a fresh module instance because zmk-target.ts memoizes the
// hardware catalog (and its resolved ref) at module scope.
async function freshZmkTarget() {
  vi.resetModules();
  return import("./zmk-target");
}

describe("resolveZmkFirmwareMetadata", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete mockEnv.GITHUB_TOKEN;
  });

  it("without a GitHub token, resolves targets from the codeload archive and never calls api.github.com", async () => {
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      requestedUrls.push(url);

      if (url.startsWith("https://codeload.github.com/zmkfirmware/zmk/legacy.zip/")) {
        return new Response(zmkZipball("zmkfirmware-zmk-abc1234"), { status: 200 });
      }
      // Production has no GITHUB_TOKEN secret, so the unauthenticated core
      // API's shared 60 req/hr limit routinely 403s. The tokenless resolver
      // must never touch api.github.com at all.
      if (url.includes("api.github.com")) {
        throw new Error(`regression: unauthenticated ZMK resolver hit the GitHub REST API: ${url}`);
      }
      // Metadata contents come out of the archive; per-file raw fetches were
      // the old tree-API design and must not come back.
      if (url.includes("raw.githubusercontent.com")) {
        throw new Error(`regression: ZMK resolver fetched metadata file-by-file: ${url}`);
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { resolveZmkFirmwareMetadata } = await freshZmkTarget();
    const metadata = await resolveZmkFirmwareMetadata({ deviceName: "Corne" });

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

  it("degrades to undefined instead of failing when the archive cannot be fetched", async () => {
    const fetchMock = vi.fn(async () => new Response("forbidden", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    const { resolveZmkFirmwareMetadata } = await freshZmkTarget();

    // The ZMK-BLE connect flow treats "no metadata" as a soft state; a
    // catalog outage must never reject the remote-query promise.
    await expect(resolveZmkFirmwareMetadata({ deviceName: "Corne" })).resolves.toBeUndefined();
  });

  it("resolves undefined for hardware the catalog does not know", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("https://codeload.github.com/zmkfirmware/zmk/legacy.zip/")) {
        return new Response(zmkZipball("zmkfirmware-zmk-abc1234"), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { resolveZmkFirmwareMetadata } = await freshZmkTarget();

    await expect(
      resolveZmkFirmwareMetadata({ deviceName: "Completely Unknown Device 9000" }),
    ).resolves.toBeUndefined();
  });

  it("with a GitHub token configured, resolves the revision via the commits API and fetches the pinned zipball", async () => {
    mockEnv.GITHUB_TOKEN = "test-token";
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      requestedUrls.push(url);

      if (url === "https://api.github.com/repos/zmkfirmware/zmk/commits/main") {
        const headers = init?.headers as Record<string, string> | undefined;
        expect(headers?.Authorization).toBe("Bearer test-token");
        return new Response(JSON.stringify({ sha: "pinnedsha1234567" }), { status: 200 });
      }
      if (url === "https://api.github.com/repos/zmkfirmware/zmk/zipball/pinnedsha1234567") {
        return new Response(zmkZipball("zmkfirmware-zmk-pinnedsha"), { status: 200 });
      }
      if (url.startsWith("https://codeload.github.com/")) {
        throw new Error(`regression: authenticated ZMK resolver fell back to codeload: ${url}`);
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { resolveZmkFirmwareMetadata } = await freshZmkTarget();
    const metadata = await resolveZmkFirmwareMetadata({ deviceName: "Corne" });

    expect(metadata?.zmk?.ref).toBe("pinnedsha1234567");
    expect(
      requestedUrls.some(
        (url) => url === "https://api.github.com/repos/zmkfirmware/zmk/commits/main",
      ),
    ).toBe(true);
  });

  it("falls back to the codeload archive when the authenticated revision lookup fails", async () => {
    mockEnv.GITHUB_TOKEN = "test-token";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "https://api.github.com/repos/zmkfirmware/zmk/commits/main") {
        // A rate-limited (non-retryable) failure of the commits API call.
        return new Response("forbidden", { status: 403 });
      }
      if (url.startsWith("https://codeload.github.com/zmkfirmware/zmk/legacy.zip/")) {
        return new Response(zmkZipball("zmkfirmware-zmk-fedcba9"), { status: 200 });
      }
      if (url.startsWith("https://api.github.com/repos/zmkfirmware/zmk/zipball/")) {
        throw new Error("regression: fetched the authenticated zipball without a resolved ref");
      }
      return new Response("not found", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { resolveZmkFirmwareMetadata } = await freshZmkTarget();
    const metadata = await resolveZmkFirmwareMetadata({ deviceName: "Corne" });

    expect(metadata?.zmk?.ref).toBe("fedcba9");
  });
});
