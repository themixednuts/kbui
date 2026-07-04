# Firmware Source Generation + Download

Status: implemented for flash-design phase 2. This wave generates source and downloads a zip. It does not compile in the browser, call a remote build service, or flash a device.

## Generator Surface

`src/lib/keyboard/firmware-source.ts` is a pure generator module. It has no clock dependency; source hashes are deterministic over generated file path + content.

- `generateQmkKeymapJson(profile)` emits QMK Configurator-style `qmk/keymap.json` with `keyboard`, `keymap`, `layout`, and ordered `layers`.
- `generateQmkSourceBundle(profile)` emits `keymap.c`, `config.h`, and `rules.mk` under `qmk/keymaps/<keymap>/`.
- `generateZmkSource(profile)` emits `zmk/config/<kb>.keymap`, `zmk/config/<kb>.conf`, and `zmk/build.yaml`.
- `generateFirmwareArtifacts(profile)` selects the target from `profile.firmware`, returns the file set, diagnostics, content hash, and the manual local build command.

Optional future metadata is read when present, such as `qmk.keyboard`, `qmk.layout`, `qmk.keyOrder`, `zmk.board`, `zmk.shield`, and ZMK key-position order. Current sample profiles do not carry that metadata, so the generator flags it and uses placeholders/fallback ordering instead of guessing.

## Target Outputs

QMK simple/layer-only profiles get `keymap.json` suitable for `qmk compile qmk/keymap.json` when board metadata and keycodes are representable.

QMK advanced profiles also get full source:

- `keymap.c`: layer arrays, macros, combos, tap dances, key overrides.
- `config.h`: tapping term, debounce, VIA layer count, hold-tap flags, split/lighting TODOs.
- `rules.mk`: feature flags such as `VIA_ENABLE`, `COMBO_ENABLE`, `TAP_DANCE_ENABLE`, `KEY_OVERRIDE_ENABLE`, and `NKRO_ENABLE`.
- Build command: `qmk compile -kb <kb> -km <km>` with placeholders if keyboard metadata is missing.

ZMK profiles get:

- `.keymap`: `zmk,keymap` layers, known QMK-to-ZMK behavior mappings, combo nodes, macro/tap-dance skeletons.
- `.conf`: keyboard name, Studio/BLE/NKRO settings where applicable, setting TODOs where ZMK behavior scope matters.
- `build.yaml`: board/shield skeleton.
- Build command: `west build -b <board> -- -DSHIELD=<shield>` with placeholders if metadata is missing.

## Representable Matrix

| Profile area | Generated | Flagged |
| --- | --- | --- |
| Layer keymap cells | QMK keycode names; ZMK `&kp`, `&mo`, `&to`, `&tog`, `&lt`, `&mt` subset | Unknown/unmapped keycodes become `KC_NO` or `&none` with `UNSUPPORTED` diagnostics |
| QMK macros | `process_record_user` cases for `QK_MACRO_n` | Sequence timing and modifier hold/release semantics |
| QMK combos | `combo_t` skeleton from base-layer keycodes | Layer-scoped combo policy needs manual `combo_should_trigger` code |
| QMK tap dances | `ACTION_TAP_DANCE_DOUBLE` skeleton | Hold behavior needs custom handlers |
| QMK key overrides | `ko_make_basic(...)` when modifiers map to QMK masks | Unsupported modifier shapes |
| QMK settings | `TAPPING_TERM`, `DEBOUNCE`, hold-tap flags, VIA layer count, NKRO rules | Board-specific split transport and RGB feature selection |
| ZMK combos | Combo nodes with key positions and behavior binding | Missing physical position order, unmapped binding behavior |
| ZMK macros/tap dances | Behavior-node skeletons | Timing, hold behavior, and custom behavior semantics |
| Board metadata | Consumed when explicit metadata exists | QMK keyboard path, layout macro, key order; ZMK board, shield, key position order |

## FlashOverlay UX

`src/lib/components/flash/FlashOverlay.svelte` implements the source-only modal:

1. Validate profile snapshot, target, and rebuild-required changes.
2. Generate source files, diagnostics, and content hash.
3. Download the source zip and copy the command log.

The zip contains the generated source files, `COMMANDS.txt`, and `kbgui-diagnostics.json`. The command log lists rebuild-required changes, generated files, diagnostics, source hash, and the manual build command.

The trigger is in `src/routes/(app)/editor/+page.svelte`: the coral **Build firmware** action appears only in the rebuild-required notice from the active live-sync classifier. VIA live-writable edits still do not show a firmware build/flash button.

## Verification

- `vp install`: completed before implementation.
- `vp check`: pass; all 164 files formatted, no warnings/lint/type errors across 244 files.
- `vp run svelte:check`: pass; 0 errors, 0 warnings.
- `vp test`: pass; 31 files, 154 tests.
- `vp build`: pass.
- `vp run capture`: pass; 8/8 screenshots.

## Deferred

In-browser compilation/WASM build remains a later wave. UF2/device flashing and post-flash verification also remain later waves. This phase intentionally stops at source generation, zip download, and manual local build commands.
