import { Effect } from "effect";
import { getContext, setContext } from "svelte";
import { runApp } from "$lib/app/runtime";
import { platformError } from "$lib/effect/errors";
import {
  DEFAULT_MONKEYTYPE_MODE,
  DEFAULT_MONKEYTYPE_MODE2,
  type MonkeytypeConnectionStatus,
} from "$lib/monkeytype/types";
import type { ConnectionState } from "$lib/keyboard/transport";

export type AppRouteId = "connect" | "editor" | "browse" | "library" | "versions" | "settings";

export interface ShellNavItem {
  id: AppRouteId;
  href: `/${AppRouteId}`;
  icon: string;
  label: string;
  title: string;
}

export type ShellConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export interface ShellDevice {
  board: string;
  message: string;
  name: string;
  productId?: number;
  protocol: string;
  protocolVersion?: number;
  status: ShellConnectionStatus;
  transport: string;
  vendorId?: number;
}

export interface ShellVariant {
  id: string;
  name: string;
  color: string;
}

export interface ShellMonkeytype {
  connected: boolean;
  username: string | null;
  mode: string;
  mode2: string;
  wpm: number | null;
  accuracy: number | null;
  consistency: number | null;
  pb: number | null;
  tests: number | null;
  lastSyncedAt: string | null;
  stale: boolean;
  error: string | null;
}

export type ShellAccountStatus = "loading" | "signed-in" | "signed-out";

export interface ShellAccount {
  status: ShellAccountStatus;
  id?: string;
  name: string;
  login: string;
  email?: string;
  image?: string | null;
  initials: string;
  githubProfileUrl?: string;
  message?: string;
}

export interface ShellSessionUser {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  githubLogin?: string | null;
}

export type ShellPlaceMode =
  | {
      kind: "macro";
      id: string;
      label: string;
    }
  | {
      kind: "tapDance";
      id: string;
      label: string;
    }
  | {
      kind: "combo";
      id: string;
      label: string;
      picks: string[];
    };

export type ShellPlacementIntent =
  | Extract<ShellPlaceMode, { kind: "macro" }>
  | Extract<ShellPlaceMode, { kind: "tapDance" }>
  | (Omit<Extract<ShellPlaceMode, { kind: "combo" }>, "picks"> & {
      picks?: string[];
    });

const SHELL_CONTEXT = Symbol("kbgui.shell");

export const appNavItems = [
  { id: "connect", href: "/connect", icon: "cable", label: "Connect", title: "Connect" },
  { id: "editor", href: "/editor", icon: "keyboard", label: "Editor", title: "Editor" },
  { id: "browse", href: "/browse", icon: "explore", label: "Browse", title: "Browse community" },
  {
    id: "library",
    href: "/library",
    icon: "dashboard_customize",
    label: "Library",
    title: "Library",
  },
  { id: "versions", href: "/versions", icon: "history", label: "Versions", title: "Versions" },
  { id: "settings", href: "/settings", icon: "tune", label: "Settings", title: "Settings" },
] as const satisfies readonly ShellNavItem[];

export function routeIdFromPath(pathname: string): AppRouteId {
  return (
    appNavItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
      ?.id ?? "editor"
  );
}

export function routeTitleFromPath(pathname: string): string {
  return appNavItems.find((item) => item.id === routeIdFromPath(pathname))?.title ?? "Editor";
}

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "K";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function githubHandleFrom(value: string | null | undefined) {
  const candidate = value?.trim();
  if (!candidate) return null;
  if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,37}[a-zA-Z0-9])?$/.test(candidate)) return null;
  return candidate;
}

function githubHandleFromEmail(email: string | null | undefined) {
  const candidate = email?.trim();
  if (!candidate) return null;

  const noreply = candidate.match(/^(?:\d+\+)?([a-zA-Z0-9-]+)@users\.noreply\.github\.com$/);
  if (noreply?.[1]) return githubHandleFrom(noreply[1]);

  return githubHandleFrom(candidate.split("@")[0]);
}

function githubHandleFor(user: ShellSessionUser) {
  return (
    githubHandleFrom(user.githubLogin) ??
    githubHandleFrom(user.name) ??
    githubHandleFromEmail(user.email)
  );
}

function loginFor(user: ShellSessionUser, name: string) {
  const handle = githubHandleFor(user);
  if (handle) return handle;
  if (user.email) return user.email.split("@")[0] ?? name;
  if (user.id) return user.id.slice(0, 12);
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "github"
  );
}

function githubProfileUrlFor(user: ShellSessionUser) {
  const handle = githubHandleFor(user);
  return handle ? `https://github.com/${handle}` : undefined;
}

function shellDeviceEquals(left: ShellDevice, right: ShellDevice) {
  return (
    left.board === right.board &&
    left.message === right.message &&
    left.name === right.name &&
    left.productId === right.productId &&
    left.protocol === right.protocol &&
    left.protocolVersion === right.protocolVersion &&
    left.status === right.status &&
    left.transport === right.transport &&
    left.vendorId === right.vendorId
  );
}

function shellVariantEquals(left: ShellVariant, right: ShellVariant) {
  return left.id === right.id && left.name === right.name && left.color === right.color;
}

export class ShellStore {
  readonly navItems = appNavItems;

  device = $state<ShellDevice>({
    board: "No device",
    message: "Local-only editing",
    name: "No device",
    protocol: "Local",
    status: "disconnected",
    transport: "Offline",
  });

  currentVariant = $state<ShellVariant>({
    id: "main",
    name: "main",
    color: "var(--coral)",
  });

  dirty = $state(0);
  #connection: ConnectionState | null = null;
  connectionRevision = $state(0);

  get connection(): ConnectionState | null {
    // Register a reactive dependency without proxying native HID/ZMK handles.
    void this.connectionRevision;
    return this.#connection;
  }

  set connection(connection: ConnectionState | null) {
    if (this.#connection === connection) return;
    this.#connection = connection;
    this.connectionRevision += 1;
  }

  monkeytype = $state<ShellMonkeytype>({
    connected: false,
    username: null,
    mode: DEFAULT_MONKEYTYPE_MODE,
    mode2: DEFAULT_MONKEYTYPE_MODE2,
    wpm: null,
    accuracy: null,
    consistency: null,
    pb: null,
    tests: null,
    lastSyncedAt: null,
    stale: false,
    error: null,
  });

  account = $state<ShellAccount>({
    status: "loading",
    name: "Loading account",
    login: "local",
    initials: "KL",
  });

  profileOpen = $state(false);
  placeMode = $state<ShellPlaceMode | null>(null);

  readonly connected = $derived(this.device.status === "connected");
  readonly connecting = $derived(this.device.status === "connecting");
  readonly liveConnection = $derived(
    this.device.status === "connected" && this.connection?.status === "connected"
      ? this.connection
      : null,
  );
  readonly primaryActionLabel = $derived(
    this.connected ? "Connected" : this.connecting ? "Connecting" : "Connect",
  );
  readonly activeMonkeytype = $derived(
    this.account.status === "signed-in" && this.monkeytype.connected ? this.monkeytype : null,
  );

  setAuthLoading() {
    this.account = {
      status: "loading",
      name: "Loading account",
      login: "local",
      initials: "KL",
    };
  }

  setSessionUser(user: ShellSessionUser | null | undefined) {
    if (!user?.id) {
      this.setSignedOut();
      return;
    }

    const name = user.name?.trim() || user.email || "GitHub user";
    this.account = {
      status: "signed-in",
      id: user.id,
      name,
      login: loginFor(user, name),
      email: user.email ?? undefined,
      image: user.image ?? null,
      initials: initialsFor(name),
      githubProfileUrl: githubProfileUrlFor(user),
    };
  }

  setSignedOut(message?: string) {
    this.account = {
      status: "signed-out",
      name: "Local draft",
      login: "not signed in",
      initials: "LD",
      message,
    };
    this.setMonkeytypeStatus(null);
  }

  setAuthError(message: string) {
    this.account = {
      status: "signed-out",
      name: "Local draft",
      login: "auth unavailable",
      initials: "LD",
      message,
    };
    this.setMonkeytypeStatus(null);
  }

  setMonkeytypeStatus(status: MonkeytypeConnectionStatus | null | undefined) {
    if (!status?.connected) {
      this.monkeytype = {
        connected: false,
        username: null,
        mode: DEFAULT_MONKEYTYPE_MODE,
        mode2: DEFAULT_MONKEYTYPE_MODE2,
        wpm: null,
        accuracy: null,
        consistency: null,
        pb: null,
        tests: null,
        lastSyncedAt: null,
        stale: false,
        error: status?.error?.message ?? null,
      };
      return;
    }

    const summary = status.summary;
    this.monkeytype = {
      connected: true,
      username: status.username,
      mode: status.mode,
      mode2: status.mode2,
      wpm: summary?.wpm ?? null,
      accuracy: summary?.accuracy ?? null,
      consistency: summary?.consistency ?? null,
      pb: summary?.pb ?? null,
      tests: summary?.tests ?? null,
      lastSyncedAt: status.lastSyncedAt,
      stale: status.stale,
      error: status.error?.message ?? summary?.error?.message ?? null,
    };
  }

  setMonkeytypeError(message: string) {
    this.monkeytype = {
      ...this.monkeytype,
      stale: this.monkeytype.connected,
      error: message,
    };
  }

  toggleProfile() {
    this.profileOpen = !this.profileOpen;
  }

  closeProfile() {
    this.profileOpen = false;
  }

  setDirty(count: number) {
    const next = Math.max(0, Math.floor(count));
    if (this.dirty !== next) this.dirty = next;
  }

  setDevice(device: ShellDevice) {
    if (device.status !== "connected") this.connection = null;
    if (!shellDeviceEquals(this.device, device)) this.device = device;
  }

  setDisconnected(message = "Local-only editing") {
    const nextDevice: ShellDevice = {
      board: "No device",
      message,
      name: "No device",
      protocol: "Local",
      status: "disconnected",
      transport: "Offline",
    };
    if (this.connection) this.connection = null;
    if (!shellDeviceEquals(this.device, nextDevice)) this.device = nextDevice;
  }

  setConnecting(message = "Waiting for device permission", transport = "WebHID") {
    const nextDevice: ShellDevice = {
      ...this.device,
      board: this.device.board === "No device" ? "Connecting" : this.device.board,
      message,
      name: this.device.name === "No device" ? "Connecting" : this.device.name,
      protocol: this.device.protocol === "Local" ? "VIA" : this.device.protocol,
      status: "connecting",
      transport,
    };
    if (this.connection) this.connection = null;
    if (!shellDeviceEquals(this.device, nextDevice)) this.device = nextDevice;
  }

  setConnected(input: {
    board: string;
    connection?: ConnectionState;
    message?: string;
    productId?: number;
    protocol: string;
    protocolVersion?: number;
    transport: string;
    vendorId?: number;
  }) {
    const nextConnection = input.connection ?? this.connection;
    if (this.connection !== nextConnection) this.connection = nextConnection;
    const nextDevice: ShellDevice = {
      board: input.board,
      message: input.message ?? "Connected",
      name: input.board,
      productId: input.productId,
      protocol: input.protocol,
      protocolVersion: input.protocolVersion,
      status: "connected",
      transport: input.transport,
      vendorId: input.vendorId,
    };
    if (!shellDeviceEquals(this.device, nextDevice)) this.device = nextDevice;
  }

  setConnectionError(message: string, transport?: string) {
    const nextDevice: ShellDevice = {
      ...this.device,
      board: "Connection error",
      message,
      name: "No device",
      status: "error",
      transport: transport ?? this.device.transport,
    };
    if (this.connection) this.connection = null;
    if (!shellDeviceEquals(this.device, nextDevice)) this.device = nextDevice;
  }

  disconnectDevice(message = "Device disconnected; edits are local only.") {
    const connection = this.connection;
    this.connection = null;
    const cleanups: Array<() => Promise<void>> = [];
    if (connection?.hidDevice?.close) cleanups.push(() => connection.hidDevice!.close!());
    if (connection?.zmkStudio?.close) cleanups.push(() => connection.zmkStudio!.close!());
    return runApp(
      "shell.disconnect-device",
      Effect.gen(function* () {
        const results = yield* Effect.forEach(
          cleanups,
          (cleanup) =>
            Effect.result(
              Effect.tryPromise({
                try: cleanup,
                catch: (cause) => platformError("shell.disconnect-resource", cause),
              }),
            ),
          { concurrency: "unbounded" },
        );
        const failures = results.filter((result) => result._tag === "Failure");
        if (failures.length > 0) {
          return yield* Effect.fail(
            platformError(
              "shell.disconnect-device",
              failures.map((failure) => failure.failure.message).join("; "),
            ),
          );
        }
      }).pipe(Effect.ensuring(Effect.sync(() => this.setDisconnected(message)))),
    );
  }

  updateConnectedBoard(input: { board: string; protocol: string; transport?: string }) {
    if (this.device.status !== "connected") return;

    const nextDevice: ShellDevice = {
      ...this.device,
      board: input.board,
      name: input.board,
      protocol: input.protocol,
      transport: input.transport ?? this.device.transport,
    };
    if (!shellDeviceEquals(this.device, nextDevice)) this.device = nextDevice;
  }

  setCurrentVariant(variant: ShellVariant) {
    if (shellVariantEquals(this.currentVariant, variant)) return;
    this.currentVariant = variant;
  }

  startPlacement(intent: ShellPlacementIntent) {
    this.placeMode =
      intent.kind === "combo" ? { ...intent, picks: [...(intent.picks ?? [])] } : intent;
  }

  clearPlacement() {
    this.placeMode = null;
  }

  toggleComboPlacementKey(keyId: string): string[] {
    if (this.placeMode?.kind !== "combo") return [];

    const picks = this.placeMode.picks.includes(keyId)
      ? this.placeMode.picks.filter((candidate) => candidate !== keyId)
      : [...this.placeMode.picks, keyId];
    this.placeMode = {
      ...this.placeMode,
      picks,
    };
    return picks;
  }
}

export function setShellContext(shell: ShellStore) {
  setContext(SHELL_CONTEXT, shell);
}

export function getShellContext(): ShellStore {
  return getContext<ShellStore>(SHELL_CONTEXT);
}
