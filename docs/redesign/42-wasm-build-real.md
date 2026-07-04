# Flash Design 42: Real WASM Firmware Build Attempt

Status: blocked on toolchain. The in-browser ARM compile/link/objcopy/UF2 milestone is **not** achieved.

## Goal

Phase 4 option B was to compile firmware source to a valid RP2040 `.uf2` entirely in the browser:

1. `clang -target thumbv6m-none-eabi -mcpu=cortex-m0plus -mthumb -c ...`
2. `ld.lld` with an RP2040 linker script to produce an ELF.
3. `llvm-objcopy` from ELF to raw binary.
4. JavaScript UF2 packing with RP2040 family id `0xe48bff56`, flash base `0x10000000`, and 256-byte payload blocks.

The blocker is step 1: no obtainable WASM-hosted Clang build found in this pass contains the ARM target.

## Toolchain Research

### `@eduoj/wasm-clang` / wasm-clang demo

This is the toolchain family used by the earlier PoC. It still cannot compile ARM.

Probe:

```text
clang -cc1 -triple thumbv6m-none-eabi -target-cpu cortex-m0plus -mfloat-abi soft -emit-obj ...
elapsed: 512.6 ms
error: unable to create target: 'No available targets are compatible with triple
      "thumbv6m-none-unknown-eabi"'
```

Its `lld.wasm` can run the ELF driver:

```text
ld.lld --help
elapsed: 28.7 ms
ld.lld: supported targets: elf
```

Verdict: ELF LLD exists, but Clang was stripped to targets that do not include ARM.

### `@yowasp/clang@22.0.0-git20542-10`

YoWASP is a much newer WASM-hosted LLVM package. It exposes `ld.lld` and `llvm-objcopy`, but its Clang target list is WebAssembly-only.

Probe:

```text
clang --print-targets
elapsed: 387.8 ms
Registered Targets:
  wasm32 - WebAssembly 32-bit
  wasm64 - WebAssembly 64-bit
```

ARM compile probe:

```text
clang -target thumbv6m-none-eabi -mcpu=cortex-m0plus -mthumb -c main.c -o main.o
elapsed: 475.8 ms
error: unable to create target: 'No available targets are compatible with triple "thumbv6m-unknown-none-eabi"'
object: missing
```

ELF and objcopy probes:

```text
ld.lld --help
elapsed: 40.4 ms
ld.lld: supported targets: elf

objcopy --help
elapsed: 21.5 ms
OVERVIEW: llvm-objcopy tool
```

Package size observed locally:

```text
gen/llvm.core.wasm:     75,532,134 bytes
gen/llvm-resources.tar: 29,665,280 bytes
total fetched:         105,241,285 bytes
```

Verdict: good candidate for a browser LLVM runtime shape, but not for RP2040 because ARM codegen is absent.

### WASI SDK and Wasmer

WASI SDK release assets are host SDK/sysroot distributions, not a ready browser-hosted Clang with ARM codegen. Wasmer's `clang/clang` package is browser/WASM-runner oriented, but its public examples target WebAssembly output; I did not get a reliable Node probe far enough to prove ARM target availability. I did not use it as a firmware build dependency.

## Code Implemented

### UF2 writer

Added `packUf2(bytes, { familyId, baseAddress })` in `src/lib/keyboard/uf2-flash.ts`.

Behavior:

- Emits 512-byte UF2 blocks.
- Uses 256-byte payloads by default.
- Sets the family-id-present flag.
- Writes RP2040-compatible family id `0xe48bff56` when requested.
- Uses caller-provided base address, with `rp2040FlashBaseAddress = 0x10000000`.
- Pads the final UF2 payload with zeros.

The unit test packs 300 raw bytes into two UF2 blocks and verifies `parseUf2()` accepts:

```text
family: 0xe48bff56
payload per block: 256
target range: 0x10000000-0x10000200
UF2 size: 1024 bytes
```

This proves the JS UF2 writer/parser path, not the compiler path.

### Firmware builder boundary

Replaced the throwing-only builder behavior with `WasmFirmwareBuilder`.

Current behavior:

- `isBrowserBuildAvailable()` returns `true` only when browser APIs exist and a positive ARM-toolchain availability signal is present.
- With the current researched toolchains, it returns `false`.
- `WasmFirmwareBuilder.build(request)` returns a structured `toolchain_unsupported` result with diagnostics, cache key, log, and timings instead of throwing or producing a fake artifact.
- The worker returns the same structured unsupported result for build messages.

This is intentionally not a successful build path. It prevents the UI from implying browser firmware builds work before an ARM-enabled WASM LLVM exists.

### OPFS/cache shape

The worker and builder both derive cache paths from `firmwareObjectBundleCacheKey()`:

```text
bundles/<cache-key>
work/<request-id>
toolchains/wasm-llvm-arm
```

Runtime-fetched large artifacts are ignored in git:

```text
static/wasm-toolchain/
resources/wasm-*/
```

No toolchain bytes were committed or bundled into the app.

### Flash overlay

`FlashOverlay.svelte` now has an experimental browser-build path, but it is hidden unless all of these are true:

- Browser build support is available.
- The generated target is QMK.
- A supported board object-bundle manifest exists.

No board manifest exists in this repo yet, so users still see the existing source zip and selected-UF2 flash flow. If the future path runs and fails, the overlay records real builder diagnostics and leaves the source-download path available.

## QMK Object Bundle

No QMK RP2040 object bundle was produced in this pass.

The intended full build remains:

1. CI builds a compatible RP2040 QMK object/static-library bundle for a specific QMK commit, keyboard path, features, and linker script.
2. Browser build compiles only generated `keymap.c` to ARM.
3. Browser link combines `keymap.o` with the object bundle.
4. Browser objcopy emits `.bin`.
5. JS packs `.bin` to `.uf2`.

Step 2 is blocked today by the missing ARM target in the obtainable WASM Clang builds. Step 1 is also still a CI-produced input.

## Verification

Focused tests:

```text
vp test src/lib/keyboard/uf2-flash.test.ts src/lib/keyboard/firmware-build/builder.test.ts
Test Files 2 passed
Tests 12 passed
Duration 1.31s
```

What this verifies:

- UF2 packer emits parser-accepted RP2040 UF2 blocks.
- Builder cache keys remain deterministic.
- Browser build availability stays false without a verified ARM-capable WASM toolchain.
- Builder failures are structured and explicit.

What this does **not** verify:

- No minimal C source was compiled to ARM by WASM Clang.
- No ELF was linked from ARM objects.
- No `llvm-objcopy` ELF-to-bin step ran on an ARM ELF.
- No compiler-produced RP2040 UF2 was generated.

## Honest Verdict

Minimal ARM UF2 via real in-browser WASM LLVM: **No**.

QMK firmware via in-browser WASM LLVM: **No**.

Useful work completed:

- Found the real blocker precisely: available WASM Clang builds are WebAssembly-target-only or otherwise lack ARM codegen.
- Confirmed ELF `ld.lld` and `llvm-objcopy` are available in a modern WASM LLVM package.
- Added a real RP2040 UF2 writer and parser round-trip test.
- Added honest builder/worker diagnostics and gated UI wiring so the app cannot fake browser builds.

Next unblocker: obtain or produce a WASM-hosted LLVM/Clang build with ARM backend enabled. Building LLVM from source was explicitly out of scope for this pass.

## References

- YoWASP Clang package: https://www.npmjs.com/package/@yowasp/clang
- YoWASP Clang repository: https://github.com/YoWASP/clang
- LLVM WebAssembly LLD documentation: https://lld.llvm.org/WebAssembly.html
- WASI SDK repository/releases: https://github.com/WebAssembly/wasi-sdk
- Wasmer Clang package: https://wasmer.io/clang/clang
