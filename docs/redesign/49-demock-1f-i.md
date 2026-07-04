# De-Mock 1f-i: Honest Generated Firmware Source

Status: implemented.

Scope: findings 33, 34, 35, 36, and 37 from `docs/redesign/43-demock-audit.md`.

## Diagnostics Model

Generated firmware artifacts now carry severity-bearing diagnostics through the existing `FirmwareDiagnostic[]` channel:

- `error`: build-critical missing metadata. These diagnostics make `FirmwareArtifacts.buildReady` and `summary.buildReady` false.
- `warning`: incomplete generated coverage that falls back to safe source output, TODO comments, or board-specific manual review.
- `info`: retained for existing non-blocking metadata notes outside this wave.

Each new diagnostic names a concrete `path` or `file` such as `metadata.qmk.keyboard`, `metadata.zmk.shield`, `settings.splitTransport`, `settings.tappingTerm`, `lighting`, or `combos.<id>.layerIds`.

## Missing Metadata Is Explicit

QMK source export no longer emits plausible build-critical placeholders when board metadata is missing:

- Missing keyboard path records `qmk.metadata.keyboard_missing` as an `error`.
- Missing layout macro records `qmk.metadata.layout_missing` as an `error`.
- `keymap.json` uses explicit required markers:
  - `<REQUIRED: qmk keyboard path>`
  - `<REQUIRED: qmk layout macro>`
- `keymap.c` uses `KBGUI_REQUIRED_QMK_LAYOUT_MACRO` plus a required-input comment.
- The command log/build command uses `<REQUIRED: qmk keyboard path>`, not `<qmk-keyboard>`.

ZMK source export now treats both board and shield identity as build-critical:

- Missing board records `zmk.metadata.board_missing` as an `error`.
- Missing shield records `zmk.metadata.shield_missing` as an `error`.
- `build.yaml` includes `# REQUIRED` comments and quoted required markers:
  - `<REQUIRED: zmk board>`
  - `<REQUIRED: zmk shield>`
- The command log/build command uses the same explicit required markers, not `<zmk-board>` or `<zmk-shield>`.

## Visible Export UI

`FlashOverlay.svelte` now surfaces source diagnostics before the source zip and flash controls:

- Error banner: `Not build-ready - missing: ...`
- Warning banner: `Incomplete coverage - review before flashing: ...`
- The source summary row includes `Source status` as `build-ready` or `not build-ready`.
- The downloaded `kbgui-diagnostics.json` includes `buildReady`, `summary`, and the full diagnostics list.
- Browser build affordances are gated by `artifacts.buildReady`; errored generated source cannot be presented as browser-buildable.
- The command log records `source-status` and a note when required metadata markers must be resolved first.

## Unsupported Keycodes

Unsupported generated key fallbacks are now warning diagnostics rather than silent source comments:

- QMK unknown keycodes emit `KC_NO /* UNSUPPORTED: ... */` and `qmk.keycode.unsupported` with severity `warning`.
- ZMK unknown keycodes emit `&none /* UNSUPPORTED: ... */` and `zmk.keycode.unsupported` with severity `warning`.
- Diagnostics include the original keycode, path, and emitted fallback.

## Warning Coverage Added

Visible warning diagnostics now cover the user-downloadable TODO/fallback areas from the audit:

- QMK combo layer scope: `qmk.combos.layer_scope`.
- QMK split transport: `qmk.settings.split_transport`.
- QMK lighting config/rules ambiguity: `qmk.lighting.unsupported` and `qmk.rules.lighting_feature_unknown`.
- ZMK serial split transport: `zmk.settings.serial_split_transport`.
- ZMK behavior-specific tapping term gap: `zmk.settings.tapping_term_scope`.

## Honest Now vs Deferred

Honest now:

- Generated source with missing QMK or ZMK build identity is marked not build-ready.
- Required metadata is represented as explicit required-input markers, not real-looking placeholder values.
- Warning-only gaps are visible in the overlay, command log, diagnostics JSON, and tests.
- Browser builds remain unavailable unless the future manifest/toolchain path exists and source has no error diagnostics.

Deferred to feature #2 / `docs/redesign/42-wasm-build-real.md`:

- Real board metadata source and automatic QMK keyboard/layout resolution.
- Real ZMK board/shield resolution.
- Complete board-specific combo policy, split transport, and lighting codegen.
- A GitHub Actions produced object-bundle/build service that can turn generated source into a real firmware artifact.

## Tests

Added and updated `src/lib/keyboard/firmware-source.test.ts` coverage for:

- Error diagnostics on missing QMK and ZMK build-critical metadata.
- Explicit required markers instead of fake build targets.
- Warning diagnostics for QMK combo layer scope, split transport, lighting, and unsupported key fallback.
- Warning diagnostics for ZMK unsupported keys, serial split transport, and tapping term gaps.
- `buildReady === false` when error diagnostics exist, and `buildReady === true` for warning-only generated source.

## Verification

Ports 5173, 5174, and 4173 were checked/killed before build and before capture; no listeners were present.

Commands run:

- `vp install`: completed.
- `vp test src/lib/keyboard/firmware-source.test.ts`: 1 file passed, 9 tests passed.
- `vp check --fix`: formatting applied, no lint/type errors.
- `vp run svelte:check`: 0 errors, 0 warnings.
- `vp check`: all 176 files formatted; no warnings, lint errors, or type errors in 244 files.
- `vp test`: 37 files passed, 190 tests passed.
- `vp build`: succeeded.
- `vp run capture`: 8 passed, capture 8/8.
