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

      <div class="connect-status" data-state={shell.device.status}>
        <span class="status-dot" aria-hidden="true"></span>
        <div>
          <strong>{statusLabel}</strong>
          <span>{message ?? shell.device.message}</span>
        </div>
      </div>
    </div>

    <div class="connect-card connect-panel">
      <div class="connect-panel-head">
        <div>
          <span class="eyebrow">Available</span>
          <h2>Connection options</h2>
        </div>
        <Chip>{activeProfileSummary}</Chip>
      </div>

      <div class="connect-option-list">
        {#if shell.connected}
          <button
            type="button"
            class="connect-option disconnect"
            data-testid="disconnect-device"
            disabled={busy}
            onclick={disconnectDevice}
          >
            <span class="option-icon material-symbols-outlined" aria-hidden="true">link_off</span>
            <span class="option-copy">
              <strong>{busyAction === "disconnect" ? "Disconnecting device" : "Disconnect device"}</strong>
              <small>Keep the current draft and stop live VIA writes</small>
            </span>
            <span class="option-action">{busyAction === "disconnect" ? "..." : "Disconnect"}</span>
          </button>
        {/if}

        <button
          type="button"
          class="connect-option primary"
          data-testid="connect-device"
          disabled={busy}
          onclick={connectDevice}
        >
          <span class="option-icon material-symbols-outlined" aria-hidden="true">cable</span>
          <span class="option-copy">
            <strong>{busyAction === "real" ? "Opening browser prompt" : "Connect device"}</strong>
            <small>WebHID VIA keyboard, current keymap import when a definition is found</small>
          </span>
          <span class="option-action">{busyAction === "real" ? "..." : "Connect"}</span>
        </button>

        <button
          type="button"
          class="connect-option"
          data-testid="connect-zmk-ble"
          disabled={busy}
          onclick={connectZmkBluetooth}
        >
          <span class="option-icon material-symbols-outlined" aria-hidden="true">bluetooth</span>
          <span class="option-copy">
            <strong>{busyAction === "zmk-ble" ? "Opening Bluetooth prompt" : "Connect over Bluetooth (ZMK)"}</strong>
            <small>
              {webBluetoothSupported
                ? "Real ZMK Studio BLE transport; hardware-unverified until board-tested"
                : "Web Bluetooth unavailable in this browser"}
            </small>
          </span>
          <span class="option-action">{busyAction === "zmk-ble" ? "..." : webBluetoothSupported ? "Connect" : "Unavailable"}</span>
        </button>

        <button
          type="button"
          class="connect-option"
          data-testid="connect-zmk-usb"
          disabled={busy}
          onclick={connectZmkSerial}
        >
          <span class="option-icon material-symbols-outlined" aria-hidden="true">usb</span>
          <span class="option-copy">
            <strong>{busyAction === "zmk-usb" ? "Opening serial prompt" : "Connect over USB (ZMK)"}</strong>
            <small>
              {webSerialSupported
                ? "Real ZMK Studio USB serial transport; hardware-unverified until board-tested"
                : "Web Serial unavailable in this browser"}
            </small>
          </span>
          <span class="option-action">{busyAction === "zmk-usb" ? "..." : webSerialSupported ? "Connect" : "Unavailable"}</span>
        </button>

        {#if import.meta.env.DEV}
          <button
            type="button"
            class="connect-option"
            data-testid="use-demo-device"
            disabled={busy}
            onclick={useDemoDevice}
          >
            <span class="option-icon material-symbols-outlined" aria-hidden="true">developer_board</span>
            <span class="option-copy">
              <strong>{busyAction === "mock" ? "Starting demo device" : "Use demo device"}</strong>
              <small>Mock VIA Workbench 65 with protocol, layers, keymap reads, and writes</small>
            </span>
            <span class="option-action">{busyAction === "mock" ? "..." : "Demo"}</span>
          </button>

          <button
            type="button"
            class="connect-option"
            data-testid="use-demo-zmk-device"
            disabled={busy}
            onclick={useDemoZmkDevice}
          >
            <span class="option-icon material-symbols-outlined" aria-hidden="true">settings_input_antenna</span>
            <span class="option-copy">
              <strong>{busyAction === "zmk-mock" ? "Starting ZMK demo" : "Use demo ZMK device"}</strong>
              <small>Mock ZMK Studio Workbench 65 with RPC keymap reads, writes, and saves</small>
            </span>
            <span class="option-action">{busyAction === "zmk-mock" ? "..." : "Demo"}</span>
          </button>
        {/if}

        <button
          type="button"
          class="connect-option"
          data-testid="load-via-json"
          disabled={busy}
          onclick={chooseViaJson}
        >
          <span class="option-icon material-symbols-outlined" aria-hidden="true">folder_open</span>
          <span class="option-copy">
            <strong>{busyAction === "import" ? "Importing JSON" : "Load VIA JSON"}</strong>
            <small>Import a VIA v3 definition into a local DeviceProfile</small>
          </span>
          <span class="option-action">Import</span>
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
          class="connect-option"
          data-testid="continue-without-device"
          disabled={busy}
          onclick={continueLocalOnly}
        >
          <span class="option-icon material-symbols-outlined" aria-hidden="true">edit_note</span>
          <span class="option-copy">
            <strong>{busyAction === "local" ? "Preparing profile" : "Continue without a device"}</strong>
            <small>Local-only editing from the Workbench 65 starter profile</small>
          </span>
          <span class="option-action">Local</span>
        </button>

      </div>

      {#if import.meta.env.DEV}
        <div class="connect-foot">
          <span class="material-symbols-outlined" aria-hidden="true">memory</span>
          <span>Mock targets: Workbench 65 VIA / Workbench ZMK 65 ZMK Studio</span>
        </div>
      {/if}
    </div>
  </div>
</section>

<style>
  .connect-panel {
    display: grid;
    gap: 12px;
    padding: 14px;
    border: 1px solid var(--line-2);
    border-radius: 14px;
    background: color-mix(in oklch, var(--surface) 90%, var(--paper));
    box-shadow: var(--shadow-float);
  }

  .connect-panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
    padding: 2px 2px 8px;
  }

  .connect-panel-head h2 {
    margin: 3px 0 0;
    font-size: 18px;
    line-height: 1.1;
  }

  .connect-option-list {
    display: grid;
    gap: 8px;
  }

  .connect-option {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    min-width: 0;
    min-height: 72px;
    padding: 12px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--paper-2);
    text-align: left;
    transition:
      border-color var(--dur-fast) var(--ease-out-soft),
      background var(--dur-fast) var(--ease-out-soft),
      transform var(--dur-fast) var(--ease-out-soft);
  }

  .connect-option:hover:not(:disabled) {
    border-color: var(--line-2);
    background: color-mix(in oklch, var(--coral) 9%, var(--paper-2));
    transform: translateY(-1px);
  }

  .connect-option.primary {
    border-color: color-mix(in oklch, var(--coral) 44%, var(--line-2));
    background: color-mix(in oklch, var(--coral) 13%, var(--paper-2));
  }

  .connect-option.disconnect {
    border-color: oklch(0.62 0.2 25 / 0.3);
    background: oklch(0.96 0.035 25);
  }

  .option-icon {
    display: grid;
    width: 42px;
    height: 42px;
    place-items: center;
    border: 1px solid var(--line-2);
    border-radius: 9px;
    background: var(--paper);
    color: var(--ink);
    font-size: 21px;
  }

  .option-copy {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .option-copy strong,
  .option-copy small,
  .option-action {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .option-copy strong {
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
  }

  .option-copy small {
    color: var(--ink-3);
    font-size: 12px;
    line-height: 1.35;
  }

  .option-action {
    display: inline-grid;
    min-width: 58px;
    min-height: 30px;
    place-items: center;
    padding: 0 10px;
    border: 1px solid var(--line-2);
    border-radius: 999px;
    background: var(--surface);
    font-family: var(--mono);
    font-size: 10px;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .connect-option.primary .option-action {
    border-color: var(--coral);
    background: var(--coral);
    color: #1c0a04;
  }

  .connect-option.disconnect .option-action {
    border-color: oklch(0.62 0.2 25 / 0.34);
    color: oklch(0.4 0.16 25);
  }

  .connect-status,
  .connect-foot {
    display: grid;
    align-items: center;
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: color-mix(in oklch, var(--surface) 74%, transparent);
  }

  .connect-status {
    grid-template-columns: 10px minmax(0, 1fr);
    gap: 10px;
    width: min(420px, 100%);
    padding: 10px 12px;
  }

  .connect-status strong,
  .connect-status span,
  .connect-foot span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .connect-status strong {
    display: block;
    font-family: var(--mono);
    font-size: 11px;
  }

  .connect-status span:not(.status-dot) {
    display: block;
    margin-top: 2px;
    color: var(--ink-3);
    font-size: 12px;
    line-height: 1.35;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--ink-3);
  }

  .connect-status[data-state="connected"] .status-dot {
    background: var(--mint);
    box-shadow: 0 0 0 3px color-mix(in oklch, var(--mint) 24%, transparent);
  }

  .connect-status[data-state="connecting"] .status-dot {
    background: var(--mustard);
    box-shadow: 0 0 0 3px color-mix(in oklch, var(--mustard) 24%, transparent);
  }

  .connect-status[data-state="error"] .status-dot {
    background: var(--removed);
    box-shadow: 0 0 0 3px color-mix(in oklch, var(--removed) 18%, transparent);
  }

  .connect-foot {
    grid-template-columns: 18px minmax(0, 1fr);
    gap: 8px;
    padding: 9px 10px;
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 10px;
  }

  .connect-foot .material-symbols-outlined {
    font-size: 16px;
  }

  @media (max-width: 760px) {
    .connect-panel {
      padding: 10px;
    }

    .connect-panel-head {
      align-items: flex-start;
      flex-direction: column;
    }

    .connect-option {
      grid-template-columns: 38px minmax(0, 1fr);
      min-height: 0;
    }

    .option-icon {
      width: 38px;
      height: 38px;
    }

    .option-action {
      grid-column: 2;
      justify-self: start;
    }
  }
</style>
