# Wave 4c-ii ZMK Studio Real Transport

Status: implemented and protocol-pipeline tested without hardware.

## Protobuf Strategy

I attempted the preferred official package first with:

```sh
vp add @zmkfirmware/zmk-studio-ts-client
```

It installed, but Vite+ test could not import the package because the published ESM files import `protobufjs/minimal` without the `.js` suffix. The dependency was externalized by the test runner, so a Vite alias did not fix the import path. I removed the official package and used the bounded fallback.

The implemented fallback uses `protobufjs/minimal.js` directly plus a local subset of the ZMK Studio message schema in `src/lib/keyboard/zmk-studio-rpc.ts`. The subset covers only the RPCs needed by kbgui:

- `core.get_device_info`
- `core.get_lock_state`
- `core.lock_state_changed`
- `core.reset_settings`
- `behaviors.list_all_behaviors`
- `behaviors.get_behavior_details`
- `keymap.get_physical_layouts`
- `keymap.get_keymap`
- `keymap.set_layer_binding`
- `keymap.check_unsaved_changes`
- `keymap.save_changes`
- `keymap.discard_changes`

The official package was not kept as a dependency. `protobufjs` is now the direct dependency.

## Framing And RPC Layer

`src/lib/keyboard/zmk-studio-rpc.ts` implements:

- ZMK Studio framing: `SoF 0xAB`, `Esc 0xAC`, `EoF 0xAD`.
- Escaping for all special bytes inside protobuf payloads.
- Incremental deframing across byte chunks.
- Protobuf encode/decode for the bounded request/response/notification subset.
- A request-id multiplexer that allows concurrent calls and matches responses by `request_id`.
- Meta-error handling through `ZmkStudioRpcMetaError`.
- Notification dispatch for `lock_state_changed` and unsaved-change status.
- `RealZmkStudioConnection`, which exposes the existing `ZmkStudioConnection.call(request)` contract used by the mock and live-sync engine.

The RPC wrapper keeps the app transport-agnostic: `connect-flow` and `zmk-live-sync` still talk to `ZmkStudioConnection.call(...)`.

## BLE Transport

`src/lib/keyboard/transport-zmk-ble.ts` adds `createWebBluetoothZmkStudioTransport()`.

Behavior:

- Feature-detects `navigator.bluetooth`.
- Requests devices with service `00000000-0196-6107-c967-c5cfb1c2482a`.
- Connects GATT and opens characteristic `00000001-0196-6107-c967-c5cfb1c2482a`.
- Starts notifications and routes `characteristicvaluechanged` bytes into the framed RPC layer.
- Writes framed request bytes to the RPC characteristic.
- Probes `get_device_info` and `get_lock_state` before returning `ConnectionState`.

The UI and transport notes mark this path hardware-unverified.

## Serial Transport

`src/lib/keyboard/transport-zmk-serial.ts` adds `createWebSerialZmkStudioTransport()`.

Behavior:

- Feature-detects `navigator.serial`.
- Calls `navigator.serial.requestPort({})`.
- Opens the port with `{ baudRate: 12500 }`.
- Wires `port.readable` and `port.writable` into the same framed RPC layer.
- Probes `get_device_info` and `get_lock_state` before returning `ConnectionState`.

The UI and transport notes mark this path hardware-unverified.

## Unlock Model

There is no remote unlock RPC. On connect, kbgui reads lock state:

- If unlocked, live-sync may write normally.
- If locked, the connection still activates read-only, the connection message says to unlock on the keyboard with `&studio_unlock`, and existing live-sync logic refuses writes.
- `lock_state_changed` notifications update `RealZmkStudioConnection.lockState`.

## Hardware-Unverified Scope

No real ZMK Studio board was available in this wave, so these are not verified:

- Browser permission prompts and remembered grants.
- BLE GATT indication behavior and disconnect behavior.
- BLE write size, MTU, and chunking behavior on a real device.
- USB CDC/ACM serial behavior, busy-port errors, and OS permission issues.
- Real firmware requirements such as `CONFIG_ZMK_STUDIO=y` and USB UART setup.
- Actual `&studio_unlock` timing and notification behavior.
- Persistence across save, reconnect, power cycle, and firmware flashing.

A real-board validation pass should connect over USB serial and BLE, read info/lock/layouts/keymap/behaviors, unlock on the keyboard, set a binding, verify readback, save, disconnect/reconnect, and confirm persistence.

## Pipeline Evidence

The no-hardware pipeline tests are in `src/lib/keyboard/zmk-studio-rpc.test.ts`:

- Framing round trip, including escaped special bytes.
- Protobuf encode/decode for every required request and response.
- Request-id multiplexing with out-of-order responses.
- Notification dispatch.
- Meta-error handling.
- Existing `MockZmkStudioConnection` handlers driven through the real framed protobuf byte pipeline.

Verification run:

- `vp check`: passed.
- `vp run svelte:check`: passed, 0 errors and 0 warnings.
- `vp build`: passed.
- `vp test`: passed, 30 files and 149 tests.
- `vp run capture`: passed, 8/8 visual captures.
- Capture server cleanup: no listener remained on port 4173.
