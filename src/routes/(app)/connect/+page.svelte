<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import { ArrowRight, FolderOpen, Usb } from "@lucide/svelte";
  import { Effect } from "effect";
  import { runApp, type AppServices } from "$lib/app/runtime";
  import { Button, Spinner } from "$lib/components/ui";
  import {
    connectZmkStudioAndActivateEffect,
    connectViaAndActivateEffect,
    continueWithoutDeviceEffect,
    importViaJsonAndActivateEffect,
  } from "$lib/app/connect-flow";
  import { createViaCatalogResolver } from "$lib/app/via-catalog-resolver";
  import { getShellContext } from "$lib/app/shell-store.svelte";
  import { getWorkbenchContext } from "$lib/app/workbench-store.svelte";
  import { cn } from "$lib/utils.js";
  import { platformError } from "$lib/effect/errors";
  import { createWebHidViaTransport } from "$lib/keyboard/transport";
  import { createWebBluetoothZmkStudioTransport } from "$lib/keyboard/transport-zmk-ble";
  import { createWebSerialZmkStudioTransport } from "$lib/keyboard/transport-zmk-serial";

  import {
    getViaKeyboardDetail,
    getViaKeyboardIndex,
    resolveKeyboardIdentity,
    resolveZmkTarget,
  } from "../../keyboards.remote";

  type BusyAction =
    | "real"
    | "zmk-ble"
    | "zmk-usb"
    | "import"
    | "local"
    | "disconnect";

  const shell = getShellContext();
  const workbench = getWorkbenchContext();
  const viaCatalog = createViaCatalogResolver({
    getViaKeyboardDetail,
    getViaKeyboardIndex,
    resolveKeyboardIdentity,
    workbench,
  });

  let fileInput = $state<HTMLInputElement | undefined>();
  let busyAction = $state<BusyAction | null>(null);
  let message = $state<string | null>(null);

  const busy = $derived(busyAction !== null || shell.device.status === "connecting");
  const webBluetoothSupported = $derived(!browser || Boolean(navigator.bluetooth));
  const webSerialSupported = $derived(!browser || Boolean(navigator.serial));

  const pageClass =
    "connect-view flex min-h-full items-center justify-center p-kb-40 max-[640px]:p-kb-16";
  const colClass = "connect-onboarding w-[560px] max-w-full";
  const h1Class = "m-0 mb-kb-10 text-[24px] leading-[1.05] text-ink";
  const proseClass = "m-0 mb-kb-24 max-w-[460px] text-[15px] leading-[1.55] text-ink-2";
  const cardClass =
    "connect-card overflow-hidden rounded-lg border border-line-2 bg-surface shadow-card";
  const cardHeadClass =
    "flex items-center gap-kb-10 border-b border-line px-kb-16 py-kb-13";
  const cardHeadTitleClass = "m-0 text-kb-14 font-semibold leading-tight text-ink";
  const rowsClass = "grid gap-kb-6 p-kb-8";
  const rowClass =
    "connect-option grid min-w-0 grid-cols-[46px_minmax(0,1fr)_auto] items-center gap-kb-14 rounded-[10px] p-kb-12 text-left transition-[background,opacity] duration-[var(--dur-fast)] ease-[var(--ease-out-soft)] max-[480px]:grid-cols-[46px_minmax(0,1fr)] max-[480px]:[&_[data-slot=button]]:col-start-2 max-[480px]:[&_[data-slot=button]]:justify-self-start";
  const rowActiveClass = "bg-surface-2 hover:bg-[color-mix(in_oklch,var(--surface-2)_70%,var(--surface))]";
  const rowDangerClass = "!border !border-[var(--danger-border)] bg-danger-surface";
  const rowDisabledClass = "bg-transparent opacity-55";
  const tagClass =
    "grid h-[44px] w-[46px] place-items-center rounded-[9px] border border-line-2 bg-surface font-mono text-[11px] tracking-[0.04em] text-ink-2";
  const rowTitleClass =
    "overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[14px] text-ink max-[480px]:whitespace-normal";
  const rowMetaClass =
    "mt-kb-3 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[11px] text-ink-3 max-[480px]:whitespace-normal";
  const footerClass =
    "mt-kb-16 flex items-center justify-between gap-kb-8 px-kb-4 max-[560px]:flex-col max-[560px]:items-stretch";
  const statusMessageClass =
    "mt-kb-10 px-kb-4 text-[12px] leading-[1.4] text-ink-3";
  function currentFilters() {
    return viaCatalog.currentFilters();
  }

  function hostEffect<A>(operation: string, task: () => PromiseLike<A>) {
    return Effect.tryPromise({
      try: task,
      catch: (cause) => platformError(operation, cause),
    });
  }

  function runAction(action: BusyAction, task: Effect.Effect<string, unknown, AppServices>) {
    if (busyAction) return;

    busyAction = action;
    message = null;
    void runApp(
      `connect.${action}`,
      task.pipe(
        Effect.tap((result) => Effect.sync(() => (message = result))),
        Effect.andThen(
          hostEffect("connect.navigate-editor", () => goto("/editor")),
        ),
        Effect.catch((error) =>
          Effect.sync(() => {
            message = error instanceof Error ? error.message : "Connect action failed.";
            if (!shell.connected) {
              shell.setConnectionError(message, shell.device.transport);
            }
          }),
        ),
        Effect.ensuring(Effect.sync(() => (busyAction = null))),
      ),
    );
  }

  function connectDevice() {
    runAction(
      "real",
      connectViaAndActivateEffect({
        connectOptions: { resolveMatrixHint: viaCatalog.matrixHintFor },
        resolveBaseProfile: viaCatalog.baseProfileForConnection,
        shell,
        transport: createWebHidViaTransport(currentFilters()),
        workbench,
      }).pipe(Effect.map((result) => result.message)),
    );
  }

  function connectZmkBluetooth() {
    if (!webBluetoothSupported) {
      message = "Web Bluetooth is unavailable in this browser.";
      return;
    }

    runAction(
      "zmk-ble",
      connectZmkStudioAndActivateEffect({
        resolveFirmwareMetadata: (profile) =>
          resolveZmkTarget({ deviceName: profile.name, manufacturer: profile.vendor }),
        shell,
        transport: createWebBluetoothZmkStudioTransport(),
        workbench,
      }).pipe(Effect.map((result) => result.message)),
    );
  }

  function connectZmkSerial() {
    if (!webSerialSupported) {
      message = "Web Serial is unavailable in this browser.";
      return;
    }

    runAction(
      "zmk-usb",
      connectZmkStudioAndActivateEffect({
        resolveFirmwareMetadata: (profile) =>
          resolveZmkTarget({ deviceName: profile.name, manufacturer: profile.vendor }),
        shell,
        transport: createWebSerialZmkStudioTransport(),
        workbench,
      }).pipe(Effect.map((result) => result.message)),
    );
  }

  function chooseViaJson() {
    fileInput?.click();
  }

  function loadViaJson(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    runAction(
      "import",
      Effect.gen(function* () {
        const text = yield* hostEffect("connect.read-via-json", () => file.text());
        const json = yield* Effect.try({
          try: () => JSON.parse(text) as unknown,
          catch: (cause) => platformError("connect.parse-via-json", cause),
        });
        const result = yield* importViaJsonAndActivateEffect({
          fileName: file.name,
          json,
          shell,
          workbench,
        });
        return result.message;
      }).pipe(Effect.ensuring(Effect.sync(() => (input.value = "")))),
    );
  }

  function continueLocalOnly(event: MouseEvent) {
    event.preventDefault();
    runAction(
      "local",
      continueWithoutDeviceEffect({ shell, workbench }).pipe(
        Effect.map((result) => result.message),
      ),
    );
  }

  function disconnectDevice() {
    if (busyAction) return;

    busyAction = "disconnect";
    message = null;
    void runApp(
      "connect.disconnect",
      hostEffect("connect.disconnect-device", () => shell.disconnectDevice()).pipe(
        Effect.tap(() =>
          Effect.sync(() => (message = "Disconnected device. Edits remain local.")),
        ),
        Effect.catch((error) =>
          Effect.sync(() => {
            message = error instanceof Error ? error.message : "Could not disconnect device.";
          }),
        ),
        Effect.ensuring(Effect.sync(() => (busyAction = null))),
      ),
    );
  }
</script>

{#snippet deviceRow(opts: {
  tag: string;
  title: string;
  meta: string;
  action: string;
  testid: string;
  onclick: () => void;
  variant?: "primary" | "outline";
  danger?: boolean;
  unavailable?: boolean;
  busy?: boolean;
})}
  <div
    class={cn(rowClass, opts.danger ? rowDangerClass : opts.unavailable ? rowDisabledClass : rowActiveClass)}
    data-tag={opts.tag}
  >
    <span class={tagClass}>{opts.tag}</span>
    <span class="grid min-w-0">
      <strong class={rowTitleClass}>{opts.title}</strong>
      <small class={rowMetaClass}>{opts.meta}</small>
    </span>
    <Button
      variant={opts.danger ? "outline" : opts.variant === "primary" ? "coral" : "outline"}
      size="sm"
      data-testid={opts.testid}
      disabled={busy || opts.unavailable}
      onclick={opts.onclick}
      class={opts.danger ? "!border-[var(--danger-border)] !text-danger-ink" : ""}
    >
      {#if opts.busy}<Spinner class="size-3.5" />{/if}
      {opts.action}
    </Button>
  </div>
{/snippet}

<section class={pageClass}>
  <div class={colClass}>
    <h1 class={h1Class}>Connect a keyboard</h1>
    <p class={proseClass}>
      Connect over USB or Bluetooth. Import a VIA JSON, or start without a device.
    </p>

    <div class={cardClass}>
      <div class={cardHeadClass}>
        <Usb size={17} aria-hidden="true" />
        <h3 class={cardHeadTitleClass}>Available connections</h3>
      </div>

      <div class={rowsClass}>
        {#if shell.connected}
          {@render deviceRow({
            tag: "USB",
            title: busyAction === "disconnect" ? "Disconnecting device" : shell.device.board ?? "Connected device",
            meta: "Keeps the local draft.",
            action: busyAction === "disconnect" ? "Disconnecting" : "Disconnect",
            testid: "disconnect-device",
            onclick: disconnectDevice,
            danger: true,
            busy: busyAction === "disconnect",
          })}
        {/if}

        {@render deviceRow({
          tag: "HID",
          title: busyAction === "real" ? "Opening browser prompt" : "VIA over USB",
          meta: "Imports the matched keymap.",
          action: busyAction === "real" ? "Connecting" : "Connect",
          testid: "connect-device",
          onclick: connectDevice,
          variant: "primary",
          busy: busyAction === "real",
        })}

        {@render deviceRow({
          tag: "BLE",
          title: busyAction === "zmk-ble" ? "Opening Bluetooth prompt" : "Bluetooth (ZMK)",
          meta: webBluetoothSupported ? "ZMK Studio. Experimental." : "Web Bluetooth unavailable",
          action: busyAction === "zmk-ble" ? "Pairing" : "Pair",
          testid: "connect-zmk-ble",
          onclick: connectZmkBluetooth,
          unavailable: !webBluetoothSupported,
          busy: busyAction === "zmk-ble",
        })}

        {@render deviceRow({
          tag: "USB",
          title: busyAction === "zmk-usb" ? "Opening serial prompt" : "USB (ZMK)",
          meta: webSerialSupported ? "ZMK Studio. Experimental." : "Web Serial unavailable",
          action: busyAction === "zmk-usb" ? "Connecting" : "Connect",
          testid: "connect-zmk-usb",
          onclick: connectZmkSerial,
          unavailable: !webSerialSupported,
          busy: busyAction === "zmk-usb",
        })}
      </div>
    </div>

    <div class={footerClass}>
      <Button variant="ghost" size="sm" data-testid="load-via-json" disabled={busy} onclick={chooseViaJson}>
        <FolderOpen size={16} aria-hidden="true" />
        {busyAction === "import" ? "Importing JSON" : "Load profile (.json)"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        href="/editor"
        data-testid="continue-without-device"
        disabled={busy}
        onclick={continueLocalOnly}
      >
        {busyAction === "local" ? "Preparing profile" : "Continue without a device"}
        <ArrowRight size={16} aria-hidden="true" />
      </Button>
      <input
        bind:this={fileInput}
        class="hidden"
        type="file"
        accept="application/json,.json"
        onchange={loadViaJson}
      />
    </div>

    {#if message ?? shell.device.message}
      <p class={statusMessageClass} role="status">{message ?? shell.device.message}</p>
    {/if}
  </div>
</section>
