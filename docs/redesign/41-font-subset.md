# Material Symbols Font Subset

## Source Audit

Material Symbols usage was audited with:

```sh
rg -n "material-symbols-outlined|@lucide/svelte|font-variation-settings" src
```

Only elements using `material-symbols-outlined` were included. `@lucide/svelte`
imports are SVG components and are not part of this font subset.

The dynamic rail icons come from `appNavItems` in
`src/lib/app/shell-store.svelte.ts`. Other dynamic Material Symbols are finite
ternaries in `+layout.svelte`, `settings/+page.svelte`, and
`FlashOverlay.svelte`.

The kept source of truth is:

```txt
scripts/material-symbols-used.txt
```

It contains 58 ligature names. During the audit, one use of `cable_off` was
found in the connect page, but the existing full self-hosted font does not
contain a `cable_off` ligature. That use now renders the already-used
`link_off` icon.

## Subsetting

The original full font is kept outside `static/` so it is not shipped:

```txt
resources/fonts/material-symbols-outlined.full.woff2
```

The shipped same-origin font remains:

```txt
static/fonts/material-symbols-outlined.woff2
```

Regenerate it with:

```sh
vp run subset:material-symbols
```

That task runs:

```sh
python scripts/subset-material-symbols.py
```

The script uses `fonttools` with Brotli WOFF2 support. It reads the icon list,
instances the variable font at the app's fixed axes, prunes GSUB ligature rules
to the listed names, subsets to the icon glyphs plus required spelling
characters, space, and `.notdef`, writes WOFF2, and verifies every listed
ligature still resolves.

The source font exposes Material Symbols substitution features as `rlig` and
`rclt`, not literal `liga`/`calt`. The script asks fonttools to preserve
`rlig`, `rclt`, `liga`, and `calt`; the final subset keeps the needed `rlig`
table.

## CSS Decision

`src/app.css` uses one fixed setting for every Material Symbols icon:

```css
font-variation-settings:
  "FILL" 0,
  "wght" 400,
  "GRAD" 0,
  "opsz" 24;
```

No runtime code varies these axes, so the subset is a static instance at:

```txt
FILL=0, wght=400, GRAD=0, opsz=24
```

The `@font-face` now declares `font-weight: 400`. `font-display: block` stays in
place because icon font fallback would expose ligature text; the file is now
small enough that the block period is negligible.

## Size

Before:

```txt
static/fonts/material-symbols-outlined.woff2  3,960,064 bytes
```

After:

```txt
static/fonts/material-symbols-outlined.woff2      7,192 bytes
.svelte-kit/output/client/fonts/...               7,192 bytes
.svelte-kit/cloudflare/fonts/...                  7,192 bytes
```

The final subset is static (`fvar` absent), has 90 glyphs total, and contains
58 exact Material Symbols ligature substitutions.

## Verification

Commands run:

```txt
vp install
vp run subset:material-symbols
python scripts/subset-material-symbols.py --verify-only
vp check
vp run svelte:check
vp build
vp test
vp run capture
```

Results:

```txt
vp check: pass, 172 files formatted; no lint/type warnings or errors
vp run svelte:check: 0 errors, 0 warnings
vp build: pass
vp test: 35 files passed, 173 tests passed
vp run capture: 8 passed
```

Fresh captures were written to `docs/redesign/screenshots/rebuild/`. I visually
checked `editor-keys.png`, `connect.png`, and `settings.png`: left-rail nav
icons, appbar icons, connect option icons, and settings action/status icons
render as symbols rather than ligature text.

No local listeners remained on ports `4173`, `5173`, or `8787` after capture.
