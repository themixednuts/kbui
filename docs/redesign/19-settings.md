# Wave 2c Settings

## Screen Sections

- Keyboard timing: tapping term and debounce sliders, using `SliderField` with the active clean base values as reset/reference values.
- Keyboard behavior: switches for permissive hold, retro tapping, and NKRO.
- Split transport: single, serial, I2C, and BLE options from `split-transport.ts`, including disabled-state validation for QMK, ZMK, and single-piece profiles.
- App preferences: target OS selector and accent palette.

## Scope

Device-scoped settings are written through `WorkbenchStore.updateSettings`, inherited from `EditorStore`, and stored on the active `DeviceProfile` at `profile.settings`:

- `tappingTerm`
- `debounce`
- `permissiveHold`
- `retroTapping`
- `nkro`
- `splitTransport`

These settings are part of the draft profile diff. Versions sees them through `diffProfiles` in `src/lib/keyboard/changes.ts`, producing `setting` change records such as `settings/tappingTerm`, `settings/debounce`, and `settings/splitTransport`.

App-scoped preferences are not written to `profile.settings`:

- Target OS continues to use `src/lib/app/services/target-os.ts`.
- Accent uses the new `src/lib/app/services/accent.ts`.

## Accent Persistence

The accent picker stores a stable accent id in `localStorage` through `src/lib/app/services/preferences.ts` under `klakson.accent.v1`.

`Accent.saveAndApply(id)` persists the id and applies the matching OKLCH value by calling:

```ts
document.documentElement.style.setProperty("--coral", value);
```

`src/routes/(app)/+layout.svelte` calls `Accent.loadAndApply` on browser startup so the persisted accent is active before users visit `/settings`.

## Reuse

- Reused `SettingsDrawer` target OS service behavior via `TargetOS.labels`, `TargetOS.load`, and `TargetOS.save` through the shared editor/workbench store.
- Reused `split-transport.ts` option data and validation helpers for transport availability and disabled reasons.
- Reused the existing card, switch, toggle group, segmented nav, button, and slider primitives.
- Kept the legacy `(workbench)` route unchanged.

## Checks

- `vp install`: passed.
- `vp check`: passed; all 120 checked files formatted and 197 files with no warnings, lint errors, or type errors.
- `vp run svelte:check`: passed with 0 errors and 0 warnings.
- `vp build`: passed. Vite+ emitted plugin timing warnings only.
- `vp test`: passed; 17 test files, 94 tests.

No `vp dev` or `vp preview` server was left running.
