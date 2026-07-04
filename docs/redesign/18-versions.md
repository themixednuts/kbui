# Wave 2b Versions

## SavePoint Model

`SavePoint` now lives in `src/lib/keyboard/schema.ts`:

- `id`: stable save point id.
- `variantId`: variant or fork lane that owns the point.
- `message`: user-facing label.
- `createdAt`: caller-provided timestamp. Pure helpers do not stamp time.
- `authorMeta`: local/GitHub/agent attribution object.
- `snapshot`: full `DeviceProfile` snapshot for direct restore and branch seeding.
- `diffFromParent`: bundled `ChangeRecord[]` captured at creation for first-point summaries.
- `parentSavePointId`: previous save point in the same variant, when present.

Pure helpers live in `src/lib/keyboard/save-points.ts`:

- `createSavePointFromProfile(...)`
- `listOrderedSavePointsForVariant(...)`
- `latestSavePointForVariant(...)`
- `resolveProfileAtSavePoint(...)`
- `computeSavePointDiff(...)`
- `changesForSavePoint(...)`

The helper API accepts ids and timestamps from callers so tests and pure code stay deterministic.

## Storage

`src/lib/keyboard/local-store.ts` adds `local_save_points`:

- `id TEXT PRIMARY KEY`
- `variant_id TEXT NOT NULL`
- `data TEXT NOT NULL`
- `created_at TEXT NOT NULL`

CRUD functions:

- `createLocalSavePoint`
- `listLocalSavePointsByVariant`
- `getLocalSavePoint`
- `deleteLocalSavePoint`

Save point snapshots reuse the existing profile storage encoder/decoder, so normalized keycode storage behavior stays consistent with profiles, drafts, and forks.

## Store Actions

`WorkbenchStore` now owns versioning state:

- `forks`
- `savePoints`
- `selectedSavePointId`
- `activeVariantId`
- derived `variants`, `activeVariant`, `activeSavePoints`, `selectedSavePoint`, `selectedSavePointChanges`, and `savePointTracks`

Actions:

- `createSavePoint(message)`: captures the base-to-draft diff, persists a save point, selects it, and advances the current draft to the clean base so dirty resets.
- `selectSavePoint(id)`: selects a point in the timeline.
- `restoreSavePoint(id)`: loads the save point snapshot as the new draft.
- `branchFromSavePoint(name)`: creates a persisted `WorkspaceFork` seeded from the selected snapshot and switches the active variant to it.
- `flashSavePoint(id)`: stub only. It records `flashIntent` for the future flash overlay and performs no device writes.

The app shell variant chip now follows `workbench.activeVariant`.

## Route Structure

`src/routes/(app)/versions/+page.svelte` replaces the placeholder with two tabs:

- Changes: grouped uncommitted counts for keymap, lighting, and settings, plus `VersionChangesPanel` for the live diff and a coral-filled Save point action.
- History: variant timeline lanes with save points ordered newest-first, selected save point details, restore and flash actions, selected change list, and branch creation.

Primary actions use the coral Button variant: Save point, Restore, Flash this, and Create variant.

## Reused Pieces

- `VersionChangesPanel.svelte` is reused for live changes and selected save point changes. It now accepts a `title` prop.
- `diffProfiles` and `ChangeRecord` from `src/lib/keyboard/changes.ts` remain the diff engine.
- Existing `WorkspaceFork` storage is reused for branch-new-variant persistence.

## Verification

- `vp check`: pass. All 118 files formatted; no warnings, lint errors, or type errors in 195 files.
- `vp run svelte:check`: pass. 0 errors, 0 warnings.
- `vp build`: pass.
- `vp test`: pass. 16 test files, 91 tests.
