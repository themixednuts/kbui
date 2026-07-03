# Design Tokens

Source: `resources/kbgui-handoff/kbgui/project/styles.css`, with the accent override mechanism in `Klakson.html` and `tweaks-panel.jsx`.

## Color Custom Properties

| Token         | Value                  | Role                                                  |
| ------------- | ---------------------- | ----------------------------------------------------- |
| `--paper`     | `#F2EDE3`              | App background / warm paper surface.                  |
| `--surface`   | `#FBF8F2`              | Primary cards, nav, topbar, controls.                 |
| `--surface-2` | `#ECE5D6`              | Secondary fills, hover fills, key hero backgrounds.   |
| `--surface-3` | `#DCD3C1`              | Deeper secondary surface, switch off state.           |
| `--ink`       | `#1B1917`              | Primary text and solid neutral controls.              |
| `--ink-2`     | `#565149`              | Secondary text and neutral icons.                     |
| `--ink-3`     | `#8B8475`              | Muted text, labels, metadata, empty states.           |
| `--line`      | `rgba(27,25,23,0.10)`  | Subtle borders and dividers.                          |
| `--line-2`    | `rgba(27,25,23,0.16)`  | Stronger borders and control outlines.                |
| `--coral`     | `oklch(0.72 0.17 32)`  | Primary accent; runtime-overridable.                  |
| `--coral-ink` | `oklch(0.46 0.15 32)`  | Darker coral text/icon accent.                        |
| `--teal`      | `oklch(0.72 0.12 195)` | Layer color, connected/device accents, combo pick UI. |
| `--teal-ink`  | `oklch(0.44 0.11 195)` | Darker teal text/icon accent.                         |
| `--mint`      | `oklch(0.80 0.12 155)` | Success/connected state and community highlights.     |
| `--lilac`     | `oklch(0.76 0.11 305)` | Layer/community accent.                               |
| `--mustard`   | `oklch(0.82 0.12 90)`  | Layer/community accent and spacebar LED.              |
| `--added`     | `oklch(0.60 0.15 150)` | Added/positive diff text.                             |
| `--removed`   | `oklch(0.60 0.19 27)`  | Removed/danger diff text.                             |

## Derived Color Expressions

| Selector / context     | Value / expression                                                                              | Role                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------- |
| Accent solid hover     | `oklch(0.68 0.18 32)`                                                                           | Button hover for `tone=accent` solid buttons. |
| Accent outline border  | `color-mix(in oklch, var(--coral) 55%, transparent)`                                            | Accent outline border.                        |
| Accent outline hover   | `color-mix(in oklch, var(--coral) 12%, transparent)`                                            | Accent outline hover background.              |
| Danger hover           | `oklch(0.93 0.06 27)`                                                                           | Danger ghost hover background.                |
| Keycap base            | `linear-gradient(180deg, #FFFDF7 0%, #EBE2CE 100%)`                                             | Default keycap material.                      |
| Modifier keycap        | `linear-gradient(180deg, #2C2825 0%, #1B1917 100%)`                                             | Dark modifier keycap.                         |
| Accent keycap          | `linear-gradient(180deg, oklch(0.82 0.14 32) 0%, oklch(0.70 0.18 32) 100%)`                     | Coral accent keycap.                          |
| Transparent keycap     | `repeating-linear-gradient(-45deg, rgba(27,25,23,.05) 0 4px, transparent 4px 8px), #F7F1E4`     | Fall-through / inherited key state.           |
| LED off                | `linear-gradient(180deg, #2A2724 0%, #1B1917 100%)`                                             | Off LED keycap and off swatch.                |
| Diff left pane         | `oklch(0.97 0.035 27)`                                                                          | Removed/base side of source diff.             |
| Diff right pane        | `oklch(0.97 0.035 150)`                                                                         | Added/working side of source diff.            |
| Added tag background   | `oklch(0.92 0.06 150)`                                                                          | Added tag fill.                               |
| Removed tag background | `oklch(0.92 0.06 27)`                                                                           | Removed tag fill.                             |
| Place banner           | `color-mix(in oklch, var(--coral) 18%, var(--surface))`                                         | Single-key placement banner.                  |
| Pick bar               | `color-mix(in oklch, var(--teal) 16%, var(--surface))`                                          | Combo picking banner.                         |
| RGB preview            | `linear-gradient(90deg, oklch(0.70 0.18 var(--h,32)), oklch(0.70 0.13 calc(var(--h,32) + 60)))` | Lighting preview strip.                       |

## Spacing And Sizing

There is no named spacing custom-property scale. Spacing is hard-coded in CSS, with repeated values functioning as the token scale.

| Value   | Common uses                                                                     |
| ------- | ------------------------------------------------------------------------------- |
| `2px`   | Segmented-control internal gap/padding, switch knob offset, timeline track gap. |
| `3px`   | Segment container padding, nav item gap, key hero copy gap.                     |
| `4px`   | Small icon gaps, cap top gap, change-row padding, diff line radius.             |
| `5px`   | Keyboard row/key gaps, keycap padding top, tweak row gap.                       |
| `6px`   | Field gaps, chip/icon gaps, tag/action gaps, keycode grid gap.                  |
| `7px`   | Keycap horizontal padding, keycode group gap, button gap.                       |
| `8px`   | Layer gap, swatches gap, nav foot gap, list action gaps.                        |
| `9px`   | Brand gap, account gap, nav-device gap, modal-head gap.                         |
| `10px`  | Card header gap, nav item horizontal gap, modal/action gaps, list-row gap.      |
| `11px`  | Small button horizontal padding, nav item vertical padding, nav-device padding. |
| `12px`  | Topbar gap, field/card gaps, modal gap, diff pane padding.                      |
| `13px`  | Card header vertical padding, map info vertical padding.                        |
| `14px`  | Button horizontal padding, key hero gap, device card gap, modal body gap.       |
| `15px`  | Key hero/card row padding, diff pane horizontal padding.                        |
| `16px`  | Card body padding, browse grid gap, log padding, tweak panel offset.            |
| `18px`  | Main content gap, version page gap, button/icon cluster spacing.                |
| `20px`  | Appbar horizontal padding, timeline gap, modal radius token.                    |
| `22px`  | Body page padding, inspector side padding, switch height.                       |
| `24px`  | Main horizontal padding, stage vertical padding, inspector dock padding.        |
| `26px`  | Brand mark, chip height, close button, toast bottom offset.                     |
| `28px`  | Segmented tab height, focus/dense controls.                                     |
| `29px`  | Small button height.                                                            |
| `30px`  | Connect H1 size, account avatar size.                                           |
| `34px`  | Default button/input/layer-chip height.                                         |
| `38px`  | Switch width.                                                                   |
| `40px`  | Connect wrapper vertical padding, avatar size in profile header.                |
| `44px`  | Device icon box.                                                                |
| `50px`  | Minimum keycap height.                                                          |
| `56px`  | Topbar / LED chip / big cap dimensions.                                         |
| `58px`  | Appbar minimum height.                                                          |
| `72px`  | Default split keyboard gap.                                                     |
| `80px`  | Editor split gap and design-canvas section bottom margin.                       |
| `92px`  | RGB preview height.                                                             |
| `208px` | Left nav width.                                                                 |
| `300px` | Browse card width and versions save-point side rail.                            |
| `320px` | Versions history side rail.                                                     |
| `340px` | Editor inspector side width and Library `Use it` card width.                    |
| `420px` | Flash modal width.                                                              |
| `560px` | Browse preview modal width / connect max width.                                 |

## Radii

| Token / value      |   Value | Uses                                                                     |
| ------------------ | ------: | ------------------------------------------------------------------------ |
| `--r-1`            |   `6px` | Small rounded controls.                                                  |
| `--r-2`            |   `9px` | Buttons, inputs, nav items, key hero inner controls, modal small radius. |
| `--r-3`            |  `13px` | Cards, device cards, profile popover, RGB preview, option cards.         |
| `--r-4`            |  `20px` | Modal radius.                                                            |
| Brand mark         |   `7px` | `brand-mark`.                                                            |
| Keycap             |   `8px` | Main keycap body.                                                        |
| Big cap / LED chip |   `9px` | Inspector key hero cap and LED hero chip.                                |
| Frame              |  `12px` | Legacy `.frame` wrapper.                                                 |
| Pill               | `999px` | Chips, switches, segmented tabs, tag pills, toast, swatches.             |

## Typography

| Token / selector      | Value                                                         | Role                                  |
| --------------------- | ------------------------------------------------------------- | ------------------------------------- |
| Font import           | `Inter:wght@400;450;500;600;700` and `Departure Mono`         | Primary sans and mono families.       |
| `--sans`              | `'Inter', system-ui, sans-serif`                              | Body/UI font.                         |
| `--mono`              | `'Departure Mono', ui-monospace, 'JetBrains Mono', monospace` | Brand, labels, keycaps, code-like UI. |
| `html, body`          | `14px`, `var(--sans)`, antialiasing                           | Base app text.                        |
| `.mono`               | `var(--mono)`, `letter-spacing: .02em`                        | Generic mono utility.                 |
| `.brand`              | `13px`, `600`, `.08em`, mono                                  | Brand wordmark.                       |
| `.appbar h2`          | `16px`, `600`, `letter-spacing: -.01em`                       | Route title.                          |
| `.card-header h3`     | `12px`, `600`, `.06em`, uppercase, mono                       | Card titles.                          |
| `.field-label`        | `10px`, `.1em`, uppercase, mono                               | Field labels.                         |
| `.btn`                | `13px`, `500`; small `12px`; xs `11px`                        | Buttons.                              |
| `.chip`               | `11px`, `.03em`, mono                                         | Pills/chips.                          |
| `.seg [role=tab]`     | `12px`, `.03em`, mono                                         | Segmented tabs.                       |
| `.keycap .cap-legend` | `9px`, uppercase, mono                                        | Physical legend on keycap.            |
| `.keycap .cap-src`    | `8px`, `600`, `.04em`, mono                                   | Layer source marker.                  |
| `.keycap .g-main`     | `13px`, `500`, `line-height: 1.05`, mono                      | Main key glyph.                       |
| `.keycap .g-sub`      | `8px`, uppercase, `.05em`, mono                               | Secondary key glyph.                  |
| `.key-hero h2`        | `17px`, `500`, `.02em`, mono                                  | Inspector selected key code.          |
| `.connect-inner h1`   | `30px`, `600`, mono                                           | Connect hero title.                   |
| `.eyebrow`            | `11px`, `.12em`, uppercase, mono                              | Connect step label.                   |
| `.log`                | `12px`, `line-height: 1.7`, mono                              | Build/flash command log.              |

## Shadows / Elevation

| Token / selector | Value                                                                             | Role                                 |
| ---------------- | --------------------------------------------------------------------------------- | ------------------------------------ |
| `--shadow-cap`   | `0 1px 0 rgba(0,0,0,.09), 0 2px 0 rgba(0,0,0,.16), 0 4px 7px rgba(27,25,23,.10)`  | Keycap depth.                        |
| `--shadow-card`  | `0 1px 0 rgba(27,25,23,.03), 0 10px 26px -14px rgba(27,25,23,.14)`                | Card and active tab elevation.       |
| Keycap selected  | `0 0 0 2px var(--coral), 0 2px 0 rgba(0,0,0,.16), 0 8px 14px rgba(214,99,64,.24)` | Selected key focus ring/elevation.   |
| Keycap picked    | `0 0 0 2px var(--teal), var(--shadow-cap)`                                        | Combo/light selection marker.        |
| Swatch pressed   | `0 0 0 2px var(--ink), inset 0 -2px 3px rgba(0,0,0,.12)`                          | Active LED swatch.                   |
| Profile popover  | `0 16px 44px -14px rgba(0,0,0,.4)`                                                | Nav account popover.                 |
| Toast            | `0 10px 30px -8px rgba(0,0,0,.4)`                                                 | Floating toast.                      |
| Modal            | `0 24px 70px -20px rgba(0,0,0,.5)`                                                | Flash/browse modal.                  |
| Switch knob      | `0 1px 2px rgba(0,0,0,.25)`                                                       | Toggle knob.                         |
| Sequence key     | `0 1px 0 rgba(0,0,0,.16)`                                                         | Mini key tokens in macro/combo rows. |

## Theming / Accent Mechanism

| Piece               | Source                              | Behavior                                                                                                                                                  |
| ------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Accent options      | `ACCENTS` in `Klakson.html`         | Coral `oklch(0.72 0.17 32)`, Teal `oklch(0.72 0.13 195)`, Lilac `oklch(0.76 0.11 305)`, Mustard `oklch(0.82 0.12 90)`.                                    |
| Persistence hook    | `useTweaks` in `tweaks-panel.jsx`   | Holds tweak state and posts `__edit_mode_set_keys` to the host so the edit-mode block can be persisted.                                                   |
| Runtime application | `React.useEffect` in `Klakson.html` | Writes `--coral` directly on `document.documentElement` whenever `tweaks.accent` changes.                                                                 |
| CSS dependency      | `styles.css`                        | Buttons, switches, selected rings, place banner, active key pills, and similar accent UI read `var(--coral)`.                                             |
| Limitation          | `styles.css`                        | Only `--coral` is overridden. `--coral-ink` and hard-coded hue-32 expressions such as accent hover/keycap gradients stay coral unless separately updated. |
