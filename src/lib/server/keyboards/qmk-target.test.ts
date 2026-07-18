import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import type { KeyboardKey } from "$lib/keyboard/schema";

import { qmkKeyboardCandidates, resolveQmkKeyboardIdentity, resolveQmkLayout } from "./qmk-target";

const keys: KeyboardKey[] = [
  { id: "k0-0", label: "A", row: 0, col: 0 },
  { id: "k0-1", label: "B", row: 0, col: 1 },
];

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

    const entry = await resolveQmkKeyboardIdentity({
      vendorId: 0xa8f8,
      productId: 0x1833,
      productName: "Charybdis (4x6) Splinky",
    });

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

    await expect(
      resolveQmkKeyboardIdentity({
        vendorId: 0x3434,
        productId: 0x0101,
        productName: "Keychron Q1 V2",
      }),
    ).resolves.toMatchObject({
      sourcePath: "keychron/q1/v2",
      vendor: "Keychron",
      firmwareMetadata: { qmk: { targetConfirmed: true } },
    });
  });
});
