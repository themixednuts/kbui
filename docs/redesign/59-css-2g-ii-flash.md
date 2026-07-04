# CSS Migration 2g-ii: Flash Overlay

## Capture Coverage

Added `flash-overlay.png` to `tests/visual/capture.spec.ts`.

The capture uses the editor Build firmware path on `/editor?board=split`:

1. Open the starter split board editor.
2. In the selected key inspector, switch to Hold-Tap.
3. Set `Hold` to `KC_LCTL` and apply the behavior.
4. Wait for `via-rebuild-required`.
5. Click `Build firmware`.
6. Wait for `data-testid="flash-overlay"` and the `Flash to ...` dialog.

The split starter board keeps the capture on the preferred editor path while avoiding the default starter board's duplicate diagnostics-key crash during the baseline attempt.

Baseline was generated before conversion with `vp run capture` and copied to:

`C:\Users\jonfo\AppData\Local\Temp\claude\E--Projects-kbgui\beb81430-2e12-4c06-a43f-add4936ff953\scratchpad\flash-overlay-before.png`

## CSS Converted

Converted all scoped CSS in `src/lib/components/flash/FlashOverlay.svelte` to Tailwind utilities and removed the `<style>` block.

Covered areas:

- Overlay, scrim, modal frame, header, close affordance, and mobile layout.
- Phase flow steps and source status facts.
- Build-readiness error banner, incomplete-coverage warning banner, diagnostic lists, and source status row.
- UF2 artifact panel, bootloader guidance, browser-build unavailable/build states, copy/verify actions, progress state, and command log.

Some utilities use `!` to preserve the old scoped selectors' precedence over global `button` and `.material-symbols-outlined` reset rules.

`:global` retained: none.

## Fidelity

Before/after comparison:

- Source: saved baseline above vs `docs/redesign/screenshots/rebuild/flash-overlay.png`
- Size: 1440 x 900
- Byte equal: true
- Differing pixels: 0

## Verification

Ports cleared before final verification: no listeners on `5173`, `5174`, or `4173`.

- `vp check`: passed. All 177 files formatted; no warnings, lint errors, or type errors in 245 files.
- `vp run svelte:check`: passed. 0 errors, 0 warnings.
- `vp build`: passed.
- `vp test`: passed. 37 files, 194 tests.
- `vp run capture`: passed. 9/9 captures, including `flash-overlay.png`.
