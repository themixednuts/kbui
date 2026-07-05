# CSS 2i App CSS Purge

## Scope

Sub-wave 2i removed dead global class selectors from `src/app.css` after the shadcn/Tailwind component migration. The purge was source-only: no class was inlined, converted, or moved into components.

## Reference Audit

Audit method:

- Parsed `src/app.css` with PostCSS and enumerated every class selector, including compound selectors, descendant selectors, selectors inside media queries, and grouped selectors.
- Scanned 253 source files under `src/**` and `extension/**`, excluding generated output (`.svelte-kit`, `.output`, `dist`, `build`, `.vite`, `coverage`) and excluding `src/app.css` itself.
- Source scan included `.svelte`, `.ts`, `.js`, `.tsx`, `.jsx`, and `.html` files.
- Treated exact boundary matches in static `class="..."`, Svelte `class:x`, `cn(...)` / `clsx(...)` / `tailwind-variants` strings, string literals, and template literals as live references.
- Reviewed template literals with class-bearing contexts; no dead class candidate was being dynamically constructed.
- Applied the explicit keep list as live even when not currently referenced: `mono`, `row`, `col`, `muted`, `field`, `field-label`, `spacer`, `divider`, `seg`, `topbar`, `brand`, `eyebrow`, `accent-word`, `connect-view`, `view-seg`, `app-topbar`, `material-symbols-outlined`, and `dark`.
- Classified a selector as dead when any required class in that selector was unreferenced. For grouped selectors, fully dead rules were removed and dead selector arms were pruned from otherwise live grouped rules.

Final audit after formatting:

- Remaining class selector names: 77
- Live/protected class selector names: 77
- Dead selector count: 0

## Removed

Removed:

- 163 dead class names
- 311 fully dead rules
- 5 dead selector arms pruned from mixed grouped rules
- 4 empty media blocks

Removed class names:

`active-row`, `app-error-block`, `app-error-stack`, `app-frame`, `behavior-hint`, `behavior-panel`, `binding-panel`, `branch-graph`, `branch-lanes`, `branch-legend`, `branch-legend-item`, `branch-row`, `brand-name`, `build-log`, `build-log-card`, `build-log-empty`, `catalog-picker`, `combo-connector-line-active`, `combo-marker`, `combo-source-label`, `combo-source-note`, `commit-dot`, `compact-layer-hues`, `compact-list`, `compact-rgb-preview`, `connect-primary-cta`, `connect-strip`, `definition-needed`, `detect-notes`, `device-card`, `device-chip`, `diff-column`, `diff-line`, `diff-pair-list`, `diff-pair-more`, `diff-pair-path`, `diff-pair-row`, `diff-pane`, `diff-preview-row`, `diff-side`, `diff-title`, `disconnect-actions`, `disconnect-copy`, `disconnect-status`, `disconnected-panel`, `entry-card`, `entry-list`, `entry-name`, `error-copy`, `error-icon`, `error-title`, `feature-list`, `firmware-meta`, `firmware-view`, `flash-summary`, `fork-connector`, `ft-label`, `ft-toggle`, `glyph`, `gut`, `head-tag`, `hue-color-input`, `hue-row`, `hue-swatch`, `identity-card`, `inherits-binding`, `inline-actions`, `inspector-editor`, `inspector-empty`, `kb-block`, `kb-row`, `kc-grid`, `kc-pill`, `keyboard-stage`, `keymap-bind-mode`, `keymap-main`, `keymap-mode-nav`, `keymap-panning`, `keymap-rgb-mode`, `keymap-view`, `keymap-zoom-readout`, `ki-shell`, `lane-main`, `lane-swatch`, `layer-activation-chain`, `layer-activation-marker`, `layer-chain-key`, `layer-chip`, `layer-hues`, `layer-name-input`, `layer-row`, `layer-stack-bar`, `layer-stack-card`, `layer-stack-chip`, `layer-stack-label`, `lighting-main`, `lighting-view`, `log-body`, `logic-main`, `logic-view`, `macro-list`, `mock-actions`, `mock-device-panel`, `mock-grid`, `mock-head`, `mock-led`, `mock-packet`, `mock-packet-log`, `mock-pressed`, `mock-readout`, `mode-grid`, `os-seg`, `paper-bg`, `preview-code`, `protocol-chip`, `removed-key`, `renaming`, `rgb-hint`, `rgb-inspector-tab`, `rgb-inspector-tab-panel`, `rgb-inspector-tabs`, `rgb-inspector-tabs-list`, `rgb-mode-nav`, `rgb-override`, `rgb-preview`, `rgb-section`, `rgb-section-head`, `rgb-selected`, `rgb-selection-actions`, `rgb-slider-grid`, `rgb-tab-badge`, `rm`, `settings-gear`, `side-stack`, `slim-body`, `source-panel`, `split-transport-copy`, `split-transport-grid`, `split-transport-intro`, `split-transport-lock`, `split-transport-option`, `split-transport-option-disabled`, `split-transport-section`, `stack-arrow`, `stack-hint`, `state-dot`, `state-label`, `status-chip`, `topbar-commands`, `topbar-identity`, `topbar-workspace`, `topbar-zone`, `transport-btn`, `transport-divider`, `transport-pill`, `validation-list`, `version-main`, `versioning-view`, `view-intro`, `view-shell`, `visual-diff`, `waiting-for-device`, `wide-btn`.

## Kept

Kept foundation:

- `@import`, `@theme`, `@custom-variant dark`, all `@keyframes`, font faces, `:root` design tokens, and base element resets.
- `.material-symbols-outlined` icon font mechanics.
- Live shared helpers such as `.mono`, `.row`, `.col`, `.muted`, `.field`, `.field-label`, `.spacer`, `.divider`, `.seg`, `.topbar`, `.brand`, `.eyebrow`, `.accent-word`, `.connect-view`, `.view-seg`, and `.app-topbar`.
- `.app-toast`, `.app-toast-title`, and `.app-toast-close` because `src/lib/app-toast.ts` still constructs those class names. Keeping them follows the reference guardrail even though the wrapper currently has no import sites.

## Line Count

- Before: 3829 lines
- After: 1617 lines
- Net: 2212 fewer lines

## Fidelity Diff

Baseline: `C:\Users\jonfo\AppData\Local\Temp\claude\E--Projects-kbgui\beb81430-2e12-4c06-a43f-add4936ff953\scratchpad\fid_baseline`

No size changes were reported.

| Screen | Diff |
| --- | ---: |
| `browse.png` | 9 px (0.001%) |
| `connect.png` | 9 px (0.001%) |
| `editor-keys.png` | 9 px (0.000%) |
| `editor-lighting.png` | 9 px (0.001%) |
| `editor-split.png` | 9 px (0.001%) |
| `library.png` | 9 px (0.001%) |
| `settings.png` | 9 px (0.000%) |
| `versions.png` | 9 px (0.001%) |
| Total | 72 px |

## Verification

- `vp install`: passed.
- `vp check --fix`: formatted `src/app.css`; lint/type pass clean.
- `vp check`: passed. 178 files correctly formatted; 246 files with no warnings, lint errors, or type errors.
- `vp run svelte:check`: passed. 6002 files, 0 errors, 0 warnings.
- `vp build`: passed. Vite/Rolldown emitted the existing generated CSS optimizer warning for `.bg-[var(...)]`; exit code 0.
- `vp test`: passed. 37 test files, 194 tests.
- `vp run capture`: passed. 9/9 screenshots captured.
- `node scripts/fidelity-diff.mjs "<baseline>"`: passed with all 8 compared screens at 9 px.
