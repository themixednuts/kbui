import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { createMockViaTransport } from "./transport-mock";
import {
  createUf2FlashPlan,
  createUf2FlashPlanEffect,
  detectUf2FileSystemAccessSupport,
  flashUf2ViaFileSystemAccessEffect,
  packUf2,
  parseUf2,
  rp2040FlashBaseAddress,
  rp2040Uf2FamilyId,
  Uf2ValidationError,
  verifyUf2ReconnectEffect,
} from "./uf2-flash";

const uf2MagicStart0 = 0x0a324655;
const uf2MagicStart1 = 0x9e5d5157;
const uf2MagicEnd = 0x0ab16f30;
const uf2FamilyFlag = 0x00002000;

function syntheticUf2(
  options: {
    blocks?: number;
    familyId?: number;
    includeFamilyId?: boolean;
    payloadSize?: number;
    targetAddress?: number;
  } = {},
) {
  const blocks = options.blocks ?? 2;
  const familyId = options.familyId ?? 0xe48bff56;
  const payloadSize = options.payloadSize ?? 256;
  const targetAddress = options.targetAddress ?? 0x10000000;
  const bytes = new Uint8Array(blocks * 512);
  const view = new DataView(bytes.buffer);

  for (let block = 0; block < blocks; block += 1) {
    const offset = block * 512;
    view.setUint32(offset, uf2MagicStart0, true);
    view.setUint32(offset + 4, uf2MagicStart1, true);
    view.setUint32(offset + 8, options.includeFamilyId === false ? 0 : uf2FamilyFlag, true);
    view.setUint32(offset + 12, targetAddress + block * payloadSize, true);
    view.setUint32(offset + 16, payloadSize, true);
    view.setUint32(offset + 20, block, true);
    view.setUint32(offset + 24, blocks, true);
    view.setUint32(offset + 28, familyId, true);
    for (let index = 0; index < payloadSize; index += 1) {
      bytes[offset + 32 + index] = (block + index) & 0xff;
    }
    view.setUint32(offset + 508, uf2MagicEnd, true);
  }

  return bytes;
}

class MockWritable {
  chunks: Uint8Array[] = [];
  closed = false;

  async write(data: BufferSource | Blob | string) {
    if (typeof data === "string") {
      this.chunks.push(new TextEncoder().encode(data));
      return;
    }
    if (data instanceof Blob) {
      this.chunks.push(new Uint8Array(await data.arrayBuffer()));
      return;
    }
    const bytes =
      data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    this.chunks.push(bytes);
  }

  async close() {
    this.closed = true;
  }

  bytes() {
    const total = this.chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }
}

class MockFileHandle {
  kind = "file" as const;
  writable = new MockWritable();

  constructor(readonly name: string) {}

  async createWritable() {
    return this.writable;
  }
}

class MockDirectoryHandle {
  kind = "directory" as const;
  files = new Map<string, MockFileHandle>();
  name = "RPI-RP2";

  async getFileHandle(name: string, options?: { create?: boolean }) {
    const existing = this.files.get(name);
    if (existing) return existing;
    if (!options?.create) throw new Error(`${name} not found`);
    const handle = new MockFileHandle(name);
    this.files.set(name, handle);
    return handle;
  }
}

describe("UF2 flashing helpers", () => {
  it("packs raw RP2040 firmware bytes into UF2 blocks that the parser accepts", () => {
    const raw = new Uint8Array(300);
    for (let index = 0; index < raw.byteLength; index += 1) raw[index] = index & 0xff;

    const uf2 = packUf2(raw, {
      baseAddress: rp2040FlashBaseAddress,
      familyId: rp2040Uf2FamilyId,
    });
    const parsed = parseUf2(uf2);

    expect(uf2.byteLength).toBe(1024);
    expect(parsed.blockCount).toBe(2);
    expect(parsed.familyId).toBe(rp2040Uf2FamilyId);
    expect(parsed.familyIdHex).toBe("0xe48bff56");
    expect(parsed.payloadSize).toBe(512);
    expect(parsed.payloadSizePerBlock).toBe(256);
    expect(parsed.targetAddressRange).toEqual({
      start: rp2040FlashBaseAddress,
      endExclusive: rp2040FlashBaseAddress + 512,
    });
    expect(Array.from(uf2.slice(32, 32 + 256))).toEqual(Array.from(raw.slice(0, 256)));
    expect(Array.from(uf2.slice(512 + 32, 512 + 32 + 44))).toEqual(Array.from(raw.slice(256)));
  });

  it("parses a valid UF2 container and extracts family and target metadata", () => {
    const bytes = syntheticUf2({
      blocks: 3,
      familyId: 0xada52840,
      payloadSize: 128,
      targetAddress: 0x20000000,
    });

    const parsed = parseUf2(bytes);

    expect(parsed.blockCount).toBe(3);
    expect(parsed.familyId).toBe(0xada52840);
    expect(parsed.familyIdHex).toBe("0xada52840");
    expect(parsed.payloadSize).toBe(384);
    expect(parsed.payloadSizePerBlock).toBe(128);
    expect(parsed.targetAddressRange).toEqual({
      start: 0x20000000,
      endExclusive: 0x20000180,
    });
    expect(parsed.artifact).toMatchObject({
      hashAlgorithm: "fnv1a32",
      size: bytes.byteLength,
    });
  });

  it("rejects non-UF2 input", () => {
    expect(() => parseUf2(new Uint8Array([1, 2, 3, 4]))).toThrow(/512-byte blocks/);

    const junk = new Uint8Array(512);
    expect(() => parseUf2(junk)).toThrow(/not a valid UF2 block/);
  });

  it("builds a flash plan when the declared UF2 family matches the target", () => {
    const bytes = syntheticUf2({ familyId: 0xada52840 });
    const plan = createUf2FlashPlan({
      boardName: "Workbench 65",
      expectedFamilyId: 0xada52840,
      expectedVolumeHints: ["RPI-RP2"],
      fileName: "workbench.uf2",
      uf2Bytes: bytes,
    });

    expect(plan.artifact.fileName).toBe("workbench.uf2");
    expect(plan.targetBootloader).toMatchObject({
      expectedVolumeHints: ["RPI-RP2"],
      familyId: 0xada52840,
      name: "UF2 mass-storage bootloader",
    });
    expect(plan.warnings).toEqual([]);
    expect(plan.hardwareVerified).toBe(false);
  });

  it("rejects a UF2 artifact whose declared family differs from the target", () => {
    const bytes = syntheticUf2({ familyId: 0x0 });

    expect(() =>
      createUf2FlashPlan({
        boardName: "Workbench 65",
        expectedFamilyId: 0xada52840,
        uf2Bytes: bytes,
      }),
    ).toThrow("UF2 family 0x00000000 does not match expected 0xada52840.");
  });

  it("blocks a UF2 artifact that omits family metadata", () => {
    const bytes = syntheticUf2({ includeFamilyId: false });
    expect(() =>
      createUf2FlashPlan({
        boardName: "Workbench 65",
        expectedFamilyId: 0xada52840,
        uf2Bytes: bytes,
      }),
    ).toThrow("UF2 does not declare a family id; direct flashing is blocked.");
  });

  it("reports corrupt UF2 input as a typed validation failure", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const error = yield* Effect.flip(
          createUf2FlashPlanEffect({
            boardName: "Workbench 65",
            expectedFamilyId: 0xada52840,
            uf2Bytes: new Uint8Array([1, 2, 3, 4]),
          }),
        );

        expect(error).toBeInstanceOf(Uf2ValidationError);
        expect(error).toMatchObject({
          _tag: "Uf2ValidationError",
          operation: "uf2.create-flash-plan",
          message: "UF2 file must be a non-empty sequence of 512-byte blocks.",
        });
      }),
    ));

  it("blocks overlapping UF2 target ranges", () => {
    const bytes = syntheticUf2({ blocks: 2 });
    const view = new DataView(bytes.buffer);
    view.setUint32(512 + 12, view.getUint32(12, true), true);

    expect(() => parseUf2(bytes)).toThrow("UF2 target address ranges overlap.");
  });

  it("writes a UF2 to a mock File System Access directory and reports progress", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const bytes = syntheticUf2({ blocks: 2 });
        const directory = new MockDirectoryHandle();
        const progress: string[] = [];

        const result = yield* flashUf2ViaFileSystemAccessEffect(directory, bytes, {
          chunkSize: 512,
          expectedFamilyId: rp2040Uf2FamilyId,
          expectedVolumeHints: ["RPI-RP2"],
          fileName: "mock-board.uf2",
          onProgress: (event) => {
            progress.push(`${event.phase}:${event.bytesWritten}/${event.totalBytes}`);
          },
        });

        const written = directory.files.get("mock-board.uf2")?.writable;
        expect(result.ok).toBe(true);
        expect(result.hardwareVerified).toBe(false);
        expect(result.bytesWritten).toBe(bytes.byteLength);
        expect(result.volumeName).toBe("RPI-RP2");
        expect(result.progress.map((event) => event.phase)).toEqual([
          "validating",
          "writing",
          "writing",
          "done",
        ]);
        expect(progress.at(0)).toBe("validating:0/1024");
        expect(progress.at(-1)).toBe("done:1024/1024");
        expect(written?.closed).toBe(true);
        expect(Array.from(written?.bytes() ?? [])).toEqual(Array.from(bytes));
      }),
    ));

  it("verifies a post-flash reconnect through the mock VIA transport", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const transport = createMockViaTransport();
        const result = yield* verifyUf2ReconnectEffect(
          Effect.promise(() => transport.connect()),
          {
            productId: 0x6060,
            protocol: "via-v3",
            vendorId: 0xfeed,
          },
        );

        expect(result.ok).toBe(true);
        expect(result.metadata).toMatchObject({
          keymapRead: true,
          layerCount: 3,
          protocolVersion: 12,
        });
        expect(result.log.join("\n")).toContain("VIA protocol 12");
      }),
    ));

  it("blocks direct copy when File System Access is unsupported", () => {
    const support = detectUf2FileSystemAccessSupport({
      isBrowser: true,
      isSecureContext: false,
      navigator: { userAgent: "Firefox/140" },
      showDirectoryPicker: undefined,
    });

    expect(support.supported).toBe(false);
    expect(support.canPickDirectory).toBe(false);
    expect(support.browserFamily).toBe("non-chromium");
    expect(support.reason).toBe(
      "File System Access writes require a secure context such as HTTPS or localhost.",
    );
  });

  it("blocks copying an artifact to an unexpected bootloader volume", () =>
    Effect.runPromise(
      Effect.gen(function* () {
        const bytes = syntheticUf2();
        const directory = new MockDirectoryHandle();
        directory.name = "WRONG-BOARD";

        const error = yield* Effect.flip(
          flashUf2ViaFileSystemAccessEffect(directory, bytes, {
            expectedFamilyId: rp2040Uf2FamilyId,
            expectedVolumeHints: ["RPI-RP2"],
          }),
        );

        expect(error.message).toBe("Selected volume WRONG-BOARD does not match RPI-RP2.");
      }),
    ));
});
