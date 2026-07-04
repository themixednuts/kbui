# Wave 4b Flash/WASM Research Design

Status: research and design only. This document replaces the remote-build assumptions in `docs/redesign/27-flash-design.md` with the revised product direction: VIA edits apply live to a connected device, while QMK/ZMK firmware changes require a browser-local build path.

## Corrected Firmware Model

There are two different product modes:

1. VIA devices are live-edit devices.
   - When a compatible VIA board is connected, supported edits are written to the board's EEPROM as the user edits.
   - There is no separate "Apply to device", "Flash", or "Build" action for these edits. Continuous live sync is the VIA value proposition.
   - The UI should show connection and sync state, not a call to action to apply changes.

2. QMK/ZMK firmware changes are rebuild changes.
   - Changes that cannot be represented through VIA dynamic keymap/config writes require regenerated firmware source and, eventually, a firmware artifact.
   - Examples: QMK source features such as combos, tap dances, key overrides, feature flags, matrix/layout metadata, and non-VIA boards; ZMK source changes outside ZMK Studio's runtime feature set.

This distinction should drive the editor's change classification. A user should never wonder whether a connected VIA keymap edit is "pending flash". If the device is connected and the edit is live-writable, the system syncs it.

## VIA Live-Apply UX

The Connect flow is the entry point for live apply. The current code already has the core transport pieces:

- `src/lib/keyboard/transport.ts` discovers WebHID/WebUSB devices and includes `writeViaKeycodeEffect`.
- `src/lib/keyboard/via-protocol.ts` contains VIA dynamic keymap, encoder, macro-buffer, custom-value, and `bootloaderJump` commands.
- `src/lib/keyboard/schema.ts` has the `DeviceProfile` shape and VIA/QMK/ZMK firmware fields.
- `src/lib/keyboard/via-definition.ts` imports VIA definitions.
- `src/routes/(app)/connect/+page.svelte` is still a placeholder, so the product needs a real Connect wave before or alongside live apply.

Live VIA UI states should be explicit:

- `Disconnected`: edits are local only; connect a VIA device to sync live-writable edits.
- `Connected`: a VIA device is available and its definition/keymap have been read.
- `Syncing`: one or more live-writable edits are being written and read back.
- `Synced`: live-writable edits match the connected device.
- `Local only`: the current change is valid in the profile but cannot be written through generic VIA.
- `Firmware rebuild required`: the current change needs QMK/ZMK source generation and firmware build.
- `Sync failed`: the last live write failed verification or transport failed; keep the local edit and expose retry/reconnect.

The editor should debounce and serialize writes. The workbench already has the shape of this in its hidden VIA write queue: edits are validated, encoded through `qmkKeycodeValue`, written with `writeViaKeycodeEffect`, read back, and then marked saved to the base profile. That queue should become a visible, user-facing live-sync system instead of a hidden prototype.

Because VIA writes persist to EEPROM, do not write every transient UI state. Use a short debounce and only commit the final value after the user settles on it. Also avoid clearing rebuild-required dirty state just because a separate keymap edit synced live.

## Live-Writable vs Rebuild-Required

The compatibility table from `27-flash-design.md` remains useful, but the action changes from "Apply to device" to continuous live sync.

| `DeviceProfile` change | VIA live-writable? | Notes |
| --- | --- | --- |
| `layers[*].bindings[keyId].code` | Yes, partly implemented | Works when the binding can be encoded as a 16-bit QMK keycode by `qmkKeycodeValue`, then written with VIA `dynamicKeymapSetKeycode` and verified by readback. |
| Basic keycodes, layer keys, mod-tap/layer-tap aliases | Yes, when encodable | These are the best first live-sync surface. |
| Binding to an already compiled macro slot | Yes, limited | A key can point at an existing `QK_MACRO_N` if the encoder supports it, but generic VIA does not create/edit compiled macro source. |
| VIA dynamic macro contents | Possible, not implemented | `via-protocol.ts` includes macro buffer commands, but the product does not yet serialize macro content into VIA's runtime macro storage. |
| Encoder remaps | Possible, not implemented | `via-protocol.ts` includes dynamic encoder get/set commands. Needs definition import and UI mapping. |
| Global lighting settings | Board-specific | VIA custom UI/menu values can expose these, but `via-definition.ts` does not currently preserve enough metadata to make this generic. |
| Per-key lighting | Usually no | Treat as firmware rebuild or board-specific extension unless a concrete VIA writer exists. |

Rebuild-required changes:

- New or edited combo definitions.
- Tap dance definitions. A tap-dance keycode might be bindable if the action already exists in firmware, but the action definition itself is compiled source.
- Key overrides.
- Macro definitions, until VIA dynamic macro serialization is implemented for the subset VIA can support.
- Firmware settings such as tapping term, debounce, permissive hold, retro tapping, NKRO, split transport, feature flags, and board-level options.
- Matrix, layout, VID/PID, bootloader, protocol, LED topology, and layer-count changes.
- Non-VIA QMK boards.
- ZMK source changes, except for the subset ZMK Studio can change at runtime.

## WASM Browser Build Feasibility

The revised requirement is that firmware source never leaves the user's browser. That rules out Cloudflare Workers, `api.qmk.fm`, and self-hosted build services as the product build path. The question is whether the browser can realistically host the embedded build toolchain.

### Existing Browser/WASM Toolchain Building Blocks

There are real WebAssembly compiler building blocks:

- [WASI SDK](https://github.com/WebAssembly/wasi-sdk) packages upstream LLVM/Clang, LLD, and wasi-libc for compiling C/C++ to WebAssembly/WASI. As of July 4, 2026, the latest GitHub release is `wasi-sdk-33`, published April 30, 2026. Its Linux tarballs are about 193 MB compressed, Windows tarballs about 655 MB compressed, and the sysroot package about 124 MB. This is a strong LLVM/WASI distribution, but it is not itself a browser-embedded AVR/ARM firmware compiler.
- [binji/wasm-clang](https://github.com/binji/wasm-clang) demonstrates Clang and LLD running in WebAssembly. Its README describes it as alpha demo software, and the compiled `clang` wasm artifact is about 30 MB. It proves the concept, not a production QMK toolchain.
- [Wasmer's "Run Clang in Your Browser" post](https://wasmer.io/posts/clang-in-browser) shows Clang running from JavaScript in a browser through Wasmer JS SDK. This is promising for browser-hosted compilation, but it targets C-to-wasm demos rather than embedded QMK/ZMK firmware.
- [Emscripten](https://github.com/emscripten-core/emscripten) can port C/C++ tools to WebAssembly using LLVM and Binaryen. It is relevant for porting pieces of a toolchain, not a ready-made embedded GCC replacement.

There is not, from the research pass, a maintained official browser/WASM build of `avr-gcc` or `arm-none-eabi-gcc`.

The official [Arm GNU Toolchain](https://developer.arm.com/downloads/-/gnu-rm) is a native GCC toolchain for Cortex-A, Cortex-M, and Cortex-R targets on Windows/Linux/macOS. The xPack `arm-none-eabi-gcc` release metadata shows compressed archives around 293-335 MB for native desktop platforms. [Microchip's AVR and Arm GCC compiler page](https://www.microchip.com/en-us/tools-resources/develop/microchip-studio/gcc-compilers) likewise documents native AVR/Arm GCC toolchains with compilers, assemblers, linkers, C libraries, and math libraries, not browser builds.

LLVM can target embedded ARM, and Clang/LLD are a plausible base for ARM Cortex-M firmware compilation in a WASM-hosted toolchain. AVR is less comfortable. Clang has AVR support and recognizes MCUs such as `atmega32u4`, but LLVM's own Clang diagnostics still include AVR-specific warnings for missing `avr-libc`, unimplemented standard-library linking support for microcontrollers, and missing interrupt vector/compiler runtime pieces when the runtime is not linked. QMK's AVR ecosystem is built around `avr-gcc`, so replacing it with LLVM is a high-risk compatibility project.

### QMK Prior Art

QMK's documented build flow assumes a local build environment and native tools. The new-user guide runs `qmk setup` and `qmk compile -kb <keyboard> -km default`, producing firmware such as `.hex` and checking firmware size. See [QMK's getting started guide](https://docs.qmk.fm/newbs_getting_started).

QMK Configurator is not browser-local compilation. Its architecture document says the frontend is a static app that sends `keymap.json` compilation requests to the QMK API, polls for status, and downloads the resulting source/binary. See [QMK Configurator architecture](https://docs.qmk.fm/configurator_architecture) and [QMK API docs](https://docs.qmk.fm/api_docs). This is useful prior art for source shape and async UX, but it does not satisfy the revised requirement because source leaves the browser.

QMK `info.json` already exposes important build metadata such as `processor`, `bootloader`, and `build.firmware_format` (`bin`, `hex`, `uf2`). See [QMK's `info.json` reference](https://docs.qmk.fm/reference_info_json). That metadata is useful for selecting an allowed browser build preset and output type.

VIA is also important prior art because it avoids recompilation for keymap edits. The official [VIA QMK configuration docs](https://caniusevia.com/docs/configuring_qmk/) describe EEPROM usage and dynamic keymaps, with dynamic keymaps defaulting to four layers unless configured otherwise. QMK's own FAQ notes that when VIA first runs, it copies the flash keymap into EEPROM and then QMK uses the EEPROM copy. See [QMK FAQ: why VIA keymap does not update after flashing](https://docs.qmk.fm/faq_keymap). This means patching or reflashing a default keymap is not the right live-edit mechanism for VIA boards.

I did not find a production-ready "QMK compile fully in the browser" project during this pass. The existing mainstream answer is server/API compilation or local native compilation.

### ZMK Prior Art

ZMK's normal user workflow is GitHub Actions. The [ZMK user setup docs](https://zmk.dev/docs/user-setup) explain that most users do not install a toolchain; they create a config repo, edit `build.yaml`, `.keymap`, and `.conf`, then push to trigger a build action.

ZMK configuration is explicitly compile-time today. The [ZMK config overview](https://zmk.dev/docs/config) describes Kconfig and Devicetree configuration and says users must build and flash new firmware after making changes. [ZMK keymaps](https://zmk.dev/docs/keymaps) are declarative devicetree files, with dynamic runtime keymap updates handled separately by ZMK Studio.

ZMK Studio is the live-edit counterpart to VIA. Its [feature docs](https://zmk.dev/docs/features/studio) support runtime keymap changes over USB or BLE and web/native clients, but also list limits: Studio can assign predefined/user-defined behaviors, but it cannot define new behaviors and cannot add more layers than the firmware's devicetree keymap contains.

Full ZMK browser compilation is harder than QMK. ZMK sits on Zephyr. Zephyr's [west basics](https://docs.zephyrproject.org/latest/develop/west/basics.html) describe multi-repository workspaces and manifest-driven `west update`; [west build/flash docs](https://docs.zephyrproject.org/latest/develop/west/build-flash-debug.html) build with CMake and Ninja. Porting that whole workflow into a browser is a larger R&D effort than a QMK keymap compile/link slice.

### Browser Storage And Runtime Constraints

Browser storage can support large cached assets, but it is not invisible or free.

- The [Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) gives a private per-origin filesystem, works in workers, and can avoid permission prompts, but it is subject to browser quota and is cleared with site data.
- [MDN's storage quota docs](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) emphasize that quotas and eviction behavior differ by browser and storage mode. Persistent storage can be requested, but the browser remains in control.
- Chrome/V8 has supported WebAssembly memories up to 4 GB in suitable conditions, but that is a ceiling, not a product budget. A usable product still needs predictable behavior on normal laptops, constrained Chromebooks, and browsers with different quotas.

The conclusion is that OPFS makes a cached compiler/object bundle possible, especially from a worker, but a multi-hundred-megabyte toolchain plus source tree is a heavy first-run experience and must be measured.

## Approach Options

### A. Full In-Browser QMK Recompile

This means shipping enough of the QMK source tree, build system, Python/QMK CLI behavior, make/C compiler/linker/binutils, libraries, and board metadata for the browser to run something equivalent to `qmk compile`.

Assessment:

- Technically plausible as a long R&D project for a narrow target set.
- Not near-term shippable as the main Wave 4b feature.
- QMK's GitHub repository size metadata is about 532,566 KB as of July 4, 2026, before considering browser packaging, cache expansion, generated files, and toolchains.
- Native embedded toolchains are large. Current WASI/LLVM distributions are also large, and official embedded GCC browser builds were not found.
- QMK build assumptions include Python, Make, compiler-specific flags, board libraries, generated headers, and post-processing tools.
- AVR is the highest-risk common target because QMK's AVR builds use `avr-gcc` and AVR LLVM compatibility is less proven for this ecosystem.
- ARM/RP2040 is more plausible than AVR with LLVM/LLD, but QMK still expects the established toolchain and build layout.
- ZMK full browser compilation is even larger because it includes Zephyr, west, CMake, Ninja, devicetree, Kconfig, modules, and board overlays.

Verdict: do not block product value on full in-browser recompilation. Treat it as a separate R&D track after a narrower compile/link prototype has real measurements.

### B. Precompiled Board Objects + In-Browser Compile/Link

This means prebuilding each board's fixed firmware objects in CI once, then shipping a signed object bundle to the browser. The browser only compiles the user's generated `keymap.c`/small source files and links them with the precompiled objects into `.hex`, `.bin`, or `.uf2`.

Assessment:

- This is the most realistic browser-WASM path.
- It preserves the revised privacy requirement for user-authored source: the generated keymap/source never leaves the browser.
- It avoids shipping the entire QMK tree and rebuilding all board code on the user's machine.
- It allows a board allowlist instead of pretending every QMK keyboard is supported.
- It still needs a WASM-hosted compiler and linker, object format support, `objcopy`/UF2 conversion, linker scripts, libraries, and exact build metadata.
- Object bundles must be keyed by QMK commit, keyboard path, MCU, compiler family/version, CFLAGS/LDFLAGS, linker script, enabled feature set, and output format.
- Feature flags must be handled conservatively. If a requested change needs a feature that was not compiled into the bundle, the browser cannot "turn it on" at link time.
- Compiled-source features that live entirely in the keymap layer, such as combos/tap dances/key overrides when their QMK features are already enabled in the object bundle, are plausible.
- Mixing GCC-built fixed objects with Clang-built keymap objects may work for plain C ABI on ARM, but it must be proven per target. For AVR, this is much riskier.

Verdict: prototype this first, narrowly. The best initial target is a QMK RP2040 board that outputs UF2. If measurements are acceptable, expand to a small allowlist.

### C. Hex/Binary Patching

This means compiling a base firmware once and patching a known keymap table or config region in the resulting `.hex`/`.bin`/`.uf2`.

Assessment:

- For VIA boards, this is the wrong abstraction. VIA dynamic keymap writes already patch EEPROM live and persistently.
- QMK's VIA behavior means EEPROM can override the flashed default keymap after first run, so patching the firmware image's default keymap may not affect the user's observed layout unless EEPROM is reset.
- For non-VIA boards, a keymap table location is not a stable product contract across compilers, features, link order, PROGMEM placement, and firmware formats.
- Binary patching cannot express source-level features such as combos, tap dances, key overrides, feature flags, or ZMK devicetree/Kconfig.
- It can be useful as a board-specific emergency optimization, not as the main architecture.

Verdict: do not choose binary patching as the general Wave 4b firmware path.

## MCU Target Priority

Ship order should be based on tractability, not board popularity alone.

1. VIA live apply: MCU-independent as long as the board exposes a compatible VIA WebHID interface.
2. QMK RP2040 UF2: best first WASM compile/link target. ARM Cortex-M is more LLVM-friendly than AVR, UF2 is user-friendly, and a manual download/copy flow can ship before WebUSB DFU complexity.
3. QMK STM32/ARM DFU or `.bin`: plausible after RP2040, but flash UX and board-specific bootloader details are more complex.
4. QMK AVR/atmega32u4 `.hex`: common, but browser toolchain risk is higher because `avr-gcc` is the de facto ecosystem toolchain and a maintained browser build was not found.
5. ZMK/nRF: use ZMK Studio live edits and source generation first. Full in-browser Zephyr/ZMK builds should be a later, separate R&D effort.

## Architecture

### Connect Flow

Connect should become a first-class route, not a placeholder. It is prerequisite for:

- VIA live sync.
- Importing the current hardware keymap into `DeviceProfile`.
- Resolving the VIA definition and matrix/layout mapping.
- Entering bootloader when safe through VIA `bootloaderJump`.
- Post-flash verification after the board reconnects.

The flow:

1. User opens Connect.
2. Browser requests WebHID/WebUSB access.
3. Transport reads VIA protocol version, layer count, optional keymap, and device identity.
4. App resolves/imports a VIA definition and creates or updates `DeviceProfile`.
5. Editor enters connected live-sync mode for supported edits.

### Change Classification

Each edit should be classified before it reaches persistence:

- `liveViaWritable`: write automatically if a compatible VIA device is connected.
- `firmwareRebuildRequired`: keep local and show source/build path.
- `sourceOnlyUnsupported`: allow source generation or export, but do not claim browser build support yet.
- `invalid`: reject with validation feedback.

This classification should be per change, not per profile. A profile can have live-synced keymap edits and rebuild-required combo edits at the same time.

### VIA Live Sync Engine

The live-sync engine should:

- Subscribe to editor operations.
- Debounce each key/encoder/value lane.
- Serialize writes per device.
- Encode supported bindings through the QMK keycode encoder.
- Use `writeViaKeycodeEffect` for keymap writes.
- Read back and verify before marking the specific change synced.
- Preserve local state when transport fails.
- Retry only on explicit user action or reconnect after repeated failures.

No user-facing "Apply to device" button should be exposed for generic VIA keymap edits. The controls are connect, disconnect, retry failed sync, and optionally pause live sync.

### Firmware Build Path

For rebuild-required changes, the path is:

1. `DeviceProfile` snapshot.
2. Source generation:
   - QMK `keymap.c`, `config.h`, `rules.mk`, and metadata as needed.
   - QMK Configurator-style `keymap.json` when the change can be represented there.
   - ZMK `.keymap`, `.conf`, and `build.yaml`/shield metadata when applicable.
3. Build:
   - Phase 1: no build, source download only.
   - WASM prototype: precompiled object bundle plus browser compile/link.
4. Artifact:
   - `.uf2` first.
   - `.bin`/DFU and `.hex` later.
5. Flash:
   - UF2 download/manual copy first.
   - WebUSB DFU later for supported bootloaders.
   - Use VIA `bootloaderJump` only when the connected device and bootloader behavior are known.
6. Verify:
   - Reconnect through Connect.
   - Confirm expected device identity/protocol.
   - If the flashed firmware is VIA-enabled, read the live keymap/metadata and warn if EEPROM state overrides flashed defaults.

For VIA-enabled firmware rebuilds, the EEPROM caveat must be explicit. If the goal is to replace the default firmware keymap, the device may continue using its old EEPROM keymap until EEPROM is reset or migrated. The product needs a deliberate "reset VIA EEPROM / restore stock keymap" design before claiming that a flashed default keymap is active.

### WASM Build Runtime

If option B is prototyped, the browser build runtime should use:

- A dedicated Web Worker for compiler/linker execution.
- OPFS for cached toolchain files, object bundles, generated source, temporary objects, and final artifacts.
- A cache key that includes toolchain ID, QMK commit, board ID, feature preset, object bundle hash, and output format.
- A user-visible cache manager because payloads may be large and browser storage can be evicted.
- A manifest per object bundle:
  - QMK commit.
  - Keyboard path.
  - MCU and board family.
  - Compiler family/version.
  - CFLAGS/LDFLAGS/linker script.
  - Enabled QMK features.
  - Object/library hashes.
  - Firmware output format.
  - Maximum flash/RAM budgets when known.

The source generator must check the bundle manifest before enabling a feature. If the bundle lacks `COMBO_ENABLE`, for example, a profile with combos should not be sent to the linker. It should fall back to source download or a different bundle.

## Phasing

### Phase 1: Connect + VIA Live Apply

Ship this first. It has real user value and does not depend on browser compilation.

Scope:

- Build the Connect screen.
- Connect WebHID VIA devices.
- Import current keymap into `DeviceProfile`.
- Turn supported keymap edits into debounced live writes.
- Show connected/syncing/synced/local-only/rebuild-required/error state.
- Remove any VIA "Apply to device" or "Flash" concept from the keymap-edit path.

### Phase 2: Source Generation + Download

Give rebuild-required changes a useful path before compilation exists.

Scope:

- Generate QMK source or QMK Configurator-compatible `keymap.json` where possible.
- Generate ZMK config source for supported profile fields.
- Download source bundles locally.
- Make it explicit that source stays in the browser unless the user exports it.

### Phase 3: Guided Artifact Flash + Verify

Support flashing an artifact the user already has, then verify through Connect.

Scope:

- UF2-first flow with download/manual copy guidance.
- Optional File System Access write for UF2 mass-storage targets where browser support permits.
- Later WebUSB DFU for allowlisted bootloaders.
- Reconnect and verify identity/protocol/keymap where possible.

### Phase 4: WASM Compile/Link Prototype

Prototype option B with one board family.

Scope:

- One QMK RP2040 UF2 board or very small allowlist.
- One QMK commit.
- One feature preset with explicit enabled features.
- Browser-generated `keymap.c`.
- WASM compiler/linker worker.
- OPFS cache.
- Measurements: cold download size, cached size, compile/link time, peak memory, success/failure rate, final artifact size, and browser compatibility.

Do not broaden support until this data is acceptable.

### Phase 5: Broaden Carefully

Expand only after Phase 4 proves the architecture.

Possible order:

- More RP2040 boards sharing the same toolchain/preset.
- STM32 ARM boards.
- WebUSB DFU bootloader support.
- AVR research if a reliable browser-hosted AVR toolchain exists or can be built.
- ZMK source workflows and ZMK Studio integration before any full Zephyr browser-build effort.

## Honest Verdict

Full in-browser recompilation of arbitrary QMK or ZMK firmware is not a near-term shippable feature. It is technically interesting but too large and fragile for Wave 4b: embedded toolchains are big, official browser builds of `avr-gcc`/`arm-none-eabi-gcc` were not found, QMK assumes a native build environment, AVR LLVM compatibility is risky for this ecosystem, and ZMK adds Zephyr/west/CMake/Ninja complexity.

The most realistic WASM path is option B: precompiled board objects plus in-browser compile/link for a narrow allowlist, starting with QMK RP2040 UF2. That still needs a real prototype and measurement before product commitment, but it is much more plausible than shipping the whole build system.

The first slice should ship without waiting for WASM compilation: Connect plus VIA live autosync, followed by source generation/download for rebuild-required changes. Browser-local compile should be a measured R&D milestone, not a dependency for delivering VIA value.

Binary patching is not recommended as the general path. For VIA, live EEPROM writes are already the correct mechanism. For non-VIA, binary patching is too brittle and cannot express source-level features.

## Decisions For Sign-Off

1. Confirm that Wave 4b's first shippable slice is Connect + VIA live autosync, with no VIA "Apply to device" or "Flash" button for live-writable edits.
2. Confirm that rebuild-required edits ship next as source generation/download before browser compilation.
3. Choose option B, precompiled board objects + in-browser compile/link, as the only near-term WASM compile prototype.
4. Reject option A, full arbitrary in-browser QMK/ZMK recompile, as a Wave 4b dependency.
5. Reject option C, binary patching, as the general architecture.
6. Pick the first WASM target: QMK RP2040 UF2, one QMK commit, one board or tiny allowlist, one feature preset.
7. Define acceptance gates for the prototype: maximum cold payload, maximum cached size, compile/link time budget, browser support matrix, and failure recovery UX.
8. Keep ZMK on source generation and ZMK Studio-style live edits until a separate Zephyr/ZMK browser-build R&D track is justified.

