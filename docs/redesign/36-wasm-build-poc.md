# WASM Build PoC Report

Status: bounded PoC spike for flash-design phase 4. Scaffold implemented; no production browser firmware compiler is wired into the UI.

## Scope

This spike tested option B from `docs/redesign/28-flash-wasm.md`: precompiled per-board objects plus browser-local compile/link for generated keymap source. It did not attempt a full QMK/ZMK browser build, did not clone QMK, did not download native embedded toolchains, and did not add a fake compiler path to `FlashOverlay.svelte`.

Code added:

- `src/lib/keyboard/firmware-build/types.ts`
- `src/lib/keyboard/firmware-build/builder.ts`
- `src/lib/keyboard/firmware-build/firmware-build.worker.ts`
- `src/lib/keyboard/firmware-build/builder.test.ts`

The shipped builder is intentionally refusing: `NotImplementedFirmwareBuilder` throws an error that says "in-browser WASM build not yet available — download source and build with `qmk compile`". `isBrowserBuildAvailable()` returns `false`.

## Minimal Demo Attempt

### Candidate Search

I checked small npm-installable candidates before installing anything large:

| Candidate | Result |
| --- | --- |
| `tcc@3.0.2` | Not viable for browser. It is native Node bindings requiring `libtcc`, not a WASM/browser compiler. Dry-run package size was 3,486 bytes compressed / 11,582 bytes unpacked because it ships bindings, not a compiler. |
| `@wasmer/sdk@0.10.0` | Potential runtime, not a compiler by itself. Dry-run package size was 5,694,113 bytes compressed / 15,527,071 bytes unpacked before any Wasmer registry compiler package. I did not fetch registry compiler packages because their payload was not known upfront. |
| `@eduoj/wasm-clang@1.0.0` | Viable for one bounded demo. Dry-run package size was 10,136 bytes compressed / 31,585 bytes unpacked. It is a wrapper around the old `wasm-clang@0.0.1` CDN assets, not a maintained embedded firmware toolchain. |

`@eduoj/wasm-clang` package contents were inspected in `%TEMP%\kbgui-wasm-poc-eduoj`; it was not added to project dependencies.

### Asset Measurements

The wrapper loads these CDN assets from `https://cdn.jsdelivr.net/npm/wasm-clang@0.0.1/bin/`.

HEAD `content-length` values:

| Asset | HEAD bytes |
| --- | ---: |
| `clang` | 9,758,023 |
| `lld` | 6,318,644 |
| `memfs` | 17,159 |
| `sysroot.tar` | 1,669,838 |
| Total | 17,763,664 |

Node `fetch().arrayBuffer()` returned decoded bytes:

| Asset | decoded bytes | fetch time |
| --- | ---: | ---: |
| `memfs` | 345,442 | 139 ms |
| `sysroot.tar` | 9,297,920 | 101 ms |
| `clang` | 31,214,472 | 311 ms |
| `lld` | 19,490,094 | 239 ms |
| Total | 60,347,928 | 790 ms summed |

Interpretation: transfer can be compressed by the CDN, but a browser OPFS cache would likely need about 57.6 MiB for decoded assets if kbgui stores the files itself.

### Compile/Link Run

I ran a throwaway `vp exec node -` script from the repo root using the temp-unpacked wrapper. It compiled and linked:

```c
int main() { return 0; }
```

Target and output:

- Compile target passed to Clang: `-triple=wasm32-unknown-wasi`
- Output object: `test.o`, 259 bytes
- Linked output: `test.wasm`, 13,151 bytes

Measured times:

| Phase | Time |
| --- | ---: |
| Runtime/sysroot ready | 180 ms |
| Compile trivial source to object | 586 ms |
| Link object to WASM binary | 332 ms |
| Ready + compile + link | 1,098 ms |

Verdict on the demo: a WASM-hosted Clang and LLD can run from this project and compile/link a trivial local source string without a server. This is real evidence for the worker-shaped architecture, but it is not evidence that QMK RP2040 firmware can be produced yet. The demo targets generic `wasm32-wasi`, links against the demo sysroot, and produces a WASM executable, not an ARM/RP2040 ELF or UF2.

The demo package is also old and CDN-backed. It is acceptable as feasibility evidence, not as a product dependency.

## Scaffold Details

`FirmwareObjectBundleManifest` models the immutable object-bundle identity:

- QMK commit and repository.
- Keyboard path, layout, MCU, board family, bootloader, VID/PID.
- Compiler family/version/runtime/target triple.
- CFLAGS, CPPFLAGS, LDFLAGS, and compile-time defines.
- Enabled features such as VIA, combos, tap dance, key overrides, NKRO, and lighting family.
- Object files and static libraries with hashes and sizes.
- Linker script hash and size.
- Toolchain asset refs for future WASM clang/lld archives.
- Output format, UF2 family id, and flash/RAM budgets.

`firmwareObjectBundleCacheKey(manifest)` creates an OPFS-safe key from the manifest version, QMK commit, keyboard path, MCU family, compiler identity, output format, and bundle hash.

`FirmwareBuildRequest` carries generated source from `src/lib/keyboard/firmware-source.ts`, the selected manifest, cache hints, request id, and output filename. `FirmwareBuildResult` is a success/failure union with artifact bytes, diagnostics, log entries, timings, and cache metadata.

`firmware-build.worker.ts` is a deliberate stub. It defines the message boundary for future worker execution and documents the intended OPFS layout:

- toolchain files under `toolchains/wasm-clang`;
- object bundle under `bundles/<manifest-cache-key>`;
- generated source under `work/<request-id>`.

It responds with `type: "unavailable"` and does not compile.

## Option-B Implementation Spec

### CI Bundle Build

Inputs:

- allowlisted QMK commit;
- keyboard path and layout macro;
- board family, MCU, bootloader, firmware format;
- fixed feature preset: VIA, combos, tap dance, key overrides, macros, NKRO, lighting mode;
- exact compiler family/version and target triple;
- exact CFLAGS/CPPFLAGS/LDFLAGS and linker script;
- source generator compatibility tests for the same feature preset.

CI should build with the same compiler family intended for browser keymap objects. If fixed objects are produced with GCC but browser keymap objects are produced with Clang, that ABI/link mix must be proven per target before support is claimed.

Outputs:

- object files and static libraries for board/quantum/driver code excluding user keymap source;
- generated headers and any include tree needed to compile `keymap.c`;
- linker script and startup/runtime objects;
- objcopy/UF2 conversion metadata;
- `manifest.json` using `FirmwareObjectBundleManifest`;
- SHA-256 hashes for every object, library, linker script, and toolchain artifact;
- optional signature metadata before public distribution.

Hosting:

- publish bundles to R2/static under a content-addressed path such as `firmware-build/qmk/<commit>/<keyboard>/<preset>/<bundle-hash>/`;
- serve `manifest.json`, `objects.tar.zst` or equivalent, linker script, and toolchain refs with immutable cache headers;
- keep a small allowlist index in the app or as a static manifest.

### Browser Flow

1. Generate source with `generateFirmwareArtifacts(profile)`.
2. Match the profile and requested rebuild features to an allowlisted manifest.
3. If no manifest matches, keep the existing source-zip path.
4. Start a dedicated Web Worker.
5. Worker fetches the manifest-selected WASM toolchain and object bundle.
6. Worker caches decoded assets in OPFS under `firmwareObjectBundleCacheKey(manifest)`.
7. Worker writes generated `keymap.c`, `config.h`, and `rules.mk` inputs to a per-request work directory.
8. Worker compiles only generated keymap sources with WASM Clang and manifest flags.
9. Worker links generated objects with prebuilt board objects/libraries and the manifest linker script through WASM LLD.
10. Worker converts the linked image to the requested format. First target is RP2040 `.uf2`.
11. The resulting UF2 bytes are passed to `src/lib/keyboard/uf2-flash.ts`.

Source must not be posted to any server. Network requests are only for immutable public toolchain/object assets.

### Target Order

1. QMK RP2040 UF2, one board, one QMK commit, one feature preset.
2. A tiny RP2040 allowlist sharing the same toolchain and preset.
3. STM32/ARM boards after linker/objcopy/DFU details are proven.
4. AVR only if a reliable browser-hosted AVR toolchain is found or produced.
5. ZMK remains source generation and ZMK Studio-style live edits until a separate Zephyr browser-build R&D track is justified.

## Acceptance Gates

For the first RP2040 board:

- Cold transfer: <= 30 MiB compressed for toolchain plus object bundle.
- Decoded OPFS cache: <= 100 MiB for one board/preset.
- Cached compile+link+UF2: <= 10 s p50, <= 20 s p95 on a normal laptop.
- Peak worker memory: <= 512 MiB.
- Output correctness: fixture keymaps match native CI builds semantically, and size budgets are enforced from the manifest.
- Hardware smoke test: at least one RP2040 UF2 board flashes and reconnects through the existing UF2 flow.
- Browser matrix: Chrome and Edge desktop first; Firefox/Safari only after OPFS and WASM runtime behavior is measured.
- Privacy gate: generated source never leaves the browser. Test or instrument requests so only manifest/toolchain/object URLs are fetched.
- Failure UX: missing bundle, quota failure, compiler failure, linker failure, and UF2 conversion failure all fall back to source download with clear diagnostics.

## Honest Verdict

Achievable now:

- Source generation and source download are already implemented.
- UF2 parse/copy/download/verify scaffolding is already implemented.
- A real browser-shaped WASM Clang/LLD demo can compile/link trivial local source, with about 17.8 MB compressed transfer and 60.3 MB decoded assets for the old demo toolchain.
- The app now has a typed build scaffold and a refusing builder that does not fake firmware artifacts.

Not achieved:

- No QMK RP2040 object bundle exists.
- No vetted browser-hosted ARM embedded Clang/LLD/objcopy toolchain is selected.
- No RP2040 ELF/bin/UF2 is produced in-browser.
- No ABI proof exists for mixing CI-built fixed objects with browser-built keymap objects.
- No OPFS cache implementation or production worker compile loop exists.

Realistic effort estimate:

- 1 to 2 weeks to build a serious single-board RP2040 CI bundle and browser worker prototype if a suitable WASM LLVM/binutils toolchain is selected quickly.
- 2 to 4 additional weeks to harden OPFS caching, UF2 conversion, diagnostics, browser compatibility, and hardware verification for one board.
- Broader board support is incremental but not automatic; every compiler/feature/preset family needs manifest coverage and test fixtures.

The next decision should be whether to spend that effort on one RP2040 proof board. Until then, the product path should remain source download plus guided UF2 flashing, with browser build visibly unavailable.
