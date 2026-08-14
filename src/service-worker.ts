/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from "$service-worker";
import { Effect } from "effect";

import { platformError } from "./lib/effect/errors";
import { selfHeal } from "./lib/effect/self-healing";
import { runServiceWorkerEffect } from "./lib/effect/service-worker-runtime";

const worker = self as unknown as ServiceWorkerGlobalScope;
const CACHE_PREFIX = "kbui-cache-";
const LEGACY_CACHE_PREFIX = "klakson-cache-";
const CACHE_NAME = `${CACHE_PREFIX}${version}`;
const PRECACHE_ASSETS = [...build, ...files];

// Dynamic endpoints that must always hit the network and must never be read
// from — or written to — any cache. `/_app/remote/*` carries SvelteKit remote
// queries/commands and `/api/*` carries live JSON. A cached success (or worse, a
// cached `{"message":"Internal Error"}`) would replay stale data until a hard
// reload. These prefixes must never be served from the precache regardless of
// what `build`/`files` happen to contain.
const NETWORK_ONLY_PREFIXES = ["/_app/remote/", "/api/"];

function isNetworkOnlyPath(pathname: string) {
  return NETWORK_ONLY_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

const clearAppCachesEffect = Effect.gen(function* () {
  const keys = yield* Effect.tryPromise({
    try: () => caches.keys(),
    catch: (cause) => platformError("service-worker.list-caches", cause),
  });
  yield* Effect.forEach(
    keys.filter((key) => key.startsWith(CACHE_PREFIX) || key.startsWith(LEGACY_CACHE_PREFIX)),
    (key) =>
      selfHeal(
        Effect.tryPromise({
          try: () => caches.delete(key),
          catch: (cause) => platformError("service-worker.delete-cache", cause),
        }),
        "250 millis",
      ),
    { concurrency: 8, discard: true },
  );
});

const precacheAssetsEffect = Effect.gen(function* () {
  const cache = yield* selfHeal(
    Effect.tryPromise({
      try: () => caches.open(CACHE_NAME),
      catch: (cause) => platformError("service-worker.open-cache", cause),
    }),
    "250 millis",
  );
  yield* Effect.forEach(
    PRECACHE_ASSETS,
    (asset) => {
      const request = new Request(asset, { cache: "reload" });
      return selfHeal(
        Effect.gen(function* () {
          const response = yield* Effect.tryPromise({
            try: () => fetch(request),
            catch: (cause) => platformError("service-worker.fetch-asset", cause),
          });
          if (!response.ok) {
            return yield* Effect.fail(
              platformError("service-worker.fetch-asset", `HTTP ${response.status} for ${asset}`),
            );
          }
          yield* Effect.tryPromise({
            try: () => cache.put(request, response),
            catch: (cause) => platformError("service-worker.cache-asset", cause),
          });
        }),
        "250 millis",
      );
    },
    { concurrency: 8, discard: true },
  );
});

worker.addEventListener("install", (event) => {
  event.waitUntil(
    runServiceWorkerEffect(
      "service-worker.install",
      Effect.andThen(
        precacheAssetsEffect,
        Effect.tryPromise({
          try: () => worker.skipWaiting(),
          catch: (cause) => platformError("service-worker.skip-waiting", cause),
        }),
      ),
    ),
  );
});

worker.addEventListener("activate", (event) => {
  event.waitUntil(
    runServiceWorkerEffect(
      "service-worker.activate",
      Effect.gen(function* () {
        const keys = yield* Effect.tryPromise({
          try: () => caches.keys(),
          catch: (cause) => platformError("service-worker.list-caches", cause),
        });
        yield* Effect.forEach(
          keys.filter(
            (key) =>
              (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) ||
              key.startsWith(LEGACY_CACHE_PREFIX),
          ),
          (key) =>
            selfHeal(
              Effect.tryPromise({
                try: () => caches.delete(key),
                catch: (cause) => platformError("service-worker.delete-stale-cache", cause),
              }),
              "250 millis",
            ),
          { concurrency: 8, discard: true },
        );
        yield* Effect.tryPromise({
          try: () => worker.clients.claim(),
          catch: (cause) => platformError("service-worker.claim-clients", cause),
        });
      }),
    ),
  );
});

worker.addEventListener("message", (event) => {
  const data = event.data as { type?: string } | null;
  if (data?.type !== "kbui:force-refresh" && data?.type !== "klakson:force-refresh") return;
  event.waitUntil(
    runServiceWorkerEffect(
      "service-worker.force-refresh",
      Effect.andThen(
        clearAppCachesEffect,
        Effect.tryPromise({
          try: () => worker.skipWaiting(),
          catch: (cause) => platformError("service-worker.skip-waiting", cause),
        }),
      ),
    ),
  );
});

worker.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  // Never intercept dynamic endpoints: let them fall through to the network so
  // they are never served from — nor written to — the cache.
  if (isNetworkOnlyPath(url.pathname)) return;

  // Only the precached, content-hashed build/static assets are cache-eligible.
  if (url.origin !== worker.location.origin || !PRECACHE_ASSETS.includes(url.pathname)) return;

  event.respondWith(
    runServiceWorkerEffect(
      "service-worker.fetch",
      Effect.gen(function* () {
        const cached = yield* Effect.tryPromise({
          try: () => caches.match(event.request),
          catch: (cause) => platformError("service-worker.match-cache", cause),
        });
        if (cached) return cached;
        // Cache miss (e.g. a stale/evicted entry): fetch from network and serve
        // it directly. We deliberately do NOT cache.put() the runtime response —
        // precaching (install) is the only writer, and it stores ok responses
        // only, so an error response can never land in the cache.
        return yield* selfHeal(
          Effect.tryPromise({
            try: () => fetch(event.request),
            catch: (cause) => platformError("service-worker.fetch", cause),
          }),
          "250 millis",
        );
      }),
    ),
  );
});
