# htmlswap Svelte Pilot Report

Date: 2026-07-03

Inputs:
- Keymap editor: `resources/kbgui-handoff/kbgui/project/artboards-keymap.jsx` plus `keyboard.jsx`
- Browse: `resources/kbgui-handoff/kbgui/project/browse.jsx`
- Shared styles: `resources/kbgui-handoff/kbgui/project/styles.css`

Pilot artifacts:
- DC: `resources/pilot/dc/keymap.dc.html`, `resources/pilot/dc/browse.dc.html`
- Generated Svelte: `resources/pilot/svelte/Keymap.svelte`, `resources/pilot/svelte/Browse.svelte`
- Logs: `resources/pilot/logs/keymap.log`, `resources/pilot/logs/browse.log`, `resources/pilot/logs/svelte-validate.log`

## 1. Transcription Effort

### Keymap editor

The structural chrome mapped reasonably well to DC: the lens selector, layer buttons, active stack card, inspector tabs, keycode picker, lighting swatches, and form controls became normal HTML, `sc-for`, `sc-if`, ARIA state, and semantic button markers. The final DC keeps the single render root at `resources/pilot/dc/keymap.dc.html:5`, uses `sc-for` for lens tabs and layers at lines 9 and 17, and uses grammar-compliant tabs/switches at lines 8, 172, 297, and 314.

The keyboard board did not map cleanly as direct JSX. `keyboard.jsx` computes the visible key class list, dynamic width/background/box-shadow, title, source layer label, and lighting/fall-through state inside `Keycap` (`keyboard.jsx:80-109`). `BlockKeyboard` and `SplitKeyboard` derive resolved bindings and selected/marked state while walking nested board layout arrays (`keyboard.jsx:131-148`, `keyboard.jsx:169-211`). In DC this had to become a precomputed view model: `keyboard.rows`, `row.keys`, `key.className`, `key.style`, `key.sourceStyle`, `key.mainStyle`, etc. See `resources/pilot/dc/keymap.dc.html:64-79`.

The drag-select lighting behavior also does not fit declarative DC well. The React source uses refs, global pointer listeners, `document.elementFromPoint`, modifier keys, pointer capture, and dispatch calls (`artboards-keymap.jsx:84-123`). The DC source can only bind named handlers, so it preserves the event surface as `editor.startLightingSelection` and `editor.extendLightingSelection` on mouse events (`resources/pilot/dc/keymap.dc.html:59-61`) and leaves the real behavior to component script.

Other computed JSX also had to be externalized:
- Responsive key unit: `computeUnit`/`useWidth` in `artboards-keymap.jsx:18-35` became `keyboard.style`.
- KbRender props and board branch: `artboards-keymap.jsx:126-131` became the `keyboard.rows` model.
- Inspector branches: `artboards-keymap.jsx:155-203` became `inspector.*` and `lighting.*` bindings.
- Dynamic resets such as `physCode(kb, r, c)` and `friendlyCode(binding.code)` cannot appear in holes, so they are precomputed as labels/actions.

The source board is not canvas/SVG; it is DOM flex keycaps. That is good for htmlswap structurally, but the amount of runtime computation means a DC transcription still requires a substantial view-model script before it can run.

### Browse

Browse mapped better. The main page is static list chrome plus a modal, and the final DC uses `browse.tags`, `browse.maps`, preview board rows/cells, and `browse.preview.*` bindings (`resources/pilot/dc/browse.dc.html:8`, `42`, `53-61`, `135-171`).

The main non-clean mapping was `PreviewBoard`. In React it computes dimensions, gaps, border radius, ghost cells, highlight colors, split halves, and per-cell inline styles (`browse.jsx:7-37`). In DC this became a prepared preview model (`map.previewRows`, `previewRow.groups`, `group.cells`, `cell.style`) rather than JSX expressions.

Browse filtering/sorting and modal selection are also script concerns: tags, compatible-only filtering, sorting by likes, and preview lookup are computed in `browse.jsx:54-63`. The JSX ternary for the compatibility button variant (`browse.jsx:75`) became a simple binding, `browse.compatVariant`, at `resources/pilot/dc/browse.dc.html:26`.

The modal source uses `.overlay`/`.modal` CSS (`browse.jsx:108-117`). The DC markup remains flex-only, but the external stylesheet still contains fixed positioning and z-index for overlays (`styles.css:547`) plus other browser-only positioning (`styles.css:500`, `531`). Because the command passes the whole stylesheet, the Svelte adapter inlined those browser-only properties into Browse output (`resources/pilot/svelte/Browse.svelte:286`).

## 2. Generated Svelte Quality

### Diagnostics

htmlswap reported no diagnostics for either screen:

```text
keymap.log:
EXIT_CODE=0

browse.log:
EXIT_CODE=0
```

I also validated the generated components with the installed `svelte/compiler`:

```text
resources/pilot/svelte/Keymap.svelte: ERROR attribute_duplicate at 168:35
Attributes need to be unique
https://svelte.dev/e/attribute_duplicate
resources/pilot/svelte/Browse.svelte: OK
```

The important finding is that htmlswap can exit successfully while emitting Svelte that the Svelte compiler rejects.

### Svelte 5 idiom and cleanup

The adapter does use Svelte 5 runes at the top level: `Keymap.svelte` has `$props()` and `$state()` at `resources/pilot/svelte/Keymap.svelte:3-4`; `Browse.svelte` has `$props()` at `resources/pilot/svelte/Browse.svelte:3`.

The output is not yet shippable as idiomatic Svelte:
- Keymap is invalid Svelte because grammar-correct tab markup is emitted with duplicate roles: `role="tablist" role="tablist"` at `resources/pilot/svelte/Keymap.svelte:168`, repeated at lines 415 and 625. Tab buttons duplicate `role="tab"` at lines 171, 418, and 628. The switch duplicates `role="switch"` at line 656. I removed nonessential `aria-label`, `role=group`, and `aria-hidden` from DC, but keeping real tab/switch roles still triggers the adapter bug.
- Browse compiles, but its generated props include loop aliases as component props (`group`, `map`, `previewRow`) at `resources/pilot/svelte/Browse.svelte:3`. Keymap does the same with `group` and `row` at `resources/pilot/svelte/Keymap.svelte:3`.
- The adapter inlines most external CSS into every element. Example: Browse card buttons and preview cells carry large style strings at `resources/pilot/svelte/Browse.svelte:138-154`; Keymap key buttons do the same at `resources/pilot/svelte/Keymap.svelte:235`.
- The generated scoped CSS contains odd duplicated pseudo selectors such as `.hs_0.seg [role="tab"]:hover:hover` (`resources/pilot/svelte/Keymap.svelte:19`) and `.hs_0.browse-tag:hover:hover` (`resources/pilot/svelte/Browse.svelte:17`).
- The generated files are noisy: the whole stylesheet comment structure appears as `htmlswap-css-comment` blocks (`Keymap.svelte:106-160`, `Browse.svelte:39-93`), and every element has `htmlswap-source` comments unless `--no-source-comments` is used.
- The adapter strips some source intent markers. For example, `data-htmlswap-component="tabs"` in DC (`keymap.dc.html:8`) does not survive on the generated tablist (`Keymap.svelte:168`). The same happens for `data-htmlswap-component="keyboard"` and `keycap` (`keymap.dc.html:63`, `70`; generated around `Keymap.svelte:228`, `235`).
- Browser-only external CSS is not diagnosed for the Svelte target. Browse inlines `position: fixed` and `z-index: 300` from `.overlay` into `Browse.svelte:286`, despite the DC authoring subset being flexbox-only.

### What was dropped or lossy

There were no htmlswap diagnostics or warnings, so lossy behavior was not surfaced through the compiler logs.

Observed lossy or questionable output:
- `data-htmlswap-component` markers are removed from generated elements, while only source comments preserve the original tag.
- External CSS comments are emitted as source comments, not useful runtime code.
- Browser-only positioning from the shared stylesheet is accepted and inlined without warning.
- React behaviors are not represented: reducer dispatch payloads, pointer capture, `elementFromPoint`, `ResizeObserver`, and helper calls must be supplied by hand-written component script.

## 3. Recommendation

Recommendation: **(ii) port JSX to Svelte 5 directly by hand, using htmlswap's Svelte adapter output and DC grammar only as convention references.**

The evidence does not support committing to a full DC-transcribe -> compile -> refine pipeline yet. Browse proves that simple/static panels can be transcribed and can produce Svelte that at least compiles after minor DC cleanup. But even there, the output would need cleanup before shipping: oversized inline styles, noisy comments, leaked loop aliases in props, and externally imported positioning inlined into the component.

The keymap editor is the deciding screen. It is exactly the kind of core workflow this app needs to ship, and a faithful grammar-compliant transcription generated invalid Svelte because standard tab/switch roles were duplicated. More importantly, the interactive board needs substantial hand-authored script anyway for responsive sizing, resolved bindings, fall-through display, drag selection, lighting selection, reducer dispatches, and keycap style computation.

Screen category guidance:
- Static panels, cards, browse lists, settings forms: htmlswap/DC can be useful as an authoring convention or one-off scaffold, especially once the duplicate-attribute and CSS emission issues are fixed.
- Interactive keyboard board, drag-selection lighting, split-board rendering, live key binding inspectors: port directly to Svelte 5 by hand.
- Any future drag/canvas/SVG-heavy screen: port directly. DC can describe the surrounding chrome, but the interaction model belongs in Svelte code.

