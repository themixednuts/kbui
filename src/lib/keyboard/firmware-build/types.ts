import type {
  FirmwareDiagnostic,
  FirmwareGeneratedFile,
  FirmwareSourceBundle,
} from "../firmware-source";

export type FirmwareBuildHashAlgorithm = "sha256" | "sha512" | "fnv1a32";
export type FirmwareBuildOutputFormat = "uf2" | "bin" | "hex";
export type FirmwareBuildMcuFamily = "rp2040" | "stm32" | "avr" | "nrf52" | "unknown";
export type FirmwareBuildCompilerFamily = "clang" | "gcc";
export type FirmwareBuildCacheBackend = "opfs";
export type FirmwareBuildCacheMode = "cache-first" | "refresh" | "offline";

export interface FirmwareBuildHash {
  algorithm: FirmwareBuildHashAlgorithm;
  value: string;
}

export interface FirmwareBuildFileRef {
  hash: FirmwareBuildHash;
  path: string;
  sizeBytes: number;
}

export interface FirmwareBuildBudget {
  bytes: number;
  warningBytes?: number;
}

export interface FirmwareBuildBoardIdentity {
  boardFamily: FirmwareBuildMcuFamily;
  bootloader?: string;
  keyboardPath: string;
  layout?: string;
  mcu: string;
  vendorProductId?: {
    productId: number;
    vendorId: number;
  };
}

export interface FirmwareBuildCompilerIdentity {
  family: FirmwareBuildCompilerFamily;
  runtime?: "wasi" | "wasix";
  targetTriple: string;
  version: string;
}

export interface FirmwareBuildFeatureSet {
  combos?: boolean;
  keyOverrides?: boolean;
  lighting?: "none" | "rgblight" | "rgb-matrix" | "board-specific";
  macros?: boolean;
  nkro?: boolean;
  tapDance?: boolean;
  via?: boolean;
  [feature: string]: boolean | number | string | undefined;
}

export interface FirmwareObjectBundleManifest {
  board: FirmwareBuildBoardIdentity;
  bundle: {
    hash: FirmwareBuildHash;
    objects: FirmwareBuildFileRef[];
    staticLibraries: FirmwareBuildFileRef[];
  };
  compiler: FirmwareBuildCompilerIdentity;
  enabledFeatures: FirmwareBuildFeatureSet;
  flags: {
    cflags: string[];
    cppflags?: string[];
    defines?: Record<string, string | true>;
    ldflags: string[];
  };
  linkerScript: FirmwareBuildFileRef;
  manifestVersion: 1;
  output: {
    fileExtension: FirmwareBuildOutputFormat;
    format: FirmwareBuildOutputFormat;
    uf2FamilyId?: number;
  };
  qmk: {
    commit: string;
    keymapBase?: string;
    repository?: string;
  };
  resourceBudgets: {
    flash: FirmwareBuildBudget;
    ram: FirmwareBuildBudget;
  };
  toolchain: {
    archive?: FirmwareBuildFileRef;
    wasmClang?: FirmwareBuildFileRef;
    wasmLd?: FirmwareBuildFileRef;
  };
}

export interface FirmwareBuildCachePlan {
  backend: FirmwareBuildCacheBackend;
  bundleDirectory: string;
  cacheKey: string;
  mode: FirmwareBuildCacheMode;
  sourceDirectory: string;
  toolchainDirectory: string;
}

export interface FirmwareBuildRequest {
  cache?: Partial<Pick<FirmwareBuildCachePlan, "backend" | "mode">>;
  generatedSource: FirmwareSourceBundle;
  manifest: FirmwareObjectBundleManifest;
  outputFileName?: string;
  requestId: string;
}

export interface FirmwareBuildTiming {
  compileMs?: number;
  fetchMs?: number;
  linkMs?: number;
  objcopyMs?: number;
  totalMs: number;
  uf2Ms?: number;
}

export interface FirmwareBuildArtifact {
  bytes: Uint8Array;
  fileName: string;
  format: FirmwareBuildOutputFormat;
  hash: FirmwareBuildHash;
  sizeBytes: number;
}

export interface FirmwareBuildLogEntry {
  message: string;
  phase: "cache" | "compile" | "link" | "objcopy" | "uf2" | "worker";
}

export type FirmwareBuildResult =
  | {
      artifact: FirmwareBuildArtifact;
      cache: FirmwareBuildCachePlan;
      diagnostics: FirmwareDiagnostic[];
      generatedFiles: FirmwareGeneratedFile[];
      log: FirmwareBuildLogEntry[];
      manifest: FirmwareObjectBundleManifest;
      ok: true;
      requestId: string;
      timings: FirmwareBuildTiming;
    }
  | {
      cache?: FirmwareBuildCachePlan;
      diagnostics: FirmwareDiagnostic[];
      error: {
        code:
          | "browser_build_unavailable"
          | "bundle_missing"
          | "compile_failed"
          | "link_failed"
          | "objcopy_failed"
          | "toolchain_missing"
          | "toolchain_unsupported"
          | "uf2_failed";
        message: string;
      };
      log: FirmwareBuildLogEntry[];
      manifest?: FirmwareObjectBundleManifest;
      ok: false;
      requestId: string;
      timings?: FirmwareBuildTiming;
    };

export interface FirmwareBuildWorkerBuildMessage {
  request: FirmwareBuildRequest;
  type: "build";
}

export interface FirmwareBuildWorkerWarmCacheMessage {
  cache: FirmwareBuildCachePlan;
  manifest: FirmwareObjectBundleManifest;
  type: "warm-cache";
}

export type FirmwareBuildWorkerMessage =
  | FirmwareBuildWorkerBuildMessage
  | FirmwareBuildWorkerWarmCacheMessage;

export type FirmwareBuildWorkerResponse =
  | {
      requestId?: string;
      result: FirmwareBuildResult;
      type: "result";
    }
  | {
      message: string;
      requestId?: string;
      type: "unavailable";
    };

export function firmwareObjectBundleCacheKey(manifest: FirmwareObjectBundleManifest) {
  return [
    "firmware-build",
    `manifest-v${manifest.manifestVersion}`,
    manifest.qmk.commit,
    manifest.board.keyboardPath,
    manifest.board.boardFamily,
    manifest.board.mcu,
    `${manifest.compiler.family}-${manifest.compiler.version}`,
    manifest.compiler.targetTriple,
    manifest.output.format,
    manifest.bundle.hash.algorithm,
    manifest.bundle.hash.value,
  ]
    .map(cacheKeySegment)
    .join("/");
}

function cacheKeySegment(value: string | number) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
