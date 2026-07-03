# UI primitives

Shared components that compose every screen. Tailwind v4 utilities first,
typed in `types.ts` so consumers can import enum-like unions without going
through the `.svelte` files (oxlint can't resolve type re-exports from
SvelteKit's `*.svelte` ambient module).

## How to use

```ts
import { Button, Chip, Topbar } from "$lib/components/ui";
import type { ChipTone, TopbarStatusInfo } from "$lib/components/ui";
```

Stories live next to each component (`Button.stories.svelte`, etc.) and run
under Storybook 10 + `@storybook/addon-svelte-csf`. Launch with:

```sh
vp run storybook       # dev server on :6006
vp run storybook:build # static export to storybook-static/
```

## Authoring rules

- **Tailwind first.** Reach for utilities (`bg-paper`, `text-ink-3`,
  `shadow-cap`, `font-mono`, `rounded-pill`) before reaching for a `<style>`
  block. Tokens are in `src/app.css` under `@theme {}` — add new ones there
  rather than hardcoding values.
- **Bracket notation for one-off values.** Prefer `h-[34px]` /
  `[grid-template-columns:auto_1fr]` over restyling tokens for one-off
  measurements. Tokens are for design decisions, brackets are for layout.
- **Types in `types.ts`.** Don't `export type` from a `<script lang="ts" module>`
  block — oxlint can't see through SvelteKit's `*.svelte` ambient module.
  Move types to `types.ts` and import them.
- **Reactive props get `$derived`.** Reading a prop directly into a `const`
  captures only the initial value (Svelte 5 emits `state_referenced_locally`).
  Wrap in `$derived(...)` so the value tracks.
- **Class merging.** Components accept a `class` prop and append it last
  so call sites can override or extend without `!important`. Use
  `class: extra = ""` to avoid the reserved `class` keyword.
- **Snippet slots, not children-as-component-prop.** When a parent needs to
  inject markup, expose a `Snippet` named after the slot (`catalog`, `nav`,
  `transports`) — composes cleaner than passing components.

## Migration progress (Tailwind v4)

| Surface                            | Status     | Notes                                                                                            |
| ---------------------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| Topbar (header bar)                | ✅ Done    | Components: `Topbar`, `Brand`, `Chip`, `Button`, `SegmentedNav`, `CatalogPicker`, `AvatarButton` |
| Connect / onboarding screen        | ⏳ Pending | Inline in `+page.svelte`, uses legacy `.connect-onboarding`, `.connect-card`, etc.               |
| Keymap view (keyboard + inspector) | ⏳ Pending | `.keycap`, `.keyboard-stage`, `.key-hero`, `.inspector-editor`                                   |
| Diff & branch graph view           | ⏳ Pending | `.diff-pair-row`, `.branch-graph`, `.branch-row`                                                 |
| Logic view (macros / combos / TD)  | ⏳ Pending | `.entry-card`, `.seq`, `.tap-grid`                                                               |
| Lighting view                      | ⏳ Pending | `.rgb-preview`, `.slider-row`, `.mode-grid`                                                      |
| Firmware view                      | ⏳ Pending | `.build-log`, `.flash-summary`, `.device-card`                                                   |
| App notice / error stack           | ⏳ Pending | `.app-notice`, `.app-error-block`                                                                |
| Mock device panel (dev only)       | ⏳ Pending | `.mock-device-panel`, `.mock-grid`, `.mock-packet`                                               |

The legacy `app.css` rules still apply during migration — design tokens
were promoted to a `@theme` block so utilities and the legacy CSS share
the same source of truth (`var(--color-paper)` is the same paint as
`bg-paper`).

## Migration playbook (per surface)

1. Identify a chunk of related markup in `+page.svelte`.
2. Pull it into a component under `src/lib/components/ui/` (or a feature
   folder like `src/lib/components/keymap/` for non-shared compositions).
3. Convert hand-written CSS rules to Tailwind utilities. Anything that
   doesn't have a clean utility (e.g. fancy `repeating-linear-gradient`
   keycap pattern) stays in a co-located `<style>` block in the component
   itself — not in `app.css`.
4. Delete the now-orphaned rules from `app.css`.
5. Add a `*.stories.svelte` file with the realistic states (idle, loading,
   error, dense, sparse) so future regressions are spottable in Storybook.
6. Run `vp run svelte:check`, `vp check`, `vp test`, then visually verify
   the page in `vp dev` and the component in `vp run storybook`.

## Known gotchas

- **Use `@lucide/svelte`, not `lucide-svelte`.** The legacy `lucide-svelte`
  package (v1.x) ships Svelte 4 class components. The Svelte 5 fork is
  published as `@lucide/svelte` — same icons, proper `Component<>` typings.
  Our `IconComponent` alias re-exports `LucideIcon` from there.
- **Tailwind v4 has no `tailwind.config.js`.** Configuration lives in CSS
  via `@theme`. Don't add a JS config file — it'll be silently ignored.
- **Storybook 10 picks up SvelteKit's Vite config automatically**, so the
  `tailwindcss()` plugin is active in stories without extra wiring. The
  global stylesheet is loaded once from `.storybook/preview.ts`.
