# CSS Migration 2h: Settings

## Scope

- Converted `src/routes/(app)/settings/+page.svelte` from scoped CSS to Tailwind v4 utilities.
- Deleted the scoped `<style>` block entirely.
- Retained the existing markup structure, runes, handlers, Monkeytype sync, GitHub identity, extension pairing, and app preference behavior.

## Fidelity Fixes

- Used arbitrary `text-[Npx]` for font-size-only rules to avoid `text-kb-*` line-height drift.
- Preserved explicit line heights with `leading-[1.05]`, `leading-[1.55]`, `leading-[1.4]`, `leading-[1.45]`, `leading-[1.25]`, and `leading-none`.
- Used exact `[background:...]` declarations for gradients, `color-mix(...)`, and CSS-variable backgrounds.
- Added important utilities for cascade-sensitive places: Material Symbols icon sizes, `.input` background/border overrides, ToggleGroup root/item overrides, and raw accent swatch button chrome.
- Avoided duplicate custom `gap-kb-*` classes on specialized card bodies because `tailwind-merge` does not reliably collapse this app's custom spacing utilities.
- Matched the baseline PB-mode select rendering with `![background:var(--paper)]`.

## Globals Retained

None. No `:global(...)` rules remain in `+page.svelte`.

## Final Fidelity Diff

```text
browse.png                       9 px  (0.001%)
connect.png                      9 px  (0.001%)
editor-keys.png                  9 px  (0.000%)
editor-lighting.png              9 px  (0.001%)
editor-split.png                 9 px  (0.001%)
library.png                      9 px  (0.001%)
settings.png                     9 px  (0.000%)
versions.png                     9 px  (0.001%)
TOTAL: 72
```

## Verification

- `vp check`: pass, all 178 files formatted; 0 warnings/lint/type errors across 246 files.
- `vp run svelte:check`: pass, 0 errors, 0 warnings.
- `vp build`: pass. It still emits the existing Tailwind optimizer warning for arbitrary variable background utilities outside this Settings migration.
- `vp test`: pass, 37 test files and 194 tests.
- `vp run capture`: pass, 9/9 screenshots captured.
- `node scripts/fidelity-diff.mjs "<baseline>"`: pass, `settings.png` at 9 px with no size change.
