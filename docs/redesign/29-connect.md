# Wave 4c Connect Implementation

Status: implemented as the bounded Connect wave. VIA live-sync of editor edits is still the next wave.

## Transport Interface

The app now has one transport interface in `src/lib/keyboard/transport.ts`:

- `KeyboardTransport`
- `KeyboardTransportConnectOptions`
- `createWebHidViaTransport()`

The real implementation wraps the existing WebHID VIA path through `connectKeyboard("webhid", ...)`. It requests a browser HID device, reads VIA protocol version, layer count, macro count, identity, and the keymap when a matrix hint is available. WebUSB discovery remains in the lower-level transport code, but the Connect screen's primary device action targets WebHID VIA because that is the live-edit path.

The mock implementation lives in `src/lib/keyboard/transport-mock.ts`:

- `mockViaBoards.workbench65`
- `createMockViaTransport()`
- `MockHidKeyboardDevice`

The mock board models Workbench 65 with stable identity `0xFEED:0x6060`, serial `MOCK-WB65-001`, VIA protocol 12, the sample profile matrix, sample layer count, sample macro count, and an in-memory keymap generated from the Workbench 65 `DeviceProfile`.

Mock VIA capabilities covered in this wave:

- `getProtocolVersion`
- `dynamicKeymapGetLayerCount`
- `dynamicKeymapMacroGetCount`
- `dynamicKeymapGetKeycode`
- `dynamicKeymapSetKeycode`
- `dynamicKeymapGetBuffer`
- HID product/vendor/product/serial identity
- readback after writes from the same in-memory keymap
- packet validation capture through the existing VIA report validator

## Connect Screen

`src/routes/(app)/connect/+page.svelte` is no longer a placeholder. It uses the redesign Connect hero classes from `app.css` and exposes five options:

- `Connect device`: opens the real WebHID VIA transport. It resolves a VIA catalog matrix hint when possible, reads device metadata/keymap, builds a `DeviceProfile`, updates the workbench, and routes to `/editor`.
- `Use demo device`: starts the mock Workbench 65 VIA transport. This is the default hardware-free test/demo path.
- `Load VIA JSON`: imports a VIA v3 definition JSON with `parseViaDefinition()`, converts it through `profileFromCatalog()`, sets it as the active workbench profile, and keeps the shell in local-only/disconnected state.
- `Continue without a device`: clones the Workbench 65 starter profile as a local-only profile and sets it active.
- `Trace from photo`: visible disabled placeholder for the later photo-to-layout flow.

The shared flow logic is in `src/lib/app/connect-flow.ts` so the behavior can be unit-tested without mounting the Svelte route.

## Profile Import Flow

Connected VIA flow:

1. Shell state becomes `connecting`.
2. The selected `KeyboardTransport` connects.
3. The transport returns `ConnectionState` with VIA detection data.
4. The app resolves a base layout profile from the VIA catalog or the transport default profile.
5. `profileFromDetection()` overlays identity, protocol, layer count, and live keymap data onto the base `DeviceProfile`.
6. The workbench store replaces its active profile and commits it as the clean base.
7. Shell state becomes `connected(board, protocol)`.
8. The route moves to `/editor`.

VIA JSON import flow:

1. Shell state becomes `connecting` with transport label `VIA JSON`.
2. The file is parsed as JSON.
3. `parseViaDefinition()` validates the VIA v3 definition.
4. `profileFromCatalog()` creates a `DeviceProfile`.
5. The workbench store replaces its active profile.
6. Shell state returns to `disconnected` with a local-only import message.
7. The route moves to `/editor`.

Local-only flow:

1. Shell state becomes `connecting` with transport label `Local`.
2. The sample Workbench 65 profile is cloned with a `local:` profile id.
3. Device identity is cleared.
4. The workbench store replaces its active profile.
5. Shell state returns to `disconnected`.
6. The route moves to `/editor`.

## Shell Connection State

`src/lib/app/shell-store.svelte.ts` now models explicit connection state:

- `disconnected`
- `connecting`
- `connected`
- `error`

The appbar and left-rail device status read this shell state. Loading or editing a local profile no longer implies that hardware is connected. The shell primary action is:

- `Connect` while disconnected or errored
- `Connecting` while connecting
- `Connected` while connected

There is no VIA `Apply` or `Flash` action in this wave.

## Mock-Driven Test Evidence

Hardware-free tests added or extended:

- `src/lib/keyboard/transport.test.ts`
  - reads VIA protocol, layers, macros, and keymap through mock WebHID
  - validates set-keycode writes and readback
  - validates keymap-buffer read windows
  - verifies `createMockViaTransport()` exposes the Workbench 65 profile and identity
- `src/lib/app/connect-flow.test.ts`
  - mock VIA connect -> identity/keymap read -> populated `DeviceProfile` -> active workbench profile
  - VIA JSON import -> `DeviceProfile` -> active workbench profile
  - continue without device -> local-only profile -> active workbench profile
  - shell transitions for connect/import/local-only paths

Covered without hardware:

- browser-independent connection flow state transitions
- VIA protocol probing against a deterministic HID mock
- keymap import from mock device memory
- write/readback behavior in the mock
- VIA definition JSON import
- active profile replacement in the shared workbench store
- app shell disconnected/connecting/connected/error state model

Still needs a real board later:

- browser permission prompt behavior across Chrome/Edge variants
- real VIA definition matching for vendor/product/product-name collisions
- real keyboard EEPROM read timing and failure modes
- WebHID report quirks on specific boards
- disconnect/reconnect events
- live-sync of editor edits, including debounce, write queue, readback failures, and user-visible sync status

The next wave should build the VIA live-sync engine on top of this connection and mock-device foundation.
