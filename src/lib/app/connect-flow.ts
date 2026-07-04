import { protocolLabel, type WorkbenchStore } from "$lib/app/workbench-store.svelte";
import { profileFromCatalog, type KeyboardCatalogEntry } from "$lib/keyboard/catalog";
import {
  cloneDevice,
  profileFromDetection,
  sampleKeyboard,
  type DeviceProfile,
} from "$lib/keyboard/schema";
import type {
  ConnectionState,
  KeyboardTransport,
  KeyboardTransportConnectOptions,
  TransportKind,
} from "$lib/keyboard/transport";
import { parseViaDefinition } from "$lib/keyboard/via-definition";

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

function transportLabel(transport: KeyboardTransport | TransportKind | undefined) {
  if (!transport) return "WebHID";
  if (typeof transport !== "string") return transport.mode === "mock" ? "Mock VIA" : "WebHID";
  return transport === "webusb" ? "WebUSB" : "WebHID";
}

function connectedMessage(connection: ConnectionState, profile: DeviceProfile) {
  const protocol = connection.detection?.protocolVersion
    ? `VIA protocol ${connection.detection.protocolVersion}`
    : protocolLabel(profile.protocol);
  return `Connected ${profile.name} over ${transportLabel(connection.transport)} (${protocol})`;
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
