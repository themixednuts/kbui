# Wave 4a-i Browse Implementation

Date: 2026-07-04

## Scope

Implemented the read-only Browse community-keymap slice. This wave adds schema, seed data, read queries, DO-backed remote access, static fallback, and the Browse UI. It intentionally does not implement like, adopt, report, publish, moderation workflows, or compile pipeline mutation logic.

## Drizzle Schema

Added `src/lib/community/schema.ts` with Drizzle SQLite table objects for the CommunityAgent SQLite store:

- `community_user`
- `community_keymap`
- `community_keymap_tag`
- `community_keymap_like`
- `community_keymap_adoption`
- `community_keymap_report`
- `community_seed`

The read model stores compact card fields plus `payload_json` as `StoredDeviceProfile` with `payload_format = "stored-device-profile-v1"`. The like, adoption, and report tables exist for Wave 4a-ii but have no public mutation methods in this slice.

## Seed Data

Added `src/lib/community/seed-maps.ts` as the single seed source for the six handoff maps, with deterministic ids `cm1` through `cm6`, fixed timestamps, seed authors, tags, counts, official status, notes, highlights, and demo compile metadata:

- `compileStatus = "verified"`
- `compileTarget = "demo-seed-wave-4a"`

Each seed map includes a full encoded `StoredDeviceProfile` payload:

- `65` maps use the Workbench 65 sample profile.
- `3x5+2` maps use the Corney Split 34 profile.
- Profiles are cloned, renamed, assigned fixed `updatedAt`, expanded to the advertised layer count, then encoded through `encodeDeviceProfileForStorage`.

## CommunityAgent

Added `src/agents/community-agent.ts`, exported through `svelte.config.js`, and bound in `wrangler.toml` as a SQLite Durable Object migration `v3`.

The Agent mirrors `AuthAgent`:

- `CommunityAgent extends Agent<Cloudflare.Env, CommunityState>`
- Captures `AgentContext` in the constructor.
- Builds Drizzle with `drizzle(this.#agentCtx.storage, { logger: true })`.
- Uses `this.sql` only for `CREATE TABLE IF NOT EXISTS` DDL.
- Uses Drizzle inserts/upserts for seed users, keymaps, tags, and the `community_seed` marker.
- Uses Drizzle core query builder for `listKeymaps(input, viewerId?)` and `getKeymap(id, viewerId?)`.

List filters implemented: tag, exact `compatibleWithCatalogId`, vendor/product fallback, official-only, search, hidden/moderation-hidden exclusion. Sorts implemented: likes, new, adoptions.

## Remote Functions

Added `src/routes/(app)/browse/community.remote.ts`:

- `listCommunityKeymaps(input)`
- `getCommunityKeymap(id)`

Both read `getRequestEvent()` synchronously, validate inputs with the shared community validators, pass `locals.user?.id` as optional viewer id, and call `CommunityAgent` under singleton name `global-community`.

When `platform.env.CommunityAgent` is absent, the remote path falls back to the static seed catalog and applies the same in-process filter/sort behavior from `src/lib/community/catalog.ts`. This keeps `/browse` populated in plain `vp dev` and preview contexts.

## Browse UI

Replaced the placeholder `/browse` page with a read-only community catalog:

- SSR loads initial cards through the remote query.
- Client filters call `listCommunityKeymaps`.
- Tag chips, search, compatible-with-current-board toggle, official-only filter, and likes/new/adoptions sort are implemented.
- Cards show title, author avatar/handle, board, tags, layer count, likes, adoptions, demo compile badge, official badge, and compact positive-only preview signals.
- Preview modal calls `getCommunityKeymap`, decodes the stored profile, and renders a read-only `KeyboardBoard` with `lens="keys"` and no mutation callbacks.
- Adopt, Like, and Report affordances are visible but disabled and labelled for `4a-ii`.

New Browse components:

- `src/lib/components/browse/CommunityKeymapCard.svelte`
- `src/lib/components/browse/CommunityPreviewModal.svelte`

## Deferred To 4a-ii

- Like/unlike commands and optimistic query refresh.
- Adopt-as-variant command and local SQLocal fork/save-point write.
- Report modal/command and moderation state transitions.
- Publish flow.
- Real compile verification pipeline and non-demo verified status.

## Verification

Commands run:

- `vp install`: passed.
- `vp check`: passed, no warnings/errors.
- `vp run svelte:check`: passed, 0 errors and 0 warnings.
- `vp build`: passed, Cloudflare adapter completed.
- `vp test`: passed, 22 files and 111 tests.

Runtime proof via `vp run dev:worker`:

- HTTP line: `HTTP 200 /browse; seeded Browse titles rendered: 6/6`
- Worker log evidence included local binding: `env.CommunityAgent (CommunityAgent) Durable Object local`
- Drizzle evidence included `insert into "community_user"` and `insert into "community_keymap"` seed upserts.
- Port cleanup check: `No listener on 127.0.0.1:8787 / port 8787.`
