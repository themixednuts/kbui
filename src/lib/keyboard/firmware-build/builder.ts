import {
  firmwareObjectBundleCacheKey,
  type FirmwareBuildCachePlan,
  type FirmwareBuildRequest,
  type FirmwareBuildResult,
  type FirmwareBuildWorkerResponse,
} from "./types";

export const firmwareBuildUnavailableMessage =
  "in-browser WASM ARM firmware build unavailable: no verified ARM-capable WASM LLVM toolchain is configured";

const wasmLlvmArmBlocker =
  "The tested WASM Clang builds expose ELF lld/llvm-objcopy, but omit the ARM target required for thumbv6m-none-eabi.";

export interface FirmwareBuilder {
  build(request: FirmwareBuildRequest): Promise<FirmwareBuildResult>;
}

export interface BrowserFirmwareBuildEnvironment {
  isBrowser?: boolean;
  navigator?: {
    storage?: {
      getDirectory?: unknown;
    };
  };
  toolchainAvailable?: boolean;
  Worker?: typeof Worker;
}

export class FirmwareBuildUnavailableError extends Error {
  readonly code = "browser_build_unavailable";

  constructor(message = firmwareBuildUnavailableMessage) {
    super(message);
    this.name = "FirmwareBuildUnavailableError";
  }
}

export class WasmFirmwareBuilder implements FirmwareBuilder {
  constructor(private readonly environment = defaultBrowserFirmwareBuildEnvironment()) {}

  async build(request: FirmwareBuildRequest): Promise<FirmwareBuildResult> {
    const started = performanceNow();
    if (!isBrowserBuildAvailable(this.environment)) {
      return unavailableResult(request, plannedCacheFor(request), elapsedSince(started));
    }

    const WorkerCtor = this.environment.Worker;
    if (typeof WorkerCtor !== "function") {
      return unavailableResult(request, plannedCacheFor(request), elapsedSince(started));
    }

    try {
      return await buildInWorker(WorkerCtor, request);
    } catch (error) {
      return {
        cache: plannedCacheFor(request),
        diagnostics: request.generatedSource.diagnostics,
        error: {
          code: "browser_build_unavailable",
          message: error instanceof Error ? error.message : firmwareBuildUnavailableMessage,
        },
        log: [
          {
            message: "worker launch failed",
            phase: "worker",
          },
        ],
        manifest: request.manifest,
        ok: false,
        requestId: request.requestId,
        timings: {
          totalMs: elapsedSince(started),
        },
      };
    }
  }
}

export function isBrowserBuildAvailable(
  environment: BrowserFirmwareBuildEnvironment = defaultBrowserFirmwareBuildEnvironment(),
): boolean {
  return (
    environment.isBrowser === true &&
    typeof environment.Worker === "function" &&
    typeof environment.navigator?.storage?.getDirectory === "function" &&
    environment.toolchainAvailable === true
  );
}

function defaultBrowserFirmwareBuildEnvironment(): BrowserFirmwareBuildEnvironment {
  const root = globalThis as typeof globalThis &
    BrowserFirmwareBuildEnvironment & {
      __KBGUI_WASM_ARM_LLVM_AVAILABLE__?: boolean;
    };
  return {
    isBrowser: typeof window !== "undefined",
    navigator: root.navigator,
    toolchainAvailable: root.__KBGUI_WASM_ARM_LLVM_AVAILABLE__ === true,
    Worker: root.Worker,
  };
}

function plannedCacheFor(request: FirmwareBuildRequest): FirmwareBuildCachePlan {
  const cacheKey = firmwareObjectBundleCacheKey(request.manifest);
  return {
    backend: request.cache?.backend ?? "opfs",
    bundleDirectory: `bundles/${cacheKey}`,
    cacheKey,
    mode: request.cache?.mode ?? "cache-first",
    sourceDirectory: `work/${request.requestId}`,
    toolchainDirectory: "toolchains/wasm-llvm-arm",
  };
}

function unavailableResult(
  request: FirmwareBuildRequest,
  cache: FirmwareBuildCachePlan,
  totalMs: number,
): FirmwareBuildResult {
  return {
    cache,
    diagnostics: [
      ...request.generatedSource.diagnostics,
      {
        code: "wasm-arm-toolchain-unavailable",
        message: wasmLlvmArmBlocker,
        severity: "error",
      },
    ],
    error: {
      code: "toolchain_unsupported",
      message: `${firmwareBuildUnavailableMessage}. ${wasmLlvmArmBlocker}`,
    },
    log: [
      {
        message: `planned OPFS cache key ${cache.cacheKey}`,
        phase: "cache",
      },
      {
        message: wasmLlvmArmBlocker,
        phase: "worker",
      },
    ],
    manifest: request.manifest,
    ok: false,
    requestId: request.requestId,
    timings: {
      totalMs,
    },
  };
}

function buildInWorker(
  WorkerCtor: typeof Worker,
  request: FirmwareBuildRequest,
): Promise<FirmwareBuildResult> {
  return new Promise((resolve, reject) => {
    const worker = new WorkerCtor(new URL("./firmware-build.worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (event: MessageEvent<FirmwareBuildWorkerResponse>) => {
      if (event.data.type === "result") {
        worker.terminate();
        resolve(event.data.result);
        return;
      }
      worker.terminate();
      reject(new FirmwareBuildUnavailableError(event.data.message));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message));
    };
    worker.postMessage({
      request,
      type: "build",
    });
  });
}

function performanceNow() {
  return typeof performance === "undefined" ? 0 : performance.now();
}

function elapsedSince(started: number) {
  return Math.max(0, Math.round((performanceNow() - started) * 10) / 10);
}
