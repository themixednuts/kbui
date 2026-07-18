import { Effect } from "effect";

import { runApp } from "$lib/app/runtime";
import { protocolLabel, type WorkbenchStore } from "$lib/app/workbench-store.svelte";
import { platformError } from "$lib/effect/errors";
import { tryMaybePromise } from "$lib/effect/maybe-promise";
import { profileFromCatalog, type KeyboardCatalogEntry } from "$lib/keyboard/catalog";
import { starterBoardProfile } from "$lib/keyboard/sample-boards";
import {
  profileFromDetection,
  withDeviceProfileOrigin,
  type Capability,
  type DeviceProfile,
  type DeviceProfileOrigin,
  type FirmwareMetadata,
  type Layer,
} from "$lib/keyboard/schema";
import type {
  ConnectionState,
  KeyboardTransport,
  KeyboardTransportConnectOptions,
  TransportKind,
} from "$lib/keyboard/transport";
import { parseViaDefinition } from "$lib/keyboard/via-definition";
import { decodeZmkBinding } from "$lib/keyboard/zmk-binding";
import {
  createZmkBehaviorCatalog,
  zmkProfileLayerId,
  type ZmkPhysicalLayout,
  type ZmkStudioConnection,
  type ZmkStudioKeymap,
} from "$lib/keyboard/zmk-studio";

import type { ShellStore } from "./shell-store.svelte";

export interface ConnectFlowResult {
  connection?: ConnectionState;
  message: string;
  profile: DeviceProfile;
  source: "device" | "import" | "local";
}

export interface ConnectViaOptions {
  baseProfile?: DeviceProfile;
  connectOptions?: KeyboardTransportConnectOptions;
  resolveBaseProfile?: (
    connection: ConnectionState,
  ) => DeviceProfile | Promise<DeviceProfile | undefined> | undefined;
  shell: ShellStore;
  transport: KeyboardTransport;
  workbench: WorkbenchStore;
}

export interface ConnectZmkStudioOptions {
  connectOptions?: KeyboardTransportConnectOptions;
  shell: ShellStore;
  resolveFirmwareMetadata?: (profile: DeviceProfile) => Promise<FirmwareMetadata | undefined>;
  transport: KeyboardTransport;
  workbench: WorkbenchStore;
}

export interface ImportViaJsonOptions {
  fileName: string;
  json: unknown;
  shell: ShellStore;
  workbench: WorkbenchStore;
}

export interface LocalOnlyOptions {
  baseProfile?: DeviceProfile;
  shell: ShellStore;
  workbench: WorkbenchStore;
}

export interface ActivateViaConnectionOptions {
  connection: ConnectionState;
  displayTransport?: string;
  resolveBaseProfile?: (
    connection: ConnectionState,
  ) => DeviceProfile | Promise<DeviceProfile | undefined> | undefined;
  shell: ShellStore;
  workbench: WorkbenchStore;
}

function transportLabel(transport: KeyboardTransport | TransportKind | undefined): string {
  if (!transport) return "WebHID";
  if (typeof transport !== "string") {
    if (transport.mode === "mock" && transport.id.includes("zmk")) return "Mock ZMK";
    return transport.mode === "mock" ? "Mock VIA" : transportLabel(transport.transport);
  }
  if (transport === "webusb") return "WebUSB";
  if (transport === "webbluetooth") return "Web Bluetooth";
  if (transport === "webserial") return "Web Serial";
  return "WebHID";
}

function connectedMessage(connection: ConnectionState, profile: DeviceProfile) {
  const protocol = connection.detection?.protocolVersion
    ? `VIA protocol ${connection.detection.protocolVersion}`
    : protocolLabel(profile.protocol);
  return `Connected ${profile.name} over ${transportLabel(connection.transport)} (${protocol})`;
}

function zmkMatrixForLayout(layout: ZmkPhysicalLayout) {
  return layout.keys.reduce(
    (matrix, key) => ({
      rows: Math.max(matrix.rows, key.row + 1),
      cols: Math.max(matrix.cols, key.col + 1),
    }),
    { rows: 1, cols: 1 },
  );
}

function zmkLayerColor(index: number) {
  const colors = ["#2f7f79", "#d96f32", "#5d6fb8", "#b88a2f", "#39945f"];
  return colors[index % colors.length];
}

function zmkCallEffect<A>(operation: string, call: () => PromiseLike<A>) {
  return Effect.tryPromise({
    try: call,
    catch: (cause) => platformError(`connect.zmk.${operation}`, cause),
  });
}

function loadZmkBehaviorCatalogEffect(connection: ZmkStudioConnection, keymap: ZmkStudioKeymap) {
  return Effect.gen(function* () {
    const list = yield* zmkCallEffect("list-behaviors", () =>
      connection.call({ type: "list_all_behaviors" }),
    );
    if (list.type !== "list_all_behaviors") {
      return yield* Effect.fail(
        platformError("connect.zmk.list-behaviors", "ZMK behavior list response mismatch."),
      );
    }
    const behaviors = yield* Effect.forEach(
      list.behaviorIds,
      (behaviorId) =>
        Effect.flatMap(
          zmkCallEffect(`behavior.${behaviorId}`, () =>
            connection.call({ type: "get_behavior_details", behaviorId }),
          ),
          (details) =>
            details.type === "get_behavior_details"
              ? Effect.succeed(details.behavior)
              : Effect.fail(
                  platformError(
                    `connect.zmk.behavior.${behaviorId}`,
                    `ZMK behavior ${behaviorId} response mismatch.`,
                  ),
                ),
        ),
      { concurrency: 8 },
    );
    return createZmkBehaviorCatalog(
      behaviors,
      keymap.layers.map((layer) => layer.id),
    );
  });
}

function zmkLayersFromKeymap(
  keymap: ZmkStudioKeymap,
  layout: ZmkPhysicalLayout,
  catalog: ReturnType<typeof createZmkBehaviorCatalog>,
): Layer[] {
  return keymap.layers.map((layer, layerIndex) => {
    const bindings = Object.fromEntries(
      layout.keys.map((key) => [
        key.id,
        decodeZmkBinding(
          layer.bindings[key.keyPosition] ?? { behaviorId: 3, param1: 0, param2: 0 },
          catalog,
        ),
      ]),
    );

    return {
      id: zmkProfileLayerId(layer.id),
      name: layer.name || (layerIndex === 0 ? "Base" : `Layer ${layerIndex}`),
      color: zmkLayerColor(layerIndex),
      bindings,
    };
  });
}

export function profileFromConnectedZmkStudio(connection: ConnectionState): Promise<DeviceProfile> {
  return runApp("connect.zmk.profile", profileFromConnectedZmkStudioEffect(connection));
}

function profileFromConnectedZmkStudioEffect(connection: ConnectionState) {
  return Effect.gen(function* () {
    if (connection.status !== "connected") {
      return yield* Effect.fail(
        platformError(
          "connect.zmk.profile",
          connection.message || "Keyboard connection did not complete.",
        ),
      );
    }
    if (connection.protocol !== "zmk-studio" || !connection.zmkStudio) {
      return yield* Effect.fail(
        platformError("connect.zmk.profile", "The connected keyboard is not a ZMK Studio device."),
      );
    }

    const zmk = connection.zmkStudio;
    const [info, lock, layouts, keymapResponse, unsaved] = yield* Effect.all(
      [
        zmkCallEffect("device-info", () => zmk.call({ type: "get_device_info" })),
        zmkCallEffect("lock-state", () => zmk.call({ type: "get_lock_state" })),
        zmkCallEffect("physical-layouts", () => zmk.call({ type: "get_physical_layouts" })),
        zmkCallEffect("keymap", () => zmk.call({ type: "get_keymap" })),
        zmkCallEffect("unsaved-changes", () => zmk.call({ type: "check_unsaved_changes" })),
      ],
      { concurrency: 5 },
    );

    if (info.type !== "get_device_info") {
      return yield* Effect.fail(platformError("connect.zmk.profile", "Device info mismatch."));
    }
    if (lock.type !== "get_lock_state") {
      return yield* Effect.fail(platformError("connect.zmk.profile", "Lock state mismatch."));
    }
    if (layouts.type !== "get_physical_layouts") {
      return yield* Effect.fail(platformError("connect.zmk.profile", "Layout response mismatch."));
    }
    if (keymapResponse.type !== "get_keymap") {
      return yield* Effect.fail(platformError("connect.zmk.profile", "Keymap response mismatch."));
    }
    if (unsaved.type !== "check_unsaved_changes") {
      return yield* Effect.fail(
        platformError("connect.zmk.profile", "Unsaved-change response mismatch."),
      );
    }

    const keymap = keymapResponse.keymap;
    const layout = layouts.layouts[layouts.activeLayoutIndex] ?? layouts.layouts[0];
    if (!layout) {
      return yield* Effect.fail(
        platformError("connect.zmk.profile", "ZMK Studio did not return a physical layout."),
      );
    }

    const catalog = yield* loadZmkBehaviorCatalogEffect(zmk, keymap);
    const keyPositionByKeyId = Object.fromEntries(
      layout.keys.map((key) => [key.id, key.keyPosition]),
    );

    zmk.lockState = lock.lockState;
    zmk.behaviorCatalog = catalog;
    zmk.layerIdByLayerIndex = keymap.layers.map((layer) => layer.id);
    zmk.keyPositionByKeyId = keyPositionByKeyId;
    zmk.keymap = keymap;

    const capabilities: Capability[] = ["keymap", "layers", "settings", "firmware"];
    const detectionNotes = [
      "Imported the current ZMK Studio keymap and physical-layout key positions from the device.",
    ];
    if (lock.lockState === "locked") {
      detectionNotes.push("ZMK Studio is locked; unlock on the keyboard before live writes.");
    }
    if (unsaved.hasUnsavedChanges) {
      detectionNotes.push(
        "Device reported unsaved ZMK Studio changes; this fetched keymap is accepted as the clean base.",
      );
    }

    const profileId = connection.deviceKey ?? `keyboard:zmk-studio:${info.serialNumber}`;

    return {
      id: profileId,
      name: info.deviceName,
      origin: "device",
      vendor: info.manufacturer,
      firmware: "zmk",
      firmwareEditIntent: "live",
      protocol: "zmk-studio",
      firmwareVersion: info.firmwareVersion,
      vendorId: connection.vendorId ?? 0,
      productId: connection.productId ?? 0,
      identity: {
        key: profileId,
        transport: connection.transport ?? "webbluetooth",
        vendorId: connection.vendorId,
        productId: connection.productId,
        productName: info.deviceName,
        serialNumber: info.serialNumber,
      },
      matrix: zmkMatrixForLayout(layout),
      keys: layout.keys.map(({ keyPosition: _keyPosition, ...key }) => key),
      capabilities,
      layers: zmkLayersFromKeymap(keymap, layout, catalog),
      macros: [],
      combos: [],
      tapDances: [],
      keyOverrides: [],
      lighting: {
        mode: "solid",
        hue: 0,
        saturation: 0,
        brightness: 72,
        speed: 0,
        keys: {},
      },
      settings: {
        tappingTerm: 200,
        debounce: 5,
        permissiveHold: false,
        retroTapping: false,
        nkro: true,
        splitTransport: "none",
      },
      detectionNotes,
      firmwareMetadata: undefined,
      updatedAt: new Date().toISOString(),
    } satisfies DeviceProfile;
  });
}

function activateProfileEffect(
  workbench: WorkbenchStore,
  profile: DeviceProfile,
  origin: DeviceProfileOrigin,
) {
  const activeProfile = withDeviceProfileOrigin(profile, origin);
  if (origin === "device") {
    return Effect.tryPromise({
      try: () => workbench.activateConnectedProfile(activeProfile),
      catch: (cause) => platformError("connect.activate-device-profile", cause),
    });
  }

  return Effect.gen(function* () {
    yield* Effect.tryPromise({
      try: () =>
        workbench.replaceProfile(activeProfile, activeProfile, {
          hydrateDraft: false,
          origin,
        }),
      catch: (cause) => platformError("connect.replace-profile", cause),
    });
    yield* Effect.tryPromise({
      try: () => workbench.commitCurrentDraftAsBase(),
      catch: (cause) => platformError("connect.commit-profile", cause),
    });
  });
}

export function profileFromViaJson(fileName: string, json: unknown): DeviceProfile {
  const entry = parseViaDefinition(fileName, json, 10_000);
  if (!entry) {
    throw new Error("The selected JSON is not a supported VIA v3 keyboard definition.");
  }

  const profile = profileFromCatalog(entry);
  profile.id = `import:${entry.id}`;
  profile.firmwareEditIntent = "source";
  profile.origin = "imported";
  profile.vendor = entry.vendor;
  profile.detectionNotes = [`Imported ${fileName} as a local VIA v3 definition.`];
  return profile;
}

export function profileFromConnectedVia(
  connection: ConnectionState,
  baseProfile: DeviceProfile,
): DeviceProfile {
  if (connection.status !== "connected") {
    throw new Error(connection.message || "Keyboard connection did not complete.");
  }
  if (!connection.detection) {
    throw new Error("The connected keyboard did not return VIA metadata.");
  }

  const profile = profileFromDetection(baseProfile, connection.detection);
  profile.firmwareEditIntent = "live";
  return profile;
}

export function profileFromCatalogForConnection(
  entry: KeyboardCatalogEntry,
  connection: ConnectionState,
) {
  return withDeviceProfileOrigin(
    profileFromCatalog(entry, connection.detection?.layerCount ?? 4),
    "device",
  );
}

function viaIdentificationError(connection: ConnectionState) {
  const identity = connection.detection?.identity;
  const productName = identity?.productName ?? connection.productName ?? "this keyboard";
  const vendorId = identity?.vendorId ?? connection.vendorId;
  const productId = identity?.productId ?? connection.productId;
  const usbId =
    typeof vendorId === "number" && typeof productId === "number"
      ? ` (${vendorId.toString(16).padStart(4, "0")}:${productId.toString(16).padStart(4, "0")})`
      : "";

  return `Could not safely identify ${productName}${usbId} from the refreshed VIA/QMK catalogs. No device changes were made.`;
}

export function connectViaAndActivate({
  baseProfile,
  connectOptions,
  resolveBaseProfile,
  shell,
  transport,
  workbench,
}: ConnectViaOptions): Promise<ConnectFlowResult> {
  shell.setConnecting(`Opening ${transport.label}`, transportLabel(transport));
  return runConnectFlow(
    "connect.via",
    shell,
    transportLabel(transport),
    Effect.gen(function* () {
      const connection = yield* Effect.tryPromise({
        try: () => transport.connect(connectOptions),
        catch: (cause) => platformError("connect.via.transport", cause),
      });
      if (connection.status !== "connected") {
        return yield* Effect.fail(
          platformError(
            "connect.via.transport",
            connection.message || "Keyboard connection failed.",
          ),
        );
      }
      return yield* activateViaConnectionAndProfileEffect({
        connection,
        displayTransport: transportLabel(transport),
        resolveBaseProfile: (activeConnection) =>
          resolveBaseProfile?.(activeConnection) ?? transport.defaultProfile ?? baseProfile,
        shell,
        workbench,
      });
    }),
  );
}

export function activateViaConnectionAndProfile(
  options: ActivateViaConnectionOptions,
): Promise<ConnectFlowResult> {
  return runConnectFlow(
    "connect.via.activate",
    options.shell,
    options.displayTransport ?? transportLabel(options.connection.transport),
    activateViaConnectionAndProfileEffect(options),
  );
}

function activateViaConnectionAndProfileEffect({
  connection,
  displayTransport,
  resolveBaseProfile,
  shell,
  workbench,
}: ActivateViaConnectionOptions) {
  return Effect.gen(function* () {
    if (connection.status !== "connected") {
      return yield* Effect.fail(
        platformError("connect.via.activate", connection.message || "Keyboard connection failed."),
      );
    }

    const resolvedBase = resolveBaseProfile
      ? yield* tryMaybePromise(
          () => resolveBaseProfile(connection),
          (cause) => platformError("connect.via.resolve-profile", cause),
        )
      : undefined;
    if (!resolvedBase) {
      return yield* Effect.fail(
        platformError("connect.via.resolve-profile", viaIdentificationError(connection)),
      );
    }

    const profile = profileFromConnectedVia(connection, resolvedBase);
    const message = connectedMessage(connection, profile);
    const transport = displayTransport ?? transportLabel(connection.transport);

    yield* activateProfileEffect(workbench, profile, "device");
    shell.setConnected({
      board: profile.name,
      connection,
      message,
      productId: profile.productId,
      protocol: protocolLabel(profile.protocol),
      protocolVersion: connection.detection?.protocolVersion,
      transport,
      vendorId: profile.vendorId,
    });

    return {
      connection,
      message,
      profile,
      source: "device",
    } satisfies ConnectFlowResult;
  });
}

export function connectZmkStudioAndActivate({
  connectOptions,
  shell,
  resolveFirmwareMetadata,
  transport,
  workbench,
}: ConnectZmkStudioOptions): Promise<ConnectFlowResult> {
  shell.setConnecting(`Opening ${transport.label}`, transportLabel(transport));
  return runConnectFlow(
    "connect.zmk",
    shell,
    transportLabel(transport),
    Effect.gen(function* () {
      const connection = yield* Effect.tryPromise({
        try: () => transport.connect(connectOptions),
        catch: (cause) => platformError("connect.zmk.transport", cause),
      });
      if (connection.status !== "connected") {
        return yield* Effect.fail(
          platformError(
            "connect.zmk.transport",
            connection.message || "Keyboard connection failed.",
          ),
        );
      }

      const profile: DeviceProfile = yield* profileFromConnectedZmkStudioEffect(connection);
      if (resolveFirmwareMetadata) {
        profile.firmwareMetadata = yield* Effect.tryPromise({
          try: () => resolveFirmwareMetadata(profile),
          catch: (cause) => platformError("connect.zmk.resolve-firmware-metadata", cause),
        });
        if (profile.firmwareMetadata?.zmk?.board) {
          profile.detectionNotes = [
            ...(profile.detectionNotes ?? []),
            `Resolved ZMK build target ${profile.firmwareMetadata.zmk.board} from the official hardware catalog.`,
          ];
        }
      }
      const lockSuffix =
        connection.zmkStudio?.lockState === "locked"
          ? "; locked until you unlock on the keyboard"
          : "";
      const dirtySuffix = profile.detectionNotes?.some((note) => note.includes("unsaved"))
        ? "; device had unsaved Studio changes"
        : "";
      const message = `Connected ${profile.name} over ${transportLabel(connection.transport)} (ZMK Studio${lockSuffix}${dirtySuffix})`;

      yield* activateProfileEffect(workbench, profile, "device");
      shell.setConnected({
        board: profile.name,
        connection,
        message,
        productId: profile.productId,
        protocol: protocolLabel(profile.protocol),
        transport: transportLabel(transport),
        vendorId: profile.vendorId,
      });

      return {
        connection,
        message,
        profile,
        source: "device",
      } satisfies ConnectFlowResult;
    }),
  );
}

export function importViaJsonAndActivate({
  fileName,
  json,
  shell,
  workbench,
}: ImportViaJsonOptions): Promise<ConnectFlowResult> {
  shell.setConnecting(`Importing ${fileName}`, "VIA JSON");
  return runConnectFlow(
    "connect.import-via",
    shell,
    "VIA JSON",
    Effect.gen(function* () {
      const profile = yield* Effect.try({
        try: () => profileFromViaJson(fileName, json),
        catch: (cause) => platformError("connect.import-via", cause),
      });
      yield* activateProfileEffect(workbench, profile, "imported");
      const message = `Imported ${profile.name} for local editing.`;
      yield* Effect.sync(() => shell.setDisconnected(message));
      return { message, profile, source: "import" } satisfies ConnectFlowResult;
    }),
  );
}

export function continueWithoutDevice({
  baseProfile = starterBoardProfile(),
  shell,
  workbench,
}: LocalOnlyOptions): Promise<ConnectFlowResult> {
  shell.setConnecting("Preparing local profile", "Local");
  return runConnectFlow(
    "connect.local",
    shell,
    "Local",
    Effect.gen(function* () {
      const profile = withDeviceProfileOrigin(baseProfile, "starter");
      profile.id = profile.id.startsWith("local:") ? profile.id : `local:${profile.id}`;
      profile.identity = undefined;
      profile.firmwareEditIntent = "source";
      profile.detectionNotes = ["Created a local-only profile without a connected keyboard."];
      yield* activateProfileEffect(workbench, profile, "starter");
      const message = `Editing ${profile.name} without a connected device.`;
      yield* Effect.sync(() => shell.setDisconnected(message));
      return { message, profile, source: "local" } satisfies ConnectFlowResult;
    }),
  );
}

function runConnectFlow<A>(
  operation: string,
  shell: ShellStore,
  displayTransport: string,
  effect: Effect.Effect<A, { readonly message: string }>,
) {
  return runApp(
    operation,
    effect.pipe(
      Effect.tapError((error) =>
        Effect.sync(() => shell.setConnectionError(error.message, displayTransport)),
      ),
    ),
  );
}
