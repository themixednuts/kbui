# Prototype Data Model

Sources: `resources/kbgui-handoff/kbgui/project/data.js` and `resources/kbgui-handoff/kbgui/project/store.jsx`.

## Static Demo Data

| Entity            | Shape                                                                                                                      | Relationships / notes                                                                                                               |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `KC`              | `{ mods, base, digits, layer, media, qmk, nav, punct }`, each an array of keycode strings.                                 | Keycode groups used as demo source material. The actual picker in `shared.jsx` also contains hard-coded groups.                     |
| `KEYBOARDS`       | Map keyed by board id (`"65"`, `"3x5+2"`). Each board has `id`, `name`, `vendor`, `protocol`, `matrix`, `split`, `layout`. | `store.boardId` selects one keyboard. `layout` is consumed by `KbRender` and helpers in `keyboard.jsx`.                             |
| 65% layout rows   | `layout: Array<Array<{ label, code, w?, x?, mod?, accent?, homing? }>>`.                                                   | `row()` computes x positions by accumulating widths. Coordinates are array indexes `(row, col)`.                                    |
| Split layout rows | `layout: Array<[leftHalf, rightHalf]>`, where halves are arrays of `{ label, code, ghost?, mod?, accent?, homing? }`.      | `SplitKeyboard` maps right-half columns to absolute `c + 5`; `physCode` uses `c < 5` to choose half.                                |
| `LAYERS`          | Map keyed by board id. Each layer has `id`, `name`, `color`, `overrides`.                                                  | Overrides are keyed by string coordinates like `"2,4"`. Missing override falls through; BASE missing resolves to physical key code. |
| `LEDS`            | Map keyed by board id. Each value has `base` color and `keys` coordinate-color map.                                        | Key LED colors are stored separately from layer bindings. `ledColor()` returns `null` for `"off"` and falls back to base.           |
| `MACROS`          | `{ id, name, trigger, seq, desc }[]`.                                                                                      | Library displays `seq`; placement writes a binding code `MACRO(label)`.                                                             |
| `COMBOS`          | `{ id, name, keys, emits, layers }[]`. `keys` may be an array or a string in demo data.                                    | Combo placement updates `keys` to physical key labels or coordinates based on editor picks.                                         |
| `TAPDANCES`       | `{ id, key, tap, hold, double, desc }[]`.                                                                                  | Library displays tap/hold/double; placement writes `TD(label)`.                                                                     |
| `BRANCHES`        | `{ id, name, color, parent?, commits }[]`; commits have `{ id, msg, time, author, lane }`.                                 | Present in `data.js` as demo branch graph data, but current `VersionsView` reads `state.variants` and `state.history` instead.      |
| `SAMPLE_DIFF`     | `{ layer, scope, path, before, after, kind }[]`.                                                                           | Present as static sample data; current live changes are computed in `computeChanges(state)`.                                        |
| `COMMUNITY`       | `{ id, name, author, board, tags, layers, likes, adoptions, compiles, updated, note, official?, accent, highlights }[]`.   | `BrowseView` filters and sorts this list; `ADOPT` creates a new variant and save point from a selected community map.               |

## Board And Key Coordinates

| Concept            | Details                                                                                                                                                                                       |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Coordinate key     | Strings like `"r,c"` identify matrix positions in layer overrides, LEDs, selection arrays, and combo picks.                                                                                   |
| Physical code      | `physCode(kb, r, c)` returns the key's base `code` from the board layout.                                                                                                                     |
| All positions      | `allPositions(kb)` returns every valid coordinate; for split boards it emits columns `0..9` for each row.                                                                                     |
| Binding resolution | `resolveBinding(layers, activeStack, row, col, baseCode)` searches active stack top-to-base and returns `{ code, source, transparent }`; missing values fall back to physical code or `TRNS`. |
| Display code       | `friendlyCode()` derives keycap `main`, optional `sub`, and dim state from QMK-like strings such as `LT(NAV,SPC)`, `MO(NAV)`, `LCTL_T(Z)`, `MACRO(name)`, and `TD(name)`.                     |

## Store State

| State field         | Initial value / shape                                                                                      | Purpose                                                         |
| ------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `route`             | `"connect"`                                                                                                | Current shell route.                                            |
| `device`            | `null`                                                                                                     | Connected demo device object or null.                           |
| `boardId`           | From `initBoard("65")`                                                                                     | Current board id.                                               |
| `layers`            | Deep clone of `KBData.LAYERS[boardId]`                                                                     | Mutable working binding overrides.                              |
| `leds`              | Shallow copy of `KBData.LEDS[boardId].keys`                                                                | Mutable per-key LED overrides.                                  |
| `activeLayer`       | `"BASE"`                                                                                                   | Primary layer selected in editor.                               |
| `showFall`          | `true`                                                                                                     | Whether fall-through/inherited keys are visually hatched.       |
| `lens`              | `"keys"`                                                                                                   | Editor lens: `keys` or `lighting`.                              |
| `selected`          | `{ r: 2, c: 4 }`                                                                                           | Single selected key coordinate.                                 |
| `editorTab`         | `"bind"`                                                                                                   | Key inspector tab: `bind`, `hold`, `notes`.                     |
| `paintScope`        | `"key"`                                                                                                    | Scope for the older `PAINT` reducer path: key, row, or board.   |
| `selection`         | `["2,4"]`                                                                                                  | Lighting multi-selection coordinate list.                       |
| `browseTag`         | `"all"`                                                                                                    | Active Browse tag filter.                                       |
| `previewMapId`      | `null`                                                                                                     | Community map id shown in preview modal.                        |
| `rgb`               | `{ effect: "reactive", speed: 45, brightness: 82, tintByLayer: false }`                                    | Global RGB controls.                                            |
| `macros`            | Clone of `KBData.MACROS`                                                                                   | Mutable library macros.                                         |
| `combos`            | Clone of `KBData.COMBOS`                                                                                   | Mutable library combos.                                         |
| `tapdances`         | Clone of `KBData.TAPDANCES`                                                                                | Mutable library tap dances.                                     |
| `libraryTab`        | `"macros"`                                                                                                 | Active Library tab.                                             |
| `librarySel`        | `{ macros: "m1", combos: "c1", td: "td1" }`                                                                | Selected item per Library tab.                                  |
| `placeMode`         | `null` or `{ kind, id, label, picks? }`                                                                    | Cross-route placement state for macros, tap dances, and combos. |
| `settings`          | `{ tapTerm: 185, debounce: 5, toggles: { ph: true, rt: false, nkro: true, mk: false }, transport: "i2c" }` | Global behavior/split settings.                                 |
| `variants`          | `main`, `homerow`, `gaming` objects with `id`, `name`, `color`, `note`                                     | Version branches / variants.                                    |
| `currentVariant`    | `"main"`                                                                                                   | Active variant id.                                              |
| `history`           | Save point list `{ id, variant, msg, meta }[]`                                                             | Variant timeline entries.                                       |
| `selectedSavepoint` | `"c3"`                                                                                                     | Current selected save point id.                                 |
| `versionsTab`       | `"history"`                                                                                                | Versions tab: `history` or `changes`.                           |
| `dirty`             | `0`                                                                                                        | Count of uncommitted local changes.                             |
| `seq`               | `6`                                                                                                        | Numeric id source for new save points.                          |
| `toast`             | `null`                                                                                                     | Current toast text.                                             |
| `flash`             | `null` or `{ phase }`                                                                                      | Flash overlay state.                                            |
| `account`           | GitHub-like account with Monkeytype stats                                                                  | Nav account/profile data.                                       |
| `profileOpen`       | `false`                                                                                                    | Account popover visibility.                                     |

## Derived Helpers

| Helper                                    | Output                                          | Used by                                             |
| ----------------------------------------- | ----------------------------------------------- | --------------------------------------------------- |
| `initBoard(boardId)`                      | `{ boardId, layers, leds }`                     | Initial state and `CONNECT`/`ADOPT` board switches. |
| `activeStack(state)`                      | `["BASE"]` or `[activeLayer, "BASE"]`           | Editor binding resolution and layer-stack UI.       |
| `setOverride(layers, layerId, key, code)` | New layer array with one override updated       | `BIND`, single placement.                           |
| `positionsForScope(state, kb)`            | Selected key, selected row, or all positions    | Legacy `PAINT` action.                              |
| `computeChanges(state)`                   | List of `{ path, before, after, kind }`         | Versions changes tab and Save point card.           |
| `colorName(v)`                            | Human label for known OKLCH colors or raw value | LED changes.                                        |

## Reducer Actions

| Action           | Writes                                                                                              | Notes                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `NAV`            | `route`                                                                                             | Shell route change.                                                                        |
| `CONNECT`        | `device`, board clone, `activeLayer`, `selected`, `selection`, `route`, `toast`                     | Chooses default selected coordinate based on board id.                                     |
| `SELECT`         | `selected`, optionally `placeMode`, `layers`, `combos`, `dirty`, `route`, `toast`                   | Handles normal key select, combo member picking, macro placement, and tap-dance placement. |
| `SET_LENS`       | `lens`                                                                                              | Switches editor between keys and lighting.                                                 |
| `SET_LAYER`      | `activeLayer`                                                                                       | Sets primary layer.                                                                        |
| `TOGGLE_FALL`    | `showFall`                                                                                          | Toggles fall-through visualization.                                                        |
| `SET_TAB`        | `editorTab`                                                                                         | Key inspector tab.                                                                         |
| `SEL_START`      | `selection`, `selected`                                                                             | Starts lighting selection.                                                                 |
| `SEL_ADD`        | `selection`, `selected`                                                                             | Adds lighting key if not already selected.                                                 |
| `SEL_TOGGLE`     | `selection`, `selected`                                                                             | Toggles lighting key membership.                                                           |
| `SEL_CLEAR`      | `selection`                                                                                         | Clears lighting selection.                                                                 |
| `SEL_ALL`        | `selection`                                                                                         | Selects all positions for current board.                                                   |
| `PAINT_SEL`      | `leds`, `dirty`                                                                                     | Applies one color to selected lighting keys if changed.                                    |
| `BIND`           | `layers`, `dirty`                                                                                   | Writes selected key override on active layer.                                              |
| `PAINT`          | `leds`, `dirty`                                                                                     | Applies one color by `paintScope`; not the primary lighting UI in current screenshots.     |
| `SET_SCOPE`      | `paintScope`                                                                                        | Changes legacy paint scope.                                                                |
| `SET_RGB`        | `rgb`, `dirty`                                                                                      | Updates global lighting setting.                                                           |
| `LIB_TAB`        | `libraryTab`                                                                                        | Switches Library tab.                                                                      |
| `LIB_SEL`        | `librarySel[libraryTab]`                                                                            | Selects Library item for active tab.                                                       |
| `PLACE`          | `route`, `placeMode`, `toast`                                                                       | Starts macro/tap-dance placement or combo member picking in editor.                        |
| `CONFIRM_COMBO`  | `combos`, `placeMode`, `dirty`, `route`, `toast`                                                    | Requires at least two picks; writes combo member keys using `physCode` where available.    |
| `CANCEL_PLACE`   | `placeMode`                                                                                         | Cancels placement.                                                                         |
| `SET_SETTING`    | `settings[k]`, `dirty`                                                                              | Sets scalar setting.                                                                       |
| `TOGGLE_SETTING` | `settings.toggles[k]`, `dirty`                                                                      | Toggles boolean setting.                                                                   |
| `SET_TRANSPORT`  | `settings.transport`, `dirty`                                                                       | Sets split transport.                                                                      |
| `VERSIONS_TAB`   | `versionsTab`                                                                                       | Switches Versions tab.                                                                     |
| `SELECT_SP`      | `selectedSavepoint`                                                                                 | Selects save point.                                                                        |
| `SAVE_POINT`     | `history`, `seq`, `dirty`, `selectedSavepoint`, `route`, `versionsTab`, `toast`                     | Prepends a new history item for `currentVariant`.                                          |
| `BRANCH`         | `variants`, `currentVariant`, `toast`                                                               | Appends a new variant; does not clone data separately.                                     |
| `RESTORE`        | `toast`                                                                                             | Stubbed view-only restore.                                                                 |
| `BROWSE_TAG`     | `browseTag`                                                                                         | Browse filter.                                                                             |
| `PREVIEW_MAP`    | `previewMapId`                                                                                      | Opens/closes Browse modal.                                                                 |
| `ADOPT`          | `variants`, `currentVariant`, `history`, `seq`, `previewMapId`, `route`, `toast`, maybe board clone | Creates an adopted variant from a community map.                                           |
| `FLASH_START`    | `flash` or `route`/`toast`                                                                          | Requires a device; otherwise navigates to connect.                                         |
| `FLASH_PHASE`    | `flash.phase`                                                                                       | Advances flash overlay.                                                                    |
| `FLASH_DONE`     | `flash.phase`, `dirty`                                                                              | Marks done and clears dirty.                                                               |
| `CLOSE_FLASH`    | `flash`                                                                                             | Closes overlay.                                                                            |
| `TOAST`          | `toast`                                                                                             | Shows toast.                                                                               |
| `CLEAR_TOAST`    | `toast`                                                                                             | Clears toast.                                                                              |
| `TOGGLE_PROFILE` | `profileOpen`                                                                                       | Account popover.                                                                           |
| `SIGN_IN`        | `account.signedIn`, `profileOpen`, `toast`                                                          | Demo sign-in.                                                                              |
| `SIGN_OUT`       | `account.signedIn`, `profileOpen`, `toast`                                                          | Demo sign-out.                                                                             |
| `MT_TOGGLE`      | `account.monkeytype.connected`, `toast`                                                             | Demo Monkeytype connect/disconnect.                                                        |

## Runtime Layer Implications

| Requirement from handoff | Runtime shape needed                                                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keyboard rendering       | A board model with physical layout dimensions, matrix coordinates, split-half grouping, key width/accent/mod/homing flags, and stable key ids or coordinate mapping. |
| Layered bindings         | Layer list with colors and binding overrides; transparent/fall-through resolution against base layer.                                                                |
| Per-key lighting         | Global RGB settings plus per-key override map; support for named swatches or conversion between OKLCH swatches and the runtime hue/saturation/brightness model.      |
| Logic library            | First-class macros, combos, and tap dances; cross-screen placement workflow for macros/tap dances and combo member picking.                                          |
| Versions                 | Variants plus ordered save points with selected save point, dirty changes, branch creation, restore, and flash-from-savepoint behavior.                              |
| Community Browse         | Read-only public keymap records with board compatibility, tags, author identity, positive signals, preview highlights, and adoption into a local editable variant.   |
| Account/profile          | GitHub identity and optional Monkeytype stats.                                                                                                                       |
