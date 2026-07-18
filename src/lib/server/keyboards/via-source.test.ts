import { strToU8, zipSync } from "fflate";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { loadViaKeyboardDetail } from "./via-source";

// Minimal VIA v3 definition: one keymap row producing two keys plus the
// mandatory USB identity. parseViaDefinition ignores anything else.
const viaDefinition = {
  name: "Test Board",
  vendorId: "0x1234",
  productId: "0x5678",
  matrix: { rows: 1, cols: 2 },
  layouts: { keymap: [["0,0", "0,1"]] },
};

// GitHub zipballs nest every file under a `<repo>-<sha>/` root directory.
// archiveDefinitionPath keys off the `/v3/` marker, so the definition lands at
// catalog id "test/board".
function viaZipball() {
  return zipSync({
    "the-via-keyboards-testsha/v3/test/board.json": strToU8(JSON.stringify(viaDefinition)),
  });
}

describe("loadViaKeyboardDetail", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the VIA entry without building the QMK USB index and degrades QMK metadata gracefully", async () => {
    const requestedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      requestedUrls.push(url);

      if (url.includes("/repos/the-via/keyboards/commits/master")) {
        return new Response(JSON.stringify({ sha: "testsha1234567" }), { status: 200 });
      }
      if (url.includes("/repos/the-via/keyboards/zipball/")) {
        return new Response(viaZipball(), { status: 200 });
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
});
