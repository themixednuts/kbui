# Design Fidelity Audit

Summary counts: 51 FIX / 5 INTENTIONAL / 9 UNCERTAIN

## Top FIX Items

1. App shell brand mark changed from the handoff's 26px ink square with text K to a 28px coral SVG logo.
2. Connect now shows the global appbar even though the handoff suppresses it on the connect screen.
3. Connect changed from a centered 560px flow to a two-column 860px hero with a 36-64px uppercase headline.
4. Editor board stage is now a framed, textured, zoomable viewport instead of the handoff's plain centered flex stage.
5. Keyboard board renderer changed from flex rows to absolute-positioned keys with pan/zoom controls.
6. Keycap face values drifted: radius, padding, min-height, gradient, and default inset source shadow differ from the handoff.
7. Editor inspector changed from a fixed 340px side card to a resizable pane with chrome and gradient background.
8. Browse cards changed from fixed 300px cards with simple previews to responsive rounded-8 cards with textured 132px previews.
9. Browse modal changed from a 560px simple modal to an 1120px split modal.
10. Versions change rows no longer show before/after values and the arrow affordance from the handoff.
11. Settings sliders use an 8px bordered track and stacked bounds instead of the handoff's 4px inline slider row.
12. Shared Button currently uses pill radius globally, while the handoff button radius is `var(--r-2)` / 9px.

## Shared Primitives

| Screen | Element | Handoff value | Current value | Classification |
| --- | --- | --- | --- | --- |
| Shared primitives | Button shape | `.btn` height 34px, padding `0 14px`, radius `var(--r-2)` = 9px, font 13px/500 (`resources/kbgui-handoff/kbgui/project/styles.css:125-131`) | `Button.svelte` uses `rounded-pill` for all variants; sm is 28px high and md remains 34px (`src/lib/components/ui/Button.svelte:31-45`) | FIX |
| Shared primitives | Card shell | `.card` radius `var(--r-3)` = 13px; header padding `13px 16px`; body padding 16px (`resources/kbgui-handoff/kbgui/project/styles.css:187-204`) | shadcn card radius 14px, header `px-[18px] py-3.5`, content `px-[18px] py-[18px]` (`src/lib/components/ui/card/card.svelte:16-18`, `src/lib/components/ui/card/card-header.svelte:16-18`, `src/lib/components/ui/card/card-content.svelte:13-16`) | FIX |
| Shared primitives | Switch geometry | Width 38px, height 22px, padding 2px, knob 16px, off background `var(--surface-3)` (`resources/kbgui-handoff/kbgui/project/styles.css:238-249`) | default switch is 32px x 18.4px with 16px thumb and transparent border; sm is 24px x 14px (`src/lib/components/ui/switch/switch.svelte:16-29`) | FIX |
| Shared primitives | Slider geometry | `.slider-row` is inline with 88px label, 46px value, range track 4px, thumb 16px (`resources/kbgui-handoff/kbgui/project/styles.css:357-368`) | `SliderField` uses an 8px bordered track, 14px thumb, optional stacked bounds/default badge (`src/lib/components/ui/SliderField.svelte:4-16`, `src/lib/components/ui/SliderField.svelte:132-184`) | FIX |
| Shared primitives | Input radius | `.input` radius `var(--r-2)` = 9px (`resources/kbgui-handoff/kbgui/project/styles.css:207-214`) | `.input` radius is 8px (`src/app.css:562-573`) | FIX |
| Shared primitives | Segmented nav typography/iconography | Handoff `Seg` renders text tabs only; tab letter spacing `.03em` (`resources/kbgui-handoff/kbgui/project/shared.jsx:57-71`, `resources/kbgui-handoff/kbgui/project/styles.css:228-235`) | `SegmentedNav` can render Lucide icons and uses `tracking-[0.04em]` (`src/lib/components/ui/SegmentedNav.svelte:47-73`) | FIX |

## App Shell

| Screen | Element | Handoff value | Current value | Classification |
| --- | --- | --- | --- | --- |
| App shell | Root shell layout | `.app` is a flex row, full viewport, paper background; nav is a fixed 208px flex rail (`resources/kbgui-handoff/kbgui/project/styles.css:477-482`) | shell root is CSS grid with responsive 208px/72px/58px columns and radial background (`src/routes/(app)/+layout.svelte:306-309`) | FIX |
| App shell | Nav rail spacing/background | Nav padding `14px 12px`, gap 14px, background `var(--surface)` (`resources/kbgui-handoff/kbgui/project/styles.css:481-489`) | left rail gap 18px, border-bottom brand row, color-mixed surface/paper background (`src/routes/(app)/+layout.svelte:308-313`) | FIX |
| App shell | Brand mark | 26px x 26px, radius 7px, ink background, paper text K (`resources/kbgui-handoff/kbgui/project/styles.css:117-121`, `resources/kbgui-handoff/kbgui/project/app-shell.jsx:39-40`) | 28px x 28px coral mark with SVG path, mint dot, and cap shadow (`src/lib/components/ui/Brand.svelte:18-50`) | FIX |
| App shell | Nav item active state | `.nav-item` flex, gap 11px, padding `9px 11px`, radius 9px; active `background: var(--ink); color: var(--paper)` (`resources/kbgui-handoff/kbgui/project/styles.css:485-488`) | nav item is grid, min-height 38px, radius 8px, border/shadow on active (`src/routes/(app)/+layout.svelte:314-317`) | FIX |
| App shell | Appbar layout/type | `.appbar` gap 10px, padding `0 20px`, min-height 58px, background `var(--surface)`; title 16px/600 (`resources/kbgui-handoff/kbgui/project/styles.css:516-518`) | appbar gap 8px, color-mixed background, responsive wrap, title 17px/bold (`src/routes/(app)/+layout.svelte:374-377`) | FIX |
| App shell | Connect appbar presence | Handoff skips appbar on connect (`resources/kbgui-handoff/kbgui/project/app-shell.jsx:101-114`) | current layout renders the appbar unconditionally for all app routes (`src/routes/(app)/+layout.svelte:613-658`) | FIX |
| App shell | Footer device status | `.nav-device` padding `10px 11px`, radius 9px, background `var(--surface)` (`resources/kbgui-handoff/kbgui/project/styles.css:513-515`) | device status min-height 48px, radius 10px, color-mixed surface background and responsive icon-only mode (`src/routes/(app)/+layout.svelte:360-372`) | FIX |
| App shell | Profile popover | Popover left/right 10px, bottom 118px, gap 10px, padding 12px, radius 13px (`resources/kbgui-handoff/kbgui/project/styles.css:499-512`) | current popover is overflow-hidden, radius 12px, bottom 114px, altered action/link/stat layout (`src/routes/(app)/+layout.svelte:322-351`) | FIX |

## Editor - Keys

| Screen | Element | Handoff value | Current value | Classification |
| --- | --- | --- | --- | --- |
| Editor keys | Starter board picker | Handoff toolbar has only lens Seg, layer stack, spacer, and fall-through/selection chip (`resources/kbgui-handoff/kbgui/project/artboards-keymap.jsx:133-142`) | current toolbar inserts "Starter boards" chip and Workbench 65 / Corney Split 34 picker (`src/routes/(app)/editor/+page.svelte:218-224`) | INTENTIONAL |
| Editor keys | Board stage container | `.stage` is plain flex center with `padding: 24px 0`; board is not inside a bordered card (`resources/kbgui-handoff/kbgui/project/styles.css:97-103`, `resources/kbgui-handoff/kbgui/project/artboards-keymap.jsx:217-225`) | board stage has min-height 430px, rounded 12px border, color-mixed surface background, and card shadow (`src/routes/(app)/editor/+page.svelte:64-69`, `src/routes/(app)/editor/+page.svelte:348-367`) | FIX |
| Editor keys | Layer chips | Height 34px, padding `0 13px 0 10px`, font 13px, no shadow (`resources/kbgui-handoff/kbgui/project/styles.css:171-184`) | layer buttons are 36px high, min-width 74px, padding 15px, font 12px, shadow-card, hover translate (`src/lib/components/editor/EditorLayerStack.svelte:14-22`) | FIX |
| Editor keys | Board renderer layout | Handoff renderer uses `.kb` flex columns and `.kb-row` flex rows (`resources/kbgui-handoff/kbgui/project/keyboard.jsx:130-165`, `resources/kbgui-handoff/kbgui/project/styles.css:297-300`) | current board uses a scrollable textured grid viewport with absolute key plane and absolute keycaps (`src/lib/components/board/KeyboardBoard.svelte:27-31`, `src/lib/components/board/KeyboardBoard.svelte:293-371`) | FIX |
| Editor keys | Keycap face | Handoff keycap min-height 50px, padding `5px 7px 6px`, radius 8px, gradient `#FFFDF7` to `#EBE2CE` (`resources/kbgui-handoff/kbgui/project/styles.css:251-263`) | current face is absolute child with padding `7px 5px 6px`, derived height, radius var, gradient var, and default inset source shadow (`src/lib/components/board/Keycap.svelte:34-38`) | FIX |
| Editor keys | Inspector layout | Handoff inspector is a fixed 340px side column with `padding: 22px 22px 22px 0`; content is a card (`resources/kbgui-handoff/kbgui/project/styles.css:328-330`, `resources/kbgui-handoff/kbgui/project/artboards-keymap.jsx:251-256`) | current inspector is a resizable pane with chrome, collapse handle, 30% default size, border-left, gradient background (`src/lib/components/keymap/KeyInspectorPanel.svelte:36-67`, `src/app.css:1125-1140`) | FIX |
| Editor keys | Key hero | Handoff hero background `var(--surface-2)`, radius 13px; big cap 56px, radius 9px, font 16px (`resources/kbgui-handoff/kbgui/project/styles.css:332-342`) | current hero is grid, has border/color-mix background, radius 12px; big cap is 58px, font 20px (`src/lib/components/editor/EditorKeyInspector.svelte:105-116`) | FIX |
| Editor keys | Keycode picker structure | Handoff `KeycodePicker` is grouped pill lists only (`resources/kbgui-handoff/kbgui/project/shared.jsx:142-165`) | current adds Keycode input + Apply button and a Workspace logic section before reset/clear actions (`src/lib/components/editor/EditorKeyInspector.svelte:187-257`) | UNCERTAIN |
| Editor keys | Active layer stack card | Handoff uses a standard `.card` header/body, row body, stack meta on the header (`resources/kbgui-handoff/kbgui/project/artboards-keymap.jsx:205-212`) | current `ActiveStackCard` is a custom grid, rounded 10px, color-mixed background, and custom header/body layout (`src/lib/components/editor/ActiveStackCard.svelte:14-36`) | FIX |

## Editor - Lighting

| Screen | Element | Handoff value | Current value | Classification |
| --- | --- | --- | --- | --- |
| Editor lighting | Lighting hero chip | `.led-chip` is 56px x 56px, radius 9px, simple border and inset shadow (`resources/kbgui-handoff/kbgui/project/styles.css:322-324`, `resources/kbgui-handoff/kbgui/project/artboards-keymap.jsx:184-190`) | current preview is 58px, rounded big-cap, color-mix gradient, extra inset glow (`src/lib/components/editor/EditorLightingInspector.svelte:81-103`) | FIX |
| Editor lighting | Swatches | Handoff swatches are 26px circles, hover scale 1.1, active `0 0 0 2px var(--ink)` (`resources/kbgui-handoff/kbgui/project/styles.css:309-320`) | current swatches are 28px, hover scale 1.08, active also changes border (`src/lib/components/editor/EditorLightingInspector.svelte:112-123`) | FIX |
| Editor lighting | Drag hint copy/style | Handoff hint uses `.lens-hint` surface-2, radius 9px, full shortcut copy: drag, Shift-drag, Cmd/Ctrl-click, click empty (`resources/kbgui-handoff/kbgui/project/styles.css:325-326`, `resources/kbgui-handoff/kbgui/project/artboards-keymap.jsx:213-215`) | current hint is bordered/color-mixed and only says "Drag across keys to select" (`src/routes/(app)/editor/+page.svelte:397-401`) | FIX |
| Editor lighting | Global effect tabs | Handoff effect Seg has text-only Solid/Reactive/Rainbow (`resources/kbgui-handoff/kbgui/project/artboards-keymap.jsx:197-199`) | current effect tabs include Palette/Sparkles/Blend Lucide icons (`src/lib/components/editor/EditorLightingInspector.svelte:33-37`, `src/lib/components/editor/EditorLightingInspector.svelte:182-190`) | FIX |

## Editor - Split

| Screen | Element | Handoff value | Current value | Classification |
| --- | --- | --- | --- | --- |
| Editor split | Inspector dock | Handoff split uses `.inspector-dock`: border-top, `background: var(--surface)`, padding `16px 24px`, gap 14px (`resources/kbgui-handoff/kbgui/project/styles.css:328-330`, `resources/kbgui-handoff/kbgui/project/artboards-keymap.jsx:230-246`) | current dock uses color-mixed surface/paper, `px 22 pt 10 pb 12`, and a top shadow (`src/routes/(app)/editor/+page.svelte:70-71`, `src/routes/(app)/editor/+page.svelte:407-416`) | FIX |
| Editor split | Split seam and label | Handoff seam is a flex `.kb-gap` with dashed border and the split label renders below the board in the stage (`resources/kbgui-handoff/kbgui/project/styles.css:301-307`, `resources/kbgui-handoff/kbgui/project/artboards-keymap.jsx:223`) | current seam and label are absolutely positioned inside the key plane/surface (`src/lib/components/board/KeyboardBoard.svelte:328-359`) | FIX |
| Editor split | Compact inspector content | Handoff compact split inspector is one row: KeyHero, compact Quick pick, Color/Reset actions (`resources/kbgui-handoff/kbgui/project/artboards-keymap.jsx:232-238`) | current compact inspector still has hero, tabs, scroll area, target OS chip, and clear button (`src/lib/components/editor/EditorKeyInspector.svelte:86-178`) | FIX |
| Editor split | Zoom readout/control | Handoff renderer has no visible zoom control (`resources/kbgui-handoff/kbgui/project/keyboard.jsx:217-219`) | current board always renders a bottom-right zoom readout reset button (`src/lib/components/board/KeyboardBoard.svelte:364-371`) | UNCERTAIN |

## Library

| Screen | Element | Handoff value | Current value | Classification |
| --- | --- | --- | --- | --- |
| Library | Route background/layout | Handoff body is plain flex with padding 22px and gap 18px (`resources/kbgui-handoff/kbgui/project/artboards-rest.jsx:16-18`) | current route adds radial background and grid min-height/layout wrappers (`src/routes/(app)/library/+page.svelte:42-48`, `src/routes/(app)/library/+page.svelte:283-285`) | FIX |
| Library | Entry rows | `.entry-card` is flex, gap 14px, padding `13px 15px`, background `var(--surface-2)`, radius 9px (`resources/kbgui-handoff/kbgui/project/styles.css:420-426`, `resources/kbgui-handoff/kbgui/project/artboards-rest.jsx:26-55`) | current rows are grid, background `paper-2`, padding 10px, transparent border, radius keycap, hover translate (`src/routes/(app)/library/+page.svelte:53-57`, `src/routes/(app)/library/+page.svelte:311-420`) | FIX |
| Library | Header controls | Handoff header has title, section Seg, and a "define" tag (`resources/kbgui-handoff/kbgui/project/artboards-rest.jsx:19-24`) | current header adds item count chip and "New macro/combo/tap dance" action (`src/routes/(app)/library/+page.svelte:286-299`) | UNCERTAIN |
| Library | Use-it panel scope | Handoff right card is a placement summary with concise copy, sequence preview, Place/Edit/Duplicate buttons (`resources/kbgui-handoff/kbgui/project/artboards-rest.jsx:60-83`) | current right panel is a full editor form for name, trigger/output/layers/members/source key, plus duplicate/delete (`src/routes/(app)/library/+page.svelte:425-668`) | UNCERTAIN |
| Library | Empty/unassigned draft states | Handoff sample is populated (`resources/kbgui-handoff/kbgui/project/artboards-rest.jsx:26-55`) | current renders empty panels such as "No macros" / "Create macro" and draft notes (`src/routes/(app)/library/+page.svelte:303-310`, `src/routes/(app)/library/+page.svelte:345-350`) | INTENTIONAL |

## Browse

| Screen | Element | Handoff value | Current value | Classification |
| --- | --- | --- | --- | --- |
| Browse | Header/filter structure | Handoff starts with tag row, optional compatibility button, then muted explanatory paragraph (`resources/kbgui-handoff/kbgui/project/browse.jsx:66-82`) | current adds Community eyebrow, H2, search box, filter panel, official filter, sort Seg, and result count chip (`src/routes/(app)/browse/+page.svelte:368-437`) | UNCERTAIN |
| Browse | Tag pill styling | Handoff `.browse-tag` is 5px/12px padding, surface background, active ink/paper (`resources/kbgui-handoff/kbgui/project/styles.css:559-563`) | current filter buttons use paper-2, 28px min-height, coral active state, and visible `#` prefixes (`src/routes/(app)/browse/+page.svelte:56-59`, `src/routes/(app)/browse/+page.svelte:390-407`) | FIX |
| Browse card | Card dimensions/radius | Handoff `.map-card` fixed width 300px, radius 13px, `border: var(--line)`, card shadow (`resources/kbgui-handoff/kbgui/project/styles.css:564-569`) | current card grid uses responsive `minmax(280px,1fr)` and cards are radius 8px with `border-line-2` (`src/routes/(app)/browse/+page.svelte:66-67`, `src/lib/components/browse/CommunityKeymapCard.svelte:16-17`) | FIX |
| Browse card | Preview plane | Handoff preview min-height 96px, padding 16px, background `var(--surface-2)`, no texture (`resources/kbgui-handoff/kbgui/project/styles.css:565-568`) | current preview is a 132px row with grid texture, paper-2/surface mix, and per-cell grid preview (`src/lib/components/browse/CommunityKeymapCard.svelte:18-25`) | FIX |
| Browse card | Card actions | Handoff has two equal actions: Preview and Adopt (`resources/kbgui-handoff/kbgui/project/browse.jsx:97-100`) | current card exposes only a Preview action; adopt is only in the modal (`src/lib/components/browse/CommunityKeymapCard.svelte:128-131`) | FIX |
| Browse card | Official badge and metrics | Handoff uses fake-ish likes/downloads/compiles signals in sample cards (`resources/kbgui-handoff/kbgui/project/browse.jsx:41-47`, `resources/kbgui-handoff/kbgui/project/browse.jsx:90-96`) | current shows Official curated badges and real counts, with no compile badge (`src/lib/components/browse/CommunityKeymapCard.svelte:86-126`) | INTENTIONAL |
| Browse modal | Modal size/layout | Handoff modal is 560px wide, simple vertical stack, rounded 20px, with a big mini-preview (`resources/kbgui-handoff/kbgui/project/styles.css:546-548`, `resources/kbgui-handoff/kbgui/project/browse.jsx:107-124`) | current modal is up to 1120px wide, min 680px tall, rounded 10px, split into full board panel and 300px detail panel (`src/lib/components/browse/CommunityPreviewModal.svelte:52-74`, `src/lib/components/browse/CommunityPreviewModal.svelte:128-190`) | FIX |

## Versions

| Screen | Element | Handoff value | Current value | Classification |
| --- | --- | --- | --- | --- |
| Versions | Changes tab label | Handoff label uses `Changes` plus a dot/count suffix when dirty (`resources/kbgui-handoff/kbgui/project/artboards-diff.jsx:21-24`) | current label uses `Changes - {count}` (`src/routes/(app)/versions/+page.svelte:47-53`) | FIX |
| Versions | Change metrics | Handoff changes view starts directly with the Uncommitted changes card plus Save point sidebar (`resources/kbgui-handoff/kbgui/project/artboards-diff.jsx:26-60`) | current inserts three metric cards for Keymap/Lighting/Settings above the changes panel (`src/routes/(app)/versions/+page.svelte:79-87`, `src/routes/(app)/versions/+page.svelte:340-359`) | UNCERTAIN |
| Versions changes | Change row content/style | Handoff `.change-row` is flex, border-bottom, includes kind icon, path, before value, arrow, after value (`resources/kbgui-handoff/kbgui/project/styles.css:534-543`, `resources/kbgui-handoff/kbgui/project/artboards-diff.jsx:34-43`) | current row is grid with kind initial, path, scope/kind only, hover card styling, no before/after values (`src/lib/components/versioning/VersionChangesPanel.svelte:40-47`, `src/app.css:1376-1406`) | FIX |
| Versions changes | Discard action | Handoff Save point sidebar has Save point and Discard all buttons (`resources/kbgui-handoff/kbgui/project/artboards-diff.jsx:55-58`) | current sidebar has Save point plus a clean/local-change status card; no discard action (`src/routes/(app)/versions/+page.svelte:383-405`) | FIX |
| Versions timeline | Timeline rail | Handoff `.timeline` is flex wrap; `.track-line` is a 2px border-left with padding-left 20px, savepoints have margin-left dot (`resources/kbgui-handoff/kbgui/project/styles.css:406-418`, `resources/kbgui-handoff/kbgui/project/artboards-diff.jsx:67-85`) | current uses a fixed 3-column grid and a pseudo-element rail with rounded-pill styling (`src/routes/(app)/versions/+page.svelte:110-125`, `src/routes/(app)/versions/+page.svelte:427-470`) | FIX |
| Versions diff | Diff pane primitives | Handoff CSS defines `.diff-side`, `.diff-pane`, `.file-row` review primitives (`resources/kbgui-handoff/kbgui/project/styles.css:388-404`) | current Versions renders only `VersionChangesPanel` instances and has no diff-side/diff-pane/file-row markup (`src/routes/(app)/versions/+page.svelte:354-359`, `src/routes/(app)/versions/+page.svelte:530-535`) | FIX |
| Versions savepoint | Restore/flash action tones | Handoff Restore is neutral default and Flash this is accent solid (`resources/kbgui-handoff/kbgui/project/artboards-diff.jsx:100-103`) | current Restore and Flash this both use `variant="coral"` (`src/routes/(app)/versions/+page.svelte:512-520`) | FIX |

## Connect

| Screen | Element | Handoff value | Current value | Classification |
| --- | --- | --- | --- | --- |
| Connect | Main layout and H1 | Handoff `.connect-wrap` centers a max-width 560px column; H1 is 30px mono, normal case (`resources/kbgui-handoff/kbgui/project/styles.css:464-468`, `resources/kbgui-handoff/kbgui/project/artboards-rest.jsx:147-151`) | current uses a two-column 860px onboarding grid, background workbench lines, ghost keycap, and a 36-64px uppercase H1 (`src/routes/(app)/connect/+page.svelte:319-352`, `src/app.css:753-834`) | FIX |
| Connect | Device/option card styling | Handoff `.device-card` has 44px icon, gap 14px, padding `13px 15px`, background `var(--surface-2)`, radius 13px (`resources/kbgui-handoff/kbgui/project/styles.css:445-452`, `resources/kbgui-handoff/kbgui/project/artboards-rest.jsx:152-167`) | current connection options are 72px grid rows, 42px icon, rounded 10px, paper-2/coral states, uppercase action pill (`src/routes/(app)/connect/+page.svelte:76-98`, `src/routes/(app)/connect/+page.svelte:354-492`) | FIX |
| Connect | Connection option set | Handoff lists two example devices plus one unsupported HID row (`resources/kbgui-handoff/kbgui/project/artboards-rest.jsx:142-167`) | current lists WebHID, ZMK BLE, ZMK USB, import JSON, local-only, optional disconnect, and dev demos (`src/routes/(app)/connect/+page.svelte:355-492`) | UNCERTAIN |
| Connect | Dev demo targets | Handoff has mock device rows as sample content (`resources/kbgui-handoff/kbgui/project/artboards-rest.jsx:142-167`) | current gates demo VIA/ZMK targets behind `import.meta.env.DEV` (`src/routes/(app)/connect/+page.svelte:425-455`) | INTENTIONAL |
| Connect | Continue without device placement | Handoff places "Load profile" and "Continue without a device" as footer buttons below the card (`resources/kbgui-handoff/kbgui/project/artboards-rest.jsx:169-172`) | current "Continue without a device" is a full connection option row inside the card (`src/routes/(app)/connect/+page.svelte:479-492`) | FIX |

## Settings

| Screen | Element | Handoff value | Current value | Classification |
| --- | --- | --- | --- | --- |
| Settings | Page structure | Handoff is a wrapped `.body` with padding 22px, gap 18px, and Timing/Toggles/Split transport cards only (`resources/kbgui-handoff/kbgui/project/artboards-rest.jsx:92-133`) | current adds route-level radial background, toolbar title/meter/review button, and two-column settings grid (`src/routes/(app)/settings/+page.svelte:149-166`, `src/routes/(app)/settings/+page.svelte:596-619`) | FIX |
| Settings | Timing sliders | Handoff uses inline `.slider-row` controls with 4px range track and 16px thumb (`resources/kbgui-handoff/kbgui/project/styles.css:356-368`, `resources/kbgui-handoff/kbgui/project/artboards-rest.jsx:98-103`) | current `SliderField` uses stacked/bounded controls in Settings with 8px bordered track and default badges (`src/lib/components/ui/SliderField.svelte:4-16`, `src/routes/(app)/settings/+page.svelte:630-651`) | FIX |
| Settings | Toggles list content | Handoff has four toggles: Permissive hold, Retro tapping, NKRO, Mouse keys (`resources/kbgui-handoff/kbgui/project/artboards-rest.jsx:108-119`) | current behavior toggle list has three entries and omits Mouse keys (`src/routes/(app)/settings/+page.svelte:127-147`, `src/routes/(app)/settings/+page.svelte:670-687`) | FIX |
| Settings | Toggle row styling | Handoff `.list-row` uses padding `11px 0` and only a bottom divider (`resources/kbgui-handoff/kbgui/project/styles.css:383-386`) | current toggle rows are rounded cards with paper-2 background, padding 12px/11px, hover border (`src/routes/(app)/settings/+page.svelte:201-205`, `src/routes/(app)/settings/+page.svelte:670-685`) | FIX |
| Settings | Split transport options | Handoff `.opt-card` is flex equal width, centered, padding `14px 10px`, background surface-2, radius 13px (`resources/kbgui-handoff/kbgui/project/styles.css:454-459`, `resources/kbgui-handoff/kbgui/project/artboards-rest.jsx:123-130`) | current transport options are min-height 92px, left-aligned, rounded keycap, paper background, disabled reason text (`src/routes/(app)/settings/+page.svelte:206-213`, `src/routes/(app)/settings/+page.svelte:699-724`) | FIX |
| Settings | Extra app/integration cards | Handoff settings contains only global keyboard config cards (`resources/kbgui-handoff/kbgui/project/artboards-rest.jsx:92-133`) | current adds Monkeytype, Monkeytype run tagger, Target OS, and Accent preference cards (`src/routes/(app)/settings/+page.svelte:729-1031`) | UNCERTAIN |

## Flash Overlay

| Screen | Element | Handoff value | Current value | Classification |
| --- | --- | --- | --- | --- |
| Flash overlay | Modal size and step model | Handoff modal is 420px wide, 20px padding, 3 vertical steps: compile, write, done (`resources/kbgui-handoff/kbgui/project/styles.css:546-557`, `resources/kbgui-handoff/kbgui/project/artboards-rest.jsx:190-214`) | current modal is up to 720px wide, 22px padding, six-step grid plus panels/actions (`src/lib/components/flash/FlashOverlay.svelte:72-87`, `src/lib/components/flash/FlashOverlay.svelte:785-817`) | UNCERTAIN |
| Flash overlay | Source facts/diagnostics | Handoff flash mock has no source fact cards or firmware diagnostics (`resources/kbgui-handoff/kbgui/project/artboards-rest.jsx:196-214`) | current adds source facts and build-readiness diagnostic banners (`src/lib/components/flash/FlashOverlay.svelte:819-880`) | INTENTIONAL |
| Flash overlay | Command log size | Handoff log uses 12px mono, line-height 1.7, dark background, inline `maxHeight: 150` (`resources/kbgui-handoff/kbgui/project/styles.css:461-462`, `resources/kbgui-handoff/kbgui/project/artboards-rest.jsx:207-210`) | current command log uses 11px mono, min-height 170px, max-height 220px, whitespace-pre-wrap (`src/lib/components/flash/FlashOverlay.svelte:172-173`, `src/lib/components/flash/FlashOverlay.svelte:1042`) | FIX |
| Flash overlay | Backdrop/scrim | Handoff overlay is flex centered, background `rgba(24,20,16,.5)`, blur 6px (`resources/kbgui-handoff/kbgui/project/styles.css:546-548`) | current overlay is grid with a button scrim, background `rgba(27,25,23,0.46)`, blur 5px, mobile bottom alignment (`src/lib/components/flash/FlashOverlay.svelte:72-77`, `src/lib/components/flash/FlashOverlay.svelte:785-789`) | FIX |

