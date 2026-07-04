# Wave 4b Flash Design

Status: design only. This document does not implement the pipeline.

Wave 4b should split "flash" into two product paths:

1. **Live apply**: write compatible edits into an already-running VIA firmware over HID. No firmware is generated, compiled, or flashed.
2. **Firmware flash**: generate source, build a firmware artifact outside the Cloudflare Worker runtime, then guide the user through bootloader flashing.

The current workbench intentionally disables the firmware route with `firmwareFlowAvailable = false` in `src/routes/(workbench)/+layout.svelte`. The prototype flash overlay in `resources/kbgui-handoff/kbgui/project/artboards-rest.jsx` simulates `building -> flashing -> done`; `docs/redesign/01-screens.md` records the same flow, and `docs/redesign/04-mapping.md` calls out real flash execution as a gap.

## Current Constraints

Cloudflare Workers and Agents are the application control plane, not a firmware build host. They can validate requests, store source bundles in R2, enqueue jobs, call an external compile API, and poll job state, but they should not be expected to run QMK or ZMK Linux toolchains inside the normal Worker runtime. If kbgui owns builds, the build must run in a separate compute surface such as a container, VM, or external build provider.

The existing engine already has the beginning of the live apply path:

- `src/lib/keyboard/transport.ts` connects through WebHID/WebUSB, reads VIA metadata, and implements `writeViaKeycodeEffect`.
- `src/lib/keyboard/via-protocol.ts` encodes VIA reports, including `dynamicKeymapSetKeycode`, macro buffer commands, encoder commands, custom values, and `bootloaderJump`.
- `src/lib/keyboard/schema.ts` defines `DeviceProfile` for QMK and ZMK, including layers, macros, combos, tap dances, key overrides, lighting, and firmware settings.
- `src/lib/keyboard/changes.ts` can diff profile snapshots, but source generation is currently only a selected-key snippet.
- `src/lib/keyboard/flash-validation.ts` currently validates a stub "firmware flow" and is too WebHID-specific for real bootloader flashing.

## Path 1: Live Apply, No Build

Live apply is the common path for QMK VIA-compatible boards when the connected firmware can accept runtime changes. VIA exists specifically so a desktop or browser app can change the keymap/settings stored by compatible firmware over USB without reflashing. QMK also documents that VIA firmware copies the compiled keymap into EEPROM and then uses the EEPROM copy, which is why runtime changes can persist independently of a later source-level `keymap.c` edit.

Applies when all are true:

- `DeviceProfile.firmware === "qmk"`.
- `DeviceProfile.protocol` is `via-v3` or eventually `vial`.
- The board is connected over WebHID and exposes the VIA protocol.
- The VIA definition gives enough matrix information to map a key id to `(layer, row, col)`.
- Every dirty change is live-compatible for that board.

The app should present this as **Apply to device**, not as a firmware build. It should batch eligible changes, write them, read back when the protocol supports it, then clear only the changes that were actually verified.

### Live-Compatible DeviceProfile Changes

| `DeviceProfile` area | Live apply status | Notes |
| --- | --- | --- |
| `layers[*].bindings[keyId].code` | Supported now for encodable QMK keycodes | Current path is `writeViaKeycodeEffect` -> `dynamicKeymapSetKeycode` -> readback. Requires `qmkKeycodeValue(code)` to return a 16-bit VIA/QMK code. This covers ordinary keycodes, many modifier/layer forms, and direct keycodes such as `QK_MACRO_0` when the macro slot already exists. |
| Hold-tap/layer-tap bindings represented as one QMK keycode | Supported if encodable | If the UI stores the binding as a code that `qmkKeycodeValue` can encode, it can be written as a keymap cell. Separate behavior-object edits are not live-supported today. |
| Existing compiled macro slot binding | Supported if the key binding is `QK_MACRO_N` | This only binds an existing macro slot. It does not create or edit the macro contents. |
| VIA dynamic macro contents | Possible, not implemented | `via-protocol.ts` includes macro buffer commands, and `transport.ts` reads macro count. kbgui does not yet write macro buffers or serialize the current macro model to VIA's buffer format. |
| Encoder remaps | Possible, not implemented | VIA v3 has encoder support on some boards and `via-protocol.ts` has `dynamicKeymapSetEncoder`. kbgui needs definition support and write/readback plumbing before treating this as live. |
| Global lighting mode, hue, saturation, brightness, speed | Possible per-board, not implemented | VIA custom UI/built-in menus can expose QMK backlight, RGB Light, and RGB Matrix values through `customSetValue`, `customGetValue`, and `customSave`. `via-definition.ts` currently detects lighting capability but does not preserve the menu channel/value metadata needed to map `LightingProfile` fields safely. |
| Per-key lighting | Usually not live in this model | Some firmware can expose custom controls, but kbgui has no generic LED index/value model from VIA definitions today. Treat as rebuild/manual source unless a board-specific custom writer is added. |

### Changes That Require A Firmware Build

These changes are not safe to call "live apply" in Wave 4b:

- New or edited QMK combo definitions in `combos`.
- New or edited QMK tap dance definitions in `tapDances`. A `TD(n)` binding may be writable in principle, but the current encoder does not encode `TD(n)` strings, and the tap dance action itself is compiled firmware.
- `keyOverrides`.
- Macro definition changes until VIA macro-buffer serialization is implemented and verified.
- Firmware settings such as `tappingTerm`, `debounce`, `permissiveHold`, `retroTapping`, `nkro`, and `splitTransport`, unless a specific firmware exposes a dynamic VIA setting and the VIA definition describes it.
- Layer count, matrix, physical layout, vendor/product ids, protocol, firmware family, bootloader metadata, or LED topology.
- Any ZMK profile in Wave 4b. ZMK Studio runtime updates belong in Wave 4c.
- Non-VIA QMK boards.

This split matters in the UI. A dirty profile may contain both live-compatible and rebuild-required changes. kbgui should either:

1. Apply only the live-compatible subset and leave the rest dirty with a clear rebuild notice, or
2. Block the live apply button until the user acknowledges that only a subset will be applied.

The first option is more useful, but only if the dirty-state model can mark individual changes as saved.

## Path 2: Firmware Flash

Firmware flash applies when the user needs compiled firmware changes:

- QMK features that are defined in source, such as combos, tap dances, key overrides, custom behaviors, custom RGB logic, and feature flags.
- Changing firmware-level settings and defaults.
- Non-VIA boards.
- ZMK boards before ZMK Studio support.
- Any case where the target board's VIA firmware cannot encode or persist the requested edit.

The real pipeline is:

1. **Generate** source from `DeviceProfile`.
2. **Build** remotely or externally.
3. **Fetch** the artifact and verify expected type/hash/metadata.
4. **Enter bootloader** using VIA `bootloaderJump` where safe, or manual instructions.
5. **Flash** through the browser when supported, or guide a manual copy/tool flow.
6. **Verify** by reconnecting and checking the expected device/protocol, and by VIA readback when available.

## Source Generation

### QMK Generation

QMK has two practical source targets:

1. **QMK JSON / Configurator format** for simple keymaps.
2. **Full keymap source** (`keymap.c`, plus optional `rules.mk` and `config.h`) for advanced features.

The QMK compile API and `qmk compile` both accept Configurator-style JSON. QMK documents the JSON shape with `keyboard`, `keymap`, `layout`, and `layers`, and the CLI can compile that export directly. The public QMK API accepts a JSON payload at `/v1/compile`, returns a job id, and exposes status plus artifact URLs through `/v1/compile/<job_id>`.

Current feasible generation from `DeviceProfile`:

- Layer keymaps from `layers[*].bindings` when every binding can be converted to a QMK keycode name/value.
- Matrix order from `KeyboardKey.row` and `KeyboardKey.col`.
- Macro key bindings to `QK_MACRO_N` for existing slots.
- Basic firmware setting comments or draft `config.h` values.
- A source bundle for user inspection/download, even before kbgui can compile it.

Required model/catalog gaps before reliable QMK builds:

- QMK keyboard path, for example `vendor/board`.
- QMK layout macro name, for example `LAYOUT`, `LAYOUT_65_ansi`, or a board-specific macro.
- Stable QMK key order for the layout macro. Matrix order is not always the same as layout macro order.
- Bootloader type and expected artifact extension (`.hex`, `.bin`, `.uf2`).
- MCU/flash-size metadata if kbgui wants to preflight artifact size.
- Whether the target firmware already enables VIA, dynamic keymap, dynamic macros, combos, tap dance, RGB Matrix, Vial, or other feature flags.
- Macro serialization details beyond binding to `QK_MACRO_N`.
- QMK C generation for combos, tap dances, key overrides, custom behavior code, and custom RGB code.
- A safe policy for user-authored C snippets, if the app ever supports them.

Recommendation for Wave 4b: generate QMK JSON first for simple layer-only builds, and generate a full source zip as a transparent artifact for anything advanced. Do not promise one-click remote build for advanced QMK until `keymap.c` generation and board metadata are stable.

### ZMK Generation

ZMK source generation targets:

- `<keyboard>.keymap`, using the `zmk,keymap` devicetree node with one child per layer and `bindings` in scan order.
- `<keyboard>.conf`, using Kconfig settings.
- `build.yaml` for board/shield combinations in a `zmk-config` repository.

ZMK can represent combos, macros, tap dances, hold-taps, Bluetooth behaviors, and settings declaratively, but the current kbgui model is still QMK/VIA-shaped in several places.

Current feasible generation:

- Basic layer bindings once each `KeyBinding.code` has a ZMK behavior equivalent.
- Combos into ZMK combo nodes with `timeout-ms`, `key-positions`, `bindings`, and optional layer constraints.
- Macro and tap-dance source skeletons if the current model is mapped to ZMK behavior nodes.
- `.conf` values for supported settings.

Required gaps:

- Board/shield identity and side selection for split keyboards.
- Physical key position order for ZMK, which may not match QMK matrix order.
- Behavior mapping from QMK keycodes to ZMK behavior labels such as `&kp`, `&mt`, `&lt`, `&bt`, and custom behavior nodes.
- ZMK-specific Bluetooth, output, sleep, and split settings.
- Artifact expectations for each board, especially central/peripheral builds.

Recommendation: keep ZMK source generation behind a Wave 4c flag. Wave 4b should not block the QMK live-apply value on ZMK build support.

## Build Backend Options

| Option | Where it runs | User/app provides | Cost and ops | Latency | Fit |
| --- | --- | --- | --- | --- | --- |
| QMK compile API | `api.qmk.fm` public infrastructure | kbgui sends Configurator JSON and polls job status | Lowest app-owned infra. Depends on public service availability, rate limits, and upstream keyboard support. Source leaves kbgui. | Usually queue plus compile time; UI should poll every few seconds. | Best first remote build for simple QMK JSON. Not enough for forks, custom `keymap.c`, or private boards. |
| Self-hosted QMK CLI service | Container/VM outside normal Workers. Could be Cloudflare Containers plus Queues/R2, or another VM/container host. | App owner provides paid compute, QMK checkout/cache, container image, job queue, artifact storage, logs, cleanup, abuse controls. | Highest control and highest operational burden. Supports private forks and full source bundles. | Seconds to minutes depending cache and queue. | Correct long-term backend for advanced QMK if kbgui wants one-click build. Should be its own effort. |
| ZMK GitHub Actions | User-owned or app-managed GitHub repo using ZMK's standard workflow | GitHub account/auth, repo, workflow, board/shield config, artifact permissions. kbgui commits or dispatches and polls/webhooks. | GitHub handles build runners. User or app pays with Actions minutes/account policy. | Usually minutes. | Best aligned with ZMK's normal user flow, but belongs with Wave 4c. |

### Recommended Backend Shape

For Wave 4b, do not build a self-hosted compile service yet. Ship live VIA apply and source/artifact download flows first. If a remote build slice is approved, add QMK compile API support only for plain QMK JSON builds.

Longer-term backend:

1. SvelteKit/Worker endpoint `POST /api/firmware/jobs` validates a frozen `DeviceProfile`, classifies the build type, and stores a source bundle in R2.
2. For QMK API jobs, the Worker posts the JSON to `api.qmk.fm`, stores the external job id, and exposes a kbgui job id.
3. For self-hosted QMK, the Worker enqueues a Cloudflare Queue message. A container/VM consumes the job, runs `qmk compile`, streams logs, and uploads artifacts to R2.
4. For ZMK, the Worker uses a GitHub App/OAuth token to create/update a branch or trigger a workflow, then receives a webhook or polls the Actions run.
5. The UI polls `GET /api/firmware/jobs/:id` for state, logs, artifact metadata, and download URLs.

R2 should hold source bundles, logs, and artifacts with expiry. The job record should include source hash, target keyboard id, artifact hash, artifact extension, backend, status, and failure reason.

## Flash Mechanisms

| Mechanism | Target bootloaders | Browser support | Recommendation |
| --- | --- | --- | --- |
| UF2 copy | RP2040 BOOTSEL, TinyUF2, many nRF/ZMK boards using UF2-style mass storage | Download works everywhere. File System Access directory writes require feature detection, secure context, and user permission. | Implement first. It is the safest browser-assisted flash path and fits many modern boards. Always keep manual copy fallback. |
| WebUSB DFU | USB DFU 1.1 / DfuSe devices such as many STM32/APM32 QMK boards | WebUSB is Chromium-family and not Baseline. User must grant device access. | Implement after UF2, with board allowlists and artifact validation. Use WebDFU-style transfer logic. |
| Web Serial | Caterina/AVR109 Pro Micro-class boards and other serial bootloaders | Web Serial is Chromium-family and permission-gated. Caterina has a short bootloader window. | Later. Useful, but higher UX risk because timing and protocol handling are finicky. |
| WebHID bootloader-specific flows | Some HID bootloaders | WebHID is also limited/experimental. | Defer unless a priority board requires it. |

The first flashing slice should be UF2-oriented:

- If kbgui built or was given a `.uf2`, show bootloader instructions for the board.
- Prefer "download artifact" plus manual copy.
- Where File System Access is available, optionally let the user choose the mounted bootloader volume and copy the `.uf2`.
- After copy, wait for the normal keyboard to reconnect and verify VIA identity when possible.

For WebUSB DFU, kbgui should require a known bootloader profile and expected artifact extension. The browser should not offer arbitrary USB flashing against an arbitrary `.bin`. The transfer should validate target identity, artifact hash, and final status, then wait for reconnect.

For Web Serial Caterina, kbgui should assume the user may need to double-tap reset and choose a port quickly. This is not the first choice for a polished Wave 4b release.

## FlashOverlay Mapping

The prototype overlay in `flash.png` has three visible steps: compile, write, done, plus a command log. The real overlay should keep that mental model but map it to concrete phases.

### Firmware Build + Flash Phases

| Phase | UI step | Log examples | Failure states |
| --- | --- | --- | --- |
| `validate` | Preparing | Profile snapshot, target board, backend choice | Unsupported change set, missing board metadata, unsupported browser |
| `generate` | Generating source | Generated `keymap.json`, `keymap.c`, `.conf`, source hash | Unencodable binding, missing layout macro, unsupported ZMK behavior |
| `build.remote.queued` / `build.remote.running` | Building firmware | QMK API job id, queue position, compiler stdout | Build failed, backend unavailable, timeout, quota/rate limit |
| `fetch_artifact` | Fetching artifact | Artifact URL, size, hash, extension | Missing artifact, wrong extension, hash mismatch |
| `enter_bootloader` | Waiting for bootloader | VIA bootloader jump sent, or manual reset instructions | User canceled, bootloader not detected, wrong device |
| `flash` | Writing to device | UF2 copied, DFU blocks written, serial pages written | Permission denied, transfer failed, disconnected |
| `verify` | Verifying | Reconnected VID/PID, VIA protocol read, optional keymap readback | Device did not return, wrong target, readback mismatch |
| `done` | Done | Final artifact and source bundle links | None |

The command log should be copyable and should include enough detail to reproduce the build outside kbgui, for example `qmk compile <keymap.json>` or the GitHub Actions run URL. For public or shared support logs, redact user tokens and private repository URLs.

### Live Apply Overlay

Live apply should not pretend to compile firmware. It can reuse the same overlay component with a shorter phase list:

1. Prepare writes.
2. Write VIA packets.
3. Verify readback.
4. Done.

Failures should identify the first unsupported dirty change and whether any earlier writes succeeded. If partial writes are possible, the UI must keep unapplied changes dirty.

## First Shippable Slice

The first valuable Wave 4b slice should avoid heavy build infrastructure:

1. **Make live VIA apply the primary device action for QMK VIA boards.**
   - Batch dirty key binding changes that `qmkKeycodeValue` can encode.
   - Use the existing WebHID VIA write/readback path.
   - Report unsupported dirty changes as "requires firmware rebuild".
   - Do not label this as compile/flash.

2. **Add source bundle generation and download.**
   - Generate QMK JSON for simple keymaps when board metadata exists.
   - Generate a full source skeleton zip for advanced features, even if manual editing is still needed.
   - Show the exact local command path: `qmk compile <keymap.json>` or `qmk compile -kb <keyboard> -km <keymap>`.
   - This gives users a real migration path before kbgui owns build compute.

3. **Add UF2 guided flash.**
   - Accept a built `.uf2` artifact from kbgui or from the user.
   - Guide the user into bootloader mode.
   - Offer File System Access copy when available, with download/manual copy fallback.
   - Verify by reconnecting to the normal VIA device.

4. **Defer remote compile service.**
   - QMK compile API can be an incremental remote build for simple JSON only.
   - Self-hosted `qmk_cli` builds need a separate infra/security/design pass.
   - ZMK GitHub Actions belongs with the Wave 4c ZMK/BLE work.

## External References

- QMK API docs: `https://docs.qmk.fm/api_docs`
- QMK Configurator architecture: `https://docs.qmk.fm/configurator_architecture`
- QMK CLI commands: `https://docs.qmk.fm/cli_commands`
- QMK Configurator default keymaps: `https://docs.qmk.fm/configurator_default_keymaps`
- QMK keymaps: `https://docs.qmk.fm/keymap`
- QMK macros: `https://docs.qmk.fm/feature_macros`
- QMK combos: `https://docs.qmk.fm/features/combo`
- QMK tap dance: `https://docs.qmk.fm/features/tap_dance`
- QMK tap-hold settings: `https://docs.qmk.fm/tap_hold`
- QMK flashing: `https://docs.qmk.fm/flashing`
- VIA QMK configuration: `https://caniusevia.com/docs/configuring_qmk/`
- VIA custom UI: `https://caniusevia.com/docs/custom_ui/`
- Keebio VIA technical notes: `https://docs.keeb.io/via-technical`
- ZMK keymaps: `https://zmk.dev/docs/keymaps`
- ZMK config: `https://zmk.dev/docs/config`
- ZMK customization and GitHub Actions flow: `https://zmk.dev/docs/customization`
- ZMK user setup: `https://zmk.dev/docs/user-setup`
- ZMK keymap config: `https://zmk.dev/docs/config/keymap`
- ZMK combos: `https://zmk.dev/docs/keymaps/combos`
- Cloudflare Queues: `https://developers.cloudflare.com/queues/`
- Cloudflare R2: `https://developers.cloudflare.com/r2/`
- Cloudflare Containers: `https://developers.cloudflare.com/containers/`
- Cloudflare Workers Node compatibility: `https://developers.cloudflare.com/workers/runtime-apis/nodejs/`
- WebDFU project: `https://devanlai.github.io/projects/webdfu/`
- MDN WebHID API: `https://developer.mozilla.org/en-US/docs/Web/API/WebHID_API`
- MDN WebUSB API: `https://developer.mozilla.org/en-US/docs/Web/API/WebUSB_API`
- MDN Web Serial API: `https://developer.mozilla.org/en-US/docs/Web/API/Web_Serial_API`
- MDN File System API: `https://developer.mozilla.org/en-US/docs/Web/API/File_System_API`

## Decisions For Sign-Off

1. **Build backend choice.** Choose one first backend: QMK compile API for simple public QMK JSON, self-hosted `qmk_cli` for full QMK control, or GitHub Actions for ZMK. Recommendation: no backend in the first slice; then QMK compile API for simple QMK JSON; defer self-hosted QMK and ZMK Actions.
2. **Infrastructure/account allowance.** Confirm whether kbgui may send source to `api.qmk.fm`, whether the project has paid Cloudflare Containers/Queues/R2 or another VM for self-hosted builds, and whether GitHub accounts/repos/actions are acceptable for ZMK.
3. **Flash method priority.** Choose UF2, WebUSB DFU, or Web Serial as the first browser flashing target. Recommendation: UF2 first, WebUSB DFU second, Web Serial later.
4. **Target priority.** Confirm that QMK VIA boards are the Wave 4b priority, with ZMK/BLE deferred to Wave 4c and non-VIA boards source-only until build/flash support is explicit.
5. **Product language.** Decide whether live VIA apply is the common-case "flash" replacement. Recommendation: yes, but label it **Apply to device** and reserve **Build firmware** / **Flash firmware** for rebuild-required changes.
6. **Dirty-state policy.** Decide whether partial live apply is allowed. Recommendation: allow it only if kbgui can clear verified per-change writes and leave rebuild-required changes dirty.
7. **Verification requirement.** Decide what is required before marking success. Recommendation: VIA write readback for live apply; reconnect and identity/protocol check after firmware flash.
