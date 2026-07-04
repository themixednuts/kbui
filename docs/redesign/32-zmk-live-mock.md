# Wave 4c-i ZMK Studio Live Mock

Status: implemented as a mock-first ZMK Studio live-edit slice. This wave does not implement the real Web Bluetooth/Web Serial protobuf transport. Real hardware protocol work remains Wave 4c-ii and needs a ZMK Studio-enabled board.

## Transport Types And Mock Device

- `TransportKind` now includes `webbluetooth` and `webserial`.
- `ConnectionState` now carries `protocol: "via-v3" | "zmk-studio"`, optional `zmkStudio`, and Web Bluetooth/Web Serial feature flags.
- `ZmkStudioConnection` lives in `src/lib/keyboard/zmk-studio.ts` and exposes RPC-shaped object calls, lock state, behavior catalog, ZMK layer IDs, key-position mapping, optional current keymap, and `close()`.
- `src/lib/keyboard/transport-mock-zmk.ts` adds `createMockZmkStudioTransport()` for `Workbench ZMK 65`.
- The mock uses plain TypeScript RPC-shaped objects, not protobuf bytes.
- The mock keeps `stockKeymap`, `workingKeymap`, and `savedKeymap`; writes mutate working state, `save_changes` persists it, `discard_changes` rolls back to saved state, and `reset_settings` restores stock state.
- Test hooks are available on `MockZmkStudioConnection`: `nextSetBindingResponse`, `nextReadbackBinding`, `nextSaveResponse`, and `mockUnlock()`. `lockedAfterConnect` is supported through transport options.

## Binding Codec

- `src/lib/keyboard/zmk-binding.ts` implements `decodeZmkBinding()` and `encodeZmkBinding()`.
- Supported first slice:
  - `KC_NO` -> none behavior.
  - `KC_TRNS` -> transparent behavior.
  - Basic supported `KC_*` keyboard/modifier/media/system usages -> key-press behavior.
  - `MO(n)`, `TO(n)`, `TG(n)` -> layer behaviors using the device's Studio layer IDs.
- Unknown device bindings decode as `ZMK_BEHAVIOR(id,p1,p2)` and can round-trip through the codec without data loss.
- Unsupported source behaviors such as `QK_BOOT` and `RGB_TOG` are not claimed as ZMK Studio live-writable.

## Profile Import And Connect

- `connectZmkStudioAndActivate()` mirrors `connectViaAndActivate()` in `src/lib/app/connect-flow.ts`.
- ZMK profile import calls:
  - `get_device_info`
  - `get_lock_state`
  - `get_physical_layouts`
  - `get_keymap`
  - `check_unsaved_changes`
  - `list_all_behaviors`
  - `get_behavior_details`
- Imported ZMK `DeviceProfile` values use `firmware: "zmk"` and `protocol: "zmk-studio"`.
- ZMK writes use the connection's `layerIdByLayerIndex` and `keyPositionByKeyId`; matrix row/col is display metadata only.
- If a device reports unsaved Studio changes on connect, the fetched keymap is accepted as the clean base and a detection note warns about it.
- Connect page additions:
  - `Use demo ZMK device`: fully functional mock path to `/editor`.
  - `Connect over Bluetooth (ZMK)`: feature-detected scaffold only.
  - `Connect over USB (ZMK)`: feature-detected scaffold only.

## Classifier And Live Sync

- `src/lib/keyboard/zmk-live.ts` classifies ZMK changes as:
  - `liveZmkWritable`
  - `firmwareRebuildRequired`
  - `sourceOnlyUnsupported`
  - `invalid`
- Live-writable changes are existing-layer binding `code` edits that encode through the ZMK codec and have valid Studio layer/key-position mappings.
- Combo, macro, tap-dance, settings, layer-count, matrix, physical-layout, and device metadata edits are rebuild-required.
- Unknown `ZMK_BEHAVIOR(...)` edits are preserved but treated as source-only in this slice.
- `src/lib/app/zmk-live-sync.svelte.ts` mirrors the VIA engine:
  - Debounce per lane.
  - Lane key is `zmk:<layerId>:<keyPosition>`.
  - Serialize writes through one queue.
  - Re-check binding signature before write.
  - Skip writes when locked.
  - `set_layer_binding`, then `get_keymap` readback verification.
  - Batch `save_changes` after settled successful writes.
  - Mark only verified and saved bindings clean.
  - Preserve local edits and mark `sync-failed` on write/readback/save failure.
- `KeyboardLiveSyncEngine` chooses the VIA or ZMK engine by active profile/connection protocol while reusing the existing sync chip and notices.

## Mock-Driven Verification

Commands run with Vite+:

- `vp install`: passed.
- `vp check`: passed.
- `vp run svelte:check`: passed, 0 errors and 0 warnings.
- `vp build`: passed.
- `vp test`: passed, 29 files and 143 tests.

New or extended test coverage includes:

- Mock ZMK connect imports a ZMK `DeviceProfile` with layers and `keyPositionByKeyId`.
- Locked mock blocks writes until `mockUnlock()`.
- `KC_F -> KC_B` writes `set_layer_binding`, verifies with `get_keymap`, saves with `save_changes`, and advances the clean base.
- Rapid edits debounce to one final ZMK write.
- `save_changes` failure marks `sync-failed` and keeps the local edit dirty.
- Combo, macro, and settings edits are classified rebuild-required and are not written.
- Unknown behavior bindings round-trip as `ZMK_BEHAVIOR(id,p1,p2)`.
- Codec round-trips cover `KC_NO`, `KC_TRNS`, basic `KC_*`, `MO`, `TO`, and `TG`.

## 4c-i regression fix

Root cause: `ZmkLiveSyncEngine.processChanges()` incremented a synthetic `$state` counter on every coordinator pass. The app layout calls `KeyboardLiveSyncEngine.processChanges()` from a `$effect`, so that read/write made the effect self-invalidate continuously and starved editor route effects and lens clicks. `/editor?board=split` stayed on the default Workbench board, and the Lighting lens click never settled.

Fix: removed the synthetic observed-revision state from the ZMK live-sync engine. The coordinator still processes VIA and ZMK changes reactively from the real editor profile and connection state, but it no longer creates a feedback loop on mount or edit. A ZMK live-sync regression test now runs the full coordinator under a Svelte effect and asserts that an explicitly loaded split board and Lighting lens remain intact.
