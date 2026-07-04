import {
  firmwareObjectBundleCacheKey,
  type FirmwareBuildCachePlan,
  type FirmwareBuildRequest,
  type FirmwareBuildResult,
  type FirmwareBuildWorkerMessage,
  type FirmwareBuildWorkerResponse,
} from "./types";
import { firmwareBuildUnavailableMessage } from "./builder";

type WorkerLikeScope = {
  onmessage: ((event: { data: FirmwareBuildWorkerMessage }) => void) | null;
  postMessage: (message: FirmwareBuildWorkerResponse) => void;
};

const workerScope = globalThis as unknown as WorkerLikeScope;
const wasmLlvmArmBlocker =
  "No configured WASM-hosted LLVM build has ARM codegen for thumbv6m-none-eabi; tested builds only reached ELF lld/llvm-objcopy.";

function cachePlanFor(message: FirmwareBuildWorkerMessage): FirmwareBuildCachePlan | undefined {
  if (message.type === "warm-cache") return message.cache;
  const cacheKey = firmwareObjectBundleCacheKey(message.request.manifest);
  return {
    backend: message.request.cache?.backend ?? "opfs",
    bundleDirectory: `bundles/${cacheKey}`,
    cacheKey,
    mode: message.request.cache?.mode ?? "cache-first",
    sourceDirectory: `work/${message.request.requestId}`,
    toolchainDirectory: "toolchains/wasm-clang",
  };
}

function performanceNow() {
  return typeof performance === "undefined" ? 0 : performance.now();
}

function elapsedSince(started: number) {
  return Math.max(0, Math.round((performanceNow() - started) * 10) / 10);
}

function unsupportedToolchainResult(
  request: FirmwareBuildRequest,
  cache: FirmwareBuildCachePlan,
  started: number,
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
        message: `OPFS cache root ${cache.cacheKey}`,
        phase: "cache",
      },
      {
        message: "compile/link/objcopy skipped because the WASM Clang binary has no ARM target",
        phase: "worker",
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
      totalMs: elapsedSince(started),
    },
  };
}

workerScope.onmessage = (event) => {
  const requestId = event.data.type === "build" ? event.data.request.requestId : undefined;
  const cache = cachePlanFor(event.data);
  if (event.data.type === "build" && cache) {
    workerScope.postMessage({
      requestId,
      result: unsupportedToolchainResult(event.data.request, cache, performanceNow()),
      type: "result",
    });
    return;
  }

  workerScope.postMessage({
    message:
      cache === undefined
        ? firmwareBuildUnavailableMessage
        : `${firmwareBuildUnavailableMessage}; planned cache key ${cache.cacheKey}`,
    requestId,
    type: "unavailable",
  });
};
