# CSS Fidelity Fix

## Confirmed Root Cause

The primary regression came from replacing scoped `font-size` declarations with Vite+ theme text utilities such as `text-kb-10`, `text-kb-11`, and `text-kb-13`. Those utilities include built-in line-height values from `src/app.css`, while the pre-migration scoped CSS usually set only `font-size` and inherited the previous line-height. That changed line boxes, text baselines, and in a few places total page height.

Secondary regressions came from Tailwind utilities losing cascade priority to unlayered global rules or component defaults, especially direct `button`/`input` rules, `.material-symbols-outlined`, and Card content padding. A few `background` migrations also needed exact arbitrary `background:` declarations because `bg-[...]` did not reproduce gradient/custom-property background behavior pixel-for-pixel.

## Baseline Diff Before Fixes

```text
browse.png                  SIZE 1440x1046 -> 1440x1043
connect.png                      696 px
editor-keys.png             SIZE 1440x1296 -> 1440x1274
editor-lighting.png            19052 px
editor-split.png               40782 px
library.png                    29923 px
settings.png                       9 px
versions.png                       9 px
TOTAL: 2090471
```

## Fixes

- `src/routes/(app)/library/+page.svelte`
  - Restored old font-size-only metrics with arbitrary sizes: `text-kb-13` -> `text-[13px]`, `text-kb-11` -> `text-[11px]`, `text-kb-10` -> `text-[10px]`, `text-kb-9` -> `text-[9px]`, `text-kb-8` -> `text-[8px]`, `text-kb-12` -> `text-[12px]`.
  - Added important utilities where direct input/button and Card defaults overrode migrated styles: `!p-kb-10`, `!text-[13px]`, `!border`, `!bg-*`, `!font-mono`, and selected-state colors.
  - Restored Material Symbols sizes with `!text-[14px]` and `!text-[24px]`.

- `src/lib/components/board/Keycap.svelte`
  - Replaced keycap legend/source/sub/marker `text-kb-*` utilities with arbitrary font sizes plus `leading-none` where the old CSS used font-size-only metrics.
  - Restored key glyph font family from UI to mono.
  - Replaced keycap arbitrary variable backgrounds and gradient/color-mix utilities with exact `[background:...]` forms for base, transparent, modifier, accent, lighting, and LED-off states.

- `src/lib/components/board/KeyboardBoard.svelte`
  - Restored split label `text-kb-10` to `text-[10px]` and made the cable glyph `!text-[14px]` to beat the global Material Symbols rule, matching the old scoped `.split-label .material-symbols-outlined` rule.
  - Kept split label at the original `+10px` top coordinate and applied a split-only `-1px` surface translate to recover board placement.
  - Made zoom readout border/background/font/text hover utilities important so global button styles no longer shifted its rendering.

- `src/lib/components/editor/EditorKeyInspector.svelte`
  - Replaced inspector label `text-kb-10` with `text-[10px]`.
  - Made segmented-nav child padding important to match old scoped button padding.
  - Restored big key preview custom-property background with `![background:var(--keycap-base)]`.

- `src/lib/components/editor/EditorLightingInspector.svelte`
  - Replaced inspector label `text-kb-10` with `text-[10px]`.
  - Made segmented-nav child padding important.
  - Restored LED preview backgrounds with `[background:...]` for off, mixed, and color-gradient states.
  - Added `[&>*]:min-w-0` to the compact control grid so slider fields keep the old track widths.

- `src/lib/components/editor/EditorLayerStack.svelte`
  - Restored layer button font metrics with `![font-family:var(--mono)]`, `!text-[12px]`, and important font weight/color utilities so `tailwind-merge` and global button styles do not drop the intended mono styling.

- `src/routes/(app)/browse/+page.svelte`
  - Replaced header/filter/report font-size utilities with `text-[10px]`, `text-[11px]`, and `!text-[13px]`.
  - Made filter, active filter, report close, and search input utilities important where global button/input styles had changed text and control placement.

- `src/lib/components/browse/CommunityKeymapCard.svelte`
  - Replaced author/avatar/tag/signal `text-kb-*` utilities with arbitrary font sizes.
  - Restored preview plane and preview key backgrounds with exact background-image/background-color/background declarations.
  - Made tag border/background/font/text utilities important.

- `src/lib/components/browse/CommunityPreviewModal.svelte`
  - Replaced modal byline/tag/signal `text-kb-*` utilities with arbitrary font sizes.
  - Made the close button utilities important to preserve old direct-button rendering.

- `src/routes/(app)/connect/+page.svelte`
  - Made the Material Symbols option icon `!grid` so the old grid centering wins over global `.material-symbols-outlined { display: inline-block; }`.

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

No `SIZE` mismatches remain.

## Verification

```text
vp check
pass: All 178 files are correctly formatted
pass: Found no warnings, lint errors, or type errors in 246 files

vp run svelte:check
COMPLETED 6002 FILES 0 ERRORS 0 WARNINGS 0 FILES_WITH_PROBLEMS

vp build
passed

vp test
37 files passed, 194 tests passed

vp run capture
9 passed

node scripts/fidelity-diff.mjs "<baseline>"
TOTAL: 72
```

Note: the first `vp check` run reported formatting only in `scripts/fidelity-diff.mjs`; `vp check --fix scripts/fidelity-diff.mjs` was run before the final clean validation pass.
