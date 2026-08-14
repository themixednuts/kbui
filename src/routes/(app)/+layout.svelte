<script lang="ts">
  import { browser, dev } from "$app/environment";
  import { afterNavigate, goto } from "$app/navigation";
  import { page } from "$app/state";
  import {
    BookOpen,
    BookmarkPlus,
    Cable,
    Compass,
    Gauge,
    GitBranch,
    History,
    Keyboard,
    Settings2,
  } from "@lucide/svelte";
  import { Effect } from "effect";
  import { Accent, Theme } from "$lib/app";
  import { forkApp, startScopedApp } from "$lib/app/runtime";
  import { activateViaConnectionAndProfileEffect } from "$lib/app/connect-flow";
  import { authClient } from "$lib/auth-client";
  import {
    decodeAuthClientErrorEffect,
    decodeAuthRedirectDataEffect,
    decodeAuthSessionDataEffect,
    decodeMonkeytypeConnectionStatusEffect,
  } from "$lib/app/auth-client-boundary";
  import { cn } from "$lib/utils.js";
  import { platformError } from "$lib/effect/errors";
  import { onMount, untrack } from "svelte";
  import Brand from "$lib/components/ui/Brand.svelte";
  import Button from "$lib/components/ui/Button.svelte";
  import * as Popover from "$lib/components/ui/popover/index.js";
  import {
    setShellContext,
    routeTitleFromPath,
    ShellStore,
    type AppRouteId,
    type ShellSessionUser,
  } from "$lib/app/shell-store.svelte";
  import {
    protocolLabel,
    setWorkbenchContext,
    WorkbenchStore,
  } from "$lib/app/workbench-store.svelte";
  import { createViaCatalogResolver } from "$lib/app/via-catalog-resolver";
  import {
    FirmwareBuildEventsStore,
    setFirmwareBuildEventsContext,
  } from "$lib/app/firmware-build-events.svelte";
  import { WorkbenchCloudSyncStore } from "$lib/app/workbench-cloud-sync.svelte";
  import { KeyboardLiveSyncEngine } from "$lib/app/live-sync-coordinator.svelte";
  import {
    setViaLiveSyncContext,
  } from "$lib/app/via-live-sync.svelte";
  import { detectGrantedKeyboard } from "$lib/keyboard/transport";
  import { sampleBoardIdFromParam } from "$lib/keyboard/sample-boards";
  import {
    getViaKeyboardDetail,
    getViaKeyboardIndex,
    resolveKeyboardIdentity,
  } from "../keyboards.remote";

  const workerAuthHint = "Run `vp run dev:worker` to sign in with GitHub.";

  let { children, data } = $props();

  const shell = new ShellStore();
  const initialBoardId = untrack(() => sampleBoardIdFromParam(page.url.searchParams.get("board")));
  const workbench = new WorkbenchStore({ boardId: initialBoardId });
  const liveSync = new KeyboardLiveSyncEngine({ editor: workbench, shell });
  const firmwareBuildEvents = new FirmwareBuildEventsStore();
  const workbenchCloudSync = new WorkbenchCloudSyncStore();
  const viaCatalog = createViaCatalogResolver({
    getViaKeyboardDetail,
    getViaKeyboardIndex,
    resolveKeyboardIdentity,
    workbench,
  });
  setShellContext(shell);
  setWorkbenchContext(workbench);
  setViaLiveSyncContext(liveSync);
  setFirmwareBuildEventsContext(firmwareBuildEvents);
  const initialAuthUser = untrack(() => data.auth?.user ?? null);
  shell.setSessionUser(initialAuthUser);
  const pathname = $derived(page.url.pathname);
  const routeTitle = $derived(routeTitleFromPath(pathname));
  const showAppbar = $derived(!pathname.startsWith("/connect"));
  const editorAppbar = $derived(pathname.startsWith("/editor"));
  const activeBoardName = $derived(workbench.profile.name);
  const activeBoardTitle = $derived(
    workbench.profile.origin === "starter"
      ? "Local profile"
      : shell.connected
        ? "Connected board"
        : workbench.profile.origin === "draft"
          ? "Saved local draft"
          : "Active board profile",
  );
  const accountAvatar = $derived(shell.account.image ?? null);
  const accountId = $derived(
    shell.account.status === "signed-in" ? (shell.account.id ?? null) : null,
  );
  const navIcons: Record<AppRouteId, typeof Cable> = {
    browse: Compass,
    connect: Cable,
    editor: Keyboard,
    trainer: Gauge,
    library: BookOpen,
    settings: Settings2,
    versions: History,
  };
  const monkeytypeProfileUrl = $derived(
    shell.monkeytype.username
      ? `https://monkeytype.com/profile/${encodeURIComponent(shell.monkeytype.username)}`
      : null,
  );

  let lastSsrUserKey = $state(sessionUserKey(initialAuthUser));
  let authBusy = $state(false);
  let monkeytypeRequestedFor = $state<string | null>(null);
  let monkeytypeBusy = $state(false);
  let autoReconnectRequested = $state(false);

  $effect(() => {
    const user = data.auth?.user ?? null;
    const userKey = sessionUserKey(user);
    if (userKey === lastSsrUserKey) return;
    lastSsrUserKey = userKey;
    shell.setSessionUser(user);
  });

  afterNavigate(() => {
    shell.closeProfile();
  });

  onMount(() =>
    startScopedApp(
      "app-shell.lifecycle",
      Effect.gen(function* () {
        yield* Effect.addFinalizer(() =>
          Effect.sync(() => liveSync.destroy()).pipe(
            Effect.andThen(workbench.flushPersistenceEffect()),
            Effect.catchCause((cause) =>
              Effect.logError("Could not flush workbench during teardown", cause),
            ),
          ),
        );
        yield* Effect.all(
          [
            refreshSessionEffect(),
            Accent.loadAndApply.pipe(
              Effect.catchCause((cause) => Effect.logError("Could not load accent", cause)),
            ),
            Theme.loadAndApply.pipe(
              Effect.catchCause((cause) => Effect.logError("Could not load theme", cause)),
            ),
          ],
          { concurrency: 3, discard: true },
        );
        yield* Effect.never;
      }),
    ),
  );

  $effect(() => {
    if (!browser) return;
    const userId = shell.account.status === "signed-in" ? (shell.account.id ?? null) : null;
    if (!userId) {
      monkeytypeRequestedFor = null;
      return;
    }
    if (monkeytypeRequestedFor === userId) return;
    monkeytypeRequestedFor = userId;
    return startScopedApp(
      "monkeytype.load-status",
      monkeytypeStatusEffect("monkeytype.status", "Monkeytype unavailable", () =>
        authClient.monkeytype.status(),
      ),
    );
  });

  $effect(() => {
    const dirty = workbench.dirty;
    const board = workbench.profile.name;
    const protocol = protocolLabel(workbench.profile.protocol);
    const variant = {
      id: workbench.activeVariant.id,
      name: workbench.activeVariant.name,
      color: workbench.activeVariant.color,
    };
    untrack(() => {
      shell.setDirty(dirty);
      shell.updateConnectedBoard({ board, protocol });
      shell.setCurrentVariant(variant);
    });
  });

  $effect(() => {
    if (!browser || autoReconnectRequested || !workbench.hydrated) return;
    if (shell.device.status === "connected" || shell.device.status === "connecting") return;
    autoReconnectRequested = true;
    return startScopedApp("keyboard.reconnect-granted", reconnectGrantedKeyboardEffect());
  });

  $effect(() => {
    liveSync.processChanges(shell.liveConnection);
  });

  function hostEffect<A>(operation: string, task: () => PromiseLike<A>) {
    return Effect.tryPromise({
      try: task,
      catch: (cause) => platformError(operation, cause),
    });
  }

  function refreshSessionEffect() {
    if (dev) {
      return Effect.sync(() => shell.setAuthError(workerAuthHint));
    }

    return Effect.gen(function* () {
      const result = yield* hostEffect("auth.get-session", () => authClient.getSession());
      const error = yield* decodeAuthClientErrorEffect(result.error).pipe(
        Effect.mapError((cause) => platformError("auth.decode-session-error", cause)),
      );
      if (error) {
        shell.setAuthError(authMessage(error, "Auth unavailable"));
        return;
      }

      const session = yield* decodeAuthSessionDataEffect(result.data).pipe(
        Effect.mapError((cause) => platformError("auth.decode-session", cause)),
      );
      shell.setSessionUser(session?.user);
    }).pipe(
      Effect.catch((error) =>
        Effect.sync(() => shell.setAuthError(authMessage(error, "Auth unavailable"))),
      ),
    );
  }

  function monkeytypeStatusEffect(
    operation: string,
    fallback: string,
    request: () => PromiseLike<Awaited<ReturnType<typeof authClient.monkeytype.status>>>,
  ) {
    return Effect.gen(function* () {
      const result = yield* hostEffect(operation, request);
      const error = yield* decodeAuthClientErrorEffect(result.error).pipe(
        Effect.mapError((cause) => platformError(`${operation}.decode-error`, cause)),
      );
      if (error) {
        shell.setMonkeytypeError(errorMessage(error, fallback));
        return;
      }
      const status = yield* decodeMonkeytypeConnectionStatusEffect(result.data).pipe(
        Effect.mapError((cause) => platformError(`${operation}.decode-data`, cause)),
      );
      shell.setMonkeytypeStatus(status);
    }).pipe(
      Effect.catch((error) =>
        Effect.sync(() => shell.setMonkeytypeError(errorMessage(error, fallback))),
      ),
    );
  }

  function refreshMonkeytype() {
    if (monkeytypeBusy) return;
    monkeytypeBusy = true;
    forkApp(
      "monkeytype.refresh",
      monkeytypeStatusEffect("monkeytype.refresh", "Monkeytype refresh failed", () =>
        authClient.monkeytype.refresh({ force: true }),
      ).pipe(Effect.ensuring(Effect.sync(() => (monkeytypeBusy = false)))),
    );
  }

  function disconnectMonkeytype() {
    if (monkeytypeBusy) return;
    monkeytypeBusy = true;
    forkApp(
      "monkeytype.disconnect",
      monkeytypeStatusEffect("monkeytype.disconnect", "Monkeytype disconnect failed", () =>
        authClient.monkeytype.disconnect(),
      ).pipe(Effect.ensuring(Effect.sync(() => (monkeytypeBusy = false)))),
    );
  }

  function signInGithub() {
    if (authBusy) return;
    if (dev) {
      shell.setAuthError(workerAuthHint);
      return;
    }

    authBusy = true;

    forkApp(
      "auth.sign-in-github",
      Effect.gen(function* () {
        const result = yield* hostEffect("auth.sign-in-github", () =>
          authClient.signIn.social({
            provider: "github",
            callbackURL: "/",
            disableRedirect: true,
          }),
        );

        const error = yield* decodeAuthClientErrorEffect(result.error).pipe(
          Effect.mapError((cause) => platformError("auth.decode-sign-in-error", cause)),
        );
        if (error) {
          shell.setAuthError(authMessage(error, "GitHub sign-in failed"));
          return;
        }

        const signInData = yield* decodeAuthRedirectDataEffect(result.data).pipe(
          Effect.mapError((cause) => platformError("auth.decode-sign-in", cause)),
        );
        if (!signInData?.url) {
          shell.setAuthError("GitHub sign-in did not return an authorize URL.");
          return;
        }

        globalThis.location.assign(signInData.url);
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(() => shell.setAuthError(authMessage(error, "GitHub sign-in failed"))),
        ),
        Effect.ensuring(Effect.sync(() => (authBusy = false))),
      ),
    );
  }

  function signOut() {
    if (authBusy) return;
    authBusy = true;

    forkApp(
      "auth.sign-out",
      Effect.gen(function* () {
        const result = yield* hostEffect("auth.sign-out", () => authClient.signOut());
        const error = yield* decodeAuthClientErrorEffect(result.error).pipe(
          Effect.mapError((cause) => platformError("auth.decode-sign-out-error", cause)),
        );
        if (error) {
          shell.setAuthError(authMessage(error, "Sign out failed"));
          return;
        }

        shell.setSignedOut();
        yield* refreshSessionEffect();
      }).pipe(
        Effect.catch((error) =>
          Effect.sync(() => shell.setAuthError(authMessage(error, "Sign out failed"))),
        ),
        Effect.ensuring(Effect.sync(() => (authBusy = false))),
      ),
    );
  }

  function reconnectGrantedKeyboardEffect() {
    return Effect.gen(function* () {
      const connection = yield* hostEffect("keyboard.detect-granted", () =>
        detectGrantedKeyboard({ resolveMatrixHint: viaCatalog.matrixHintFor }),
      );
      if (!connection) return;

      const transport = connection.transport === "webusb" ? "WebUSB" : "WebHID";
      if (connection.status !== "connected") {
        if (connection.status === "error") shell.setConnectionError(connection.message, transport);
        return;
      }

      yield* activateViaConnectionAndProfileEffect({
        connection,
        displayTransport: transport,
        resolveBaseProfile: viaCatalog.baseProfileForConnection,
        shell,
        workbench,
      });
    }).pipe(
      Effect.catch((error) =>
        Effect.sync(() => {
          if (!shell.connected) {
            shell.setConnectionError(
              error instanceof Error ? error.message : "Could not reconnect the previous keyboard.",
              "WebHID",
            );
          }
        }),
      ),
    );
  }

  function openMonkeytypeSettings(event: MouseEvent) {
    event.preventDefault();
    shell.closeProfile();
    forkApp(
      "navigation.monkeytype-settings",
      hostEffect("navigation.monkeytype-settings", () => goto("/settings")),
    );
  }

  function sessionUserKey(user: ShellSessionUser | null | undefined) {
    return [user?.id ?? "", user?.name ?? "", user?.email ?? "", user?.image ?? ""].join("|");
  }

  function errorMessage(error: unknown, fallback: string) {
    if (error instanceof Error) return error.message || fallback;
    if (error && typeof error === "object") {
      if ("message" in error && typeof error.message === "string" && error.message) {
        return error.message;
      }
      if ("statusText" in error && typeof error.statusText === "string" && error.statusText) {
        return error.statusText;
      }
      if ("status" in error && typeof error.status === "number") {
        return `Auth request failed (${error.status})`;
      }
      if ("code" in error && typeof error.code === "string" && error.code) return error.code;
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

  const appShellClass =
    "new-app-shell grid h-dvh min-h-0 grid-cols-[62px_minmax(0,1fr)] overflow-hidden bg-paper text-ink max-[560px]:grid-cols-[54px_minmax(0,1fr)]";
  const leftRailClass =
    "left-rail relative z-[2] flex min-h-0 min-w-0 flex-col items-center gap-kb-4 border-r border-line bg-surface px-0 pt-kb-14 pb-kb-12";
  const railBrandClass =
    "rail-brand flex items-center justify-center px-0 pb-kb-12";
  const railNavClass = "rail-nav grid gap-kb-4 px-0 py-0";
  const railNavItemClass =
    "rail-nav-item relative grid size-[42px] place-items-center rounded-[11px] border border-transparent text-ink-3 no-underline transition-[border-color,background,color,box-shadow] duration-[var(--dur-fast)] ease-[var(--ease-out-soft)] hover:bg-surface-2 hover:text-ink max-[560px]:size-[40px]";
  const railNavItemActiveClass =
    "active border-line bg-card text-ink shadow-card before:absolute before:top-1/2 before:left-[-10px] before:h-[18px] before:w-[3px] before:-translate-y-1/2 before:rounded-pill before:bg-coral before:content-[''] hover:border-line hover:bg-card hover:text-ink max-[560px]:before:left-[-7px]";
  const railIconClass = "rail-icon size-[20px]";
  const railLabelClass = "rail-label sr-only";
  const railFooterClass =
    "rail-footer relative mt-auto grid justify-items-center px-0 pb-0";
  const profilePopoverClass =
    "profile-popover w-[320px] max-w-[calc(100vw-112px)] overflow-hidden rounded-lg border-line-2 bg-surface p-0 shadow-popover max-[560px]:w-[calc(100vw-76px)]";
  const profileHeadClass =
    "profile-head grid grid-cols-[40px_minmax(0,1fr)] items-center gap-kb-10 p-kb-12";
  const profileAvatarClass =
    "profile-avatar grid size-kb-40 place-items-center overflow-hidden rounded-lg border border-line-2 bg-surface-2 font-mono text-kb-12 font-bold";
  const profileIdentityClass = "profile-identity min-w-0";
  const profileIdentityStrongClass = "block overflow-hidden text-ellipsis whitespace-nowrap text-[13px]";
  const profileIdentitySpanClass = "mt-[2px] block overflow-hidden text-ellipsis whitespace-nowrap text-[11px] text-ink-3";
  const profileDividerClass = "profile-divider mx-kb-12 h-px bg-line";
  const profileActionsClass = "profile-actions grid gap-kb-6 px-kb-12 py-kb-10";
  const profileLinkClass =
    "profile-link inline-grid min-h-kb-28 grid-cols-[16px_minmax(0,1fr)] items-center gap-kb-8 rounded-md border border-line bg-surface px-kb-8 text-kb-12 font-semibold text-ink no-underline hover:border-line-2 hover:bg-surface-2";
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
  const monkeytypeMessageClass = "m-0 rounded-md px-kb-8 py-kb-7 text-kb-11 leading-[1.35]";
  const monkeytypeErrorClass =
    "monkeytype-error border border-[var(--danger-border)] bg-danger-surface text-danger-ink";
  const monkeytypeNoteClass =
    "monkeytype-note border border-[var(--warning-border)] bg-warning-surface text-warning-ink";
  const accountStripClass =
    "account-strip flex size-[42px] items-center justify-center rounded-[11px] border border-transparent p-0 text-left hover:border-line hover:bg-surface-2 data-[state=open]:border-line data-[state=open]:bg-surface-2 [&_.profile-avatar]:size-[34px] [&_.profile-avatar]:rounded-full";
  const accountCopyClass = "account-copy hidden min-w-0 p-0 text-left";
  const accountNameClass = "block overflow-hidden text-ellipsis whitespace-nowrap text-[12px] font-semibold";
  const accountLoginClass = "mt-[1px] block overflow-hidden text-ellipsis whitespace-nowrap text-[10px] text-ink-3";
  const accountCaretClass =
    "account-caret hidden size-kb-28 place-items-center rounded-md text-ink-3 hover:bg-surface-2 hover:text-ink";
  const shellMainClass = "shell-main flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden";
  const appbarClass =
    "appbar flex h-[56px] min-h-[56px] min-w-0 items-center gap-kb-14 border-b border-line bg-surface px-kb-20 max-[720px]:gap-kb-8 max-[720px]:px-kb-12";
  const appbarTitleClass =
    "m-0 flex-none font-mono text-[15px] font-normal leading-none tracking-[-0.01em] [text-box:trim-both_cap_alphabetic]";
  const appbarContextClass =
    "min-w-0 max-w-[240px] overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[12px] text-ink-2 max-[720px]:max-w-[145px]";
  const appbarMetadataClass =
    "inline-flex min-h-[28px] min-w-0 items-center gap-kb-7 px-kb-2 text-[12px] text-ink-2";
  const appbarStatusDotClass = "size-[7px] shrink-0 rounded-full";
  const appbarVariantClass =
    "max-[720px]:hidden inline-flex min-h-[28px] min-w-0 items-center gap-kb-6 border-l border-line pl-kb-12 font-mono text-[11px] text-ink-3";
  const appbarMetricClass =
    "max-[560px]:hidden inline-flex min-h-[28px] items-center gap-kb-6 font-mono text-[11px] text-ink-2";
  const appbarSpacerClass = "appbar-spacer min-w-[10px] flex-1 max-[900px]:hidden";
  const placementBannerHostClass = "placement-banner-host contents";
  const placementBannerClass =
    "placement-banner flex min-h-[38px] items-center gap-[8px] border-b border-[var(--place-banner-border)] bg-[var(--place-banner-bg)] px-[18px] text-[12px] text-ink";
  const placementBannerButtonClass =
    "ml-auto grid size-kb-26 place-items-center rounded-md hover:bg-[color-mix(in_oklch,var(--coral)_16%,transparent)]";
  const placementBannerSmallClass = "ml-[6px] font-mono text-[10px] text-ink-3";
  const shellContentClass = "shell-content min-h-0 min-w-0 flex-1 overflow-auto bg-paper";
  const overlayHostClass = "overlay-host pointer-events-none fixed inset-0 z-20 hidden";
  const flashOverlayHostClass = "flash-overlay-host pointer-events-none fixed inset-0 z-20 hidden";
</script>

<svelte:head>
  <title>{routeTitle} · Klakson</title>
</svelte:head>

<div
  class={appShellClass}
  {@attach firmwareBuildEvents.attach(accountId)}
  {@attach workbenchCloudSync.attach(accountId, workbench)}
>
  <nav class={leftRailClass} aria-label="Application navigation">
    <div class={railBrandClass}>
      <Brand href="/editor" compact />
    </div>

    <div class={railNavClass}>
      {#each shell.navItems as item (item.id)}
        {@const active = isActive(item.href)}
        {@const NavIcon = navIcons[item.id]}
        <a
          href={item.href}
          class={cn(railNavItemClass, active && railNavItemActiveClass)}
          aria-current={active ? "page" : undefined}
          aria-label={item.label}
          title={item.label}
          data-sveltekit-preload-data="hover"
        >
          <NavIcon class={railIconClass} aria-hidden="true" />
          <span class={railLabelClass}>{item.label}</span>
        </a>
      {/each}
    </div>

    <div class={railFooterClass}>
      <Popover.Root bind:open={shell.profileOpen}>
        <Popover.Trigger type="button" class={accountStripClass} title="Profile" aria-label="Open profile">
          <span class={profileAvatarClass}>
            {#if accountAvatar}
              <img class="size-full object-cover" src={accountAvatar} alt="" />
            {:else}
              {shell.account.initials}
            {/if}
          </span>
          <span class={accountCopyClass}>
            <span class={accountNameClass}>{shell.account.name}</span>
            <small class={accountLoginClass}>@{shell.account.login}</small>
          </span>
          <span class={accountCaretClass} aria-hidden="true">
            <span class="material-symbols-outlined" aria-hidden="true">
              {shell.profileOpen ? "expand_more" : "expand_less"}
            </span>
          </span>
        </Popover.Trigger>

        <Popover.Content class={profilePopoverClass} side="right" align="end" sideOffset={12} aria-label="Profile">
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
                <span class="material-symbols-outlined text-[15px]" aria-hidden="true">open_in_new</span>
                View GitHub profile
              </a>
            </div>

            <div class={profileDividerClass}></div>

            <section class={monkeytypeBlockClass} aria-label="Monkeytype">
              <div class={monkeytypeHeadClass}>
                <span class="material-symbols-outlined text-[15px]" aria-hidden="true">keyboard_alt</span>
                <span>Monkeytype</span>
                {#if shell.monkeytype.connected && monkeytypeProfileUrl}
                  <a class={monkeytypeOpenClass} href={monkeytypeProfileUrl} target="_blank" rel="noreferrer">
                    open
                    <span class="material-symbols-outlined text-[12px]" aria-hidden="true">open_in_new</span>
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
                  <p class={cn(monkeytypeMessageClass, monkeytypeNoteClass)} role="status">Stats are stale. Refresh.</p>
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
                  onclick={openMonkeytypeSettings}
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
        </Popover.Content>
      </Popover.Root>

    </div>
  </nav>

  <div class={shellMainClass}>
    {#if showAppbar}
      <header class={appbarClass}>
        <h1 class={appbarTitleClass}>{routeTitle}</h1>

        {#if editorAppbar}
          <div class={appbarMetadataClass} title={activeBoardTitle}>
            <span
              class={appbarStatusDotClass}
              style:background={shell.connected ? "var(--mint)" : "var(--ink-3)"}
              aria-hidden="true"
            ></span>
            <span class={appbarContextClass}>{activeBoardName}</span>
          </div>
          {#if workbench.activeVariantId !== "main"}
            <div class={appbarVariantClass} title="Active firmware variant">
              <GitBranch size={13} aria-hidden="true" />
              <span class={appbarContextClass}>{workbench.activeVariant.name}</span>
            </div>
          {/if}
        {/if}

        <div class={appbarSpacerClass}></div>

        {#if editorAppbar}
          {#if shell.activeMonkeytype}
            <div class={appbarMetricClass} title="Monkeytype average">
              <Gauge size={14} aria-hidden="true" />
              {statValue(shell.activeMonkeytype.wpm)} wpm
            </div>
          {/if}

          {#if shell.dirty > 0}
            <Button variant="ghost" size="sm" class="max-[720px]:hidden" href="/versions?tab=changes">
              <BookmarkPlus size={15} aria-hidden="true" />
              Save point · {shell.dirty}
            </Button>
          {/if}

          <Button
            variant="coral"
            href="/connect"
            disabled={shell.connecting}
            title={shell.connected ? `${shell.device.board} · ${shell.device.transport}` : shell.device.message}
          >
            <Cable size={16} aria-hidden="true" />
            {shell.primaryActionLabel}
          </Button>
        {/if}
      </header>
    {/if}

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
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            class={placementBannerButtonClass}
            aria-label="Cancel placement"
            onclick={() => shell.clearPlacement()}
          >
            <span class="material-symbols-outlined" aria-hidden="true">close</span>
          </Button>
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
