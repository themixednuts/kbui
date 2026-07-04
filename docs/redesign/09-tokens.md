# Wave 0b Token Foundation

## Source Of Truth

The rebuild token foundation lives in `src/app.css`.

Raw handoff tokens are declared on `:root` so component CSS can keep using names from the design, including `var(--coral)`, `var(--ink-2)`, `var(--surface-2)`, `var(--line-2)`, `var(--shadow-cap)`, and the `--r-*` radius tokens. Tailwind 4 utility generation is wired through the CSS-first `@theme static` block in the same file, with `--color-*`, `--spacing-kb-*`, `--radius-*`, `--font-*`, `--text-kb-*`, `--leading-*`, and `--shadow-*` aliases pointing at the raw variables.

## Token Groups

- Colors: warm paper/surface palette, semantic ink tokens, line tokens, coral accent, teal/mint/lilac/mustard accents, added/removed diff colors, and derived banner/tag/diff/keycap expressions.
- Spacing and sizing: the handoff's repeated 2px through 560px scale is available as raw `--space-*` variables and Tailwind `--spacing-kb-*` aliases.
- Radii: `--r-1` through `--r-4`, plus brand, keycap, big-cap, frame, and pill radii. Tailwind aliases include `rounded-kb-1`, `rounded-kb-2`, `rounded-kb-3`, `rounded-kb-4`, `rounded-keycap`, `rounded-frame`, and `rounded-pill`.
- Typography: `--sans` is Inter, `--mono` is Departure Mono, and Tailwind aliases expose `font-sans`, `font-mono`, `font-symbols`, `text-kb-*`, `font-book`, `font-ui`, `font-strong`, `leading-key`, and `leading-log`.
- Elevation: keycap, card, selected keycap, picked keycap, swatch, popover, toast, modal, switch knob, sequence key, and floating panel shadows are defined in the theme layer.

## Accent Override

The default accent is:

```css
--coral: oklch(0.72 0.17 32);
```

Runtime settings can override it on `document.documentElement`:

```ts
document.documentElement.style.setProperty("--coral", "oklch(0.72 0.13 195)");
```

Tailwind's `--color-coral` and dependent tokens resolve through `var(--coral)`, so `bg-coral`, `text-coral`, `ring-coral`, and direct `var(--coral)` usage re-theme from the same override. Derived accent tokens use `var(--coral)` or relative OKLCH so hover, ink, keycap, banner, and selected-shadow tokens follow the runtime accent.

## Self-Hosted Fonts

External Google Fonts references were removed from `src/app.css`; `src/app.html` had no Google font link.

Same-origin font assets:

- `static/fonts/material-symbols-outlined.woff2`
- `static/fonts/inter-latin-variable.woff2`
- `static/fonts/departure-mono.woff2`

The Material Symbols face is declared in `src/app.css`:

```css
@font-face {
  font-family: "Material Symbols Outlined";
  font-style: normal;
  font-weight: 100 700;
  font-display: block;
  src: url("/fonts/material-symbols-outlined.woff2") format("woff2");
}
```

The `.material-symbols-outlined` utility uses the handoff axis settings:

```css
font-variation-settings: "FILL" 0, "wght" 400, "GRAD" 0, "opsz" 24;
```

Because the font files are under `static/fonts/`, SvelteKit/Vite serves them from `/fonts/...` in dev and copies them same-origin into the built output.

## Verification

- `vp install`: passed.
- `vp check`: passed. All 101 files formatted; no warnings, lint errors, or type errors in 164 files.
- `vp run svelte:check`: passed. 0 errors, 0 warnings, 0 files with problems.
- `vp build`: passed.
- Google Fonts reference scan: passed. No `fonts.googleapis.com` or `fonts.gstatic.com` references remain in `src/`, `static/`, or `src/app.html`.
- Built font output: passed. `.svelte-kit/output/client/fonts/` contains `material-symbols-outlined.woff2`, `inter-latin-variable.woff2`, and `departure-mono.woff2`.
