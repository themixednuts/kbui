<script lang="ts">
  import { browser } from "$app/environment";
  import { goto } from "$app/navigation";
  import {
    connectZmkStudioAndActivate,
    connectViaAndActivate,
    continueWithoutDevice,
    importViaJsonAndActivate,
    profileFromCatalogForConnection,
  } from "$lib/app/connect-flow";
  import { getShellContext } from "$lib/app/shell-store.svelte";
  import { getWorkbenchContext } from "$lib/app/workbench-store.svelte";
  import Chip from "$lib/components/ui/Chip.svelte";
  import { cn } from "$lib/utils.js";
  import {
    bestCatalogEntryForIdentity,
    type KeyboardCatalogEntry,
    type KeyboardCatalogIndexEntry,
  } from "$lib/keyboard/catalog";
  import {
    createWebHidViaTransport,
    type ConnectionState,
  } from "$lib/keyboard/transport";
  import { createWebBluetoothZmkStudioTransport } from "$lib/keyboard/transport-zmk-ble";
  import { createWebSerialZmkStudioTransport } from "$lib/keyboard/transport-zmk-serial";

  import { getViaKeyboardDetail, getViaKeyboardIndex } from "../../keyboards.remote";

  type CatalogPayload<T> = {
    count: number;
    error?: string;
    items: T;
    repo: string;
    source: "github-api";
  };
  type BusyAction =
    | "real"
    | "mock"
    | "zmk-mock"
    | "zmk-ble"
    | "zmk-usb"
    | "import"
    | "local"
    | "disconnect";
  type CatalogIdentity = {
    productId?: number;
    productName?: string;
    serialNumber?: string;
    vendorId?: number;
  };

  const shell = getShellContext();
  const workbench = getWorkbenchContext();

  let fileInput = $state<HTMLInputElement | undefined>();
  let busyAction = $state<BusyAction | null>(null);
  let message = $state<string | null>(null);
  let catalogIndexPromise: Promise<CatalogPayload<KeyboardCatalogIndexEntry[]>> | undefined;

  const busy = $derived(busyAction !== null || shell.device.status === "connecting");
  const statusLabel = $derived(
    shell.device.status === "connected"
      ? "Connected"
      : shell.device.status === "connecting"
        ? "Connecting"
        : shell.device.status === "error"
          ? "Error"
          : "Disconnected",
  );
  const activeProfileSummary = $derived(
    `${workbench.profile.keys.length} keys, ${workbench.profile.layers.length} layers`,
  );
  const webBluetoothSupported = $derived(browser && Boolean(navigator.bluetooth));
  const webSerialSupported = $derived(browser && Boolean(navigator.serial));

  const connectPanelClass =
    "connect-panel grid gap-kb-12 rounded-[14px] border border-line-2 bg-[color-mix(in_oklch,var(--surface)_90%,var(--paper))] p-kb-14 shadow-float max-[760px]:p-kb-10";
  const connectPanelHeadClass =
    "connect-panel-head flex min-w-0 items-center justify-between gap-kb-12 px-kb-2 pt-kb-2 pb-kb-8 max-[760px]:flex-col max-[760px]:items-start";
  const connectPanelTitleClass = "m-0 mt-kb-3 text-[18px] leading-[1.1]";
  const connectOptionListClass = "connect-option-list grid gap-kb-8";
  const connectOptionClass =
    "connect-option grid min-h-kb-72 min-w-0 grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-kb-12 rounded-[10px] !border p-kb-12 text-left transition-[border-color,background,transform] duration-[var(--dur-fast)] ease-[var(--ease-out-soft)] [&:hover:not(:disabled)]:-translate-y-px [&:hover:not(:disabled)]:!border-line-2 [&:hover:not(:disabled)]:!bg-[color-mix(in_oklch,var(--coral)_9%,var(--paper-2))] max-[760px]:min-h-0 max-[760px]:grid-cols-[38px_minmax(0,1fr)]";
  const connectOptionDefaultClass = "!border-line !bg-paper-2";
  const connectOptionPrimaryClass =
    "primary !border-[color-mix(in_oklch,var(--coral)_44%,var(--line-2))] !bg-[color-mix(in_oklch,var(--coral)_13%,var(--paper-2))]";
  const connectOptionDisconnectClass =
    "disconnect !border-[oklch(0.62_0.2_25/0.3)] !bg-[oklch(0.96_0.035_25)]";
  const optionIconClass =
    "option-icon material-symbols-outlined grid size-[42px] place-items-center rounded-[9px] border border-line-2 bg-paper text-ink !text-[21px] max-[760px]:size-kb-38";
  const optionCopyClass = "option-copy grid min-w-0 gap-kb-3";
  const optionTitleClass =
    "overflow-hidden text-ellipsis whitespace-nowrap font-mono text-[13px] font-strong";
  const optionDescriptionClass =
    "overflow-hidden text-ellipsis text-[12px] leading-[1.35] text-ink-3";
  const optionActionClass =
    "option-action inline-grid min-h-[30px] min-w-[58px] place-items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-pill border border-line-2 bg-surface px-kb-10 py-0 font-mono text-[10px] uppercase max-[760px]:col-start-2 max-[760px]:justify-self-start";
  const optionActionPrimaryClass = "border-coral bg-coral text-[#1c0a04]";
  const optionActionDisconnectClass =
    "border-[oklch(0.62_0.2_25/0.34)] text-[oklch(0.4_0.16_25)]";
  const connectStatusClass =
    "connect-status grid w-[min(420px,100%)] min-w-0 grid-cols-[10px_minmax(0,1fr)] items-center gap-kb-10 rounded-[10px] border border-line bg-[color-mix(in_oklch,var(--surface)_74%,transparent)] px-kb-12 py-kb-10";
  const statusDotClass = "status-dot size-kb-8 overflow-hidden rounded-pill bg-ink-3";
  const statusDotConnectedClass =
    "bg-mint shadow-[0_0_0_3px_color-mix(in_oklch,var(--mint)_24%,transparent)]";
  const statusDotConnectingClass =
    "bg-mustard shadow-[0_0_0_3px_color-mix(in_oklch,var(--mustard)_24%,transparent)]";
  const statusDotErrorClass =
    "bg-removed shadow-[0_0_0_3px_color-mix(in_oklch,var(--removed)_18%,transparent)]";
  const statusTitleClass =
    "block overflow-hidden text-ellipsis font-mono text-[11px]";
  const statusMessageClass =
    "mt-kb-2 block overflow-hidden text-ellipsis text-[12px] leading-[1.35] text-ink-3";
  const connectFootClass =
    "connect-foot grid min-w-0 grid-cols-[18px_minmax(0,1fr)] items-center gap-kb-8 rounded-[10px] border border-line bg-[color-mix(in_oklch,var(--surface)_74%,transparent)] px-kb-10 py-kb-9 font-mono text-[10px] text-ink-3";
  const connectFootIconClass = "material-symbols-outlined !text-[16px]";
  const connectFootCopyClass = "overflow-hidden text-ellipsis";

  function currentFilters() {
    return [
      { vendorId: workbench.profile.vendorId, productId: workbench.profile.productId },
      { vendorId: workbench.profile.vendorId },
    ];
  }

  async function loadCatalogIndex() {
    catalogIndexPromise ??= Promise.resolve(getViaKeyboardIndex()).catch((error) => {
      catalogIndexPromise = undefined;
      throw error;
    });
    return catalogIndexPromise;
  }

  async function catalogSummaryFor(identity: CatalogIdentity) {
    const payload = await loadCatalogIndex();
    return bestCatalogEntryForIdentity(payload.items, identity);
  }

  async function matrixHintFor(identity: CatalogIdentity) {
    try {
      return (await catalogSummaryFor(identity))?.matrix;
    } catch {
      if (
        workbench.profile.origin !== "starter" &&
        identity.vendorId === workbench.profile.vendorId &&
        identity.productId === workbench.profile.productId
      ) {
        return workbench.profile.matrix;
      }
      return undefined;
    }
  }

  async function catalogEntryFor(identity: CatalogIdentity): Promise<KeyboardCatalogEntry | undefined> {
    const summary = await catalogSummaryFor(identity);
    return summary ? getViaKeyboardDetail(summary.id) : undefined;
  }

  async function baseProfileForConnection(connection: ConnectionState) {
    const identity = connection.detection?.identity;
    if (!identity) return undefined;

    try {
      const entry = await catalogEntryFor(identity);
      if (entry) return profileFromCatalogForConnection(entry, connection);
    } catch {
      // Fall through to a user-loaded profile when the remote catalog is unavailable.
    }

    if (
      workbench.profile.origin !== "starter" &&
      identity.vendorId === workbench.profile.vendorId &&
      identity.productId === workbench.profile.productId
    ) {
      return workbench.profile;
    }

    return undefined;
  }

  async function runAction(action: BusyAction, task: () => Promise<string>) {
    if (busyAction) return;

    busyAction = action;
    message = null;
    try {
      message = await task();
      await goto("/editor");
    } catch (error) {
      message = error instanceof Error ? error.message : "Connect action failed.";
    } finally {
      busyAction = null;
    }
  }

  function connectDevice() {
    void runAction("real", async () => {
      const result = await connectViaAndActivate({
        connectOptions: { resolveMatrixHint: matrixHintFor },
        resolveBaseProfile: baseProfileForConnection,
        shell,
        transport: createWebHidViaTransport(currentFilters()),
        workbench,
      });
      return result.message;
    });
  }

  function useDemoDevice() {
    if (!import.meta.env.DEV) return;

    void runAction("mock", async () => {
      const { createMockViaTransport, mockViaBoards } = await import(
        "$lib/keyboard/transport-mock"
      );
      const mockBoard = mockViaBoards.workbench65;
      const result = await connectViaAndActivate({
        shell,
        transport: createMockViaTransport(mockBoard),
        workbench,
      });
      return result.message;
    });
  }

  function useDemoZmkDevice() {
    if (!import.meta.env.DEV) return;

    void runAction("zmk-mock", async () => {
      const { createMockZmkStudioTransport } = await import(
        "$lib/keyboard/transport-mock-zmk"
      );
      const result = await connectZmkStudioAndActivate({
        shell,
        transport: createMockZmkStudioTransport(),
        workbench,
      });
      return result.message;
    });
  }

  function connectZmkBluetooth() {
    if (!webBluetoothSupported) {
      message = "Web Bluetooth is unavailable in this browser.";
      return;
    }

    void runAction("zmk-ble", async () => {
      const result = await connectZmkStudioAndActivate({
        shell,
        transport: createWebBluetoothZmkStudioTransport(),
        workbench,
      });
      return `${result.message}. Real BLE is hardware-unverified until tested with a ZMK Studio board.`;
    });
  }

  function connectZmkSerial() {
    if (!webSerialSupported) {
      message = "Web Serial is unavailable in this browser.";
      return;
    }

    void runAction("zmk-usb", async () => {
      const result = await connectZmkStudioAndActivate({
        shell,
        transport: createWebSerialZmkStudioTransport(),
        workbench,
      });
      return `${result.message}. Real USB serial is hardware-unverified until tested with a ZMK Studio board.`;
    });
  }

  function chooseViaJson() {
    fileInput?.click();
  }

  async function loadViaJson(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    await runAction("import", async () => {
      const json = JSON.parse(await file.text()) as unknown;
      const result = await importViaJsonAndActivate({
        fileName: file.name,
        json,
        shell,
        workbench,
      });
      return result.message;
    });
    input.value = "";
  }

  function continueLocalOnly() {
    void runAction("local", async () => {
      const result = await continueWithoutDevice({ shell, workbench });
      return result.message;
    });
  }

  async function disconnectDevice() {
    if (busyAction) return;

    busyAction = "disconnect";
    message = null;
    try {
      await shell.disconnectDevice();
      message = "Disconnected device. Edits remain local.";
    } catch (error) {
      message = error instanceof Error ? error.message : "Could not disconnect device.";
    } finally {
      busyAction = null;
    }
  }
</script>

<section class="connect-view">
  <div class="connect-onboarding">
    <div class="connect-copy">
      <span class="eyebrow">Step 1</span>
      <h1><span class="accent-word">Connect</span> a keyboard</h1>
      <p>
        Pair a VIA board, connect ZMK Studio, or load a VIA definition to start editing.
      </p>

      <div class={connectStatusClass} data-state={shell.device.status}>
        <span
          class={cn(
            statusDotClass,
            shell.device.status === "connected" && statusDotConnectedClass,
            shell.device.status === "connecting" && statusDotConnectingClass,
            shell.device.status === "error" && statusDotErrorClass,
          )}
          aria-hidden="true"
        ></span>
        <div>
          <strong class={statusTitleClass}>{statusLabel}</strong>
          <span class={statusMessageClass}>{message ?? shell.device.message}</span>
        </div>
      </div>
    </div>

    <div class={cn("connect-card", connectPanelClass)}>
      <div class={connectPanelHeadClass}>
        <div>
          <span class="eyebrow">Available</span>
          <h2 class={connectPanelTitleClass}>Connection options</h2>
        </div>
        <Chip>{activeProfileSummary}</Chip>
      </div>

      <div class={connectOptionListClass}>
        {#if shell.connected}
          <button
            type="button"
            class={cn(connectOptionClass, connectOptionDisconnectClass)}
            data-testid="disconnect-device"
            disabled={busy}
            onclick={disconnectDevice}
          >
            <span class={optionIconClass} aria-hidden="true">link_off</span>
            <span class={optionCopyClass}>
              <strong class={optionTitleClass}>{busyAction === "disconnect" ? "Disconnecting device" : "Disconnect device"}</strong>
              <small class={optionDescriptionClass}>Keep the current draft and stop live VIA writes</small>
            </span>
            <span class={cn(optionActionClass, optionActionDisconnectClass)}>{busyAction === "disconnect" ? "..." : "Disconnect"}</span>
          </button>
        {/if}

        <button
          type="button"
          class={cn(connectOptionClass, connectOptionPrimaryClass)}
          data-testid="connect-device"
          disabled={busy}
          onclick={connectDevice}
        >
          <span class={optionIconClass} aria-hidden="true">cable</span>
          <span class={optionCopyClass}>
            <strong class={optionTitleClass}>{busyAction === "real" ? "Opening browser prompt" : "Connect device"}</strong>
            <small class={optionDescriptionClass}>WebHID VIA keyboard, current keymap import when a definition is found</small>
          </span>
          <span class={cn(optionActionClass, optionActionPrimaryClass)}>{busyAction === "real" ? "..." : "Connect"}</span>
        </button>

        <button
          type="button"
          class={cn(connectOptionClass, connectOptionDefaultClass)}
          data-testid="connect-zmk-ble"
          disabled={busy}
          onclick={connectZmkBluetooth}
        >
          <span class={optionIconClass} aria-hidden="true">bluetooth</span>
          <span class={optionCopyClass}>
            <strong class={optionTitleClass}>{busyAction === "zmk-ble" ? "Opening Bluetooth prompt" : "Connect over Bluetooth (ZMK)"}</strong>
            <small class={optionDescriptionClass}>
              {webBluetoothSupported
                ? "Real ZMK Studio BLE transport; hardware-unverified until board-tested"
                : "Web Bluetooth unavailable in this browser"}
            </small>
          </span>
          <span class={optionActionClass}>{busyAction === "zmk-ble" ? "..." : webBluetoothSupported ? "Connect" : "Unavailable"}</span>
        </button>

        <button
          type="button"
          class={cn(connectOptionClass, connectOptionDefaultClass)}
          data-testid="connect-zmk-usb"
          disabled={busy}
          onclick={connectZmkSerial}
        >
          <span class={optionIconClass} aria-hidden="true">usb</span>
          <span class={optionCopyClass}>
            <strong class={optionTitleClass}>{busyAction === "zmk-usb" ? "Opening serial prompt" : "Connect over USB (ZMK)"}</strong>
            <small class={optionDescriptionClass}>
              {webSerialSupported
                ? "Real ZMK Studio USB serial transport; hardware-unverified until board-tested"
                : "Web Serial unavailable in this browser"}
            </small>
          </span>
          <span class={optionActionClass}>{busyAction === "zmk-usb" ? "..." : webSerialSupported ? "Connect" : "Unavailable"}</span>
        </button>

        {#if import.meta.env.DEV}
          <button
            type="button"
            class={cn(connectOptionClass, connectOptionDefaultClass)}
            data-testid="use-demo-device"
            disabled={busy}
            onclick={useDemoDevice}
          >
            <span class={optionIconClass} aria-hidden="true">developer_board</span>
            <span class={optionCopyClass}>
              <strong class={optionTitleClass}>{busyAction === "mock" ? "Starting demo device" : "Use demo device"}</strong>
              <small class={optionDescriptionClass}>Mock VIA Workbench 65 with protocol, layers, keymap reads, and writes</small>
            </span>
            <span class={optionActionClass}>{busyAction === "mock" ? "..." : "Demo"}</span>
          </button>

          <button
            type="button"
            class={cn(connectOptionClass, connectOptionDefaultClass)}
            data-testid="use-demo-zmk-device"
            disabled={busy}
            onclick={useDemoZmkDevice}
          >
            <span class={optionIconClass} aria-hidden="true">settings_input_antenna</span>
            <span class={optionCopyClass}>
              <strong class={optionTitleClass}>{busyAction === "zmk-mock" ? "Starting ZMK demo" : "Use demo ZMK device"}</strong>
              <small class={optionDescriptionClass}>Mock ZMK Studio Workbench 65 with RPC keymap reads, writes, and saves</small>
            </span>
            <span class={optionActionClass}>{busyAction === "zmk-mock" ? "..." : "Demo"}</span>
          </button>
        {/if}

        <button
          type="button"
          class={cn(connectOptionClass, connectOptionDefaultClass)}
          data-testid="load-via-json"
          disabled={busy}
          onclick={chooseViaJson}
        >
          <span class={optionIconClass} aria-hidden="true">folder_open</span>
          <span class={optionCopyClass}>
            <strong class={optionTitleClass}>{busyAction === "import" ? "Importing JSON" : "Load VIA JSON"}</strong>
            <small class={optionDescriptionClass}>Import a VIA v3 definition into a local DeviceProfile</small>
          </span>
          <span class={optionActionClass}>Import</span>
        </button>
        <input
          bind:this={fileInput}
          class="hidden-file-input"
          type="file"
          accept="application/json,.json"
          onchange={loadViaJson}
        />

        <button
          type="button"
          class={cn(connectOptionClass, connectOptionDefaultClass)}
          data-testid="continue-without-device"
          disabled={busy}
          onclick={continueLocalOnly}
        >
          <span class={optionIconClass} aria-hidden="true">edit_note</span>
          <span class={optionCopyClass}>
            <strong class={optionTitleClass}>{busyAction === "local" ? "Preparing profile" : "Continue without a device"}</strong>
            <small class={optionDescriptionClass}>Local-only editing from the Workbench 65 starter profile</small>
          </span>
          <span class={optionActionClass}>Local</span>
        </button>

      </div>

      {#if import.meta.env.DEV}
        <div class={connectFootClass}>
          <span class={connectFootIconClass} aria-hidden="true">memory</span>
          <span class={connectFootCopyClass}>Mock targets: Workbench 65 VIA / Workbench ZMK 65 ZMK Studio</span>
        </div>
      {/if}
    </div>
  </div>
</section>
