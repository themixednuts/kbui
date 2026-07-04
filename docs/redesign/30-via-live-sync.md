# Wave 4d VIA Live Sync Implementation

Status: implemented. Verification is mock-driven; no hardware board was used.

## Change Classifier

The pure classifier lives in `src/lib/keyboard/via-live.ts`.

It classifies each base-vs-draft `DeviceProfile` change as:

- `liveViaWritable`
- `firmwareRebuildRequired`
- `sourceOnlyUnsupported`
- `invalid`

Live-writable changes are only per-key binding `code` edits on VIA profiles where:

- the target layer and key still exist
- the key has valid VIA layer/row/col coordinates
- `qmkKeycodeValue(code)` returns a 16-bit VIA keycode

The classifier attaches the exact live-write target for these edits: layer id/index, key id, row, col, keycode, and a binding signature used by the live-sync engine to avoid writing stale intermediate values.

Firmware rebuild required:

- combo definitions
- tap-dance definitions
- macro definitions
- key override definitions
- firmware behavior settings
- matrix/layout/layer-count/device metadata changes
- binding metadata that changes compiled behavior rather than the VIA keycode slot

Source-only unsupported:

- valid but unencodable keycodes, such as custom keycodes outside the current encoder
- lighting changes, because generic VIA lighting writes remain board-specific
- local binding notes

Invalid:

- malformed binding change ids
- missing layer/key targets
- VIA coordinate/keycode values outside protocol limits

## Live Sync Engine

The Svelte 5 runes engine lives in `src/lib/app/via-live-sync.svelte.ts` and is created once in the app shell. It uses the live `ConnectionState` captured by the Connect flow and exposed through `ShellStore`.

Behavior:

- Watches editor base/draft changes through the classifier.
- Ignores non-live classifications for device writes.
- Debounces writes per `(layer,row,col)` lane.
- Serializes all writes through one device-level promise queue.
- Re-checks the current draft binding signature before writing, so queued stale values are skipped.
- Encodes the settled binding with `qmkKeycodeValue`.
- Writes through `writeViaKeycode`, which uses `writeViaKeycodeEffect` and verifies readback.
- Patches the stored connection keymap after successful readback.
- Advances the editor clean base for the synced key only with `markBindingSyncedToBase`.
- Preserves unrelated dirty rebuild-required changes.
- On failure, preserves the local edit, marks the lane `sync-failed`, and waits for explicit retry or a new connection revision.

The engine exposes:

- overall status: disconnected, connecting, connected, syncing, synced, local-only, rebuild-required, sync-failed
- classified change lists
- failed lane details
- `retryFailed()`
- `pause()` / `resume()` methods, although pause/resume controls are not surfaced in this slice

## Editor And Shell UX

There is no Apply, Flash, or Build action for VIA keymap edits in the app editor.

Shell:

- The appbar shows a live-sync chip next to device connection state.
- The shell stores the actual live `ConnectionState`, not only display metadata.
- The Connect screen includes a disconnect control for connected devices.

Editor:

- The toolbar shows the current live-sync state.
- Failed writes show a retry action.
- Rebuild-required changes show a notice listing affected change paths.
- Local-only/source-unsupported changes show a local-only notice.
- Invalid changes show a validation notice.

Disconnected behavior:

- Edits remain local.
- No VIA write is attempted unless the shell has a connected WebHID VIA connection.

## Mock-Driven Test Evidence

Added tests:

- `src/lib/keyboard/via-live.test.ts`
  - encodable key binding code edit -> `liveViaWritable`
  - unencodable custom keycode -> `sourceOnlyUnsupported`
  - combo/macro/tap-dance/key-override/settings/layer-count edits -> `firmwareRebuildRequired`
  - binding notes -> local/source-only unsupported

- `src/lib/app/via-live-sync.test.ts`
  - mock VIA connect + editor keycode edit writes `dynamicKeymapSetKeycode`, readback verifies, clean base advances for that key
  - rebuild-required combo edit is not written, while a separate live keymap edit still syncs
  - readback mismatch preserves the local edit, marks `sync-failed`, and retry succeeds
  - rapid edits on one lane debounce down to one settled write

Verification run:

- `vp check` passed
- `vp run svelte:check` passed with 0 errors / 0 warnings
- `vp build` passed
- `vp test` passed: 26 files, 131 tests

Still needs a real board later:

- browser permission and reconnect event behavior
- board-specific VIA timing and report quirks
- EEPROM persistence confirmation across unplug/replug
- real device disconnect while writes are queued
- boards with unusual matrix definitions or layer limits
