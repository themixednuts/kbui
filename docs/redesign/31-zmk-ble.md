# Wave 4c ZMK Studio BLE/Serial Design

Status: design and research only. No source/config implementation is included in this wave.

> **DECISIONS (architect, no further sign-off needed):** 1) protobuf: none in the mock slice; real transport uses `@zmkfirmware/zmk-studio-ts-client` (fallback: local protobuf subset). 2) persistence: **batch-save after settled writes** (mirror VIA). 3) transport: scaffold both BLE + Serial, mock fully functional. 4) real protocol: **scaffolded/feature-detected + flagged hardware-unverified**, split to 4c-ii. 5) engine: parallel `zmk-live-sync.svelte.ts` mirroring VIA, consolidate later. 6) codec first slice: KC_NO/KC_TRNS/basic KC_* + MO/TO/TG; unknown → `ZMK_BEHAVIOR(id,p1,p2)`. 7) Connect: **separate** Bluetooth + USB ZMK options. 8) dirty-device: accept fetched keymap as base + warn (mock covers save/discard). **Wave 4c-i = mock-first slice; 4c-ii = real BLE/Serial protobuf.**

This document designs ZMK support for kbgui through ZMK Studio live edits over Web Bluetooth and Web Serial, mirroring the existing VIA Connect plus live-sync path. The first implementation should be mock-driven and hardware-free; real BLE/serial protocol behavior should be scaffolded but not treated as verified until tested with a ZMK Studio-enabled board.

## Research Baseline

Primary sources used:

- ZMK Studio feature docs: <https://zmk.dev/docs/features/studio>
- ZMK Studio RPC protocol docs: <https://zmk.dev/docs/development/studio-rpc-protocol>
- ZMK Studio message definitions: <https://github.com/zmkfirmware/zmk-studio-messages>
- Proto files:
  - <https://github.com/zmkfirmware/zmk-studio-messages/blob/main/proto/zmk/studio.proto>
  - <https://github.com/zmkfirmware/zmk-studio-messages/blob/main/proto/zmk/core.proto>
  - <https://github.com/zmkfirmware/zmk-studio-messages/blob/main/proto/zmk/behaviors.proto>
  - <https://github.com/zmkfirmware/zmk-studio-messages/blob/main/proto/zmk/keymap.proto>
  - <https://github.com/zmkfirmware/zmk-studio-messages/blob/main/proto/zmk/meta.proto>
- ZMK Studio TypeScript client:
  - <https://github.com/zmkfirmware/zmk-studio-ts-client>
  - <https://github.com/zmkfirmware/zmk-studio-ts-client/blob/main/src/framing.ts>
  - <https://github.com/zmkfirmware/zmk-studio-ts-client/blob/main/src/index.ts>
  - <https://github.com/zmkfirmware/zmk-studio-ts-client/blob/main/src/transport/gatt.ts>
  - <https://github.com/zmkfirmware/zmk-studio-ts-client/blob/main/src/transport/serial.ts>
- ZMK Studio app call sites:
  - <https://github.com/zmkfirmware/zmk-studio/blob/main/src/App.tsx>
  - <https://github.com/zmkfirmware/zmk-studio/blob/main/src/AppHeader.tsx>
  - <https://github.com/zmkfirmware/zmk-studio/blob/main/src/keyboard/Keyboard.tsx>
- ZMK keymap/config/persistence/build docs:
  - <https://zmk.dev/docs/keymaps>
  - <https://zmk.dev/docs/config>
  - <https://zmk.dev/docs/config/settings>
  - <https://zmk.dev/docs/user-setup>
  - <https://zmk.dev/docs/development/local-toolchain/build-flash>
- Browser APIs:
  - <https://developer.mozilla.org/en-US/docs/Web/API/Web_Bluetooth_API>
  - <https://developer.mozilla.org/en-US/docs/Web/API/Bluetooth/requestDevice>
  - <https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API>
  - <https://developer.mozilla.org/en-US/docs/Web/API/Serial/requestPort>
  - <https://caniuse.com/web-bluetooth>
  - <https://caniuse.com/web-serial>

## Product Model

ZMK has the same product split as VIA/QMK, but the live-edit protocol is different.

VIA:

- Live path: WebHID dynamic keymap writes.
- Live unit: `(layer,row,col)` plus a 16-bit QMK/VIA keycode.
- Persistence: VIA dynamic keymap changes persist on the board's runtime storage.
- Rebuild path: QMK source generation and firmware build for changes outside generic VIA.

ZMK Studio:

- Live path: ZMK Studio RPC over BLE GATT or USB serial.
- Live unit: `(layer_id,key_position)` plus a ZMK `BehaviorBinding`.
- Persistence: keymap mutations become persistent only when saved through the Studio protocol. ZMK persistent settings docs state that saved Studio runtime keymap modifications and selected physical layouts are stored in the controller's flash storage.
- Rebuild path: ZMK `.keymap`, `.conf`, `build.yaml`, GitHub Actions/local `west build`, and UF2/DFU flashing for changes outside Studio.

ZMK Studio is not a full source editor. The feature docs say it can update keymaps at runtime, assign predefined and user-defined behaviors to keys, select predefined physical layouts, rename and enable available extra layers, and work over USB or BLE in supported clients. It cannot define new behaviors not present in devicetree, define new physical layouts, or add more layers than the firmware's devicetree/reserved layers allow.

Live-writable ZMK edits for kbgui:

- Reassign a key position on an existing Studio layer to a behavior already exposed by the device.
- Change the two numeric parameters of that behavior when the behavior metadata says those parameters are valid.
- Bind to an existing user-defined behavior if the device exposes that behavior ID through `list_all_behaviors`.
- In a later slice, rename a layer, select an existing physical layout, or add/restore/remove Studio-available layers. Do not include these in the first keymap-cell sync slice.

Rebuild-required ZMK edits:

- Define new macros, tap dances, hold-taps, mod-morphs, combos, conditional layers, or other behavior nodes.
- Change advanced behavior properties that are expressed in devicetree/Kconfig.
- Add more layers than the device reports as available through Studio.
- Define new physical layouts, matrix transforms, kscan, board/shield hardware metadata, split behavior, BLE settings, displays, lighting topology, or `.conf` options.
- Change source files in `.keymap`, `.conf`, `build.yaml`, modules, or devicetree overlays.

The key nuance: assigning an already compiled macro/behavior to a key can be live-writable, but creating or changing the macro/behavior definition is a firmware rebuild concern.

## Protocol Summary

ZMK Studio RPC is protobuf messages inside a simple byte-framed stream. The protocol docs define three framing bytes:

- SoF: `0xAB`
- Escape: `0xAC`
- EoF: `0xAD`

Every protobuf payload is wrapped as `SoF + escaped payload + EoF`. Any special byte inside the payload is prefixed with the escape byte. The official TypeScript client implements this in `src/framing.ts`.

Top-level protobuf messages:

- Client to device: `zmk.studio.Request`
- Device to client: `zmk.studio.Response`
- Response variants:
  - `RequestResponse`, paired to a `request_id`
  - `Notification`, async device event

Transport options:

- BLE GATT:
  - Service UUID: `00000000-0196-6107-c967-c5cfb1c2482a`
  - RPC characteristic UUID: `00000001-0196-6107-c967-c5cfb1c2482a`
  - The characteristic accepts framed client writes and sends framed device messages through GATT indications. In Web Bluetooth this appears through `characteristicvaluechanged` events after `startNotifications()`.
- USB serial:
  - The protocol docs describe it as a serial/UART transport over USB CDC/ACM.
  - The official browser TypeScript client opens `navigator.serial.requestPort({})` and `port.open({ baudRate: 12500 })`.
  - The Tauri client uses a native serial backend. Baud rate differences on USB CDC/ACM need hardware verification before kbgui claims a real-board serial implementation is final.

RPC messages kbgui needs first:

- Connect/probe:
  - `core.get_device_info`: read keyboard name and serial bytes.
  - `core.get_lock_state`: decide whether writes are allowed.
  - `core.lock_state_changed` notification: update lock UI after the user unlocks on the keyboard.
- Unlock:
  - There is no RPC unlock command in the proto. The user must trigger an `&studio_unlock` binding on the keyboard, or firmware must be built with locking disabled. kbgui should wait for `UNLOCKED`, show a clear blocked state, and never imply it can unlock remotely.
- Keymap import:
  - `behaviors.list_all_behaviors`: get device behavior IDs.
  - `behaviors.get_behavior_details`: get display names and parameter metadata for each behavior.
  - `keymap.get_physical_layouts`: read active/selectable physical layouts and key positions.
  - `keymap.get_keymap`: read layers, layer IDs, layer names, available layer capacity, and binding arrays.
- Live write:
  - `keymap.set_layer_binding`: set `layer_id`, `key_position`, and `BehaviorBinding { behavior_id, param1, param2 }`.
  - Readback should call `keymap.get_keymap` and compare that layer/key position before marking the lane synced. The protocol does not expose a dedicated single-key read.
- Persistence:
  - `keymap.check_unsaved_changes`: read device dirty state.
  - `keymap.save_changes`: persist Studio changes to keyboard storage.
  - `keymap.discard_changes`: discard unsaved Studio changes.
  - `core.reset_settings`: restore stock settings, matching the official Studio header's "Restore Stock Settings" flow.

Encoding/decoding options:

- Preferred: use `@zmkfirmware/zmk-studio-ts-client` if package shape works with Vite+/Svelte. It already uses `protobufjs`, implements framing, `create_rpc_connection`, request ID matching, meta errors, Web Bluetooth, and Web Serial adapters.
- Alternative: generate a minimal protobuf TypeScript subset from `zmk-studio-messages` with `protobuf-ts` or `protobufjs`, then implement the framing and request multiplexer locally. This avoids depending on the current client package API but creates more code to maintain.
- Avoid hand-encoding protobuf unless the dependency is impossible. The schema has nested `oneof` fields, enums, signed integers, bytes, repeated fields, and future expansion points. A hand-written subset is viable only for the mock or a very narrow prototype, not for the real protocol.

## Fit With kbgui Transport

Current code to reuse:

- `src/lib/keyboard/transport.ts` defines `KeyboardTransport`, `TransportKind`, `ConnectionState`, WebHID/WebUSB feature detection, real VIA probing, and `writeViaKeycodeEffect`.
- `src/lib/keyboard/transport-mock.ts` provides `createMockViaTransport`, a mock HID device, in-memory keymap, write/readback, and report validation.
- `src/lib/app/connect-flow.ts` activates a connected profile through `KeyboardTransport`.
- `src/lib/keyboard/via-live.ts` classifies profile changes.
- `src/lib/app/via-live-sync.svelte.ts` debounces, queues, writes, verifies readback, patches connection keymap, and marks synced lanes clean.

Transport type changes needed later:

```ts
type TransportKind = "webusb" | "webhid" | "webbluetooth" | "webserial";

interface DeviceIdentity {
  key: string;
  transport: TransportKind;
  vendorId?: number;
  productId?: number;
  productName?: string;
  serialNumber?: string;
}

interface ConnectionState {
  status: "idle" | "unsupported" | "requesting" | "connected" | "error";
  transport?: TransportKind;
  protocol?: "via-v3" | "zmk-studio";
  zmkStudio?: ZmkStudioConnection;
  detection?: KeyboardDetection;
  webBluetoothSupported: boolean;
  webSerialSupported: boolean;
  // keep existing WebHID/WebUSB fields for VIA
}
```

`ZmkStudioConnection` should hide raw browser handles behind RPC methods:

```ts
interface ZmkStudioConnection {
  label: string;
  mode: "real" | "mock";
  lockState: "locked" | "unlocked";
  behaviorCatalog: ZmkBehaviorCatalog;
  layerIdByLayerIndex: number[];
  keyPositionByKeyId: Record<string, number>;
  call: (request: ZmkStudioRequest) => Promise<ZmkStudioResponse>;
  close: () => Promise<void>;
}
```

This keeps `ConnectionState` serializable enough for shell state while still giving live-sync a real writer. It also lets the mock implement the same surface without a browser Bluetooth or Serial object.

New transports:

- `createWebBluetoothZmkStudioTransport()`
  - `id: "webbluetooth-zmk-studio"`
  - `label: "Web Bluetooth ZMK Studio"`
  - `mode: "real"`
  - `transport: "webbluetooth"`
  - Connect with `navigator.bluetooth.requestDevice({ filters: [{ services: [studioServiceUuid] }], optionalServices: [studioServiceUuid] })`.
  - Connect GATT, get service/characteristic, start notifications, wrap in RPC connection, read device/keymap.
- `createWebSerialZmkStudioTransport()`
  - `id: "webserial-zmk-studio"`
  - `label: "Web Serial ZMK Studio"`
  - `mode: "real"`
  - `transport: "webserial"`
  - Connect with `navigator.serial.requestPort()` and `port.open(...)`.
  - Use the same framed protobuf RPC pipeline.
- `createMockZmkStudioTransport()`
  - `id: "mock-zmk-studio:<board>"`
  - `label: "<board> demo"`
  - `mode: "mock"`
  - `transport: "webbluetooth"` or a new mock-neutral value if `TransportKind` is split into physical and mode. To avoid schema churn, report the same transport as the selected demo option and rely on `mode: "mock"`.
  - Returns a ZMK `DeviceProfile` with `firmware: "zmk"` and `protocol: "zmk-studio"`.

DeviceProfile import:

- Use `core.get_device_info.name` as `profile.name`.
- Use serial bytes as hex or UTF-8 when sane, then build an identity key such as `keyboard:zmk-studio:<transport>:<serial-or-name>`.
- Use `keymap.get_physical_layouts.active_layout_index` and the selected layout's `keys` array to create `KeyboardKey[]`.
- Use the binding array index as ZMK `key_position`.
- Preserve a `keyPositionByKeyId` map in detection/connection metadata. Current `KeyboardKey` has only `row` and `col`; do not pretend ZMK key positions are VIA matrix coordinates.
- Convert `keymap.layers[]` to `DeviceProfile.layers[]`; store each RPC `Layer.id` in connection metadata by array index.
- Convert `BehaviorBinding` to `KeyBinding.code` through a ZMK behavior encoder/decoder. The first slice can support only a narrow, tested subset and render unknown bindings as stable source strings such as `ZMK_BEHAVIOR(<id>,<param1>,<param2>)`.

## ZMK Positions vs VIA Matrix

VIA writes use `(layer,row,col)`. ZMK Studio writes use `(layer_id,key_position)`.

For kbgui:

- A ZMK key lane key should be `zmk:<layerId>:<keyPosition>`.
- A VIA key lane key can remain `<layerIndex>:<row>:<col>`.
- `KeyboardKey.row` and `KeyboardKey.col` may still be useful for display fallback, but ZMK writes must not derive protocol position from matrix coordinates.
- For imported ZMK Studio profiles, key positions should be assigned from the physical layout key array order returned by `keymap.get_physical_layouts`.
- For the mock ZMK device, use the current sample profile's `keys` array order as the canonical physical-layout order, and optionally set `row/col` for board rendering.

Readback:

- VIA readback reads one keycode.
- ZMK readback fetches `keymap.get_keymap` and checks `layers[layerIndex].bindings[keyPosition]`.
- After success, patch the connection's in-memory keymap with the returned binding and mark that lane clean in the editor base.

## ZMK Binding Encoding

The first ZMK live writer should not reuse `qmkKeycodeValue`. ZMK Studio writes a behavior ID plus two numeric parameters, not a 16-bit QMK keycode.

Define a ZMK binding codec:

```ts
interface ZmkStudioBinding {
  behaviorId: number;
  param1: number;
  param2: number;
}

interface ZmkBehaviorDetails {
  id: number;
  displayName: string;
  parameterSets: Array<{
    param1: ZmkParameterDescription[];
    param2: ZmkParameterDescription[];
  }>;
}

interface ZmkBindingCodec {
  decode(binding: ZmkStudioBinding, catalog: ZmkBehaviorCatalog): KeyBinding;
  encode(binding: KeyBinding, catalog: ZmkBehaviorCatalog, layers: Layer[]): ZmkStudioBinding | undefined;
}
```

Recommended first encode subset:

- `KC_NO` -> ZMK none/no-op behavior when the device exposes it.
- `KC_TRNS` -> transparent behavior when the device exposes it.
- Basic `KC_*` keyboard and consumer usages -> `&kp` equivalent behavior ID with HID usage parameter.
- `MO(n)`, `TO(n)`, `TG(n)` -> layer behavior IDs only after the behavior catalog confirms layer-id parameters.

Defer:

- `LT(layer,key)`, mod-tap, sticky keys, Bluetooth output commands, lighting commands, and user-defined behavior aliases until their parameter metadata and UI representation are tested.
- Creating or editing macros/tap dances/hold-taps/combos. Those are source/devicetree work, even if assigning an existing compiled behavior is live-writable.

Unknown device bindings:

- Preserve them as `ZMK_BEHAVIOR(id,param1,param2)` so users do not lose data.
- Classify edits from unknown to unknown as source-only or invalid unless the codec can produce a valid `BehaviorBinding`.

## Connect Flow Additions

Add two ZMK options to `src/routes/(app)/connect/+page.svelte`:

- `Connect over Bluetooth (ZMK)`
  - Uses Web Bluetooth and the ZMK Studio GATT UUIDs.
  - Feature-detect `navigator.bluetooth`.
  - Show an unavailable state on unsupported browsers.
  - On connect, read device info, lock state, behavior catalog, physical layouts, keymap, and unsaved status.
- `Use demo ZMK device`
  - Uses `createMockZmkStudioTransport()`.
  - Should work in tests and in the browser without hardware.
  - Should route to `/editor` with `firmware: "zmk"` and `protocol: "zmk-studio"`.

Add Web Serial as either:

- A third visible option: `Connect over USB (ZMK)`.
- Or a secondary option under the ZMK card.

Recommendation: show both real transports explicitly:

1. `Connect device` for WebHID VIA.
2. `Connect over Bluetooth (ZMK)`.
3. `Connect over USB (ZMK)`.
4. `Use demo device` for mock VIA.
5. `Use demo ZMK device`.
6. Existing import/local options.

Reason: Web Bluetooth and Web Serial have different browser/OS failure modes. Hiding Serial behind Bluetooth will make debugging real boards harder.

ZMK connect result:

- `connectZmkStudioAndActivate()` should mirror `connectViaAndActivate()`.
- It should activate a profile created from the device, not from the VIA catalog.
- If the device reports locked, activation can still proceed for read-only display, but live-sync should show `locked` and write nothing until an unlock notification is received.
- If `check_unsaved_changes` is true on connect, kbgui should display a device-dirty warning. First implementation should treat the fetched device keymap as the base profile and allow writes only after the user chooses either "Save device changes" or "Discard device changes". Mock tests should cover this state.

Browser support notes:

- Web Bluetooth and Web Serial are secure-context APIs and require explicit user permission. MDN marks both as limited availability.
- Web Bluetooth is not exposed in workers.
- Web Serial is available in dedicated workers in supporting browsers.
- Production should treat both APIs as Chromium-family first and feature-detect at runtime. The official ZMK Studio app exposes browser BLE only when `navigator.bluetooth` exists and the user agent contains Linux; this is a useful warning that cross-platform browser BLE needs real verification.

## Live Sync Design

Keep the behavioral contract from VIA:

- Debounce per lane.
- Serialize writes through one device queue.
- Re-check the current binding signature before writing.
- Write only live-writable changes.
- Verify readback before marking the lane synced.
- Preserve local edits on failure.
- Retry explicitly or on reconnect.

ZMK-specific write flow:

1. Classifier identifies a live-writable ZMK binding edit and attaches:
   - `layerIndex`
   - `layerId` from the device keymap
   - `keyId`
   - `keyPosition`
   - encoded `BehaviorBinding`
   - `laneKey = zmk:<layerId>:<keyPosition>`
   - binding signature
2. Live-sync waits for debounce.
3. If connection is not ZMK Studio or is locked, clear timers and do not write.
4. Send `keymap.set_layer_binding`.
5. Require response `SET_LAYER_BINDING_RESP_OK`.
6. Read `keymap.get_keymap` and compare the target binding.
7. Persist according to the selected policy.
8. Patch connection keymap.
9. Mark the editor base binding clean for that one key.

Persistence policy:

- Recommended default for kbgui: save after each settled write batch, not every transient UI state. This mirrors VIA's "edits are live and persistent" model while respecting debounce.
- Batch behavior: all pending ZMK live writes that settle together should run, then one `save_changes` should persist them. Mark lanes clean only after both readback and save succeed.
- If `save_changes` returns `SAVE_CHANGES_ERR_NO_SPACE` or another error, mark lanes `sync-failed` and keep local edits dirty.
- If product wants official ZMK Studio's manual Save/Discard UX instead, the sync engine should have a `device-mutated-unsaved` status and a separate Save action. This is a sign-off decision because it differs from VIA semantics.

Implementation shape:

- Add `src/lib/keyboard/zmk-live.ts` rather than extending `via-live.ts` directly.
- Add a protocol-neutral live-sync adapter boundary:

```ts
interface LiveSyncAdapter<TTarget> {
  protocol: "via-v3" | "zmk-studio";
  canWrite(connection: ConnectionState): boolean;
  classify(base: DeviceProfile, draft: DeviceProfile): ClassifiedLiveChange<TTarget>[];
  write(connection: ConnectionState, target: TTarget): Promise<void>;
  patchConnection(connection: ConnectionState, target: TTarget): ConnectionState;
}
```

- Either extract the queue/debounce core from `ViaLiveSyncEngine`, or implement `ZmkLiveSyncEngine` as a close mirror first. The safest first implementation is a parallel `zmk-live-sync.svelte.ts` with identical tests; consolidate after both engines pass mock tests.

## ZMK Change Classification

Add `zmk-live.ts` with ZMK-specific classifications:

- `liveZmkWritable`
- `firmwareRebuildRequired`
- `sourceOnlyUnsupported`
- `invalid`

Live-writable rules:

- Profile must be `firmware === "zmk"` and `protocol === "zmk-studio"`.
- Change must target an existing layer binding.
- Changed binding fields must be limited to `code` for the first slice.
- The active connection must provide `layerIdByLayerIndex` and `keyPositionByKeyId`.
- The codec must encode the binding into a valid `BehaviorBinding` for the device behavior catalog.
- The behavior ID and parameters must satisfy the device's behavior metadata.

Firmware rebuild required:

- Combo definitions.
- Macro definitions.
- Tap dance definitions.
- Key override-like source behaviors.
- New or edited ZMK behavior definitions.
- Layer count above `available_layers` or devicetree reserved capacity.
- Matrix/layout/physical layout definitions.
- Firmware settings in `.conf`/Kconfig/devicetree.
- Split/BLE/output configuration.
- Device metadata, board/shield, module, bootloader, display, lighting topology.

Source-only unsupported:

- Local notes.
- Unknown but valid existing behavior bindings that kbgui can display but not encode.
- Board-specific runtime features that ZMK Studio may eventually support but kbgui does not encode yet.

Invalid:

- Missing layer/key.
- Missing ZMK position mapping.
- Locked connection when a write is attempted.
- Behavior parameters outside metadata range.
- `set_layer_binding` response errors:
  - invalid location
  - invalid behavior
  - invalid parameters

Longer term, rename the public classification to protocol-neutral `liveWritable` and carry `protocol: "via-v3" | "zmk-studio"` on the target. Do this only when UI churn is acceptable.

## Mock ZMK Device Plan

Create a mock that mirrors `transport-mock.ts`, but at the ZMK Studio RPC level.

Mock board:

- Name: `Workbench ZMK 65` or `Studio Split Demo`.
- `firmware: "zmk"`.
- `protocol: "zmk-studio"`.
- Stable identity, e.g. `keyboard:zmk-studio:mock-zmk-001`.
- A physical layout derived from `sampleKeyboard.keys`.
- Layers with numeric Studio IDs, e.g. `100`, `101`, `102`.
- `available_layers`, e.g. `2`, so add-layer behavior can be tested later.
- Behavior catalog with IDs for:
  - key press
  - transparent
  - none
  - momentary layer
  - to layer
  - toggle layer
  - studio unlock if needed for display
- In-memory `BehaviorBinding[][]` keyed by layer index and key position.

Mock capabilities:

- `core.get_device_info`.
- `core.get_lock_state`.
- Lock starts as locked or unlocked depending test setup.
- `mockUnlock()` helper emits `core.lock_state_changed = UNLOCKED`.
- `behaviors.list_all_behaviors`.
- `behaviors.get_behavior_details`.
- `keymap.get_physical_layouts`.
- `keymap.get_keymap`.
- `keymap.set_layer_binding`.
- `keymap.check_unsaved_changes`.
- `keymap.save_changes`.
- `keymap.discard_changes`.
- `core.reset_settings`.
- Request ID matching and meta errors.

Mock persistence:

- Maintain `stockKeymap`, `workingKeymap`, and `savedKeymap`.
- `set_layer_binding` mutates `workingKeymap` and sets `unsaved = true`.
- `save_changes` copies `workingKeymap` to `savedKeymap` and clears `unsaved`.
- `discard_changes` restores `workingKeymap` from `savedKeymap` and clears `unsaved`.
- `reset_settings` restores `workingKeymap` and `savedKeymap` from `stockKeymap`.

Mock readback/failure hooks:

- `nextSetBindingResponse`.
- `nextReadbackBinding`.
- `nextSaveResponse`.
- `disconnectAfterWrite`.
- `lockedAfterConnect`.

Tests to require before real hardware:

- Mock connect creates a ZMK `DeviceProfile` with layers and key positions.
- Locked mock blocks writes until unlock notification.
- Basic `KC_A -> KC_B` edit writes `set_layer_binding`, readbacks with `get_keymap`, saves, and marks the lane clean.
- Rapid edits on one lane debounce to one final ZMK write.
- Save failure preserves local edit and marks `sync-failed`.
- Rebuild-required ZMK combo/macro/tap-dance/settings edits do not write.
- Unknown behavior bindings round-trip without data loss when imported.
- Mock Web Bluetooth unavailable state and mock Web Serial unavailable state are handled without hardware.

## Real Hardware Required

Mock tests can validate kbgui architecture, classification, queueing, encode/decode, request matching, and persistence decisions. They cannot validate:

- Chrome/Edge permission prompts, denied permissions, remembered permissions, and reconnect behavior.
- Web Bluetooth behavior on Windows/macOS/Linux. The official ZMK Studio app gates browser BLE to Linux, so kbgui must not claim broad BLE support before testing.
- BLE GATT MTU/chunking and write limits for larger messages.
- GATT indication behavior and disconnect events.
- Web Serial port listing, permissions, Linux group permissions, busy-port errors, and baud-rate quirks.
- ZMK board firmware requirements: `CONFIG_ZMK_STUDIO=y`, `studio-rpc-usb-uart` for USB, physical layout support, no incompatible matrix transform, enough RAM.
- Actual lock/unlock timing with `&studio_unlock`.
- Studio storage behavior across unplug/replug and regular firmware flashing.
- Split central/peripheral behavior and output endpoint requirements.

## Phasing

Phase 1, mock-first ZMK Studio:

- Add ZMK transport types and mock ZMK transport.
- Add ZMK profile import from mock device.
- Add Connect options:
  - `Connect over Bluetooth (ZMK)` visible but can be scaffolded.
  - `Connect over USB (ZMK)` visible but can be scaffolded.
  - `Use demo ZMK device` fully functional.
- Add `zmk-live.ts` classifier.
- Add ZMK live-sync over mock with readback and save.
- Add tests covering locked/unlocked, write/readback/save, failure, and rebuild-required classification.

Phase 2, real protocol scaffold:

- Add framed protobuf RPC using `@zmkfirmware/zmk-studio-ts-client` or generated local protobuf.
- Add Web Serial real transport behind feature detection.
- Add Web Bluetooth real transport behind feature detection.
- Keep both flagged as hardware-unverified in code comments/UI copy until a real ZMK Studio board is tested.

Phase 3, hardware verification:

- Test one ZMK Studio-enabled board over USB serial in Chrome/Edge.
- Test one ZMK Studio-enabled BLE board on Linux Chrome/Edge.
- Verify lock/unlock, get keymap, behavior catalog, set binding, save, disconnect/reconnect, and persistence after power cycle.
- Record browser/OS matrix and known failure modes.

Phase 4, broaden live features:

- Add layer rename if needed.
- Add physical layout selection if needed.
- Add available-layer add/remove/restore only after UX and persistence behavior are clear.
- Expand binding codec for layer-tap, mod-tap, sticky keys, Bluetooth/output, lighting, and existing user-defined behaviors.

Deferred to firmware-build wave:

- ZMK config/source generation.
- GitHub Actions integration.
- Local `west build`.
- UF2/DFU flashing.
- Settings reset firmware.
- Any `.keymap`/`.conf` rebuild path. ZMK docs describe GitHub Actions as the standard no-local-toolchain path and UF2 copy as common flashing; that belongs with firmware build/flash, not this live-edit wave.

## Recommended First Slice

Ship the smallest slice that proves the architecture without hardware:

1. Mock ZMK Studio transport with real RPC-shaped behavior.
2. ZMK `DeviceProfile` activation from mock keymap/physical layout.
3. ZMK classifier for key binding `code` edits.
4. ZMK live-sync with debounce, `set_layer_binding`, `get_keymap` readback, `save_changes`, and clean-base advancement.
5. Connect UI entries for real BLE/Serial as feature-detected scaffold, plus a fully working `Use demo ZMK device`.
6. Tests equivalent to the VIA live-sync mock tests.

Do not implement source/config changes in this wave. Do not claim real Web Bluetooth/Web Serial support until a board validates it.

## Decisions For Sign-Off

1. Protobuf strategy: use `@zmkfirmware/zmk-studio-ts-client` now, or generate a local `protobuf-ts`/`protobufjs` subset from `zmk-studio-messages`.
2. Persistence strategy: kbgui saves after each settled write batch to mirror VIA, or kbgui follows official ZMK Studio's manual Save/Discard model.
3. Transport priority: implement Web Serial first because it is easier to verify on a desk, or BLE first because it is the ZMK-specific differentiator.
4. Real protocol scope: scaffold BLE/Serial now behind feature detection, or keep real transports out until a ZMK Studio board is available.
5. Engine structure: create a protocol-neutral live-sync adapter now, or mirror VIA with `zmk-live-sync.svelte.ts` first and consolidate after tests.
6. Binding codec scope: first slice supports only basic key press/transparent/none, or also includes layer behaviors such as `MO`, `TO`, and `TG`.
7. Connect UX: show Web Bluetooth and Web Serial as separate ZMK options, or one ZMK option with a transport chooser.
8. Dirty device policy on connect: require save/discard before syncing if the board reports unsaved Studio changes, or accept the fetched keymap as base and continue.
