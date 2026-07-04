import {
  firmwareObjectBundleCacheKey,
  type FirmwareBuildCachePlan,
  type FirmwareBuildWorkerMessage,
  type FirmwareBuildWorkerResponse,
} from "./types";
import { firmwareBuildUnavailableMessage } from "./builder";

type WorkerLikeScope = {
  onmessage: ((event: { data: FirmwareBuildWorkerMessage }) => void) | null;
  postMessage: (message: FirmwareBuildWorkerResponse) => void;
};

const workerScope = globalThis as unknown as WorkerLikeScope;

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

/*
 * Future implementation boundary:
 * - Fetch the manifest-selected WASM clang/lld/objcopy toolchain and object bundle.
 * - Store decoded toolchain files and per-board objects in OPFS under cachePlan.cacheKey.
 * - Write generated keymap.c/config/rules files to sourceDirectory.
 * - Compile only generated keymap sources in this worker.
 * - Link with the manifest's object/library list and linker script.
 * - Convert the linked image to the manifest output format, UF2 first for RP2040.
 *
 * This stub intentionally refuses so the UI cannot imply browser builds are ready.
 */
workerScope.onmessage = (event) => {
  const requestId = event.data.type === "build" ? event.data.request.requestId : undefined;
  const cache = cachePlanFor(event.data);
  const message =
    cache === undefined
      ? firmwareBuildUnavailableMessage
      : `${firmwareBuildUnavailableMessage}; planned cache key ${cache.cacheKey}`;

  workerScope.postMessage({
    message,
    requestId,
    type: "unavailable",
  });
};
