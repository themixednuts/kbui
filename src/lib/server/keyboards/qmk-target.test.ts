import { Effect, Fiber, Schema } from "effect";
import { TestClock } from "effect/testing";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { KeyboardKey } from "$lib/keyboard/schema";

import {
  createQmkUsbIndexEffect,
  QmkCatalogRecordsJsonSchema,
  qmkGithubHeaders,
  qmkKeyboardCandidates,
  qmkTargetCacheLayer,
  resolvePinnedQmkRefEffect,
  resolveQmkKeyboardIdentityEffect,
  resolveQmkLayout,
  usbIdentityKey,
} from "./qmk-target";

const keys: KeyboardKey[] = [
  { id: "k0-0", label: "A", row: 0, col: 0 },
  { id: "k0-1", label: "B", row: 0, col: 1 },
];

function runWithTestClock<A, E>(effect: Effect.Effect<A, E>): Promise<A> {
  return Effect.runPromise(
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(effect);
      yield* TestClock.adjust("1 minute");
      return yield* Fiber.join(fiber);
    }).pipe(Effect.provide(TestClock.layer())),
  );
}

describe("QMK firmware target resolution", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("selects the exact QMK matrix layout and prefers canonical LAYOUT", () => {
    const info = {
      layouts: {
        LAYOUT_wide: {
          layout: [{ matrix: [0, 0] }, { matrix: [0, 1] }, { matrix: [0, 2] }],
        },
        LAYOUT: {
          layout: [{ matrix: [0, 0] }, { matrix: [0, 1] }],
        },
      },
    };

    expect(resolveQmkLayout(keys, info)).toBe("LAYOUT");
  });

  it("tries publisher-free and filename-free VIA catalog paths", () => {
    const candidates = qmkKeyboardCandidates({
      id: "klakson/bastardkb/dilemma/3x5_2/dilemma_3x5_2",
      sourcePath: "klakson/bastardkb/dilemma/3x5_2/dilemma_3x5_2",
    });

    expect(candidates).toContain("bastardkb/dilemma/3x5_2");
  });

  it("derives the exact Charybdis 4x6 QMK keyboard path", () => {
    const candidates = qmkKeyboardCandidates({
      id: "klakson/bastardkb/charybdis/4x6/charybdis_4x6",
      sourcePath: "klakson/bastardkb/charybdis/4x6/charybdis_4x6",
    });

    expect(candidates).toContain("bastardkb/charybdis/4x6");
  });

  it("exposes the QMK index operations as composable Effects", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            last_updated: "2026-07-18 12:00:00 GMT",
            keyboards: {
              "test/board": {
                keyboard_name: "Test Board",
                layouts: {},
                usb: { vid: "0x1234", pid: "0x5678" },
              },
            },
          }),
          { status: 200 },
        ),
      ),
    );

    const index = await Effect.runPromise(createQmkUsbIndexEffect());

    expect(index.lastUpdated).toBe("2026-07-18 12:00:00 GMT");
    expect(index.items.get(usbIdentityKey(0x1234, 0x5678))?.[0]?.keyboard).toBe("test/board");
    expect(Effect.isEffect(resolvePinnedQmkRefEffect())).toBe(true);
    expect(new Headers(qmkGithubHeaders()).get("user-agent")).toBe("kbui-qmk-catalog");
  });

  it("rejects malformed persisted QMK index records", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        Schema.decodeUnknownEffect(QmkCatalogRecordsJsonSchema)(
          JSON.stringify([{ info: {}, keyboard: 42 }]),
        ),
      ),
    );

    expect(String(error)).toContain("Expected string, got 42");
  });

  it("does not retry deterministic JSON decode failures", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const error = await Effect.runPromise(Effect.flip(createQmkUsbIndexEffect()));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(error).toMatchObject({
      _tag: "QmkCatalogFetchError",
      operation: "qmk.fetch-catalog.decode-json",
      retryable: false,
    });
  });

  it("bounds retries for transient QMK statuses", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() => Promise.resolve(new Response("busy", { status: 503 })));
    vi.stubGlobal("fetch", fetchMock);

    const error = await runWithTestClock(Effect.flip(createQmkUsbIndexEffect()));

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(error).toMatchObject({
      _tag: "QmkCatalogFetchError",
      operation: "qmk.fetch-catalog",
      retryable: true,
      status: 503,
    });
  });

  it("does not cache failed repository-ref lookups", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("unauthorized", { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sha: "1234567890abcdef" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const first = yield* Effect.result(resolvePinnedQmkRefEffect("invalid-token"));
        const second = yield* resolvePinnedQmkRefEffect("invalid-token");
        return { first, second };
      }).pipe(Effect.provide(qmkTargetCacheLayer)),
    );

    expect(result.first._tag).toBe("Failure");
    expect(result.second).toBe("1234567890abcdef");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent repository-ref loads and expires them with TestClock", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ sha: "fedcba0987654321" }), {
          status: 200,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const refs = await Effect.runPromise(
      Effect.gen(function* () {
        const concurrent = yield* Effect.all(
          [resolvePinnedQmkRefEffect("dedupe-token"), resolvePinnedQmkRefEffect("dedupe-token")],
          { concurrency: "unbounded" },
        );
        yield* TestClock.adjust("14 minutes");
        const beforeExpiry = yield* resolvePinnedQmkRefEffect("dedupe-token");
        yield* TestClock.adjust("2 minutes");
        const afterExpiry = yield* resolvePinnedQmkRefEffect("dedupe-token");
        return { afterExpiry, beforeExpiry, concurrent };
      }).pipe(Effect.provide(qmkTargetCacheLayer), Effect.provide(TestClock.layer())),
    );

    expect(refs.concurrent).toEqual(["fedcba0987654321", "fedcba0987654321"]);
    expect(refs.beforeExpiry).toBe("fedcba0987654321");
    expect(refs.afterExpiry).toBe("fedcba0987654321");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("resolves exact USB identities from the complete QMK catalog", async () => {
    const qmkInfo = (developmentBoard: string) => ({
      keyboard_name: "Charybdis (4x6)",
      manufacturer: "Bastard Keyboards",
      development_board: developmentBoard,
      matrix_size: { rows: 10, cols: 6 },
      usb: { vid: "0xA8F8", pid: "0x1833" },
      layouts: {
        LAYOUT: {
          layout: [
            { matrix: [0, 0], x: 0, y: 0 },
            { matrix: [0, 1], x: 1, y: 0 },
          ],
        },
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            last_updated: "2026-07-11 05:23:24 GMT",
            keyboards: {
              "bastardkb/charybdis/4x6/blackpill": qmkInfo("blackpill_f411"),
              "bastardkb/charybdis/4x6/elitec": qmkInfo("elite_c"),
              "keychron/q1/v2": {
                keyboard_name: "Keychron Q1 V2",
                manufacturer: "Keychron",
                matrix_size: { rows: 1, cols: 2 },
                usb: { vid: "0x3434", pid: "0x0101" },
                layouts: {
                  LAYOUT: {
                    layout: [
                      { matrix: [0, 0], x: 0, y: 0 },
                      { matrix: [0, 1], x: 1, y: 0 },
                    ],
                  },
                },
              },
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ sha: "1234567890abcdef" }), { status: 200 }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const { entry, keychron } = await Effect.runPromise(
      Effect.gen(function* () {
        const entry = yield* resolveQmkKeyboardIdentityEffect({
          vendorId: 0xa8f8,
          productId: 0x1833,
          productName: "Charybdis (4x6) Splinky",
        });
        const keychron = yield* resolveQmkKeyboardIdentityEffect({
          vendorId: 0x3434,
          productId: 0x0101,
          productName: "Keychron Q1 V2",
        });
        return { entry, keychron };
      }).pipe(Effect.provide(qmkTargetCacheLayer)),
    );

    expect(entry).toMatchObject({
      source: "qmk-api",
      vendorId: 0xa8f8,
      productId: 0x1833,
      matrix: { rows: 10, cols: 6 },
      sourceRevision: "2026-07-11 05:23:24 GMT",
      firmwareMetadata: {
        qmk: {
          repository: "qmk/qmk_firmware",
          ref: "1234567890abcdef",
          targetConfirmed: false,
        },
      },
    });
    expect(entry?.firmwareMetadata?.qmk?.alternatives).toHaveLength(1);

    expect(keychron).toMatchObject({
      sourcePath: "keychron/q1/v2",
      vendor: "Keychron",
      firmwareMetadata: { qmk: { targetConfirmed: true } },
    });
  });
});
