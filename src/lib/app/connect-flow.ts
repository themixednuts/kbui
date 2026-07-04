import { protocolLabel, type WorkbenchStore } from "$lib/app/workbench-store.svelte";
import { profileFromCatalog, type KeyboardCatalogEntry } from "$lib/keyboard/catalog";
import {
  cloneDevice,
  profileFromDetection,
  sampleKeyboard,
  type Capability,
  type DeviceProfile,
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
  type ZmkBehaviorDetails,
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

async function loadZmkBehaviorCatalog(connection: ZmkStudioConnection, keymap: ZmkStudioKeymap) {
  const list = await connection.call({ type: "list_all_behaviors" });
  if (list.type !== "list_all_behaviors") throw new Error("ZMK behavior list response mismatch.");

  const behaviors: ZmkBehaviorDetails[] = [];
  for (const behaviorId of list.behaviorIds) {
    const details = await connection.call({ type: "get_behavior_details", behaviorId });
    if (details.type !== "get_behavior_details") {
      throw new Error(`ZMK behavior ${behaviorId} response mismatch.`);
    }
    behaviors.push(details.behavior);
  }

  return createZmkBehaviorCatalog(
    behaviors,
    keymap.layers.map((layer) => layer.id),
  );
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

export async function profileFromConnectedZmkStudio(
  connection: ConnectionState,
): Promise<DeviceProfile> {
  if (connection.status !== "connected") {
    throw new Error(connection.message || "Keyboard connection did not complete.");
  }
  if (connection.protocol !== "zmk-studio" || !connection.zmkStudio) {
    throw new Error("The connected keyboard is not a ZMK Studio device.");
  }

  const zmk = connection.zmkStudio;
  const [info, lock, layouts, keymapResponse, unsaved] = await Promise.all([
    zmk.call({ type: "get_device_info" }),
    zmk.call({ type: "get_lock_state" }),
    zmk.call({ type: "get_physical_layouts" }),
    zmk.call({ type: "get_keymap" }),
    zmk.call({ type: "check_unsaved_changes" }),
  ]);

  if (info.type !== "get_device_info") throw new Error("ZMK device info response mismatch.");
  if (lock.type !== "get_lock_state") throw new Error("ZMK lock state response mismatch.");
  if (layouts.type !== "get_physical_layouts") throw new Error("ZMK layout response mismatch.");
  if (keymapResponse.type !== "get_keymap") throw new Error("ZMK keymap response mismatch.");
  if (unsaved.type !== "check_unsaved_changes") {
    throw new Error("ZMK unsaved-change response mismatch.");
  }

  const keymap = keymapResponse.keymap;
  const layout = layouts.layouts[layouts.activeLayoutIndex] ?? layouts.layouts[0];
  if (!layout) throw new Error("ZMK Studio did not return a physical layout.");

  const catalog = await loadZmkBehaviorCatalog(zmk, keymap);
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

  const profile = cloneDevice(sampleKeyboard);
  profile.id = connection.deviceKey ?? `keyboard:zmk-studio:${info.serialNumber}`;
  profile.name = info.deviceName;
  profile.vendor = info.manufacturer;
  profile.firmware = "zmk";
  profile.protocol = "zmk-studio";
  profile.firmwareVersion = info.firmwareVersion;
  profile.vendorId = connection.vendorId ?? 0;
  profile.productId = connection.productId ?? 0;
  profile.identity = {
    key: profile.id,
    transport: connection.transport ?? "webbluetooth",
    vendorId: connection.vendorId,
    productId: connection.productId,
    productName: info.deviceName,
    serialNumber: info.serialNumber,
  };
  profile.matrix = zmkMatrixForLayout(layout);
  profile.keys = layout.keys.map(({ keyPosition: _keyPosition, ...key }) => key);
  profile.capabilities = capabilities;
  profile.layers = zmkLayersFromKeymap(keymap, layout, catalog);
  profile.macros = [];
  profile.combos = [];
  profile.tapDances = [];
  profile.keyOverrides = [];
  profile.detectionNotes = detectionNotes;
  profile.updatedAt = new Date().toISOString();

  return profile;
}

async function activateProfile(workbench: WorkbenchStore, profile: DeviceProfile) {
  await workbench.replaceProfile(profile, profile);
  await workbench.commitCurrentDraftAsBase();
}

export function profileFromViaJson(fileName: string, json: unknown): DeviceProfile {
  const entry = parseViaDefinition(fileName, json, 10_000);
  if (!entry) {
    throw new Error("The selected JSON is not a supported VIA v3 keyboard definition.");
  }

  const profile = profileFromCatalog(entry);
  profile.id = `import:${entry.id}`;
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

  return profileFromDetection(baseProfile, connection.detection);
}

export function profileFromCatalogForConnection(
  entry: KeyboardCatalogEntry,
  connection: ConnectionState,
) {
  return profileFromCatalog(entry, connection.detection?.layerCount ?? 4);
}

export async function connectViaAndActivate({
  baseProfile,
  connectOptions,
  resolveBaseProfile,
  shell,
  transport,
  workbench,
}: ConnectViaOptions): Promise<ConnectFlowResult> {
  shell.setConnecting(`Opening ${transport.label}`, transportLabel(transport));

  try {
    const connection = await transport.connect(connectOptions);
    if (connection.status !== "connected") {
      shell.setConnectionError(connection.message, transportLabel(transport));
      throw new Error(connection.message || "Keyboard connection failed.");
    }

    const resolvedBase =
      (await resolveBaseProfile?.(connection)) ??
      transport.defaultProfile ??
      baseProfile ??
      cloneDevice(sampleKeyboard);
    const profile = profileFromConnectedVia(connection, resolvedBase);
    const message = connectedMessage(connection, profile);

    await activateProfile(workbench, profile);
    shell.setConnected({
      board: profile.name,
      connection,
      message,
      productId: profile.productId,
      protocol: protocolLabel(profile.protocol),
      protocolVersion: connection.detection?.protocolVersion,
      transport: transportLabel(transport),
      vendorId: profile.vendorId,
    });

    return {
      connection,
      message,
      profile,
      source: "device",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Keyboard connection failed.";
    shell.setConnectionError(message, transportLabel(transport));
    throw error;
  }
}

export async function connectZmkStudioAndActivate({
  connectOptions,
  shell,
  transport,
  workbench,
}: ConnectZmkStudioOptions): Promise<ConnectFlowResult> {
  shell.setConnecting(`Opening ${transport.label}`, transportLabel(transport));

  try {
    const connection = await transport.connect(connectOptions);
    if (connection.status !== "connected") {
      shell.setConnectionError(connection.message, transportLabel(transport));
      throw new Error(connection.message || "Keyboard connection failed.");
    }

    const profile = await profileFromConnectedZmkStudio(connection);
    const lockSuffix =
      connection.zmkStudio?.lockState === "locked"
        ? "; locked until you unlock on the keyboard"
        : "";
    const dirtySuffix = profile.detectionNotes?.some((note) => note.includes("unsaved"))
      ? "; device had unsaved Studio changes"
      : "";
    const message = `Connected ${profile.name} over ${transportLabel(connection.transport)} (ZMK Studio${lockSuffix}${dirtySuffix})`;

    await activateProfile(workbench, profile);
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
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Keyboard connection failed.";
    shell.setConnectionError(message, transportLabel(transport));
    throw error;
  }
}

export async function importViaJsonAndActivate({
  fileName,
  json,
  shell,
  workbench,
}: ImportViaJsonOptions): Promise<ConnectFlowResult> {
  shell.setConnecting(`Importing ${fileName}`, "VIA JSON");

  try {
    const profile = profileFromViaJson(fileName, json);
    await activateProfile(workbench, profile);
    const message = `Imported ${profile.name} for local editing.`;
    shell.setDisconnected(message);
    return {
      message,
      profile,
      source: "import",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not import VIA JSON.";
    shell.setConnectionError(message, "VIA JSON");
    throw error;
  }
}

export async function continueWithoutDevice({
  baseProfile = sampleKeyboard,
  shell,
  workbench,
}: LocalOnlyOptions): Promise<ConnectFlowResult> {
  shell.setConnecting("Preparing local profile", "Local");

  const profile = cloneDevice(baseProfile);
  profile.id = profile.id.startsWith("local:") ? profile.id : `local:${profile.id}`;
  profile.identity = undefined;
  profile.detectionNotes = ["Created a local-only profile without a connected keyboard."];

  await activateProfile(workbench, profile);
  const message = `Editing ${profile.name} without a connected device.`;
  shell.setDisconnected(message);

  return {
    message,
    profile,
    source: "local",
  };
}
