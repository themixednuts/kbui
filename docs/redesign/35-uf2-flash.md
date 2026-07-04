# UF2 Guided Flash Report

Status: implemented mock-first for flash-design phase 3. Real board flashing remains hardware-unverified.

## Scope

This wave adds the UF2-first guided flash path without changing the workbench route:

- User selects a compiled `.uf2` artifact.
- kbgui validates the UF2 container and shows metadata.
- kbgui guides bootloader entry through VIA `bootloaderJump` when a live WebHID VIA device is connected, otherwise manual reset instructions are shown.
- kbgui prefers File System Access directory copy when feature detection passes.
- Unsupported browsers keep the download plus manual-copy path.
- Reconnect verification uses the existing Connect flow and VIA metadata readback where available.
- The previous source-generation and source-zip download path remains available without a UF2.

## UF2 Parser

`src/lib/keyboard/uf2-flash.ts` contains the pure UF2 parser and helpers. `parseUf2(bytes)` validates:

- 512-byte block sizing.
- UF2 start magic `0x0A324655` and `0x9E5D5157`.
- UF2 final magic `0x0AB16F30`.
- positive payload size up to 476 bytes.
- block number/count consistency and duplicate block rejection.
- consistent family id when the UF2 family flag is present.
- 32-bit target-address range overflow.

The parser returns block count, total payload size, per-block payload size, family id/hex when declared, target address range, artifact size, and deterministic `fnv1a32-*` artifact hash. No clock input is used in the pure code.

`createUf2FlashPlan(...)` wraps parsed metadata with a target bootloader description: bootloader name, expected volume hints, optional expected family id, artifact filename, hash, size, and warnings. The plan is intentionally conservative because current `DeviceProfile` metadata does not yet carry authoritative UF2 bootloader/family data.

## File System Access Flow

`flashUf2ViaFileSystemAccess(fileHandleOrDir, uf2Bytes, io)` keeps browser IO behind injected, File System Access-like handles:

- directory handles use `getFileHandle(name, { create: true })`;
- file handles use `createWritable()`;
- writes are chunked and emit progress through `io.onProgress`;
- tests use mock directory/file/writable handles, not a real mounted board.

The overlay feature-detects File System Access with `detectUf2FileSystemAccessSupport(...)`:

- browser context required;
- secure context required;
- `showDirectoryPicker` required;
- Chromium-family browser required.

When support is missing, the overlay offers `createUf2DownloadFallback(...)`, downloads the UF2 blob, and shows manual-copy guidance.

## Bootloader And Verify Phases

`FlashOverlay.svelte` now maps the prototype compile/write/done model into concrete phases:

1. Validate profile.
2. Generate source.
3. Select UF2.
4. Enter bootloader.
5. Copy UF2.
6. Verify reconnect.

Bootloader entry:

- If a live WebHID VIA connection exists, the overlay offers a confirmed VIA `bootloaderJump` command using `encodeViaCommandReport("bootloaderJump")`.
- Otherwise it shows manual reset guidance and expected UF2 volume hints such as `RPI-RP2`, `UF2BOOT`, `NODEBOOT`, and `NICENANO`.

Verify:

- `verifyUf2Reconnect(...)` is injectable and mock-tested.
- The UI verification path calls `connectViaAndActivate(...)` with a WebHID VIA transport, then checks vendor id, product id, protocol, and VIA metadata where available.
- The overlay warns that VIA EEPROM may override flashed default keymaps until a deliberate "reset VIA EEPROM" flow exists.

## Mock-Tested Vs Hardware-Unverified

Mock-tested:

- Valid synthetic UF2 parsing.
- Junk/non-UF2 rejection.
- family id, target address range, block count, payload size, artifact size/hash extraction.
- File System Access copy to a mock directory handle with progress/result.
- manual download fallback blob contents.
- unsupported-browser feature-detect guidance.
- reconnect verification through the mock VIA transport.

Hardware-unverified:

- Real mounted UF2 volume writes.
- Real bootloader reset/jump timing.
- Real board disconnect/reconnect timing after UF2 copy.
- Real post-flash device identity checks against physical hardware.
- VIA EEPROM reset/migration behavior after flashing a default keymap.

## Verification Evidence

Commands run with the Vite+ `vp` CLI:

- `vp install`: passed.
- `vp run svelte:check`: passed, 0 errors, 0 warnings.
- `vp check`: passed, all 166 files formatted, no warnings/lint/type errors in 246 files.
- `vp test`: passed, 32 test files and 161 tests.
- `vp build`: passed.
- `vp run capture`: passed, 8/8 visual captures.

Post-capture port check:

- `Get-NetTCPConnection -LocalPort 4173 -ErrorAction SilentlyContinue`: no listener found.

No git commit was made.
