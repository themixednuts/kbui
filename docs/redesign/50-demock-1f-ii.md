# De-Mock 1f-ii: Local-Only Live-Sync Honesty

## Goal

When a real device is connected and an edit cannot be written through the current live-sync path, the editor must say so directly. This wave does not expand hardware coverage; it prevents the UI from implying unsupported edits reached the device.

Reference findings: `docs/redesign/43-demock-audit.md` findings 38, 39, and 40.

## Classification Model

VIA and ZMK live classifiers now emit a typed outcome on every classified change:

- `outcome.status: "live"` with `live: true` for real live-writable key binding writes.
- `outcome.status: "local-only"` with `live: false`, `category`, and `reason` for valid edits that remain local because the live-sync coverage does not write them.
- `outcome.status: "rebuild-required"` with `live: false` for edits that need generated firmware/source.
- `outcome.status: "invalid"` with `live: false` for incomplete or invalid drafts.

The local-only categories are grouped for UI display as `lighting`, `behaviors`, `bindings`, and `metadata`.

## Local-Only Reasons

- VIA lighting: `VIA lighting is not writable over this transport.`
- VIA unencodable binding codes: `<code> cannot be encoded as a VIA keycode, so it was applied locally only.`
- Binding notes: `Binding notes are local profile metadata and are not written to the device.`
- ZMK unknown behavior bindings: `ZMK behavior <id> is not live-editable yet.`
- ZMK unsupported codec bindings: `ZMK binding <code> is not supported by the live-edit codec yet.`
- ZMK lighting: `ZMK lighting is not written live.`

## UI Surface

The editor live-sync notice area now shows connected local-only coverage gaps as:

`N changes applied locally - not written to device: <categories>`

The notice lists grouped category/reason rows, for example `lighting VIA lighting is not writable over this transport.` or `behaviors ZMK binding CUSTOM_SAFE_RANGE is not supported by the live-edit codec yet.`

The local-only notice is intentionally gated on `shell.connected`; no-device local editing is still local by definition. Invalid drafts now use an `Invalid` sync chip state instead of being folded into `Local only`.

## Live vs Local vs Deferred

- Live-written now: VIA encodable per-key binding code writes through dynamic keymap write/readback; ZMK encodable per-key binding code writes through `set_layer_binding`, readback verification, and `save_changes`.
- Local-only coverage gaps now surfaced: VIA lighting, VIA unencodable binding codes, binding notes, ZMK unknown behavior bindings, ZMK unsupported codec bindings, and ZMK lighting.
- Deferred/rebuild-required: combos, macros, tap dances, key overrides, settings, layer count, matrix, layout, and firmware metadata changes.
- Invalid/incomplete: incomplete logic bindings, missing targets, missing ZMK layer/key-position mappings, protocol limit failures.

## Tests

Added or extended coverage in:

- `src/lib/keyboard/via-live.test.ts`
- `src/lib/keyboard/zmk-live.test.ts`
- `src/lib/app/via-live-sync.test.ts`
- `src/lib/app/zmk-live-sync.test.ts`

Coverage now asserts local-only classification, `live: false`, category, reason, absence of live write targets, no fake device writes, grouped local-only summaries, and unchanged real key-binding live writes.

## Verification

- `vp check`: pass; all 177 files formatted; no warnings, lint errors, or type errors in 245 files.
- `vp run svelte:check`: pass; 6002 files, 0 errors, 0 warnings.
- `vp build`: pass.
- `vp test`: pass; 37 files, 194 tests.
- `vp run capture`: pass; 8/8 captures.
