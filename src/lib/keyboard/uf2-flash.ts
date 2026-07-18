import { Effect } from "effect";

import { runApp } from "$lib/app/runtime";
import { platformError } from "$lib/effect/errors";
import type { KeyboardProtocol } from "./transport";

export { rp2040Uf2FamilyId } from "./uf2-families";

export const uf2BlockSize = 512;
export const rp2040FlashBaseAddress = 0x10000000;

const uf2MagicStart0 = 0x0a324655;
const uf2MagicStart1 = 0x9e5d5157;
const uf2MagicEnd = 0x0ab16f30;
const uf2FlagFamilyIdPresent = 0x00002000;
const uf2MaxPayloadSize = 476;
const defaultUf2PayloadSize = 256;

export type Uf2Bytes = ArrayBuffer | ArrayBufferView;

export interface PackUf2Options {
  baseAddress: number;
  familyId: number;
  payloadSize?: number;
}

export interface Uf2TargetAddressRange {
  endExclusive: number;
  start: number;
}

export interface Uf2ArtifactMetadata {
  hash: string;
  hashAlgorithm: "fnv1a32";
  size: number;
}

export interface ParsedUf2 {
  artifact: Uf2ArtifactMetadata;
  blockCount: number;
  familyId?: number;
  familyIdHex?: string;
  payloadSize: number;
  payloadSizePerBlock: number;
  targetAddressRange: Uf2TargetAddressRange;
}

export interface Uf2TargetBootloader {
  expectedVolumeHints: string[];
  familyId: number;
  name: string;
}

export interface Uf2FlashPlan {
  artifact: Uf2ArtifactMetadata & {
    blockCount: number;
    familyId?: number;
    familyIdHex?: string;
    fileName: string;
    payloadSize: number;
    targetAddressRange: Uf2TargetAddressRange;
  };
  hardwareVerified: false;
  parsed: ParsedUf2;
  targetBootloader: Uf2TargetBootloader;
  warnings: string[];
}

export interface CreateUf2FlashPlanInput {
  bootloaderName?: string;
  boardName: string;
  expectedFamilyId: number;
  expectedVolumeHints?: readonly string[];
  fileName?: string;
  uf2Bytes: Uf2Bytes;
}

export interface Uf2FileSystemWritableLike {
  close: () => Promise<void>;
  write: (data: BufferSource | Blob | string) => Promise<void>;
}

export interface Uf2FileSystemFileHandleLike {
  createWritable: () => Promise<Uf2FileSystemWritableLike>;
  kind?: "file";
  name?: string;
}

export interface Uf2FileSystemDirectoryHandleLike {
  getFileHandle: (
    name: string,
    options?: { create?: boolean },
  ) => Promise<Uf2FileSystemFileHandleLike>;
  kind?: "directory";
  name?: string;
}

export type Uf2FileSystemAccessTarget =
  | Uf2FileSystemDirectoryHandleLike
  | Uf2FileSystemFileHandleLike;

export type Uf2FlashProgressPhase = "validating" | "writing" | "done";

export interface Uf2FlashProgress {
  bytesWritten: number;
  fileName: string;
  phase: Uf2FlashProgressPhase;
  totalBytes: number;
}

export interface Uf2FlashIo {
  chunkSize?: number;
  expectedFamilyId: number;
  expectedVolumeHints?: readonly string[];
  fileName?: string;
  onProgress?: (progress: Uf2FlashProgress) => void;
}

export interface Uf2FileSystemFlashResult {
  artifact: Uf2ArtifactMetadata;
  bytesWritten: number;
  fileName: string;
  hardwareVerified: false;
  log: string[];
  ok: true;
  parsed: ParsedUf2;
  progress: Uf2FlashProgress[];
  volumeName?: string;
}

export interface Uf2FlashSupportEnvironment {
  isBrowser?: boolean;
  isSecureContext?: boolean;
  navigator?: {
    userAgent?: string;
    userAgentData?: {
      brands?: Array<{ brand: string; version?: string }>;
    };
  };
  showDirectoryPicker?: unknown;
}

export interface Uf2FlashSupport {
  browserFamily: "chromium" | "non-chromium" | "unknown";
  canPickDirectory: boolean;
  guidance: string[];
  reason?: string;
  secureContext: boolean;
  supported: boolean;
}

export interface Uf2ReconnectConnection {
  detection?: {
    keymap?: number[][][];
    layerCount?: number;
    protocolVersion?: number;
  };
  deviceKey?: string;
  message?: string;
  productId?: number;
  productName?: string;
  protocol?: KeyboardProtocol;
  status: string;
  vendorId?: number;
}

export interface Uf2ReconnectExpectation {
  deviceKey?: string;
  productId?: number;
  productName?: string;
  protocol?: KeyboardProtocol;
  vendorId?: number;
}

export interface Uf2VerifyResult {
  connection?: Uf2ReconnectConnection;
  log: string[];
  message: string;
  metadata?: {
    keymapRead: boolean;
    layerCount?: number;
    protocolVersion?: number;
  };
  ok: boolean;
  warnings: string[];
}

function bytesView(bytes: Uf2Bytes): Uint8Array {
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function hex32(value: number) {
  return `0x${value.toString(16).padStart(8, "0")}`;
}

function readBlockUint32(view: DataView, offset: number, blockOffset: number) {
  return view.getUint32(blockOffset + offset, true);
}

function artifactHash(bytes: Uint8Array) {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `fnv1a32-${hash.toString(16).padStart(8, "0")}`;
}

function artifactMetadata(bytes: Uint8Array): Uf2ArtifactMetadata {
  return {
    hash: artifactHash(bytes),
    hashAlgorithm: "fnv1a32",
    size: bytes.byteLength,
  };
}

function normalizedUf2FileName(fileName: string | undefined) {
  const candidate = fileName?.trim() || "firmware.uf2";
  return candidate.toLowerCase().endsWith(".uf2") ? candidate : `${candidate}.uf2`;
}

function requireUint32(name: string, value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`${name} must be a 32-bit unsigned integer.`);
  }
}

export function packUf2(bytes: Uf2Bytes, options: PackUf2Options): Uint8Array {
  const input = bytesView(bytes);
  if (input.byteLength === 0) throw new Error("UF2 payload must not be empty.");

  const payloadSize = options.payloadSize ?? defaultUf2PayloadSize;
  if (!Number.isInteger(payloadSize) || payloadSize <= 0 || payloadSize > uf2MaxPayloadSize) {
    throw new Error(`UF2 payload size must be between 1 and ${uf2MaxPayloadSize} bytes.`);
  }
  requireUint32("UF2 base address", options.baseAddress);
  requireUint32("UF2 family id", options.familyId);
  if (options.baseAddress > 0xffffffff - input.byteLength) {
    throw new Error("UF2 target address range overflows 32-bit address space.");
  }

  const blockCount = Math.ceil(input.byteLength / payloadSize);
  const output = new Uint8Array(blockCount * uf2BlockSize);
  const view = new DataView(output.buffer);

  for (let block = 0; block < blockCount; block += 1) {
    const blockOffset = block * uf2BlockSize;
    const inputOffset = block * payloadSize;
    const chunk = input.subarray(
      inputOffset,
      Math.min(inputOffset + payloadSize, input.byteLength),
    );
    view.setUint32(blockOffset, uf2MagicStart0, true);
    view.setUint32(blockOffset + 4, uf2MagicStart1, true);
    view.setUint32(blockOffset + 8, uf2FlagFamilyIdPresent, true);
    view.setUint32(blockOffset + 12, options.baseAddress + inputOffset, true);
    view.setUint32(blockOffset + 16, payloadSize, true);
    view.setUint32(blockOffset + 20, block, true);
    view.setUint32(blockOffset + 24, blockCount, true);
    view.setUint32(blockOffset + 28, options.familyId, true);
    output.set(chunk, blockOffset + 32);
    view.setUint32(blockOffset + uf2BlockSize - 4, uf2MagicEnd, true);
  }

  return output;
}

export function parseUf2(bytes: Uf2Bytes): ParsedUf2 {
  const data = bytesView(bytes);
  if (data.byteLength === 0 || data.byteLength % uf2BlockSize !== 0) {
    throw new Error("UF2 file must be a non-empty sequence of 512-byte blocks.");
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const actualBlockCount = data.byteLength / uf2BlockSize;
  const seenBlocks = new Set<number>();
  let declaredBlockCount: number | undefined;
  let familyId: number | undefined;
  let targetStart = Number.POSITIVE_INFINITY;
  let targetEnd = 0;
  let payloadSizePerBlock: number | undefined;
  let payloadSize = 0;
  const targetRanges: Array<{ endExclusive: number; start: number }> = [];

  for (let blockIndex = 0; blockIndex < actualBlockCount; blockIndex += 1) {
    const blockOffset = blockIndex * uf2BlockSize;
    const start0 = readBlockUint32(view, 0, blockOffset);
    const start1 = readBlockUint32(view, 4, blockOffset);
    const end = readBlockUint32(view, uf2BlockSize - 4, blockOffset);
    if (start0 !== uf2MagicStart0 || start1 !== uf2MagicStart1 || end !== uf2MagicEnd) {
      throw new Error(`Block ${blockIndex} is not a valid UF2 block.`);
    }

    const flags = readBlockUint32(view, 8, blockOffset);
    const targetAddress = readBlockUint32(view, 12, blockOffset);
    const blockPayloadSize = readBlockUint32(view, 16, blockOffset);
    const blockNumber = readBlockUint32(view, 20, blockOffset);
    const blockCount = readBlockUint32(view, 24, blockOffset);
    const fileSizeOrFamilyId = readBlockUint32(view, 28, blockOffset);

    if (blockPayloadSize === 0 || blockPayloadSize > uf2MaxPayloadSize) {
      throw new Error(`Block ${blockIndex} has invalid UF2 payload size ${blockPayloadSize}.`);
    }
    if (targetAddress > 0xffffffff - blockPayloadSize) {
      throw new Error(`Block ${blockIndex} target address overflows 32-bit range.`);
    }
    if (blockCount === 0) throw new Error("UF2 block count must be greater than zero.");
    if (blockNumber >= blockCount) {
      throw new Error(`UF2 block number ${blockNumber} is outside ${blockCount} blocks.`);
    }
    if (seenBlocks.has(blockNumber)) {
      throw new Error(`UF2 block ${blockNumber} is duplicated.`);
    }
    seenBlocks.add(blockNumber);

    if (declaredBlockCount === undefined) declaredBlockCount = blockCount;
    else if (declaredBlockCount !== blockCount) {
      throw new Error("UF2 blocks disagree on total block count.");
    }

    if (flags & uf2FlagFamilyIdPresent) {
      if (familyId === undefined) familyId = fileSizeOrFamilyId;
      else if (familyId !== fileSizeOrFamilyId) {
        throw new Error("UF2 blocks disagree on family id.");
      }
    }

    payloadSizePerBlock ??= blockPayloadSize;
    payloadSize += blockPayloadSize;
    targetStart = Math.min(targetStart, targetAddress);
    targetEnd = Math.max(targetEnd, targetAddress + blockPayloadSize);
    targetRanges.push({ start: targetAddress, endExclusive: targetAddress + blockPayloadSize });
  }

  if (declaredBlockCount !== actualBlockCount || seenBlocks.size !== declaredBlockCount) {
    throw new Error(
      `UF2 declared ${declaredBlockCount ?? 0} blocks but contained ${actualBlockCount}.`,
    );
  }
  targetRanges.sort((left, right) => left.start - right.start);
  for (let index = 1; index < targetRanges.length; index += 1) {
    if (targetRanges[index]!.start < targetRanges[index - 1]!.endExclusive) {
      throw new Error("UF2 target address ranges overlap.");
    }
  }

  return {
    artifact: artifactMetadata(data),
    blockCount: actualBlockCount,
    familyId,
    familyIdHex: familyId === undefined ? undefined : hex32(familyId),
    payloadSize,
    payloadSizePerBlock: payloadSizePerBlock ?? 0,
    targetAddressRange: {
      endExclusive: targetEnd,
      start: targetStart,
    },
  };
}

export function createUf2FlashPlan(input: CreateUf2FlashPlanInput): Uf2FlashPlan {
  const parsed = parseUf2(input.uf2Bytes);
  const warnings: string[] = [];
  if (parsed.familyId === undefined) {
    throw new Error("UF2 does not declare a family id; direct flashing is blocked.");
  }
  if (input.expectedFamilyId !== parsed.familyId) {
    throw new Error(
      `UF2 family ${parsed.familyIdHex} does not match expected ${hex32(input.expectedFamilyId)}.`,
    );
  }

  return {
    artifact: {
      ...parsed.artifact,
      blockCount: parsed.blockCount,
      familyId: parsed.familyId,
      familyIdHex: parsed.familyIdHex,
      fileName: normalizedUf2FileName(input.fileName),
      payloadSize: parsed.payloadSize,
      targetAddressRange: parsed.targetAddressRange,
    },
    hardwareVerified: false,
    parsed,
    targetBootloader: {
      expectedVolumeHints: [
        ...(input.expectedVolumeHints ?? defaultUf2VolumeHints(input.boardName)),
      ],
      familyId: input.expectedFamilyId,
      name: input.bootloaderName ?? "UF2 mass-storage bootloader",
    },
    warnings,
  };
}

function isDirectoryHandle(
  handle: Uf2FileSystemAccessTarget,
): handle is Uf2FileSystemDirectoryHandleLike {
  return typeof (handle as Uf2FileSystemDirectoryHandleLike).getFileHandle === "function";
}

function isFileHandle(handle: Uf2FileSystemAccessTarget): handle is Uf2FileSystemFileHandleLike {
  return typeof (handle as Uf2FileSystemFileHandleLike).createWritable === "function";
}

function emitProgress(progress: Uf2FlashProgress[], io: Uf2FlashIo, next: Uf2FlashProgress) {
  progress.push(next);
  io.onProgress?.(next);
}

export function flashUf2ViaFileSystemAccess(
  fileHandleOrDir: Uf2FileSystemAccessTarget,
  uf2Bytes: Uf2Bytes,
  io: Uf2FlashIo,
): Promise<Uf2FileSystemFlashResult> {
  return runApp(
    "firmware.flash-uf2",
    Effect.gen(function* () {
      const { bytes, fileName, log, parsed, progress } = yield* Effect.try({
        try: () => {
          const bytes = bytesView(uf2Bytes);
          const parsed = parseUf2(bytes);
          if (parsed.familyId !== io.expectedFamilyId) {
            throw new Error(
              `UF2 family ${parsed.familyIdHex ?? "not declared"} does not match expected ${hex32(io.expectedFamilyId)}.`,
            );
          }
          const fileName = normalizedUf2FileName(io.fileName);
          const progress: Uf2FlashProgress[] = [];
          const log: string[] = [];
          emitProgress(progress, io, {
            bytesWritten: 0,
            fileName,
            phase: "validating",
            totalBytes: bytes.byteLength,
          });
          log.push(
            `validated ${fileName} (${bytes.byteLength} bytes, ${parsed.blockCount} UF2 blocks)`,
          );
          return { bytes, fileName, log, parsed, progress };
        },
        catch: (cause) => platformError("firmware.validate-uf2", cause),
      });

      const fileHandle = isDirectoryHandle(fileHandleOrDir)
        ? yield* Effect.tryPromise({
            try: () => fileHandleOrDir.getFileHandle(fileName, { create: true }),
            catch: (cause) => platformError("firmware.open-uf2-target", cause),
          })
        : fileHandleOrDir;
      if (!isFileHandle(fileHandle)) {
        return yield* Effect.fail(
          platformError(
            "firmware.open-uf2-target",
            "Selected target is not a File System Access file or directory handle.",
          ),
        );
      }
      const volumeHints = io.expectedVolumeHints ?? [];
      if (
        volumeHints.length > 0 &&
        fileHandleOrDir.name &&
        !volumeHints.some(
          (hint) => normalizedVolumeName(hint) === normalizedVolumeName(fileHandleOrDir.name!),
        )
      ) {
        return yield* Effect.fail(
          platformError(
            "firmware.validate-uf2-volume",
            `Selected volume ${fileHandleOrDir.name} does not match ${volumeHints.join(", ")}.`,
          ),
        );
      }

      let bytesWritten = 0;
      yield* Effect.acquireUseRelease(
        Effect.tryPromise({
          try: () => fileHandle.createWritable(),
          catch: (cause) => platformError("firmware.open-uf2-writable", cause),
        }),
        (writable) => {
          const chunkSize = Math.max(1, Math.floor(io.chunkSize ?? 64 * 1024));
          const offsets = Array.from(
            { length: Math.ceil(bytes.byteLength / chunkSize) },
            (_, index) => index * chunkSize,
          );
          return Effect.forEach(
            offsets,
            (offset) => {
              const chunk = bytes.slice(offset, Math.min(offset + chunkSize, bytes.byteLength));
              return Effect.andThen(
                Effect.tryPromise({
                  try: () => writable.write(chunk),
                  catch: (cause) => platformError("firmware.write-uf2", cause),
                }),
                Effect.sync(() => {
                  bytesWritten += chunk.byteLength;
                  emitProgress(progress, io, {
                    bytesWritten,
                    fileName,
                    phase: "writing",
                    totalBytes: bytes.byteLength,
                  });
                }),
              );
            },
            { concurrency: 1, discard: true },
          );
        },
        (writable) =>
          Effect.tryPromise({
            try: () => writable.close(),
            catch: (cause) => platformError("firmware.close-uf2-writable", cause),
          }),
      );

      emitProgress(progress, io, {
        bytesWritten,
        fileName,
        phase: "done",
        totalBytes: bytes.byteLength,
      });
      log.push(`copied ${fileName} to ${fileHandleOrDir.name ?? "selected bootloader volume"}`);
      return {
        artifact: parsed.artifact,
        bytesWritten,
        fileName,
        hardwareVerified: false,
        log,
        ok: true,
        parsed,
        progress,
        volumeName: fileHandleOrDir.name,
      } satisfies Uf2FileSystemFlashResult;
    }),
  );
}

function isChromiumLike(navigatorLike: Uf2FlashSupportEnvironment["navigator"]) {
  const brands = navigatorLike?.userAgentData?.brands ?? [];
  if (
    brands.some((brand) => /Chromium|Google Chrome|Microsoft Edge|Brave|Opera/i.test(brand.brand))
  ) {
    return true;
  }

  const userAgent = navigatorLike?.userAgent ?? "";
  return /\b(Chrome|Chromium|Edg|OPR|Brave)\//i.test(userAgent);
}

function defaultSupportEnvironment(): Uf2FlashSupportEnvironment {
  const root = globalThis as typeof globalThis & {
    navigator?: Uf2FlashSupportEnvironment["navigator"];
    showDirectoryPicker?: unknown;
  };
  return {
    isBrowser: typeof window !== "undefined",
    isSecureContext: root.isSecureContext,
    navigator: root.navigator,
    showDirectoryPicker: root.showDirectoryPicker,
  };
}

export function detectUf2FileSystemAccessSupport(
  environment: Uf2FlashSupportEnvironment = defaultSupportEnvironment(),
): Uf2FlashSupport {
  const isBrowser = environment.isBrowser === true;
  const secureContext = environment.isSecureContext === true;
  const canPickDirectory = typeof environment.showDirectoryPicker === "function";
  const chromium = isChromiumLike(environment.navigator);
  const browserFamily = chromium ? "chromium" : environment.navigator ? "non-chromium" : "unknown";
  const guidance: string[] = [];

  if (!isBrowser) guidance.push("Open kbui in a browser to copy UF2 files directly.");
  if (!secureContext) {
    guidance.push("File System Access writes require a secure context such as HTTPS or localhost.");
  }
  if (!chromium) {
    guidance.push("Directory picking for UF2 copy requires a Chromium-family browser.");
  }
  if (!canPickDirectory) {
    guidance.push("This browser cannot pick a bootloader directory for direct UF2 copy.");
  }

  const supported = isBrowser && secureContext && canPickDirectory && chromium;
  return {
    browserFamily,
    canPickDirectory,
    guidance,
    reason: supported ? undefined : guidance[0],
    secureContext,
    supported,
  };
}

function normalizedVolumeName(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function verifyUf2Reconnect(
  reconnect: () => Promise<Uf2ReconnectConnection>,
  expected: Uf2ReconnectExpectation = {},
): Promise<Uf2VerifyResult> {
  return runApp(
    "firmware.verify-uf2-reconnect",
    Effect.gen(function* () {
      const log: string[] = ["waiting for keyboard reconnect"];
      const warnings: string[] = [];
      const connection = yield* Effect.tryPromise({
        try: reconnect,
        catch: (cause) => platformError("firmware.reconnect-after-uf2", cause),
      });

      if (connection.status !== "connected") {
        return {
          connection,
          log: [...log, connection.message ?? "keyboard did not reconnect"],
          message: connection.message ?? "Keyboard did not reconnect.",
          ok: false,
          warnings,
        };
      }

      const mismatches: string[] = [];
      if (expected.vendorId !== undefined && connection.vendorId !== expected.vendorId) {
        mismatches.push(`vendor ${hex32(connection.vendorId ?? 0)} != ${hex32(expected.vendorId)}`);
      }
      if (expected.productId !== undefined && connection.productId !== expected.productId) {
        mismatches.push(
          `product ${hex32(connection.productId ?? 0)} != ${hex32(expected.productId)}`,
        );
      }
      if (expected.deviceKey && connection.deviceKey !== expected.deviceKey) {
        mismatches.push(`device key ${connection.deviceKey ?? "unknown"} != ${expected.deviceKey}`);
      }
      if (expected.protocol && connection.protocol !== expected.protocol) {
        mismatches.push(`protocol ${connection.protocol ?? "unknown"} != ${expected.protocol}`);
      }
      if (
        expected.productName &&
        connection.productName &&
        connection.productName !== expected.productName
      ) {
        warnings.push(
          `Reconnected product name is ${connection.productName}, expected ${expected.productName}.`,
        );
      }

      const metadata = {
        keymapRead: Array.isArray(connection.detection?.keymap),
        layerCount: connection.detection?.layerCount,
        protocolVersion: connection.detection?.protocolVersion,
      };
      if (connection.protocol === "via-v3" && metadata.protocolVersion === undefined) {
        warnings.push("VIA protocol metadata was not read after reconnect.");
      }

      if (mismatches.length > 0) {
        return {
          connection,
          log: [...log, ...mismatches.map((item) => `mismatch: ${item}`)],
          message: "Keyboard reconnected, but identity did not match the expected target.",
          metadata,
          ok: false,
          warnings,
        };
      }

      return {
        connection,
        log: [
          ...log,
          `reconnected ${connection.productName ?? "keyboard"} over ${connection.protocol ?? "unknown protocol"}`,
          metadata.protocolVersion === undefined
            ? "metadata read skipped"
            : `VIA protocol ${metadata.protocolVersion}, ${metadata.layerCount ?? "unknown"} layers`,
        ],
        message: "Keyboard reconnected and identity matched.",
        metadata,
        ok: true,
        warnings,
      };
    }),
  );
}

export function defaultUf2VolumeHints(boardName: string) {
  const slug = boardName
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 11);
  return [...new Set(["RPI-RP2", "UF2BOOT", "NODEBOOT", "NICENANO", slug].filter(Boolean))];
}
