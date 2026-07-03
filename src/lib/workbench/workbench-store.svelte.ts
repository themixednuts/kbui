import { page } from "$app/state";
import { getConnectionState, type ConnectionState } from "$lib/keyboard/transport";
import { cloneDevice, sampleKeyboard, type DeviceProfile } from "$lib/keyboard/schema";
import { workbenchRouteFromPath, type WorkbenchRoute } from "./routes";
import { parseWorkbenchSearch } from "./url-search";

/** Mutable workbench session state (class fields use reactive runes). */
export class WorkbenchStore {
  baseProfileJson = $state(JSON.stringify(sampleKeyboard));
  device = $state<DeviceProfile>(cloneDevice(sampleKeyboard));
  previewMode = $state(false);
  hydrated = $state(false);
  liveProfileResolved = $state(false);
  connection = $state<ConnectionState>(getConnectionState());

  readonly route = $derived(workbenchRouteFromPath(page.url.pathname) as WorkbenchRoute);
  readonly search = $derived.by(() => parseWorkbenchSearch(page.url));

  readonly selectedLayerId = $derived(this.search.layerId);
  readonly selectedKeyId = $derived(this.search.keyId);
  readonly keymapMode = $derived(this.search.keymapMode);
  readonly logicTab = $derived(this.search.logicTab);
  readonly inspectorTab = $derived(this.search.inspectorTab);

  readonly workbenchReady = $derived(
    (this.connection.status === "connected" && this.liveProfileResolved) || this.previewMode,
  );

  readonly baseProfile = $derived(JSON.parse(this.baseProfileJson) as DeviceProfile);

  setBaseProfile(profile: DeviceProfile) {
    this.baseProfileJson = JSON.stringify(profile);
  }

  applyDeviceProfile(profile: DeviceProfile) {
    this.device = cloneDevice(profile);
  }
}
