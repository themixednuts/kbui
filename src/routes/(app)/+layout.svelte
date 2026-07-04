<script lang="ts">
  import { browser, dev } from "$app/environment";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { Accent, runApp } from "$lib/app";
  import { authClient } from "$lib/auth-client";
  import { cn } from "$lib/utils.js";
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
  const activeBoardName = $derived(workbench.profile.name);
  const activeBoardTitle = $derived(
    workbench.profile.origin === "starter"
      ? "Starter board template"
      : shell.connected
        ? "Connected board"
        : workbench.profile.origin === "draft"
          ? "Saved local draft"
          : "Active board profile",
  );
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

  const appShellClass =
    "new-app-shell grid min-h-screen grid-cols-[208px_minmax(0,1fr)] overflow-hidden bg-[radial-gradient(ellipse_95%_75%_at_100%_0%,color-mix(in_oklch,var(--teal)_9%,transparent),transparent_58%),var(--paper)] text-ink max-[900px]:grid-cols-[72px_minmax(0,1fr)] max-[560px]:grid-cols-[58px_minmax(0,1fr)]";
  const leftRailClass =
    "left-rail relative z-[2] flex min-h-screen min-w-0 flex-col gap-[18px] border-r border-line bg-[color-mix(in_oklch,var(--surface)_78%,var(--paper))] max-[900px]:gap-[12px]";
  const railBrandClass =
    "rail-brand flex min-h-[58px] items-center border-b border-line px-[16px] max-[900px]:justify-center max-[900px]:px-0";
  const railNavClass =
    "rail-nav grid gap-[5px] px-[12px] py-[8px] max-[900px]:px-[10px] max-[560px]:px-[7px]";
  const railNavItemClass =
    "rail-nav-item grid min-h-[38px] grid-cols-[22px_minmax(0,1fr)_16px] items-center gap-[10px] rounded-[8px] border border-transparent px-[10px] text-[13px] text-ink-2 no-underline transition-[border-color,background,color] duration-[var(--dur-fast)] ease-[var(--ease-out-soft)] hover:border-line hover:bg-[color-mix(in_oklch,var(--surface)_72%,transparent)] hover:text-ink max-[900px]:grid-cols-[1fr] max-[900px]:justify-items-center max-[900px]:gap-0 max-[900px]:px-0";
  const railNavItemActiveClass =
    "active border-ink bg-ink text-paper shadow-card hover:border-ink hover:bg-ink hover:text-paper";
  const railIconClass = "material-symbols-outlined rail-icon !text-[19px] max-[560px]:!text-[20px]";
  const railLabelClass = "rail-label overflow-hidden text-ellipsis whitespace-nowrap max-[900px]:hidden";
  const railCheckClass = "material-symbols-outlined rail-check text-mint !text-[16px] max-[900px]:hidden";
  const railFooterClass = "rail-footer relative mt-auto grid gap-[10px] px-[12px] pb-[14px] max-[900px]:px-[10px]";
  const profilePopoverClass =
    "profile-popover absolute right-[12px] bottom-[114px] left-[12px] z-[5] overflow-hidden rounded-[12px] border border-line-2 bg-surface shadow-popover max-[900px]:right-auto max-[900px]:left-[60px] max-[900px]:w-[212px]";
  const profileHeadClass = "profile-head grid grid-cols-[40px_minmax(0,1fr)] items-center gap-[10px] p-[12px]";
  const profileAvatarClass =
    "profile-avatar grid size-[40px] place-items-center overflow-hidden rounded-[10px] border border-line-2 bg-paper-2 font-mono text-[12px] font-bold";
  const profileIdentityClass = "profile-identity min-w-0";
  const profileIdentityStrongClass = "block overflow-hidden text-ellipsis whitespace-nowrap text-[13px]";
  const profileIdentitySpanClass = "mt-[2px] block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-ink-3";
  const profileDividerClass = "profile-divider mx-[12px] h-px bg-line";
  const profileActionsClass = "profile-actions grid gap-[6px] px-[12px] py-[10px]";
  const profileLinkClass =
    "profile-link inline-grid min-h-[28px] grid-cols-[16px_minmax(0,1fr)] items-center gap-[7px] rounded-[8px] border border-line bg-paper-2 px-[8px] text-[12px] font-semibold text-ink no-underline hover:border-line-2 hover:bg-[color-mix(in_oklch,var(--coral)_10%,var(--paper-2))]";
  const authHintClass = "auth-hint mx-[12px] mb-[12px] mt-[-4px] text-[11px] leading-[1.35] text-ink-3";
  const monkeytypeBlockClass = "monkeytype-block grid gap-[8px] px-[12px] pt-[11px] pb-[12px]";
  const monkeytypeHeadClass =
    "monkeytype-head grid grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-[6px] font-mono text-[10px] uppercase tracking-[0.1em] text-ink-2";
  const monkeytypeModeClass = "monkeytype-mode text-right text-[9px] text-ink-3";
  const monkeytypeOpenClass =
    "monkeytype-open inline-grid grid-cols-[auto_12px] items-center gap-[3px] text-right font-mono text-[9px] text-coral-ink no-underline";
  const monkeytypeGridClass = "monkeytype-grid grid grid-cols-2 gap-[6px]";
  const monkeytypeStatClass =
    "monkeytype-stat grid min-h-[48px] min-w-0 gap-[2px] rounded-[8px] border border-line bg-[color-mix(in_oklch,var(--paper-2)_76%,transparent)] p-[8px]";
  const monkeytypeStatStrongClass = "overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[13px]";
  const monkeytypeStatSpanClass = "overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-ink-3";
  const monkeytypeActionsClass = "monkeytype-actions grid grid-cols-2 gap-[6px]";
  const monkeytypeMessageClass = "m-0 rounded-[8px] px-[8px] py-[7px] text-[11px] leading-[1.35]";
  const monkeytypeErrorClass =
    "monkeytype-error border border-[oklch(0.62_0.2_25_/_0.26)] bg-[oklch(0.95_0.04_25)] text-[oklch(0.42_0.15_25)]";
  const monkeytypeNoteClass =
    "monkeytype-note border border-[color-mix(in_oklch,var(--mustard)_42%,var(--line-2))] bg-[color-mix(in_oklch,var(--mustard)_15%,var(--surface))] text-ink-2";
  const accountStripClass =
    "account-strip grid grid-cols-[34px_minmax(0,1fr)_28px] items-center gap-[8px] rounded-[12px] border border-transparent p-[7px] hover:border-line hover:bg-[color-mix(in_oklch,var(--surface)_68%,transparent)] max-[900px]:flex max-[900px]:justify-center max-[900px]:px-0 max-[900px]:py-[6px]";
  const accountStripOpenClass = "open border-line bg-[color-mix(in_oklch,var(--surface)_68%,transparent)]";
  const accountCopyClass = "account-copy min-w-0 p-0 text-left max-[900px]:hidden";
  const accountNameClass = "block overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-semibold";
  const accountLoginClass = "mt-[1px] block overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-ink-3";
  const accountCaretClass =
    "account-caret grid size-[28px] place-items-center rounded-[8px] text-ink-3 hover:bg-paper-2 hover:text-ink max-[900px]:hidden";
  const deviceStatusClass =
    "device-status grid min-h-[48px] grid-cols-[10px_minmax(0,1fr)] items-center gap-[10px] rounded-[10px] border border-line bg-[color-mix(in_oklch,var(--surface)_72%,transparent)] px-[10px] py-[9px] max-[900px]:min-h-[36px] max-[900px]:place-items-center max-[900px]:p-0";
  const deviceDotClass = "device-dot size-[8px] rounded-pill bg-ink-3";
  const deviceConnectedDotClass =
    "bg-mint shadow-[0_0_0_3px_color-mix(in_oklch,var(--mint)_24%,transparent)]";
  const deviceConnectingDotClass =
    "bg-mustard shadow-[0_0_0_3px_color-mix(in_oklch,var(--mustard)_24%,transparent)]";
  const deviceErrorDotClass =
    "bg-removed shadow-[0_0_0_3px_color-mix(in_oklch,var(--removed)_18%,transparent)]";
  const deviceStatusStrongClass =
    "block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] font-semibold max-[900px]:hidden";
  const deviceStatusSpanClass =
    "mt-[2px] block overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[10px] text-ink-3 max-[900px]:hidden";
  const shellMainClass = "shell-main flex min-h-screen min-w-0 flex-col overflow-hidden";
  const appbarClass =
    "appbar flex min-h-[58px] min-w-0 items-center gap-[8px] border-b border-line bg-[color-mix(in_oklch,var(--surface)_42%,var(--paper))] px-[20px] max-[900px]:min-h-[68px] max-[900px]:flex-wrap max-[900px]:content-center max-[900px]:px-[12px] max-[900px]:py-[8px]";
  const appbarTitleClass =
    "m-0 mr-[10px] flex-none text-[17px] font-bold tracking-[0] max-[900px]:w-full max-[900px]:mr-0 max-[900px]:text-[15px]";
  const appbarChipClass = "max-[560px]:max-w-[145px]";
  const appbarSpacerClass = "appbar-spacer min-w-[10px] flex-1 max-[900px]:hidden";
  const chipIconClass = "material-symbols-outlined chip-icon !text-[14px]";
  const starterBadgeClass =
    "starter-badge inline-grid min-h-[17px] place-items-center rounded-pill border border-[color-mix(in_oklch,var(--mustard)_46%,var(--line-2))] bg-[color-mix(in_oklch,var(--mustard)_18%,var(--surface))] px-[6px] text-[9px] uppercase tracking-[0.08em] text-[oklch(0.39_0.11_90)]";
  const placementBannerHostClass = "placement-banner-host contents";
  const placementBannerClass =
    "placement-banner flex min-h-[38px] items-center gap-[8px] border-b border-[var(--place-banner-border)] bg-[var(--place-banner-bg)] px-[18px] text-[12px] text-ink";
  const placementBannerButtonClass =
    "ml-auto grid size-[26px] place-items-center rounded-[7px] hover:bg-[color-mix(in_oklch,var(--coral)_16%,transparent)]";
  const placementBannerSmallClass = "ml-[6px] font-mono text-[10px] text-ink-3";
  const shellContentClass = "shell-content min-h-0 min-w-0 flex-1 overflow-auto";
  const overlayHostClass = "overlay-host pointer-events-none fixed inset-0 z-20 hidden";
  const flashOverlayHostClass = "flash-overlay-host pointer-events-none fixed inset-0 z-20 hidden";
</script>

<div class={appShellClass}>
  <nav class={leftRailClass} aria-label="Application navigation">
    <div class={railBrandClass}>
      <Brand href="/editor" />
    </div>

    <div class={railNavClass}>
      {#each shell.navItems as item (item.id)}
        {@const active = isActive(item.href)}
        <a
          href={item.href}
          class={cn(railNavItemClass, active && railNavItemActiveClass)}
          aria-current={active ? "page" : undefined}
          data-sveltekit-preload-data="hover"
        >
          <span class={railIconClass} aria-hidden="true">{item.icon}</span>
          <span class={railLabelClass}>{item.label}</span>
          {#if item.id === "connect" && shell.connected}
            <span class={railCheckClass} aria-hidden="true">check_circle</span>
          {/if}
        </a>
      {/each}
    </div>

    <div class={railFooterClass}>
      {#if shell.profileOpen}
        <section class={profilePopoverClass} aria-label="Profile">
          {#if shell.account.status === "signed-in"}
            <div class={profileHeadClass}>
              <span class={profileAvatarClass}>
                {#if accountAvatar}
                  <img class="size-full object-cover" src={accountAvatar} alt="" />
                {:else}
                  {shell.account.initials}
                {/if}
              </span>
              <div class={profileIdentityClass}>
                <strong class={profileIdentityStrongClass}>{shell.account.name}</strong>
                <span class={profileIdentitySpanClass}>@{shell.account.login} · GitHub</span>
                {#if shell.account.email}
                  <span class={cn(profileIdentitySpanClass, "profile-email mt-[1px] text-ink-2")}>{shell.account.email}</span>
                {/if}
              </div>
            </div>

            <div class={profileDividerClass}></div>

            <div class={profileActionsClass}>
              <a
                class={profileLinkClass}
                href={shell.account.githubProfileUrl ?? "https://github.com/settings/profile"}
                target="_blank"
                rel="noreferrer"
              >
                <span class="material-symbols-outlined !text-[15px]" aria-hidden="true">open_in_new</span>
                View GitHub profile
              </a>
            </div>

            <div class={profileDividerClass}></div>

            <section class={monkeytypeBlockClass} aria-label="Monkeytype">
              <div class={monkeytypeHeadClass}>
                <span class="material-symbols-outlined !text-[15px]" aria-hidden="true">keyboard_alt</span>
                <span>Monkeytype</span>
                {#if shell.monkeytype.connected && monkeytypeProfileUrl}
                  <a class={monkeytypeOpenClass} href={monkeytypeProfileUrl} target="_blank" rel="noreferrer">
                    open
                    <span class="material-symbols-outlined !text-[12px]" aria-hidden="true">open_in_new</span>
                  </a>
                {:else if shell.monkeytype.connected}
                  <span class={monkeytypeModeClass}>{shell.monkeytype.mode}/{shell.monkeytype.mode2}</span>
                {:else}
                  <span class={monkeytypeModeClass}>offline</span>
                {/if}
              </div>
              {#if shell.monkeytype.connected}
                <div class={monkeytypeGridClass}>
                  <div class={monkeytypeStatClass}>
                    <strong class={monkeytypeStatStrongClass}>{statValue(shell.monkeytype.wpm)}</strong>
                    <span class={monkeytypeStatSpanClass}>wpm avg</span>
                  </div>
                  <div class={monkeytypeStatClass}>
                    <strong class={monkeytypeStatStrongClass}>{statValue(shell.monkeytype.accuracy, 1)}%</strong>
                    <span class={monkeytypeStatSpanClass}>accuracy</span>
                  </div>
                  <div class={monkeytypeStatClass}>
                    <strong class={monkeytypeStatStrongClass}>{statValue(shell.monkeytype.pb)}</strong>
                    <span class={monkeytypeStatSpanClass}>pb wpm</span>
                  </div>
                  <div class={monkeytypeStatClass}>
                    <strong class={monkeytypeStatStrongClass}>{statValue(shell.monkeytype.tests)}</strong>
                    <span class={monkeytypeStatSpanClass}>tests</span>
                  </div>
                </div>
                {#if shell.monkeytype.error}
                  <p class={cn(monkeytypeMessageClass, monkeytypeErrorClass)} role="status">{shell.monkeytype.error}</p>
                {:else if shell.monkeytype.stale}
                  <p class={cn(monkeytypeMessageClass, monkeytypeNoteClass)} role="status">Stale sync</p>
                {/if}
                <div class={monkeytypeActionsClass}>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="monkeytype-action w-full justify-center"
                    onclick={refreshMonkeytype}
                    disabled={monkeytypeBusy}
                  >
                    <span class="material-symbols-outlined" aria-hidden="true">sync</span>
                    {monkeytypeBusy ? "Syncing" : "Refresh"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="monkeytype-action w-full justify-center"
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
                  class="monkeytype-connect w-full justify-center"
                  href="/settings"
                  onclick={() => shell.closeProfile()}
                >
                  <span class="material-symbols-outlined" aria-hidden="true">link</span>
                  Connect Monkeytype
                </Button>
                {#if shell.monkeytype.error}
                  <p class={cn(monkeytypeMessageClass, monkeytypeErrorClass)} role="status">{shell.monkeytype.error}</p>
                {/if}
              {/if}
            </section>

            <div class={profileDividerClass}></div>

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
            <div class={profileHeadClass}>
              <span class={cn(profileAvatarClass, "local bg-coral text-[#1c0a04]")}>{shell.account.initials}</span>
              <div class={profileIdentityClass}>
                <strong class={profileIdentityStrongClass}>{shell.account.name}</strong>
                <span class={profileIdentitySpanClass}>{shell.account.message ?? "GitHub not connected"}</span>
              </div>
            </div>
            <div class={profileDividerClass}></div>
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
              <p class={authHintClass}>{shell.account.message}</p>
            {/if}
          {/if}
        </section>
      {/if}

      <div class={cn(accountStripClass, shell.profileOpen && accountStripOpenClass)}>
        <AvatarButton
          image={accountAvatar}
          initials={shell.account.initials}
          ariaLabel="Open profile"
          title="Profile"
          onclick={() => shell.toggleProfile()}
        />
        <button type="button" class={accountCopyClass} onclick={() => shell.toggleProfile()}>
          <span class={accountNameClass}>{shell.account.name}</span>
          <small class={accountLoginClass}>@{shell.account.login}</small>
        </button>
        <button
          type="button"
          class={accountCaretClass}
          aria-label={shell.profileOpen ? "Close profile" : "Open profile"}
          onclick={() => shell.toggleProfile()}
        >
          <span class="material-symbols-outlined" aria-hidden="true">
            {shell.profileOpen ? "expand_more" : "expand_less"}
          </span>
        </button>
      </div>

      <div class={deviceStatusClass} data-status={shell.device.status}>
        <span
          class={cn(
            deviceDotClass,
            shell.device.status === "connected" && deviceConnectedDotClass,
            shell.device.status === "connecting" && deviceConnectingDotClass,
            shell.device.status === "error" && deviceErrorDotClass,
          )}
          aria-hidden="true"
        ></span>
        <div>
          <strong class={deviceStatusStrongClass}>{shell.connected ? shell.device.board : "No device"}</strong>
          <span class={deviceStatusSpanClass}>{shell.connected ? `${shell.device.transport} · ${shell.device.protocol}` : shell.device.message}</span>
        </div>
      </div>
    </div>
  </nav>

  <div class={shellMainClass}>
    <header class={appbarClass}>
      <h1 class={appbarTitleClass}>{routeTitle}</h1>

      <Chip
        class={appbarChipClass}
        dot={shell.connected ? "var(--teal)" : undefined}
        tone={workbench.profile.origin === "starter" ? "warning" : "neutral"}
        title={activeBoardTitle}
      >
        {activeBoardName}
        {#if workbench.profile.origin === "starter"}
          <span class={starterBadgeClass}>Starter</span>
        {/if}
      </Chip>

      <Chip class={appbarChipClass} dot={liveSync.dot} title={liveSync.title}>{liveSync.label}</Chip>

      <Chip class={appbarChipClass} dot={shell.currentVariant.color} title="Current variant">
        <span class={chipIconClass} aria-hidden="true">account_tree</span>
        {shell.currentVariant.name}
      </Chip>

      <div class={appbarSpacerClass}></div>

      {#if shell.activeMonkeytype}
        <Chip class={appbarChipClass} title="Monkeytype average">
          <span class={chipIconClass} aria-hidden="true">speed</span>
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

    <div class={placementBannerHostClass} data-shell-placement-banner>
      {#if pathname.startsWith("/editor") && shell.placeMode}
        <div class={placementBannerClass}>
          <span class="material-symbols-outlined" aria-hidden="true">ads_click</span>
          {#if shell.placeMode.kind === "combo"}
            <span>
              Picking <strong>{shell.placeMode.label}</strong>
              <small class={placementBannerSmallClass}>{shell.placeMode.picks.length}/2 keys</small>
            </span>
          {:else}
            <span>Placing <strong>{shell.placeMode.label}</strong> - click a key</span>
          {/if}
          <button
            type="button"
            class={placementBannerButtonClass}
            aria-label="Cancel placement"
            onclick={() => shell.clearPlacement()}
          >
            <span class="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        </div>
      {/if}
    </div>

    <main class={shellContentClass}>
      {@render children()}
    </main>

    <div class={overlayHostClass} data-shell-overlay-host aria-hidden="true"></div>
    <div class={flashOverlayHostClass} data-shell-flash-overlay-host aria-hidden="true"></div>
  </div>
</div>
