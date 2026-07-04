<script lang="ts">
  import { browser, dev } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { Accent, runApp } from "$lib/app";
  import { authClient } from "$lib/auth-client";
  import { onDestroy, untrack } from "svelte";
  import AvatarButton from "$lib/components/ui/AvatarButton.svelte";
  import Brand from "$lib/components/ui/Brand.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import Chip from "$lib/components/ui/Chip.svelte";
  import {
    setShellContext,
    routeTitleFromPath,
    ShellStore,
    type ShellSessionUser,
  } from "$lib/app/shell-store.svelte";
  import {
    protocolLabel,
    setWorkbenchContext,
    WorkbenchStore,
  } from "$lib/app/workbench-store.svelte";
  import { KeyboardLiveSyncEngine } from "$lib/app/live-sync-coordinator.svelte";
  import {
    setViaLiveSyncContext,
  } from "$lib/app/via-live-sync.svelte";

  type AuthSessionData = {
    user?: ShellSessionUser | null;
  } | null;
  type AuthClientError = {
    code?: string;
    message?: string;
    status?: number;
    statusText?: string;
  };

  const workerAuthHint = "Run `vp run dev:worker` to sign in with GitHub.";

  let { children, data } = $props();

  const shell = new ShellStore();
  const workbench = new WorkbenchStore();
  const liveSync = new KeyboardLiveSyncEngine({ editor: workbench, shell });
  setShellContext(shell);
  setWorkbenchContext(workbench);
  setViaLiveSyncContext(liveSync);
  const initialAuthUser = untrack(() => data.auth?.user ?? null);
  shell.setSessionUser(initialAuthUser);
  const pathname = $derived(page.url.pathname);
  const routeTitle = $derived(routeTitleFromPath(pathname));
  const accountAvatar = $derived(shell.account.image ?? null);
  const monkeytypeProfileUrl = $derived(
    shell.monkeytype.username
      ? `https://monkeytype.com/profile/${encodeURIComponent(shell.monkeytype.username)}`
      : null,
  );

  let authRequested = $state(false);
  let accentRequested = $state(false);
  let previousPathname = $state("");
  let lastSsrUserKey = $state(sessionUserKey(initialAuthUser));
  let authBusy = $state(false);
  let monkeytypeRequestedFor = $state<string | null>(null);
  let monkeytypeBusy = $state(false);

  $effect(() => {
    const user = data.auth?.user ?? null;
    const userKey = sessionUserKey(user);
    if (userKey === lastSsrUserKey) return;
    lastSsrUserKey = userKey;
    shell.setSessionUser(user);
  });

  $effect(() => {
    if (pathname === previousPathname) return;
    previousPathname = pathname;
    shell.closeProfile();
  });

  $effect(() => {
    if (!browser || authRequested) return;
    authRequested = true;
    void refreshSession();
  });

  $effect(() => {
    if (!browser) return;
    const userId = shell.account.status === "signed-in" ? (shell.account.id ?? null) : null;
    if (!userId) {
      monkeytypeRequestedFor = null;
      return;
    }
    if (monkeytypeRequestedFor === userId) return;
    monkeytypeRequestedFor = userId;
    void loadMonkeytypeStatus();
  });

  $effect(() => {
    if (!browser || accentRequested) return;
    accentRequested = true;
    void runApp("Load accent", Accent.loadAndApply);
  });

  $effect(() => {
    shell.setDirty(workbench.dirty);
    shell.updateConnectedBoard({
      board: workbench.profile.name,
      protocol: protocolLabel(workbench.profile.protocol),
    });
    shell.setCurrentVariant({
      id: workbench.activeVariant.id,
      name: workbench.activeVariant.name,
      color: workbench.activeVariant.color,
    });
  });

  $effect(() => {
    liveSync.processChanges(shell.liveConnection);
  });

  onDestroy(() => {
    liveSync.destroy();
    void workbench.flushPersistence();
  });

  async function refreshSession() {
    try {
      const result = await authClient.getSession();
      const error = result.error as AuthClientError | null | undefined;
      if (error) {
        shell.setAuthError(authMessage(error, "Auth unavailable"));
        return;
      }

      const session = result.data as AuthSessionData;
      shell.setSessionUser(session?.user);
    } catch (error) {
      shell.setAuthError(authMessage(error, "Auth unavailable"));
    }
  }

  async function loadMonkeytypeStatus() {
    try {
      const result = await authClient.monkeytype.status();
      const error = result.error as AuthClientError | null | undefined;
      if (error) {
        shell.setMonkeytypeError(errorMessage(error, "Monkeytype unavailable"));
        return;
      }
      shell.setMonkeytypeStatus(result.data);
    } catch (error) {
      shell.setMonkeytypeError(errorMessage(error, "Monkeytype unavailable"));
    }
  }

  async function refreshMonkeytype() {
    if (monkeytypeBusy) return;
    monkeytypeBusy = true;
    try {
      const result = await authClient.monkeytype.refresh({ force: true });
      const error = result.error as AuthClientError | null | undefined;
      if (error) {
        shell.setMonkeytypeError(errorMessage(error, "Monkeytype refresh failed"));
        return;
      }
      shell.setMonkeytypeStatus(result.data);
    } catch (error) {
      shell.setMonkeytypeError(errorMessage(error, "Monkeytype refresh failed"));
    } finally {
      monkeytypeBusy = false;
    }
  }

  async function disconnectMonkeytype() {
    if (monkeytypeBusy) return;
    monkeytypeBusy = true;
    try {
      const result = await authClient.monkeytype.disconnect();
      const error = result.error as AuthClientError | null | undefined;
      if (error) {
        shell.setMonkeytypeError(errorMessage(error, "Monkeytype disconnect failed"));
        return;
      }
      shell.setMonkeytypeStatus(result.data);
    } catch (error) {
      shell.setMonkeytypeError(errorMessage(error, "Monkeytype disconnect failed"));
    } finally {
      monkeytypeBusy = false;
    }
  }

  async function signInGithub() {
    if (authBusy) return;
    authBusy = true;

    try {
      const result = await authClient.signIn.social({
        provider: "github",
        callbackURL: "/",
        disableRedirect: true,
      });

      const error = result.error as AuthClientError | null | undefined;
      if (error) {
        shell.setAuthError(authMessage(error, "GitHub sign-in failed"));
        return;
      }

      const signInData = result.data as { url?: string } | null;
      if (!signInData?.url) {
        shell.setAuthError("GitHub sign-in did not return an authorize URL.");
        return;
      }

      globalThis.location.assign(signInData.url);
    } catch (error) {
      shell.setAuthError(authMessage(error, "GitHub sign-in failed"));
    } finally {
      authBusy = false;
    }
  }

  async function signOut() {
    if (authBusy) return;
    authBusy = true;

    try {
      const result = await authClient.signOut();
      const error = result.error as AuthClientError | null | undefined;
      if (error) {
        shell.setAuthError(authMessage(error, "Sign out failed"));
        return;
      }

      shell.setSignedOut();
      await refreshSession();
    } catch (error) {
      shell.setAuthError(authMessage(error, "Sign out failed"));
    } finally {
      authBusy = false;
    }
  }

  function sessionUserKey(user: ShellSessionUser | null | undefined) {
    return [user?.id ?? "", user?.name ?? "", user?.email ?? "", user?.image ?? ""].join("|");
  }

  function errorMessage(error: unknown, fallback: string) {
    if (error instanceof Error) return error.message || fallback;
    if (error && typeof error === "object") {
      const authError = error as AuthClientError;
      if (authError.message) return authError.message;
      if (authError.statusText) return authError.statusText;
      if (authError.status) return `Auth request failed (${authError.status})`;
      if (authError.code) return authError.code;
    }
    return fallback;
  }

  function authMessage(error: unknown, fallback: string) {
    const message = errorMessage(error, fallback);
    if (message.includes("vp run dev:worker")) return message;
    if (
      dev ||
      /authagent|binding|configured|github|provider|social|unavailable|503/i.test(message)
    ) {
      return `${message} ${workerAuthHint}`;
    }
    return message;
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  function statValue(value: number | null, digits = 0, fallback = "--") {
    if (value === null || !Number.isFinite(value)) return fallback;
    return value.toLocaleString(undefined, {
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
    });
  }

  function handlePrimaryAction() {
    if (!shell.connected) {
      void goto("/connect");
    }
  }

  function openVersionsForSavePoint() {
    void goto("/versions");
  }
</script>

<div class="new-app-shell">
  <nav class="left-rail" aria-label="Application navigation">
    <div class="rail-brand">
      <Brand href="/editor" />
    </div>

    <div class="rail-nav">
      {#each shell.navItems as item (item.id)}
        {@const active = isActive(item.href)}
        <a
          href={item.href}
          class="rail-nav-item"
          class:active
          aria-current={active ? "page" : undefined}
          data-sveltekit-preload-data="hover"
        >
          <span class="material-symbols-outlined rail-icon" aria-hidden="true">{item.icon}</span>
          <span class="rail-label">{item.label}</span>
          {#if item.id === "connect" && shell.connected}
            <span class="material-symbols-outlined rail-check" aria-hidden="true">check_circle</span>
          {/if}
        </a>
      {/each}
    </div>

    <div class="rail-footer">
      {#if shell.profileOpen}
        <section class="profile-popover" aria-label="Profile">
          {#if shell.account.status === "signed-in"}
            <div class="profile-head">
              <span class="profile-avatar">
                {#if accountAvatar}
                  <img src={accountAvatar} alt="" />
                {:else}
                  {shell.account.initials}
                {/if}
              </span>
              <div class="profile-identity">
                <strong>{shell.account.name}</strong>
                <span>@{shell.account.login} · GitHub</span>
                {#if shell.account.email}
                  <span class="profile-email">{shell.account.email}</span>
                {/if}
              </div>
            </div>

            <div class="profile-divider"></div>

            <div class="profile-actions">
              <a
                class="profile-link"
                href={shell.account.githubProfileUrl ?? "https://github.com/settings/profile"}
                target="_blank"
                rel="noreferrer"
              >
                <span class="material-symbols-outlined" aria-hidden="true">open_in_new</span>
                View GitHub profile
              </a>
            </div>

            <div class="profile-divider"></div>

            <section class="monkeytype-block" aria-label="Monkeytype">
              <div class="monkeytype-head">
                <span class="material-symbols-outlined" aria-hidden="true">keyboard_alt</span>
                <span>Monkeytype</span>
                {#if shell.monkeytype.connected && monkeytypeProfileUrl}
                  <a class="monkeytype-open" href={monkeytypeProfileUrl} target="_blank" rel="noreferrer">
                    open
                    <span class="material-symbols-outlined" aria-hidden="true">open_in_new</span>
                  </a>
                {:else if shell.monkeytype.connected}
                  <span class="monkeytype-mode">{shell.monkeytype.mode}/{shell.monkeytype.mode2}</span>
                {:else}
                  <span class="monkeytype-mode">offline</span>
                {/if}
              </div>
              {#if shell.monkeytype.connected}
                <div class="monkeytype-grid">
                  <div class="monkeytype-stat">
                    <strong>{statValue(shell.monkeytype.wpm)}</strong>
                    <span>wpm avg</span>
                  </div>
                  <div class="monkeytype-stat">
                    <strong>{statValue(shell.monkeytype.accuracy, 1)}%</strong>
                    <span>accuracy</span>
                  </div>
                  <div class="monkeytype-stat">
                    <strong>{statValue(shell.monkeytype.pb)}</strong>
                    <span>pb wpm</span>
                  </div>
                  <div class="monkeytype-stat">
                    <strong>{statValue(shell.monkeytype.tests)}</strong>
                    <span>tests</span>
                  </div>
                </div>
                {#if shell.monkeytype.error}
                  <p class="monkeytype-error" role="status">{shell.monkeytype.error}</p>
                {:else if shell.monkeytype.stale}
                  <p class="monkeytype-note" role="status">Stale sync</p>
                {/if}
                <div class="monkeytype-actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    class="monkeytype-action"
                    onclick={refreshMonkeytype}
                    disabled={monkeytypeBusy}
                  >
                    <span class="material-symbols-outlined" aria-hidden="true">sync</span>
                    {monkeytypeBusy ? "Syncing" : "Refresh"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="monkeytype-action"
                    onclick={disconnectMonkeytype}
                    disabled={monkeytypeBusy}
                  >
                    <span class="material-symbols-outlined" aria-hidden="true">link_off</span>
                    Disconnect
                  </Button>
                </div>
              {:else}
                <Button
                  variant="coral"
                  size="sm"
                  class="monkeytype-connect"
                  href="/settings"
                  onclick={() => shell.closeProfile()}
                >
                  <span class="material-symbols-outlined" aria-hidden="true">link</span>
                  Connect Monkeytype
                </Button>
                {#if shell.monkeytype.error}
                  <p class="monkeytype-error" role="status">{shell.monkeytype.error}</p>
                {/if}
              {/if}
            </section>

            <div class="profile-divider"></div>

            <Button
              variant="ghost"
              size="sm"
              class="m-3 w-[calc(100%-24px)] justify-start"
              onclick={signOut}
              disabled={authBusy}
            >
              <span class="material-symbols-outlined" aria-hidden="true">logout</span>
              {authBusy ? "Signing out" : "Sign out"}
            </Button>
          {:else}
            <div class="profile-head">
              <span class="profile-avatar local">{shell.account.initials}</span>
              <div class="profile-identity">
                <strong>{shell.account.name}</strong>
                <span>{shell.account.message ?? "GitHub not connected"}</span>
              </div>
            </div>
            <div class="profile-divider"></div>
            <Button
              variant="coral"
              size="sm"
              class="m-3 w-[calc(100%-24px)] justify-start"
              onclick={signInGithub}
              disabled={authBusy || shell.account.status === "loading"}
            >
              <span class="material-symbols-outlined" aria-hidden="true">login</span>
              {authBusy ? "Opening GitHub" : "Sign in with GitHub"}
            </Button>
            {#if shell.account.message}
              <p class="auth-hint">{shell.account.message}</p>
            {/if}
          {/if}
        </section>
      {/if}

      <div class="account-strip" class:open={shell.profileOpen}>
        <AvatarButton
          image={accountAvatar}
          initials={shell.account.initials}
          ariaLabel="Open profile"
          title="Profile"
          onclick={() => shell.toggleProfile()}
        />
        <button type="button" class="account-copy" onclick={() => shell.toggleProfile()}>
          <span>{shell.account.name}</span>
          <small>@{shell.account.login}</small>
        </button>
        <button
          type="button"
          class="account-caret"
          aria-label={shell.profileOpen ? "Close profile" : "Open profile"}
          onclick={() => shell.toggleProfile()}
        >
          <span class="material-symbols-outlined" aria-hidden="true">
            {shell.profileOpen ? "expand_more" : "expand_less"}
          </span>
        </button>
      </div>

      <div class="device-status" data-status={shell.device.status}>
        <span class="device-dot" aria-hidden="true"></span>
        <div>
          <strong>{shell.connected ? shell.device.board : "No device"}</strong>
          <span>{shell.connected ? `${shell.device.transport} · ${shell.device.protocol}` : shell.device.message}</span>
        </div>
      </div>
    </div>
  </nav>

  <div class="shell-main">
    <header class="appbar">
      <h1>{routeTitle}</h1>

      {#if shell.connected}
        <Chip dot="var(--teal)" title="Connected board">{shell.device.name}</Chip>
      {:else}
        <Chip tone="warning" title="No connected board">No board</Chip>
      {/if}

      <Chip dot={liveSync.dot} title={liveSync.title}>{liveSync.label}</Chip>

      <Chip dot={shell.currentVariant.color} title="Current variant">
        <span class="material-symbols-outlined chip-icon" aria-hidden="true">account_tree</span>
        {shell.currentVariant.name}
      </Chip>

      <div class="appbar-spacer"></div>

      {#if shell.activeMonkeytype}
        <Chip title="Monkeytype average">
          <span class="material-symbols-outlined chip-icon" aria-hidden="true">speed</span>
          {statValue(shell.activeMonkeytype.wpm)} wpm
        </Chip>
      {/if}

      {#if shell.dirty > 0}
        <Button variant="ghost" size="sm" onclick={openVersionsForSavePoint}>
          <span class="material-symbols-outlined" aria-hidden="true">bookmark_add</span>
          Save point · {shell.dirty}
        </Button>
      {/if}

      <Button variant={shell.connected ? "coral" : "ghost"} onclick={handlePrimaryAction}>
        <span class="material-symbols-outlined" aria-hidden="true">
          {shell.connected ? "check_circle" : "cable"}
        </span>
        {shell.primaryActionLabel}
      </Button>
    </header>

    <div class="placement-banner-host" data-shell-placement-banner>
      {#if pathname.startsWith("/editor") && shell.placeMode}
        <div class="placement-banner">
          <span class="material-symbols-outlined" aria-hidden="true">ads_click</span>
          {#if shell.placeMode.kind === "combo"}
            <span>
              Picking <strong>{shell.placeMode.label}</strong>
              <small>{shell.placeMode.picks.length}/2 keys</small>
            </span>
          {:else}
            <span>Placing <strong>{shell.placeMode.label}</strong> - click a key</span>
          {/if}
          <button type="button" aria-label="Cancel placement" onclick={() => shell.clearPlacement()}>
            <span class="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>
      {/if}
    </div>

    <main class="shell-content">
      {@render children()}
    </main>

    <div class="overlay-host" data-shell-overlay-host aria-hidden="true"></div>
    <div class="flash-overlay-host" data-shell-flash-overlay-host aria-hidden="true"></div>
  </div>
</div>

<style>
  .new-app-shell {
    display: grid;
    grid-template-columns: 208px minmax(0, 1fr);
    min-height: 100vh;
    overflow: hidden;
    background:
      radial-gradient(ellipse 95% 75% at 100% 0%, color-mix(in oklch, var(--teal) 9%, transparent), transparent 58%),
      var(--paper);
    color: var(--ink);
  }

  .left-rail {
    position: relative;
    z-index: 2;
    display: flex;
    min-width: 0;
    min-height: 100vh;
    flex-direction: column;
    gap: 18px;
    border-right: 1px solid var(--line);
    background: color-mix(in oklch, var(--surface) 78%, var(--paper));
  }

  .rail-brand {
    display: flex;
    align-items: center;
    min-height: 58px;
    padding: 0 16px;
    border-bottom: 1px solid var(--line);
  }

  .rail-nav {
    display: grid;
    gap: 5px;
    padding: 8px 12px;
  }

  .rail-nav-item {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) 16px;
    align-items: center;
    gap: 10px;
    min-height: 38px;
    padding: 0 10px;
    border: 1px solid transparent;
    border-radius: 8px;
    color: var(--ink-2);
    font-size: 13px;
    text-decoration: none;
    transition:
      border-color var(--dur-fast) var(--ease-out-soft),
      background var(--dur-fast) var(--ease-out-soft),
      color var(--dur-fast) var(--ease-out-soft);
  }

  .rail-nav-item:hover {
    border-color: var(--line);
    color: var(--ink);
    background: color-mix(in oklch, var(--surface) 72%, transparent);
  }

  .rail-nav-item.active {
    border-color: var(--ink);
    color: var(--paper);
    background: var(--ink);
    box-shadow: var(--shadow-card);
  }

  .rail-icon {
    font-size: 19px;
  }

  .rail-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rail-check {
    color: var(--mint);
    font-size: 16px;
  }

  .rail-footer {
    position: relative;
    display: grid;
    gap: 10px;
    margin-top: auto;
    padding: 0 12px 14px;
  }

  .profile-popover {
    position: absolute;
    right: 12px;
    bottom: 114px;
    left: 12px;
    z-index: 5;
    overflow: hidden;
    border: 1px solid var(--line-2);
    border-radius: 12px;
    background: var(--surface);
    box-shadow: var(--shadow-popover);
  }

  .profile-head {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    padding: 12px;
  }

  .profile-avatar {
    display: grid;
    width: 40px;
    height: 40px;
    place-items: center;
    overflow: hidden;
    border: 1px solid var(--line-2);
    border-radius: 10px;
    background: var(--paper-2);
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 700;
  }

  .profile-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .profile-avatar.local {
    color: #1c0a04;
    background: var(--coral);
  }

  .profile-identity {
    min-width: 0;
  }

  .profile-identity strong,
  .profile-identity span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .profile-identity strong {
    font-size: 13px;
  }

  .profile-identity span {
    margin-top: 2px;
    color: var(--ink-3);
    font-size: 11px;
  }

  .profile-identity .profile-email {
    margin-top: 1px;
    color: var(--ink-2);
  }

  .profile-divider {
    height: 1px;
    margin: 0 12px;
    background: var(--line);
  }

  .profile-actions {
    display: grid;
    gap: 6px;
    padding: 10px 12px;
  }

  .profile-link {
    display: inline-grid;
    grid-template-columns: 16px minmax(0, 1fr);
    align-items: center;
    gap: 7px;
    min-height: 28px;
    padding: 0 8px;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--ink);
    background: var(--paper-2);
    font-size: 12px;
    font-weight: 600;
    text-decoration: none;
  }

  .profile-link:hover {
    border-color: var(--line-2);
    background: color-mix(in oklch, var(--coral) 10%, var(--paper-2));
  }

  .profile-link .material-symbols-outlined {
    font-size: 15px;
  }

  .auth-hint {
    margin: -4px 12px 12px;
    color: var(--ink-3);
    font-size: 11px;
    line-height: 1.35;
  }

  .monkeytype-block {
    display: grid;
    gap: 8px;
    padding: 11px 12px 12px;
  }

  .monkeytype-head {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
    color: var(--ink-2);
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .monkeytype-head .material-symbols-outlined {
    font-size: 15px;
  }

  .monkeytype-mode,
  .monkeytype-open {
    color: var(--ink-3);
    font-size: 9px;
    text-align: right;
  }

  .monkeytype-open {
    display: inline-grid;
    grid-template-columns: auto 12px;
    align-items: center;
    gap: 3px;
    color: var(--coral-ink);
    font-family: var(--mono);
    text-decoration: none;
  }

  .monkeytype-open .material-symbols-outlined {
    font-size: 12px;
  }

  .monkeytype-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .monkeytype-stat {
    display: grid;
    gap: 2px;
    min-width: 0;
    min-height: 48px;
    padding: 8px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: color-mix(in oklch, var(--paper-2) 76%, transparent);
  }

  .monkeytype-stat strong,
  .monkeytype-stat span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .monkeytype-stat strong {
    font-family: var(--mono);
    font-size: 13px;
  }

  .monkeytype-stat span {
    color: var(--ink-3);
    font-size: 10px;
  }

  .monkeytype-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 6px;
  }

  :global(.monkeytype-action),
  :global(.monkeytype-connect) {
    width: 100%;
    justify-content: center;
  }

  .monkeytype-error,
  .monkeytype-note {
    margin: 0;
    padding: 7px 8px;
    border-radius: 8px;
    font-size: 11px;
    line-height: 1.35;
  }

  .monkeytype-error {
    border: 1px solid oklch(0.62 0.2 25 / 0.26);
    background: oklch(0.95 0.04 25);
    color: oklch(0.42 0.15 25);
  }

  .monkeytype-note {
    border: 1px solid color-mix(in oklch, var(--mustard) 42%, var(--line-2));
    background: color-mix(in oklch, var(--mustard) 15%, var(--surface));
    color: var(--ink-2);
  }

  .account-strip {
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) 28px;
    align-items: center;
    gap: 8px;
    padding: 7px;
    border: 1px solid transparent;
    border-radius: 12px;
  }

  .account-strip.open,
  .account-strip:hover {
    border-color: var(--line);
    background: color-mix(in oklch, var(--surface) 68%, transparent);
  }

  .account-copy {
    min-width: 0;
    padding: 0;
    text-align: left;
  }

  .account-copy span,
  .account-copy small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .account-copy span {
    font-size: 12px;
    font-weight: 600;
  }

  .account-copy small {
    margin-top: 1px;
    color: var(--ink-3);
    font-size: 10px;
  }

  .account-caret {
    display: grid;
    width: 28px;
    height: 28px;
    place-items: center;
    border-radius: 8px;
    color: var(--ink-3);
  }

  .account-caret:hover {
    color: var(--ink);
    background: var(--paper-2);
  }

  .device-status {
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    min-height: 48px;
    padding: 9px 10px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: color-mix(in oklch, var(--surface) 72%, transparent);
  }

  .device-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--ink-3);
  }

  .device-status[data-status="connected"] .device-dot {
    background: var(--mint);
    box-shadow: 0 0 0 3px color-mix(in oklch, var(--mint) 24%, transparent);
  }

  .device-status[data-status="connecting"] .device-dot {
    background: var(--mustard);
    box-shadow: 0 0 0 3px color-mix(in oklch, var(--mustard) 24%, transparent);
  }

  .device-status[data-status="error"] .device-dot {
    background: var(--removed);
    box-shadow: 0 0 0 3px color-mix(in oklch, var(--removed) 18%, transparent);
  }

  .device-status strong,
  .device-status span {
    display: block;
    overflow: hidden;
    font-family: var(--mono);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .device-status strong {
    font-size: 11px;
    font-weight: 600;
  }

  .device-status span {
    margin-top: 2px;
    color: var(--ink-3);
    font-size: 10px;
  }

  .shell-main {
    display: flex;
    min-width: 0;
    min-height: 100vh;
    flex-direction: column;
    overflow: hidden;
  }

  .appbar {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    min-height: 58px;
    padding: 0 20px;
    border-bottom: 1px solid var(--line);
    background: color-mix(in oklch, var(--surface) 42%, var(--paper));
  }

  .appbar h1 {
    flex: 0 0 auto;
    margin: 0 10px 0 0;
    font-size: 17px;
    font-weight: 700;
    letter-spacing: 0;
  }

  .appbar-spacer {
    flex: 1;
    min-width: 10px;
  }

  .chip-icon {
    font-size: 14px;
  }

  .placement-banner-host {
    display: contents;
  }

  .placement-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 38px;
    padding: 0 18px;
    border-bottom: 1px solid var(--place-banner-border);
    background: var(--place-banner-bg);
    color: var(--ink);
    font-size: 12px;
  }

  .placement-banner button {
    display: grid;
    width: 26px;
    height: 26px;
    place-items: center;
    margin-left: auto;
    border-radius: 7px;
  }

  .placement-banner button:hover {
    background: color-mix(in oklch, var(--coral) 16%, transparent);
  }

  .placement-banner small {
    margin-left: 6px;
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 10px;
  }

  .shell-content {
    min-width: 0;
    min-height: 0;
    flex: 1;
    overflow: auto;
  }

  .overlay-host,
  .flash-overlay-host {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: none;
    pointer-events: none;
  }

  @media (max-width: 900px) {
    .new-app-shell {
      grid-template-columns: 72px minmax(0, 1fr);
    }

    .left-rail {
      gap: 12px;
    }

    .rail-brand {
      justify-content: center;
      padding: 0;
    }

    .rail-nav {
      padding-inline: 10px;
    }

    .rail-nav-item {
      grid-template-columns: 1fr;
      justify-items: center;
      gap: 0;
      padding: 0;
    }

    .rail-label,
    .rail-check,
    .account-copy,
    .account-caret,
    .device-status span,
    .device-status strong {
      display: none;
    }

    .rail-footer {
      padding-inline: 10px;
    }

    .profile-popover {
      right: auto;
      left: 60px;
      width: 212px;
    }

    .account-strip {
      display: flex;
      justify-content: center;
      padding: 6px 0;
    }

    .device-status {
      display: grid;
      place-items: center;
      min-height: 36px;
      padding: 0;
    }

    .appbar {
      flex-wrap: wrap;
      min-height: 68px;
      align-content: center;
      padding: 8px 12px;
    }

    .appbar h1 {
      width: 100%;
      margin: 0;
      font-size: 15px;
    }

    .appbar-spacer {
      display: none;
    }
  }

  @media (max-width: 560px) {
    .new-app-shell {
      grid-template-columns: 58px minmax(0, 1fr);
    }

    .rail-nav {
      padding-inline: 7px;
    }

    .rail-icon {
      font-size: 20px;
    }

    .appbar :global([data-slot="badge"]) {
      max-width: 145px;
    }
  }
</style>
