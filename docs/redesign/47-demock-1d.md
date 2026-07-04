# De-Mock 1d: Honest Browse Seed Content

## Scope

Implemented findings 17, 18, 19, 20, 21, and 22 from `docs/redesign/43-demock-audit.md` for the Browse community seed content.

## Provenance

- Added typed community keymap provenance as `CommunityKeymapSource = "official" | "community"`.
- `CommunityKeymapCard` and `CommunityKeymapDetail` now carry `source`.
- Seed records are emitted as `source: "official"`.
- Real/community records default to `source: "community"` at the Drizzle schema and Durable Object table level.
- `officialOnly` filtering now checks `source === "official"` instead of the old `official` boolean.

## Durable Object Schema

- Fresh `community_keymap` tables now include `source TEXT NOT NULL DEFAULT 'community'`.
- Fresh schema no longer declares compile metadata columns or the old `official` boolean.
- Existing Durable Object tables get a compatibility `ALTER TABLE community_keymap ADD COLUMN source TEXT NOT NULL DEFAULT 'community'`.
- Added `community_keymap_source_idx` for provenance filtering.

## Removed Fabricated Data

- Removed fake seed author handles and individual display names.
- All curated seed layouts are attributed to the first-party author `kbgui Official`.
- Removed canned seed like counts and adoption counts.
- Seed metrics now start at real zero.
- Removed invented per-map created/updated recency. Seed profiles and records use the seed applied timestamp `2026-07-04T00:00:00.000Z`.
- Removed the compile-verified seed claim and `demo-seed-wave-4a` target.
- Removed the visible `compiles` / `Compiles` badge from the Browse card and preview modal.

## Seeding Behavior

- Bumped the seed version to `wave-4a-demock-1d-2026-07-04`.
- Initial seed inserts write zero likes, zero adoptions, zero reports, and `source: "official"`.
- When upgrading from an older seed version, the agent resets old seeded metrics to zero to clear previously canned social proof.
- After this seed version is applied, repeat startup seeding preserves stored engagement counts so real likes/adoptions can grow through existing mutations.

## Visible Labeling

- `CommunityKeymapCard.svelte` shows a visible `Official` badge for `source === "official"`.
- `CommunityPreviewModal.svelte` shows the same visible `Official` badge and uses `Official curated layout` in the header metadata for curated seed records.
- Real community submissions with `source: "community"` do not receive the Official badge.
- The Browse capture shows the Official badges and no compile badge.

## Tests

- Updated community catalog tests for typed official provenance, first-party attribution, zero seed metrics, deterministic sorting without fabricated engagement, and no compile claim fields on seed cards/details.
- Updated mutation fixtures to use `source: "community"` and removed compile/official DTO fields while preserving like/adopt/report behavior coverage.

## Verification

- `vp install`: passed.
- `vp check`: passed.
- `vp run svelte:check`: passed, 0 errors, 0 warnings.
- `vp build`: passed.
- `vp test`: passed, 36 files and 184 tests.
- `vp run capture`: passed, 8/8 captures.

