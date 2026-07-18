import { Effect, Fiber } from "effect";

import { profileFromCatalogForConnection } from "$lib/app/connect-flow";
import { forkApp, runApp } from "$lib/app/runtime";
import { platformError } from "$lib/effect/errors";
import {
  bestCatalogEntryForIdentity,
  type KeyboardCatalogEntry,
  type KeyboardCatalogIndexEntry,
} from "$lib/keyboard/catalog";
import type { ConnectionState } from "$lib/keyboard/transport";

import type { WorkbenchStore } from "./workbench-store.svelte";

type CatalogPayload<T> = {
  items: T;
};

type CatalogIdentity = {
  productId?: number;
  productName?: string;
  serialNumber?: string;
  vendorId?: number;
};

function plainCatalogIdentity(identity: CatalogIdentity): CatalogIdentity {
  return {
    productId: typeof identity.productId === "number" ? identity.productId : undefined,
    productName: typeof identity.productName === "string" ? identity.productName : undefined,
    serialNumber: typeof identity.serialNumber === "string" ? identity.serialNumber : undefined,
    vendorId: typeof identity.vendorId === "number" ? identity.vendorId : undefined,
  };
}

function remoteKeyboardIdentity(identity: CatalogIdentity) {
  return {
    productId: identity.productId,
    productName: identity.productName,
    vendorId: identity.vendorId,
  };
}

export function withResolvedQmkTarget(
  definition: KeyboardCatalogEntry,
  identityEntry: KeyboardCatalogEntry | undefined,
): KeyboardCatalogEntry {
  const resolvedQmk = identityEntry?.firmwareMetadata?.qmk;
  if (!resolvedQmk) return definition;

  return {
    ...definition,
    firmwareMetadata: {
      ...definition.firmwareMetadata,
      qmk: {
        ...definition.firmwareMetadata?.qmk,
        ...resolvedQmk,
        // The VIA definition owns the physical key order used by the live
        // matrix. Keep it when present while taking the exact build target,
        // ref, controller alternatives, and confirmation state from QMK's
        // USB-identity catalog.
        keyOrder: definition.firmwareMetadata?.qmk?.keyOrder ?? resolvedQmk.keyOrder,
      },
    },
  };
}

export interface ViaCatalogResolverOptions {
  getViaKeyboardDetail: (id: string) => Promise<KeyboardCatalogEntry>;
  getViaKeyboardIndex: () => Promise<CatalogPayload<KeyboardCatalogIndexEntry[]>>;
  resolveKeyboardIdentity: (identity: CatalogIdentity) => Promise<KeyboardCatalogEntry | undefined>;
  workbench: WorkbenchStore;
}

export function createViaCatalogResolver({
  getViaKeyboardDetail,
  getViaKeyboardIndex,
  resolveKeyboardIdentity,
  workbench,
}: ViaCatalogResolverOptions) {
  let catalogIndexFiber:
    | Fiber.Fiber<CatalogPayload<KeyboardCatalogIndexEntry[]>, ReturnType<typeof platformError>>
    | undefined;
  const identityEntryFibers = new Map<
    string,
    Fiber.Fiber<KeyboardCatalogEntry | undefined, ReturnType<typeof platformError>>
  >();

  function currentFilters() {
    return [
      { vendorId: workbench.profile.vendorId, productId: workbench.profile.productId },
      { vendorId: workbench.profile.vendorId },
    ];
  }

  function loadCatalogIndexEffect() {
    return Effect.suspend(() => {
      if (catalogIndexFiber) return Fiber.join(catalogIndexFiber);

      let started!: Fiber.Fiber<
        CatalogPayload<KeyboardCatalogIndexEntry[]>,
        ReturnType<typeof platformError>
      >;
      started = forkApp(
        "via-catalog.index",
        Effect.tryPromise({
          try: getViaKeyboardIndex,
          catch: (cause) => platformError("via-catalog.index", cause),
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              if (catalogIndexFiber === started) catalogIndexFiber = undefined;
            }),
          ),
        ),
      );
      catalogIndexFiber = started;
      return Fiber.join(started);
    });
  }

  function catalogSummaryEffect(identity: CatalogIdentity) {
    return Effect.map(loadCatalogIndexEffect(), (payload) =>
      bestCatalogEntryForIdentity(payload.items, identity),
    );
  }

  function identityKey(identity: CatalogIdentity) {
    return `${identity.vendorId ?? ""}:${identity.productId ?? ""}:${identity.productName ?? ""}`;
  }

  function qmkEntryEffect(identity: CatalogIdentity) {
    return Effect.suspend(() => {
      const key = identityKey(identity);
      const existing = identityEntryFibers.get(key);
      if (existing) return Fiber.join(existing);

      let started!: Fiber.Fiber<KeyboardCatalogEntry | undefined, ReturnType<typeof platformError>>;
      started = forkApp(
        "via-catalog.resolve-qmk-identity",
        Effect.tryPromise({
          try: () => resolveKeyboardIdentity(remoteKeyboardIdentity(identity)),
          catch: (cause) => platformError("via-catalog.resolve-qmk-identity", cause),
        }).pipe(
          Effect.ensuring(
            Effect.sync(() => {
              if (identityEntryFibers.get(key) === started) identityEntryFibers.delete(key);
            }),
          ),
        ),
      );
      identityEntryFibers.set(key, started);
      return Fiber.join(started);
    });
  }

  function catalogEntryEffect(identity: CatalogIdentity) {
    return Effect.flatMap(catalogSummaryEffect(identity), (summary) =>
      summary
        ? Effect.map(
            Effect.all([
              Effect.tryPromise({
                try: () => getViaKeyboardDetail(summary.id),
                catch: (cause) => platformError("via-catalog.detail", cause),
              }),
              qmkEntryEffect(identity),
            ]),
            ([definition, identityEntry]) => withResolvedQmkTarget(definition, identityEntry),
          )
        : qmkEntryEffect(identity),
    );
  }

  function matrixHintFor(identity: CatalogIdentity) {
    const plainIdentity = plainCatalogIdentity(identity);
    return runApp(
      "via-catalog.matrix-hint",
      Effect.gen(function* () {
        const summary = yield* catalogSummaryEffect(plainIdentity);
        if (summary) return summary.matrix;
        return (yield* qmkEntryEffect(plainIdentity))?.matrix;
      }),
    );
  }

  function baseProfileForConnection(connection: ConnectionState) {
    return runApp(
      "via-catalog.base-profile",
      Effect.gen(function* () {
        const detectedIdentity = connection.detection?.identity;
        const identity = detectedIdentity ? plainCatalogIdentity(detectedIdentity) : undefined;
        if (!identity) return undefined;
        const entry = yield* catalogEntryEffect(identity);
        return entry ? profileFromCatalogForConnection(entry, connection) : undefined;
      }),
    );
  }

  return {
    baseProfileForConnection,
    currentFilters,
    matrixHintFor,
  };
}
