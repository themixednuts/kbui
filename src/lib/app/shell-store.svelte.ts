import { getContext, setContext } from "svelte";

export type AppRouteId = "connect" | "editor" | "browse" | "library" | "versions" | "settings";

export interface ShellNavItem {
  id: AppRouteId;
  href: `/${AppRouteId}`;
  icon: string;
  label: string;
  title: string;
}

export interface ShellDevice {
  connected: boolean;
  name: string;
  protocol: string;
  transport: string;
}

export interface ShellVariant {
  id: string;
  name: string;
  color: string;
}

export interface ShellMonkeytype {
  connected: boolean;
  wpm: number;
  accuracy: number;
  consistency: number;
  pb: number;
  tests: number;
}

export type ShellAccountStatus = "loading" | "signed-in" | "signed-out" | "error";

export interface ShellAccount {
  status: ShellAccountStatus;
  name: string;
  login: string;
  email?: string;
  image?: string | null;
  initials: string;
  message?: string;
}

export interface ShellSessionUser {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
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

function loginFor(user: ShellSessionUser, name: string) {
  if (user.email) return user.email.split("@")[0] ?? name;
  if (user.id) return user.id.slice(0, 12);
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "github"
  );
}

export class ShellStore {
  readonly navItems = appNavItems;

  device = $state<ShellDevice>({
    connected: true,
    name: "Workbench 65",
    protocol: "VIA v3",
    transport: "QMK",
  });

  currentVariant = $state<ShellVariant>({
    id: "main",
    name: "main",
    color: "var(--coral)",
  });

  dirty = $state(0);

  monkeytype = $state<ShellMonkeytype>({
    connected: true,
    wpm: 98,
    accuracy: 96.4,
    consistency: 82,
    pb: 121,
    tests: 1240,
  });

  account = $state<ShellAccount>({
    status: "loading",
    name: "Loading account",
    login: "local",
    initials: "KL",
  });

  profileOpen = $state(false);
  placeMode = $state<ShellPlaceMode | null>(null);

  readonly connected = $derived(this.device.connected);
  readonly primaryActionLabel = $derived(this.connected ? "Flash" : "Connect");
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
      name,
      login: loginFor(user, name),
      email: user.email ?? undefined,
      image: user.image ?? null,
      initials: initialsFor(name),
    };
  }

  setSignedOut() {
    this.account = {
      status: "signed-out",
      name: "Local draft",
      login: "not signed in",
      initials: "LD",
    };
    this.profileOpen = false;
  }

  setAuthError(message: string) {
    this.account = {
      status: "error",
      name: "Local draft",
      login: "auth unavailable",
      initials: "LD",
      message,
    };
  }

  toggleProfile() {
    this.profileOpen = !this.profileOpen;
  }

  closeProfile() {
    this.profileOpen = false;
  }

  setDirty(count: number) {
    this.dirty = Math.max(0, Math.floor(count));
  }

  setDevice(device: ShellDevice) {
    this.device = device;
  }

  setCurrentVariant(variant: ShellVariant) {
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
