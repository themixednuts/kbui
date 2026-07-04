<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { authClient } from "$lib/auth-client";
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

  let { children } = $props();

  const shell = new ShellStore();
  setShellContext(shell);
  const pathname = $derived(page.url.pathname);
  const routeTitle = $derived(routeTitleFromPath(pathname));
  const accountAvatar = $derived(
    shell.account.image ??
      (shell.account.status === "signed-in"
        ? `https://github.com/${shell.account.login}.png`
        : null),
  );

  let authRequested = $state(false);
  let previousPathname = $state("");

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

  async function refreshSession() {
    shell.setAuthLoading();

    try {
      const result = await authClient.getSession();
      const data = result.data as { user?: ShellSessionUser } | null;
      shell.setSessionUser(data?.user);
    } catch (error) {
      shell.setAuthError(error instanceof Error ? error.message : "Auth unavailable");
    }
  }

  async function signOut() {
    try {
      await authClient.signOut();
      shell.setSignedOut();
    } catch (error) {
      shell.setAuthError(error instanceof Error ? error.message : "Sign out failed");
    }
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
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
              </div>
            </div>

            <div class="profile-divider"></div>

            {#if shell.monkeytype.connected}
              <div class="monkeytype-block">
                <div class="monkeytype-head">
                  <span class="material-symbols-outlined" aria-hidden="true">keyboard_alt</span>
                  <span>Monkeytype</span>
                  <a
                    href={`https://monkeytype.com/profile/${shell.account.login}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    open
                  </a>
                </div>
                <div class="monkeytype-grid">
                  <div>
                    <strong>{shell.monkeytype.wpm}</strong>
                    <span>wpm avg</span>
                  </div>
                  <div>
                    <strong>{shell.monkeytype.accuracy}%</strong>
                    <span>accuracy</span>
                  </div>
                  <div>
                    <strong>{shell.monkeytype.pb}</strong>
                    <span>pb wpm</span>
                  </div>
                  <div>
                    <strong>{shell.monkeytype.tests.toLocaleString()}</strong>
                    <span>tests</span>
                  </div>
                </div>
              </div>
            {:else}
              <Button variant="ghost" size="sm" class="m-3 w-[calc(100%-24px)] justify-start">
                <span class="material-symbols-outlined" aria-hidden="true">link</span>
                Connect Monkeytype
              </Button>
            {/if}

            <div class="profile-divider"></div>

            <Button
              variant="ghost"
              size="sm"
              class="m-3 w-[calc(100%-24px)] justify-start"
              onclick={signOut}
            >
              <span class="material-symbols-outlined" aria-hidden="true">logout</span>
              Sign out
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
              variant="ghost"
              size="sm"
              class="m-3 w-[calc(100%-24px)] justify-start"
              disabled
            >
              <span class="material-symbols-outlined" aria-hidden="true">login</span>
              Sign in with GitHub
            </Button>
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

      <div class="device-status" data-connected={shell.connected}>
        <span class="device-dot" aria-hidden="true"></span>
        <div>
          <strong>{shell.connected ? shell.device.name : "No device"}</strong>
          <span>{shell.connected ? `${shell.device.transport} · ${shell.device.protocol}` : "Offline"}</span>
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

      <Chip dot={shell.currentVariant.color} title="Current variant">
        <span class="material-symbols-outlined chip-icon" aria-hidden="true">account_tree</span>
        {shell.currentVariant.name}
      </Chip>

      <div class="appbar-spacer"></div>

      {#if shell.activeMonkeytype}
        <Chip title="Monkeytype average">
          <span class="material-symbols-outlined chip-icon" aria-hidden="true">speed</span>
          {shell.activeMonkeytype.wpm} wpm
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
          {shell.connected ? "bolt" : "cable"}
        </span>
        {shell.primaryActionLabel}
      </Button>
    </header>

    <div class="placement-banner-host" data-shell-placement-banner>
      {#if shell.placeMode && shell.placeMode.kind !== "combo"}
        <div class="placement-banner">
          <span class="material-symbols-outlined" aria-hidden="true">ads_click</span>
          <span>Placing <strong>{shell.placeMode.label}</strong></span>
          <button type="button" aria-label="Cancel placement" onclick={() => (shell.placeMode = null)}>
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

  .profile-divider {
    height: 1px;
    margin: 0 12px;
    background: var(--line);
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

  .monkeytype-head a {
    color: var(--coral-ink);
    text-decoration: none;
    text-transform: none;
  }

  .monkeytype-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
  }

  .monkeytype-grid div {
    min-width: 0;
    padding: 8px 9px;
    border-radius: 8px;
    background: var(--paper-2);
  }

  .monkeytype-grid strong,
  .monkeytype-grid span {
    display: block;
  }

  .monkeytype-grid strong {
    font-family: var(--mono);
    font-size: 19px;
    font-weight: 600;
    line-height: 1;
  }

  .monkeytype-grid span {
    margin-top: 4px;
    color: var(--ink-3);
    font-size: 10px;
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

  .device-status[data-connected="true"] .device-dot {
    background: var(--mint);
    box-shadow: 0 0 0 3px color-mix(in oklch, var(--mint) 24%, transparent);
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
