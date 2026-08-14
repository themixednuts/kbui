import { Effect, FiberMap, Schedule } from "effect";
import type { Attachment } from "svelte/attachments";

import { runApp, startScopedApp } from "$lib/app/runtime";
import { platformError, type PlatformError } from "$lib/effect/errors";
import { effectAttachment } from "$lib/effect/svelte";

const APP_CACHE_PREFIX = "klakson-cache-";
const FORCE_REFRESH_MESSAGE = "klakson:force-refresh";
const appUpdateRetrySchedule = Schedule.spaced("3 seconds").pipe(
  Schedule.jittered,
  Schedule.upTo({ times: 3 }),
);

function retryAppUpdate<A>(effect: Effect.Effect<A, PlatformError>) {
  return effect.pipe(
    Effect.tapError((error) =>
      Effect.logWarning("App update operation failed").pipe(
        Effect.annotateLogs({ operation: error.operation }),
      ),
    ),
    Effect.retry({ schedule: appUpdateRetrySchedule }),
  );
}

export const STALE_BUILD_DESCRIPTION =
  "This tab is on an old build. Reload.";

type UpdateNotificationOptions = {
  checkForUpdate: () => Promise<unknown>;
  notify: (description: string) => void;
};

export function isChunkLoadFailure(value: unknown): boolean {
  const message = errorMessage(value).toLowerCase();
  return [
    "failed to fetch dynamically imported module",
    "importing a module script failed",
    "error loading dynamically imported module",
    "failed to load module script",
    "chunkloaderror",
    "loading chunk",
  ].some((fragment) => message.includes(fragment));
}

export function checkForUpdateEffect(checkForUpdate: () => Promise<unknown>) {
  return retryAppUpdate(
    Effect.tryPromise({
      try: checkForUpdate,
      catch: (cause) => platformError("app-update.check", cause),
    }),
  );
}

function updateRegistrationEffect(registration: ServiceWorkerRegistration) {
  return retryAppUpdate(
    Effect.tryPromise({
      try: () => registration.update(),
      catch: (cause) => platformError("app-update.service-worker.update", cause),
    }),
  );
}

function appUpdateNotificationsEffect({ checkForUpdate, notify }: UpdateNotificationOptions) {
  return Effect.gen(function* () {
    const run = yield* FiberMap.makeRuntime<never, string>();
    const notifyStaleBuild = () => notify(STALE_BUILD_DESCRIPTION);
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isChunkLoadFailure(event.reason)) notifyStaleBuild();
    };
    const handleResourceError = (event: Event) => {
      if (event instanceof ErrorEvent && isChunkLoadFailure(event.error ?? event.message)) {
        notifyStaleBuild();
        return;
      }

      const target = event.target;
      const url =
        target instanceof HTMLScriptElement
          ? target.src
          : target instanceof HTMLLinkElement
            ? target.href
            : "";
      if (url.includes("/_app/immutable/")) notifyStaleBuild();
    };
    const handlePreloadError = (event: Event) => {
      event.preventDefault();
      notifyStaleBuild();
    };
    const checkVisibleBuild = () => {
      if (document.visibilityState === "visible") {
        run("visible-build-check", checkForUpdateEffect(checkForUpdate));
      }
    };

    yield* Effect.acquireRelease(
      Effect.sync(() => {
        window.addEventListener("unhandledrejection", handleUnhandledRejection);
        window.addEventListener("error", handleResourceError, true);
        window.addEventListener("vite:preloadError", handlePreloadError);
        document.addEventListener("visibilitychange", checkVisibleBuild);
      }),
      () =>
        Effect.sync(() => {
          window.removeEventListener("unhandledrejection", handleUnhandledRejection);
          window.removeEventListener("error", handleResourceError, true);
          window.removeEventListener("vite:preloadError", handlePreloadError);
          document.removeEventListener("visibilitychange", checkVisibleBuild);
        }),
    );

    if ("serviceWorker" in navigator) {
      const registration = yield* retryAppUpdate(
        Effect.tryPromise({
          try: () => navigator.serviceWorker.ready,
          catch: (cause) => platformError("app-update.service-worker.ready", cause),
        }),
      );
      yield* watchServiceWorkerRegistration(registration, notify, run);
    }

    yield* Effect.never;
  });
}

export function appUpdateAttachment(options: UpdateNotificationOptions): Attachment<HTMLElement> {
  return effectAttachment("app-update.notifications", appUpdateNotificationsEffect(options));
}

/** Compatibility bridge for non-Svelte callers. New UI code uses {@link appUpdateAttachment}. */
export function setupAppUpdateNotifications(options: UpdateNotificationOptions): () => void {
  return startScopedApp("app-update.notifications", appUpdateNotificationsEffect(options));
}

export function deleteAppCacheEffect(
  key: string,
  deleteCache: (key: string) => Promise<boolean> = (cacheKey) => caches.delete(cacheKey),
) {
  return retryAppUpdate(
    Effect.tryPromise({
      try: () => deleteCache(key),
      catch: (cause) => platformError("app-update.cache.delete", cause),
    }).pipe(
      Effect.filterOrFail(
        (deleted) => deleted,
        () => platformError("app-update.cache.delete", `Cache ${key} was not deleted.`),
      ),
      Effect.asVoid,
    ),
  );
}

const forceRefreshClientEffect = Effect.gen(function* () {
  if ("serviceWorker" in navigator) {
    const registrations = yield* retryAppUpdate(
      Effect.tryPromise({
        try: () => navigator.serviceWorker.getRegistrations(),
        catch: (cause) => platformError("app-update.service-worker.registrations", cause),
      }),
    );

    yield* Effect.forEach(
      registrations,
      (registration) =>
        Effect.gen(function* () {
          yield* Effect.sync(() => {
            for (const worker of [
              registration.waiting,
              registration.installing,
              registration.active,
            ]) {
              worker?.postMessage({ type: FORCE_REFRESH_MESSAGE });
            }
          });
          yield* updateRegistrationEffect(registration);
          yield* Effect.sync(() => {
            registration.waiting?.postMessage({ type: FORCE_REFRESH_MESSAGE });
          });
        }),
      { concurrency: 4, discard: true },
    );
  }

  if ("caches" in window) {
    const keys = yield* retryAppUpdate(
      Effect.tryPromise({
        try: () => caches.keys(),
        catch: (cause) => platformError("app-update.caches.keys", cause),
      }),
    );
    yield* Effect.forEach(
      keys.filter((key) => key.startsWith(APP_CACHE_PREFIX)),
      (key) => deleteAppCacheEffect(key),
      { concurrency: 4, discard: true },
    );
  }
}).pipe(Effect.ensuring(Effect.sync(() => window.location.reload())));

export function forceRefreshClient(): Promise<void> {
  return runApp("app-update.force-refresh", forceRefreshClientEffect);
}

function watchServiceWorkerRegistration(
  registration: ServiceWorkerRegistration,
  notify: (description: string) => void,
  run: <A, E>(key: string, effect: Effect.Effect<A, E>) => unknown,
) {
  return Effect.acquireRelease(
    Effect.sync(() => {
      let removeInstallingListener: (() => void) | undefined;
      const notifyWaitingWorker = () => {
        if (registration.waiting) {
          notify("A new app build is ready. Reload to switch to it.");
        }
      };
      const handleUpdateFound = () => {
        removeInstallingListener?.();
        const worker = registration.installing;
        if (!worker) return;

        const handleStateChange = () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            notify("A new app build is ready. Reload to switch to it.");
          }
        };
        worker.addEventListener("statechange", handleStateChange);
        removeInstallingListener = () =>
          worker.removeEventListener("statechange", handleStateChange);
      };

      notifyWaitingWorker();
      registration.addEventListener("updatefound", handleUpdateFound);
      run("service-worker-update", updateRegistrationEffect(registration));
      return () => {
        registration.removeEventListener("updatefound", handleUpdateFound);
        removeInstallingListener?.();
      };
    }),
    (cleanup) => Effect.sync(cleanup),
  );
}

function errorMessage(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "message" in value) {
    const message = (value as { message?: unknown }).message;
    return typeof message === "string" ? message : "";
  }
  return "";
}
