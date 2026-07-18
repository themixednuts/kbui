/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true" />
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from "$service-worker";
import { Effect } from "effect";

import { platformError } from "./lib/effect/errors";
import { selfHeal } from "./lib/effect/self-healing";
import { runWorkerEffect } from "./lib/effect/worker-runtime";

const worker = self as unknown as ServiceWorkerGlobalScope;
const CACHE_PREFIX = "klakson-cache-";
const CACHE_NAME = `${CACHE_PREFIX}${version}`;
const PRECACHE_ASSETS = [...build, ...files];

const clearKlaksonCachesEffect = Effect.gen(function* () {
  const keys = yield* Effect.tryPromise({
    try: () => caches.keys(),
    catch: (cause) => platformError("service-worker.list-caches", cause),
  });
  yield* Effect.forEach(
    keys.filter((key) => key.startsWith(CACHE_PREFIX)),
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
    runWorkerEffect(
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
    runWorkerEffect(
      "service-worker.activate",
      Effect.gen(function* () {
        const keys = yield* Effect.tryPromise({
          try: () => caches.keys(),
          catch: (cause) => platformError("service-worker.list-caches", cause),
        });
        yield* Effect.forEach(
          keys.filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME),
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
  if (data?.type !== "klakson:force-refresh") return;
  event.waitUntil(
    runWorkerEffect(
      "service-worker.force-refresh",
      Effect.andThen(
        clearKlaksonCachesEffect,
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
  if (url.origin !== worker.location.origin || !PRECACHE_ASSETS.includes(url.pathname)) return;

  event.respondWith(
    runWorkerEffect(
      "service-worker.fetch",
      Effect.gen(function* () {
        const cached = yield* Effect.tryPromise({
          try: () => caches.match(event.request),
          catch: (cause) => platformError("service-worker.match-cache", cause),
        });
        if (cached) return cached;
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
