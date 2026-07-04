# De-Mock 1c Report

Sub-wave 1c makes the editor and workbench stop treating sample content as an implicit real keyboard. The sample boards remain in-tree, but they are now starter boards with explicit provenance and UI labeling.

## Provenance

`DeviceProfile` now carries a typed `origin` field:

- `device`: a real connected VIA or ZMK device profile.
- `imported`: a VIA JSON import or catalog/imported definition.
- `draft`: a restored SQLocal local draft.
- `starter`: a starter board derived from `sampleKeyboard`, `sampleBoards`, or `splitDemoKeyboard`.

The profile helpers in `src/lib/keyboard/schema.ts` stamp provenance without using `any`, and `profileDisplayName()` appends `Starter` for starter-derived profiles where a text-only display name is needed. Legacy stored profiles without `origin` decode as `imported` rather than silently becoming starters.

## Hydration Priority

`WorkbenchStore` owns app-wide active profile hydration now. Startup selection is resolved by `resolveWorkbenchHydration()` in this priority:

1. Connected device profile, stamped `origin: "device"`.
2. Newest SQLocal saved draft, stamped `origin: "draft"`, with its clean base loaded from local storage when available.
3. Starter board fallback from `starterBoardProfile()`, stamped `origin: "starter"`.

`EditorStore` can now skip its own draft hydrate when the app-wide workbench is controlling initialization. Real device, imported definition, and explicit starter activations pass `hydrateDraft: false` so a stale SQLocal draft cannot overwrite the active selection after the user connects or imports.

## Connect-Flow Fixes

ZMK Studio activation no longer clones `sampleKeyboard`. It now builds a fresh profile from the connected ZMK device information, physical layout, and keymap layers, then fills missing fields with neutral empty/default values:

- empty macros, combos, tap dances, and key overrides;
- neutral lighting defaults with no per-key sample lighting;
- real firmware/protocol/detection metadata from the connection;
- `origin: "device"`.

VIA activation no longer falls back to Workbench 65 for unidentified real WebHID devices. If no catalog/default/imported definition resolves, activation raises a clear "Load VIA JSON" identification error instead of fabricating a sample-derived board. VIA JSON imports are stamped `origin: "imported"`, while catalog-backed real connections are stamped `origin: "device"`.

`continueWithoutDevice()` now creates a local starter draft with `origin: "starter"` and copy that describes it as a starter local-only profile.

## Starter Reframe And Labeling

`switchSampleBoard()` was replaced with `selectStarterBoard()`. Workbench 65 and Corney Split 34 are still available, but they are presented as starter boards that the user can edit locally.

The editor `?board=` parameter is now a starter-board deep link:

- `/editor?board=default` selects the Workbench 65 starter.
- `/editor?board=split` selects the Corney Split 34 starter.
- `/editor` does not force a starter if a saved draft can hydrate first.

The old "Temporary editor board selector" UI was replaced with a labeled "Starter boards" picker. Selecting a starter while a device is connected disconnects the active live session before switching into local starter editing.

The topbar board chip now shows the board name plus a visible `Starter` badge whenever `origin === "starter"`. Other board-name surfaces that can show starter content, including settings, browse compatibility text, and flash overlays, use the starter-aware display name. Device, imported, and draft profiles show their real names without the starter badge.

## Tests

Updated and added coverage includes:

- hydration priority: device > draft > starter;
- app-wide SQLocal draft hydration and starter fallback;
- provenance on device, imported, draft, and starter paths;
- ZMK activation building a non-sample profile with neutral defaults;
- VIA unknown-device activation surfacing the Load VIA JSON state instead of Workbench 65;
- starter board selection and starter display labeling;
- updated live-sync tests for the renamed starter selection API.

## Verification

- `vp install`: passed.
- `vp check`: passed; all 174 files formatted, no warnings/lint/type errors in 242 files.
- `vp run svelte:check`: passed; 0 errors, 0 warnings.
- `vp build`: passed. Rolldown printed plugin timing notices only.
- `vp test`: passed; 36 test files, 184 tests.
- `vp run capture`: passed; 8/8 visual captures, including `/editor` and `/editor?board=split`.

No git commit was created.
