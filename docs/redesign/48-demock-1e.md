# Demock 1e: Version Save-Point Flash

Status: implemented.

## Save-Point Materialization

`src/lib/keyboard/save-points.ts` now exposes `materializeSavePointProfile(savePoints, savePointId)`. It returns a cloned full `DeviceProfile` for the selected save point, so callers get the post-diff profile without mutating persisted history state.

Save points are still created from base-to-draft diffs, and `diffFromParent` remains the display/history summary. The persisted `snapshot` is the authoritative materialized profile because current `ChangeRecord` values are human-readable diff labels rather than a reversible patch format for macros, combos, tap dances, lighting, and metadata.

`WorkbenchStore.materializeSavePointProfile(savePointId)` wraps that helper, selects the point, and gives route code a typed flash target. The old `flashIntent` / `status: "stubbed"` state is removed.

## Flash Flow

`src/routes/(app)/versions/+page.svelte` now reuses `src/lib/components/flash/FlashOverlay.svelte` directly for save-point firmware flashing. The selected save point is materialized into a `DeviceProfile`, classified with the same VIA/ZMK live-sync classifiers, and then routed:

- Connected VIA or unlocked ZMK Studio with only live-writable key changes: load the materialized profile as the active draft and trigger the existing live-sync coordinator. This uses the real VIA/ZMK live-apply path.
- Rebuild-required, source-only, invalid, disconnected, or non-live cases: open the existing `FlashOverlay` with the materialized profile and classified change notices. This gives the real source zip, UF2 selection/copy, bootloader guidance, and honest browser-build-unavailable behavior.

`FlashOverlay` was not forked. Its command log label now says `profile changes included` because the versions entrypoint can pass a full save-point target, not just editor rebuild notices.

## Stub Removed

Removed:

- `WorkbenchStore.flashSavePoint(...)`
- `FlashSavePointIntent`
- `flashIntent` store state
- the versions page text saying the flash intent was recorded for a future overlay and no device write runs

No fake flash success or future-wave copy remains in the versioning flash path.

## Tests

Added/updated:

- `src/lib/keyboard/save-points.test.ts`: materialized save-point profiles are cloned full profiles.
- `src/lib/app/workbench-store.test.ts`: workbench materializes a flash target and no longer records `flashIntent`.
- `src/lib/app/save-point-flash.test.ts`: no-device save-point flash opens the firmware overlay path, connected VIA live-writable changes use live apply, and connected VIA rebuild-required changes use the overlay.

## Verification

Commands run with Vite+:

- `vp install`: passed.
- `vp check`: passed, 176 formatted files and no warnings/lint/type errors in 244 files.
- `vp run svelte:check`: passed, 0 errors and 0 warnings.
- `vp build`: passed.
- `vp test`: passed, 37 test files and 188 tests.
- `vp run capture`: passed, 8/8 visual captures including `versions.png`.

Ports 5173, 5174, and 4173 were checked/cleared before build/capture; no listeners were present.

No git commit was made.
