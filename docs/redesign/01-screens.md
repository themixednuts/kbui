# Screen Reference

This file describes the handoff screens from the JSX files in `resources/kbgui-handoff/kbgui/project/`. State references point to `store.jsx` unless noted.

## App Shell

| Item                     | Details                                                                                                                                                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source components        | `AppShell` in `app-shell.jsx`; `KlaksonApp` in `Klakson.html`; shared primitives from `shared.jsx`; `FlashOverlay` from `artboards-rest.jsx`.                                                                            |
| Screenshots              | Shell appears in `app-editor.png`, `placed.png`, `lighting-drag.png`, `lighting-final.png`, `browse.png`, `browse2.png`, `browse-avatars.png`, `changes.png`, `history.png`, `history2.png`, `profile.png`, `flash.png`. |
| Layout structure         | `.app` flex row; left `.nav` rail; `.app-main` column with optional `.appbar`, optional `.place-banner`, and `.app-content`. Nav footer contains account/profile and device status.                                      |
| Interactive elements     | Nav buttons, account button, GitHub sign-in button, profile popover actions, Save point button, Flash/Connect button, placement cancel button.                                                                           |
| State read               | `route`, `toast`, `variants`, `currentVariant`, `placeMode`, `account`, `profileOpen`, `device`, `dirty`.                                                                                                                |
| State written            | `NAV`, `CLEAR_TOAST`, `VERSIONS_TAB`, `FLASH_START`, `TOGGLE_PROFILE`, `SIGN_IN`, `SIGN_OUT`, `MT_TOGGLE`, `CANCEL_PLACE`.                                                                                               |
| Interactions / animation | Toast clears after 2400 ms. Profile popover is conditionally rendered. Flash overlay is always mounted but returns null unless `flash` is set.                                                                           |

## Connect

| Item                     | Details                                                                                                                                             |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source components        | `ConnectView` in `artboards-rest.jsx`; device data local to the component.                                                                          |
| Screenshots              | `overview.png`.                                                                                                                                     |
| Layout structure         | Centered `.connect-wrap` and `.connect-inner`; heading copy; Available card with device rows; footer row for profile load and offline continuation. |
| Interactive elements     | Connect button for Workbench 65, Pair button for Corney 34, Load profile button, Continue without a device button, unsupported HID row.             |
| State read               | No store state read in component body except dispatch acquisition.                                                                                  |
| State written            | `CONNECT` with selected device; `NAV` to `editor` for continue without device.                                                                      |
| Interactions / animation | `CONNECT` initializes the selected board, chooses default selected key by board, sets route to `editor`, and shows a toast.                         |

## Editor: Keys Lens

| Item                     | Details                                                                                                                                                                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source components        | `EditorView`, `KeyHero`, `computeUnit`, `useWidth` in `artboards-keymap.jsx`; `KbRender`, `BlockKeyboard`, `SplitKeyboard`, `Keycap`, `resolveBinding`, `friendlyCode` in `keyboard.jsx`; `LayerStack`, `KeycodePicker`, `Seg`, `Btn`, `Chip` in `shared.jsx`. |
| Screenshots              | `app-editor.png`, `placed.png`, `keymap.png`, `keymap2.png`. `keymap.png` and `keymap2.png` are design-canvas crops, not clean viewport captures.                                                                                                              |
| Layout structure         | Toolbar row with lens tabs, layer chips, fall-through toggle; keyboard stage; under-board active-layer-stack card for block boards; right inspector card for block boards; bottom inspector dock for split boards.                                             |
| Interactive elements     | Lens tabs, layer chips, fall-through toggle, keycaps, inspector tabs (`Bind`, `Hold-Tap`, `Notes`), keycode pills, Reset to base, tap/hold inputs, tap-term slider, Notes textarea, Edit color button.                                                         |
| State read               | `boardId`, `layers`, `activeLayer`, `showFall`, `lens`, `selected`, `editorTab`, `settings.tapTerm`, `placeMode`, `device`, `leds`. Uses `KBData.KEYBOARDS`, `KBData.LEDS`.                                                                                    |
| State written            | `SET_LENS`, `SET_LAYER`, `TOGGLE_FALL`, `SELECT`, `SET_TAB`, `BIND`, `SET_SETTING`, `CANCEL_PLACE`, `CONFIRM_COMBO`.                                                                                                                                           |
| Interactions / animation | Board unit is recomputed from measured stage width. Binding resolution walks active layer stack top to base. Non-base inherited keys can render as hatched fall-through. Single placement clicks write `MACRO(label)` or `TD(label)` and increment `dirty`.    |

## Editor: Lighting Lens

| Item                     | Details                                                                                                                                                                                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source components        | `EditorView`, `LedSwatches`, lighting inspector branch in `artboards-keymap.jsx`; `Keycap` lighting branch and `ledColor` in `keyboard.jsx`.                                                                                                                                                             |
| Screenshots              | `lighting-top.png`, `lighting-lens.png`, `lighting-drag.png`, `lighting-final.png`. `lighting-lens.png` is mostly a lower canvas crop under the artboard.                                                                                                                                                |
| Layout structure         | Same editor shell and stage as keys lens; keycaps render LED colors; inspector hero shows uniform/mixed/off selection; paint swatches; selection actions; global RGB effect controls.                                                                                                                    |
| Interactive elements     | Keys/Lighting segmented tab, color swatches including Off, Select all, Clear, brightness slider, effect tabs (`Solid`, `Reactive`, `Rainbow`), speed slider, `Tint by active layer` switch, drag-select stage.                                                                                           |
| State read               | `lens`, `selection`, `selected`, `leds`, `rgb.effect`, `rgb.speed`, `rgb.brightness`, `rgb.tintByLayer`, `boardId`, `layers`, `activeLayer`.                                                                                                                                                             |
| State written            | `SET_LENS`, `SEL_START`, `SEL_ADD`, `SEL_TOGGLE`, `SEL_CLEAR`, `SEL_ALL`, `PAINT_SEL`, `SET_RGB`.                                                                                                                                                                                                        |
| Interactions / animation | Stage-level pointer handlers use `document.elementFromPoint` and `[data-pos]` hit testing. Plain drag starts a selection, Shift-drag adds, Ctrl/Meta toggles, empty click clears. Mixed selections show a mixed state; painting writes all selected LEDs and increments `dirty` only when values change. |

## Editor: Split Board

| Item                     | Details                                                                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source components        | Split branch in `EditorView` (`artboards-keymap.jsx`); `SplitKeyboard` in `keyboard.jsx`.                                                                         |
| Screenshots              | `split.png`.                                                                                                                                                      |
| Layout structure         | Main editor body switches to column layout; split halves render with a configurable gap and seam; inspector becomes a bottom dock rather than a right side panel. |
| Interactive elements     | Same lens, layer, key selection, binding picker, reset, and color controls as block editor, but compacted into dock actions.                                      |
| State read               | Same editor state as keys/lighting, plus `KBData.KEYBOARDS[boardId].split`.                                                                                       |
| State written            | Same editor actions as keys/lighting.                                                                                                                             |
| Interactions / animation | `computeUnit` uses a split-specific formula and clamps unit size 30-60 px. A `TRRS - left <-> right` label appears under the board.                               |

## Library

| Item                     | Details                                                                                                                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source components        | `LibraryView` in `artboards-rest.jsx`; sequence display classes in `styles.css`.                                                                                                                                     |
| Screenshots              | `library.png`.                                                                                                                                                                                                       |
| Layout structure         | Two-column body: large Library card on the left, `Use it` card on the right. Library card has tabs for `Macros`, `Combos`, `Tap Dance`.                                                                              |
| Interactive elements     | Library tabs, entry rows, Place on a key, Pick keys on board, Edit, Duplicate.                                                                                                                                       |
| State read               | `libraryTab`, `librarySel`, `macros`, `combos`, `tapdances`.                                                                                                                                                         |
| State written            | `LIB_TAB`, `LIB_SEL`, `PLACE`. Combo placement later writes through `CONFIRM_COMBO` in `EditorView`.                                                                                                                 |
| Interactions / animation | Placing macros/tap dances navigates to editor and sets a single-key `placeMode`; placing combos navigates to editor and starts a multi-key combo pick mode. Edit/Duplicate buttons are visual only in the prototype. |

## Browse Community

| Item                     | Details                                                                                                                                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source components        | `BrowseView`, `PreviewBoard`, `Signals` in `browse.jsx`; data from `KBData.COMMUNITY` in `data.js`.                                                                                                                                                       |
| Screenshots              | `browse.png`, `browse2.png`, `browse-avatars.png`.                                                                                                                                                                                                        |
| Layout structure         | Tag/filter row; optional compatibility filter; explanatory copy; flex-wrapped card grid; each card has preview area, metadata, tags, positive signals, and actions.                                                                                       |
| Interactive elements     | Tag buttons, Fits current board toggle, preview image area, Preview button, Adopt button.                                                                                                                                                                 |
| State read               | `browseTag`, `device`, `boardId`, `previewMapId`; `KBData.COMMUNITY`, `KBData.KEYBOARDS`. Component-local `compatOnly`.                                                                                                                                   |
| State written            | `BROWSE_TAG`, `PREVIEW_MAP`, `ADOPT`.                                                                                                                                                                                                                     |
| Interactions / animation | List filters by tag and optionally current board, sorts by likes but does not show ranks. Adoption creates a new variant, adds a save point, optionally switches board if no device is connected, closes preview, navigates to editor, and shows a toast. |

## Browse Preview Modal

| Item                     | Details                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Source components        | Preview modal branch in `BrowseView` (`browse.jsx`); `PreviewBoard`; `Signals`.                                      |
| Screenshots              | `browse-modal.png`, `browse-65.png`.                                                                                 |
| Layout structure         | Global `.overlay` with centered `.modal`; header identity row; large board preview; note; tags; signals; action row. |
| Interactive elements     | Backdrop close, close button, Adopt as a variant, Report.                                                            |
| State read               | `previewMapId`; selected community map.                                                                              |
| State written            | `PREVIEW_MAP` with `null`, `ADOPT`, `TOAST` for Report.                                                              |
| Interactions / animation | Modal closes on backdrop click. Report only shows a toast.                                                           |

## Versions: Changes

| Item                     | Details                                                                                                                                                                                 |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source components        | `VersionsView` in `artboards-diff.jsx`; `computeChanges` in `store.jsx`.                                                                                                                |
| Screenshots              | `changes.png`, `history.png`.                                                                                                                                                           |
| Layout structure         | Body column with History/Changes tabs; changes tab uses main Uncommitted changes card and a right Save point card.                                                                      |
| Interactive elements     | History/Changes tabs, message input, Save point, Discard all.                                                                                                                           |
| State read               | `versionsTab`, `dirty`, `currentVariant`, computed changes from `layers`, `leds`, and `settings`.                                                                                       |
| State written            | `VERSIONS_TAB`, `SAVE_POINT`, `TOAST`.                                                                                                                                                  |
| Interactions / animation | `computeChanges` compares mutable store state against demo baselines in `KBData.LAYERS`, `KBData.LEDS`, and settings defaults. Discard is explicitly stubbed and only produces a toast. |

## Versions: History And Timeline

| Item                     | Details                                                                                                                                                                                          |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Source components        | `VersionsView` in `artboards-diff.jsx`.                                                                                                                                                          |
| Screenshots              | `history2.png`, `timeline3.png`, `timeline.png`, `timeline2.png`. `timeline.png` is mostly blank canvas; `timeline2.png` is a lower-right crop; `timeline3.png` shows the full timeline concept. |
| Layout structure         | History tab has a timeline card grouped by variant and a right rail with selected save point details plus branch creation.                                                                       |
| Interactive elements     | Save point buttons, Restore, Flash this, From input, Name input, Create variant.                                                                                                                 |
| State read               | `variants`, `history`, `currentVariant`, `selectedSavepoint`, `versionsTab`, `device`.                                                                                                           |
| State written            | `SELECT_SP`, `RESTORE`, `FLASH_START`, `BRANCH`.                                                                                                                                                 |
| Interactions / animation | Timeline derives tracks by grouping `history` by variant. Branching appends a new variant with `var(--teal)` color and keeps history unchanged. Restore is view-only in the prototype.           |

## Settings

| Item                     | Details                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Source components        | `SettingsView` in `artboards-rest.jsx`; `Switch`, `Seg`, `Btn` in `shared.jsx`.                                             |
| Screenshots              | No matching screenshot file present.                                                                                        |
| Layout structure         | Flex-wrapped cards for Timing, Toggles, and Split transport.                                                                |
| Interactive elements     | Tap term slider, debounce slider, switches for permissive hold/retro tapping/NKRO/mouse keys, split transport option cards. |
| State read               | `settings.tapTerm`, `settings.debounce`, `settings.toggles`, `settings.transport`.                                          |
| State written            | `SET_SETTING`, `TOGGLE_SETTING`, `SET_TRANSPORT`.                                                                           |
| Interactions / animation | Split transport cards use `aria-pressed`; all changes increment `dirty`.                                                    |

## Profile Popover

| Item                     | Details                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| Source components        | Account/profile branch in `AppShell` (`app-shell.jsx`); `Avatar` from `shared.jsx`.                       |
| Screenshots              | `profile.png`.                                                                                            |
| Layout structure         | Popover anchored above nav footer; header identity, Monkeytype stats grid, account actions.               |
| Interactive elements     | Account button, Monkeytype open link, Disconnect/Connect Monkeytype, Sign out.                            |
| State read               | `account.signedIn`, `account.login`, `account.name`, `account.monkeytype`, `profileOpen`.                 |
| State written            | `TOGGLE_PROFILE`, `MT_TOGGLE`, `SIGN_OUT`, `SIGN_IN`.                                                     |
| Interactions / animation | GitHub avatar URL is `https://github.com/{login}.png`; `Avatar` falls back to initials after image error. |

## Flash Overlay

| Item                     | Details                                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source components        | `FlashOverlay` in `artboards-rest.jsx`; opened from `AppShell`, `VersionsView`, or flash buttons.                                                         |
| Screenshots              | `flash.png`.                                                                                                                                              |
| Layout structure         | Full-screen `.overlay`; centered `.modal`; step list; log block; cancel/done action.                                                                      |
| Interactive elements     | Flash action, Cancel, Done, backdrop close only after done.                                                                                               |
| State read               | `flash.phase`, `device`.                                                                                                                                  |
| State written            | `FLASH_START`, `FLASH_PHASE`, `FLASH_DONE`, `CLOSE_FLASH`.                                                                                                |
| Interactions / animation | `useEffect` advances `building` to `flashing` after 1300 ms and `flashing` to `done` after 1500 ms. Active step icon spins through CSS `@keyframes spin`. |

## Design Canvas Wrapper

| Item                     | Details                                                                                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source components        | `DesignCanvas`, `DCSection`, `DCArtboard`, `DCPostIt` in `design-canvas.jsx`.                                                                                                                             |
| Screenshots              | Explains canvas-like captures such as `overview.png`, `keymap.png`, `keymap2.png`, `lighting-top.png`, `lighting-lens.png`, `library.png`, `split.png`, `timeline.png`, `timeline2.png`, `timeline3.png`. |
| Layout structure         | Pan/zoom viewport with a grid background, sections, artboard frames, editable labels, and fullscreen focus overlay.                                                                                       |
| Interactive elements     | Trackpad/mouse wheel zoom, background drag-pan, artboard grip-drag reorder, inline rename, focus overlay arrows, dots, section dropdown, close.                                                           |
| State read               | Internal React state: `sections` and `focus`; persisted sidecar `.design-canvas.state.json` if available.                                                                                                 |
| State written            | Internal `patchSection`, `setFocus`; writes through `window.omelette?.writeFile`.                                                                                                                         |
| Interactions / animation | Uses direct DOM transforms for pan/zoom, pointer-driven reorder, and React portal focus overlay. This wrapper is prototype tooling, not app runtime UI.                                                   |
