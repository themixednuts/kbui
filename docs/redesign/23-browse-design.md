# Wave 4a Browse Backend Design

Date: 2026-07-04

Scope: design only. This document specifies the real Cloudflare-backed community keymap backend for the Browse screen. It does not implement source, config, or migrations.

> **STORAGE OVERRIDE (user decision, supersedes the D1 recommendation below):** the community catalog is backed by a new **`CommunityAgent`** (Cloudflare `Agents` class → DO SQLite), NOT D1 and NOT a raw DurableObject — mirroring `AuthAgent`. The Drizzle schema/tables below live in the Agent's SQLite storage; the API operations become Agent RPC methods proxied from SvelteKit remote functions. Everything else in this doc (data model, DTOs, API surface, adopt-as-variant, publish, moderation, seeding, preview, phasing) still applies. See memory `prefer-do-storage`.

## Current Evidence

- The handoff Browse UI is a community catalog, not a local keyboard catalog: it filters `KBData.COMMUNITY`, builds tag chips, optionally filters by the current board, and sorts by likes (`resources/kbgui-handoff/kbgui/project/browse.jsx:51-63`).
- Browse social signals are intentionally positive-only: likes, adoptions, and compile verification, with no downvotes (`resources/kbgui-handoff/kbgui/project/browse.jsx:41-47`, `resources/kbgui-handoff/kbgui/project/data.js:214-224`).
- The preview modal needs title, author, layers, board name, note, tags, signals, report, and "Adopt as a variant" (`resources/kbgui-handoff/kbgui/project/browse.jsx:107-124`; screenshots `browse-modal.png`, `browse-65.png`).
- Prototype adoption creates a new variant and save point, closes preview, navigates to the editor, and optionally switches board when no device is connected (`resources/kbgui-handoff/kbgui/project/store.jsx:207-218`; summarized in `docs/redesign/01-screens.md:77-99`).
- The current runtime model uses `DeviceProfile` as the full keyboard payload, with layers, macros, combos, tap dances, lighting, settings, and `updatedAt` (`src/lib/keyboard/schema.ts:135-157`).
- Local variants are `WorkspaceFork` objects and save points are stored in SQLocal tables (`src/lib/keyboard/schema.ts:176-195`, `src/lib/keyboard/local-store.ts:26-46`, `src/lib/keyboard/local-store.ts:258-425`).
- The existing auth source is better-auth in the singleton `AuthAgent` Durable Object, with a `user` table whose primary key is `user.id` (`src/agents/auth-agent.ts:156-166`, `src/lib/server/auth/schema.ts:3-11`).
- `KeyboardBoard.svelte` already renders a `DeviceProfile` and can be used read-only by omitting selection callbacks (`src/lib/components/board/KeyboardBoard.svelte:26-45`).

## External Research Notes

- SvelteKit remote functions are enabled in this repo (`svelte.config.js:45-55`). The official docs describe `.remote.ts` functions as type-safe client/server calls that always run on the server, with `query` for reads and `command` for arbitrary mutations. The docs also warn that remote function inputs are exposed over generated HTTP endpoints and should be validated: https://svelte.dev/docs/kit/remote-functions
- Cloudflare's storage guidance says D1 is for persistent relational data, ad-hoc SQL queries, and read-heavy web workloads; Durable Objects are for low-latency coordination and per-object consistency; R2 is for unstructured objects; KV is read-heavy and eventually consistent: https://developers.cloudflare.com/workers/platform/storage-options/
- D1 limits and pricing, as of the July 2026 docs: 10 GB max database size on Paid, 500 MB on Free, 2 MB max row/string/BLOB, 100 columns/table, 100 bound parameters/query, 1 TB max storage/account on Paid, Free plan 5M rows read/day and 100k rows written/day, Paid plan includes 25B rows read/month and 50M rows written/month, then $0.001/million rows read and $1/million rows written, plus storage above 5 GB at $0.75/GB-month: https://developers.cloudflare.com/d1/platform/limits/ and https://developers.cloudflare.com/d1/platform/pricing/
- SQLite-backed Durable Objects have a 10 GB per-object storage limit and are single-threaded with a soft 1,000 requests/second per object. Durable Object pricing includes request and duration charges plus SQL storage billing: https://developers.cloudflare.com/durable-objects/platform/limits/ and https://developers.cloudflare.com/durable-objects/platform/pricing/
- KV has fast global reads but is eventually consistent; changes can take up to 60 seconds or more to appear in other locations and KV is not ideal for atomic transactions: https://developers.cloudflare.com/kv/concepts/how-kv-works/
- R2 is priced for object storage and operations, with a 10 GB-month free tier and paid Standard storage at $0.015/GB-month; it is useful later for large compile logs/artifacts, not for the queryable catalog itself: https://developers.cloudflare.com/r2/pricing/
- D1 Wrangler migrations are SQL files in a migrations directory and D1 bindings are configured with `[[d1_databases]]`: https://developers.cloudflare.com/d1/reference/migrations/ and https://developers.cloudflare.com/workers/wrangler/configuration/#d1-databases

## Recommendation

Use one D1 database as the authoritative community catalog store for Wave 4a.

D1 fits Browse because the product surface is query-shaped: filter by tag, board compatibility, official/hidden state, author, and sort by likes, adoptions, or recency. Likes, adoptions, and reports also need uniqueness constraints and transactional count maintenance. These are awkward or unsafe in KV and harder to operate in a Durable Object. Durable Objects remain useful later if a single keymap becomes a high-contention counter or if moderation/compile coordination needs per-entity serialization, but they should not be the primary catalog database.

Use R2 only later for large compile artifacts, source bundles, or logs. Store compact compile metadata and optional R2 object keys in D1.

## Data Model

The public Browse card should not fetch full keymap payloads. The list query returns a compact DTO; `getCommunityKeymap` and `adoptCommunityKeymap` return the full payload for preview/adoption.

Recommended payload format for Wave 4a: store an encoded `StoredDeviceProfile` JSON payload, using the existing storage encoder/decoder shape (`src/lib/keyboard/schema.ts:1039-1173`). This is more robust than a hand-rolled compact keymap in Wave 4a because preview, adoption, and future compile verification all need the same complete `DeviceProfile`. Add `payloadFormat = "stored-device-profile-v1"` and keep `catalogId`, `vendorId`, `productId`, `matrixRows`, `matrixCols`, and `keyCount` as indexed/queryable columns.

The relationship to better-auth is logical, not a direct database foreign key to the existing `AuthAgent` table. Current auth data lives in Durable Object SQLite, while the proposed catalog lives in D1, so D1 cannot enforce a direct FK to `AuthAgent.user`. The D1 schema should maintain a `community_user` shadow row keyed by better-auth `user.id`, updated from `event.locals.user` on publish/like/adopt/report. Seed/system authors use `seed:<handle>` ids with `source = "seed"`.

Proposed Drizzle schema sketch:

```ts
import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import type { StoredDeviceProfile } from "$lib/keyboard/schema";

export const communityUser = sqliteTable("community_user", {
  id: text("id").primaryKey(), // better-auth user.id for real users; seed:<handle> for seeded authors
  source: text("source", { enum: ["better-auth", "seed", "system"] }).notNull(),
  displayName: text("display_name").notNull(),
  handle: text("handle"),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const communityKeymap = sqliteTable(
  "community_keymap",
  {
    id: text("id").primaryKey(),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => communityUser.id, { onDelete: "restrict" }),

    catalogId: text("catalog_id").notNull(),
    vendorId: integer("vendor_id").notNull(),
    productId: integer("product_id").notNull(),
    boardName: text("board_name").notNull(),
    matrixRows: integer("matrix_rows").notNull(),
    matrixCols: integer("matrix_cols").notNull(),
    keyCount: integer("key_count").notNull(),

    title: text("title").notNull(),
    slug: text("slug").notNull(),
    note: text("note").notNull().default(""),
    tagsJson: text("tags_json", { mode: "json" }).$type<string[]>().notNull(),
    highlightsJson: text("highlights_json", { mode: "json" })
      .$type<Record<string, string>>()
      .notNull(),

    layersCount: integer("layers_count").notNull(),
    likesCount: integer("likes_count").notNull().default(0),
    adoptionsCount: integer("adoptions_count").notNull().default(0),
    reportsCount: integer("reports_count").notNull().default(0),

    compileStatus: text("compile_status", {
      enum: ["unverified", "pending", "verified", "failed"],
    })
      .notNull()
      .default("unverified"),
    compileVerifiedAt: integer("compile_verified_at", { mode: "timestamp_ms" }),
    compileTarget: text("compile_target"),
    compileLogR2Key: text("compile_log_r2_key"),

    official: integer("official", { mode: "boolean" }).notNull().default(false),
    visibility: text("visibility", { enum: ["public", "unlisted", "hidden"] })
      .notNull()
      .default("public"),
    moderationState: text("moderation_state", {
      enum: ["ok", "review_pending", "hidden"],
    })
      .notNull()
      .default("ok"),

    payloadFormat: text("payload_format").notNull(),
    payloadJson: text("payload_json", { mode: "json" }).$type<StoredDeviceProfile>().notNull(),
    payloadHash: text("payload_hash").notNull(),

    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("community_keymap_slug_idx").on(table.slug),
    index("community_keymap_catalog_idx").on(table.catalogId),
    index("community_keymap_board_identity_idx").on(table.vendorId, table.productId),
    index("community_keymap_likes_idx").on(table.visibility, table.likesCount),
    index("community_keymap_new_idx").on(table.visibility, table.createdAt),
    index("community_keymap_official_idx").on(table.official),
  ],
);

export const communityKeymapTag = sqliteTable(
  "community_keymap_tag",
  {
    keymapId: text("keymap_id")
      .notNull()
      .references(() => communityKeymap.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.keymapId, table.tag] }),
    index("community_keymap_tag_tag_idx").on(table.tag),
  ],
);

export const communityKeymapLike = sqliteTable(
  "community_keymap_like",
  {
    keymapId: text("keymap_id")
      .notNull()
      .references(() => communityKeymap.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => communityUser.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.keymapId, table.userId] }),
    index("community_keymap_like_user_idx").on(table.userId),
  ],
);

export const communityKeymapAdoption = sqliteTable(
  "community_keymap_adoption",
  {
    keymapId: text("keymap_id")
      .notNull()
      .references(() => communityKeymap.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => communityUser.id, { onDelete: "cascade" }),
    localForkId: text("local_fork_id"),
    adoptedTitle: text("adopted_title"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.keymapId, table.userId] }),
    index("community_keymap_adoption_user_idx").on(table.userId),
  ],
);

export const communityKeymapReport = sqliteTable(
  "community_keymap_report",
  {
    id: text("id").primaryKey(),
    keymapId: text("keymap_id")
      .notNull()
      .references(() => communityKeymap.id, { onDelete: "cascade" }),
    reporterUserId: text("reporter_user_id")
      .notNull()
      .references(() => communityUser.id, { onDelete: "cascade" }),
    reason: text("reason", {
      enum: ["spam", "unsafe", "misleading", "copyright", "harassment", "other"],
    }).notNull(),
    detail: text("detail").notNull().default(""),
    status: text("status", { enum: ["open", "reviewing", "accepted", "rejected"] })
      .notNull()
      .default("open"),
    reviewerUserId: text("reviewer_user_id"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("community_keymap_report_once_idx").on(table.keymapId, table.reporterUserId),
    index("community_keymap_report_status_idx").on(table.status),
  ],
);
```

List DTO:

```ts
interface CommunityKeymapCard {
  id: string;
  title: string;
  author: { id: string; handle?: string; displayName: string; image?: string };
  catalogId: string;
  boardName: string;
  tags: string[];
  layersCount: number;
  likesCount: number;
  adoptionsCount: number;
  compileVerified: boolean;
  official: boolean;
  note: string;
  highlights: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  likedByViewer: boolean;
  adoptedByViewer: boolean;
}
```

Detail/adoption DTO extends the card with:

```ts
type CommunityKeymapDetail = CommunityKeymapCard & {
  payloadFormat: "stored-device-profile-v1";
  profile: StoredDeviceProfile;
  payloadHash: string;
};
```

## Storage And Binding

Add one D1 binding during implementation:

```toml
[[d1_databases]]
binding = "CommunityDB"
database_name = "kbgui-community"
database_id = "<cloudflare-d1-uuid>"
migrations_dir = "migrations"
```

Implementation should also add `CommunityDB: D1Database` to the Cloudflare env types. Drizzle can connect with `drizzle(event.platform.env.CommunityDB)` using `drizzle-orm/d1`; the installed `drizzle-orm` and `drizzle-kit` are already present in `package.json:17` and `package.json:38`.

Migration approach:

1. Create a community schema module separate from `src/lib/server/auth/schema.ts` because auth remains owned by `AuthAgent`.
2. Generate or hand-write SQL migrations under the existing empty `migrations/` directory.
3. Apply locally with `vp exec wrangler d1 migrations apply kbgui-community --local`.
4. Apply remotely with `vp exec wrangler d1 migrations apply kbgui-community --remote`.
5. Keep schema migrations separate from seed data. Seed data should be idempotent and runnable independently.

The repo currently has only Durable Object bindings in `wrangler.toml:11-25`; there is no D1 binding yet.

## API Surface

Prefer SvelteKit remote functions in `src/routes/(app)/browse/community.remote.ts` or `src/lib/community/community.remote.ts`. The repo has remote functions enabled, and Browse is an in-app Svelte workflow. Use Worker `+server.ts` routes only for external API needs, admin webhooks, or future compile pipeline callbacks.

Remote functions should use `getRequestEvent()` synchronously at the top of the handler to read `locals.user` and `platform.env.CommunityDB`. Every input must be schema-validated because each remote function is reachable as an HTTP endpoint.

Operations:

| Operation | Type | Session | Notes |
| --- | --- | --- | --- |
| `listCommunityKeymaps(input)` | `query` | Optional | Public read. Filters: `tag`, `compatibleWithCatalogId`, `vendorId/productId`, `keyCount`, `officialOnly`, `search`, `limit`, `cursor`. Sorts: `likes`, `new`, `adoptions`. Returns cards only, no payload. Hidden/moderation-hidden rows excluded. If signed in, include `likedByViewer` and `adoptedByViewer`. |
| `getCommunityKeymap(id)` | `query` | Optional | Public preview/detail read. Returns card fields plus full stored profile. Exclude hidden rows unless future moderator role is present. |
| `likeCommunityKeymap(id)` | `command` | Required | Upsert `community_user`, insert `(keymapId, userId)` into `community_keymap_like`, increment `likesCount` only on first insert, refresh affected list/detail queries. |
| `unlikeCommunityKeymap(id)` | `command` | Required | Delete the like row, decrement `likesCount` only if a row was deleted. |
| `adoptCommunityKeymap(input)` | `command` | Required, recommended | Input includes `keymapId` and client-generated `localForkId`. Server upserts a unique adoption row for `(keymapId, userId)`, increments `adoptionsCount` only on first adoption, and returns the stored profile plus provenance. The client writes SQLocal `WorkspaceFork`/save point after the command returns. |
| `publishCommunityKeymap(input)` | `command` | Required | Author is always `locals.user.id`. Accept title, note, tags, current `StoredDeviceProfile`, catalog identity, highlights. Ignore any client-provided author, counts, official flag, visibility, or compile status. |
| `reportCommunityKeymap(input)` | `command` | Required | One report per user/keymap. Store reason/detail, increment `reportsCount` only on first report, move `moderationState` to `review_pending`. |
| `listReports` / `moderateReport` | `query` / `command` | Required + admin | Not needed for the first public Browse slice. Until admin roles exist, moderation can be performed directly through D1/dashboard by trusted maintainers. |

Anonymous browsing should be allowed by default. Anonymous mutation should not be allowed in Wave 4a; otherwise likes/adoptions/reports become hard to de-duplicate and abuse-limit.

## Compatibility Filtering

The prototype uses `map.board === state.boardId` (`browse.jsx:57-61`). The real backend should use runtime catalog identity:

- Exact match: `catalogId`.
- Hardware identity fallback: `vendorId + productId`.
- Defensive shape check: `matrixRows`, `matrixCols`, `keyCount`, and matching `KeyboardKey.id` set before adoption/flash.

For list filtering, exact catalog match is enough. For adoption into an already connected device, require the stricter shape check before creating a local fork.

## Adopt As Variant

Adoption bridges the D1 community catalog and local SQLocal workspace state.

Recommended flow:

1. UI generates `localForkId = crypto.randomUUID()` before calling the command.
2. `adoptCommunityKeymap({ keymapId, localForkId })` requires a better-auth session, records unique adoption, and returns `CommunityKeymapDetail`.
3. Client decodes `profile` with the existing `decodeDeviceProfileFromStorage` path, normalizes keycodes, and verifies compatibility with the current device/catalog.
4. Client creates a local `WorkspaceFork`:

```ts
const fork: WorkspaceFork & {
  source?: {
    kind: "community";
    communityKeymapId: string;
    title: string;
    authorUserId: string;
    authorHandle?: string;
    adoptedAt: string;
    payloadHash: string;
  };
} = {
  id: localForkId,
  name: slugFromTitle(detail.title),
  baseProfileId: detail.profile.id,
  createdAt: now,
  device: decodedProfile,
  source: {
    kind: "community",
    communityKeymapId: detail.id,
    title: detail.title,
    authorUserId: detail.author.id,
    authorHandle: detail.author.handle,
    adoptedAt: now,
    payloadHash: detail.payloadHash,
  },
};
```

5. Client creates a first local save point with message `Adopted "<title>"`, `snapshot = decodedProfile`, and `authorMeta.source = "community:<id>"`.
6. Client saves the fork and save point using the existing SQLocal fork/save-point APIs.
7. UI switches to the new variant and navigates to Editor.

The current `WorkspaceFork` type has no first-class provenance object (`src/lib/keyboard/schema.ts:187-195`). Implementation can either extend it with optional `source` metadata or use `sourceVariantId = "community:<id>"` plus `SavePoint.authorMeta.source` as a narrow first slice. The explicit `source` object is preferable because it survives rename and local editing.

Adoptions count unique users, not every local fork creation. Re-adopting the same map should update `localForkId`/`updatedAt` but should not inflate `adoptionsCount`.

## Publish

Publishing clones the current local profile into D1. It should not publish raw arbitrary JSON without passing the same decode/normalize checks used by local storage.

Validation:

- Require signed-in GitHub/better-auth user.
- Derive `authorUserId`, display name, image, and handle from `event.locals.user`.
- Title: 3-80 chars, trimmed, no control chars.
- Note: 0-280 chars.
- Tags: 1-6 normalized slugs, lowercase, max 24 chars each.
- Reject unsupported profiles: missing keys/layers, payload JSON over D1 row limit, unknown catalog identity, incompatible key ids.
- Server computes `layersCount`, `payloadHash`, `matrix*`, `keyCount`, `highlights`, `createdAt`, `updatedAt`, counts, visibility, and compile status.
- `official` should be false except for an admin-only path.

Initial publish scope should be "publish from the current active local `DeviceProfile`". Do not support importing remote URLs, bulk uploads, comments, or public revisions in Wave 4a.

## Moderation And Reports

Minimal flow:

1. Report button opens a modal with reason enum and optional short detail.
2. `reportCommunityKeymap` requires auth, upserts one report per reporter/keymap, and increments `reportsCount` on first report.
3. Any report sets `moderationState = "review_pending"`.
4. Public list/detail queries exclude `visibility = "hidden"` or `moderationState = "hidden"`.
5. Maintainers can manually set `visibility = "hidden"` or resolve reports in D1 until an admin UI exists.

Abuse controls:

- Auth-required reports.
- One active report per user/keymap.
- Rate-limit report and publish commands per user. D1 count checks are enough initially; use a per-user Durable Object later if abuse needs strict per-minute coordination.
- Do not auto-delete. Optional conservative auto-hide threshold can hide non-official maps after several distinct reports, but this should be a product decision.
- Sanitize display fields and never render untrusted HTML from title/note/detail.

## Compile Verification

`compileVerified` must mean a real server-side compile passed for this exact keymap payload, board/catalog ref, and compile target. It should not be a user-supplied flag.

Recommended Wave 4a behavior:

- Store `compileStatus`, not only a boolean.
- Expose `compileVerified = compileStatus === "verified"` in DTOs.
- New user-published maps start as `unverified` or `pending`.
- Do not show the "compiles" badge for user-published maps until Wave 4b implements the real compile/flash pipeline.
- Seeded dev maps may carry `compileStatus = "verified"` only if the seed data is explicitly labelled demo/dev. Production official starter maps should be reverified by Wave 4b before carrying the verified badge.

Wave 4b should write `compileStatus`, `compileVerifiedAt`, `compileTarget`, and optional `compileLogR2Key` after a successful build.

## Seeding

Seed the six prototype maps from `resources/kbgui-handoff/kbgui/project/data.js:214-224` so Browse is populated in local dev and first-run demos.

Recommended seed strategy:

- Add an idempotent seed script or dev-only remote admin command during implementation. It should upsert by deterministic ids (`cm1` through `cm6`) and maintain a small `community_seed` marker table/version.
- Seed `community_user` rows for prototype authors with ids such as `seed:quante`, `seed:dvorak_dan`, and `seed:klakson`.
- Convert prototype board ids:
  - `"65"` -> Workbench 65/sample catalog profile.
  - `"3x5+2"` -> Corney 34/split profile.
- Convert prototype fields:
  - `name` -> `title`
  - `author` -> seed `community_user.handle`
  - `board` -> catalog identity columns
  - `tags` -> `tagsJson` and `community_keymap_tag`
  - `layers` -> `layersCount`
  - `likes` / `adoptions` -> denormalized counts only; do not create fake like/adoption rows
  - `compiles` -> `compileStatus` per the compile-verification decision above
  - `updated` -> deterministic fixture timestamp, not relative text
  - `note`, `official`, `highlights` -> direct equivalents
- Store full `StoredDeviceProfile` payloads generated from the matching seed profiles, not just highlights.

The seed process should be safe to run repeatedly and should not overwrite user-published rows with non-seed ids.

## Preview

Use a read-only wrapper around `$lib/components/board/KeyboardBoard.svelte` for the modal and card previews.

Preview rules:

- List cards use compact metadata and either a mini `KeyboardBoard` with the profile only when already fetched, or a purpose-built compact preview from `highlights` and catalog layout.
- The modal calls `getCommunityKeymap(id)` and renders the full `DeviceProfile` through `KeyboardBoard`.
- Omit mutation callbacks (`onSelectKey`, `onToggleKey`, `onLightingDrag`) so the board is read-only.
- Hide or disable zoom/pan affordances for cards. For the modal, wheel zoom is acceptable if it does not obscure the adoption/report actions.
- Use `lens="keys"` first. Lighting preview can be added later if community payloads expose meaningful RGB.

This directly replaces the handoff `PreviewBoard` canvas-like mini renderer (`resources/kbgui-handoff/kbgui/project/browse.jsx:7-39`) with the runtime board model.

## Phasing

1. Schema, binding, migrations, D1 client, seed.
   - Creates tables and local seed path.
   - No UI mutation yet.
   - Shippable because Browse can still show seeded public catalog data.
2. Read/browse/preview.
   - Implement `listCommunityKeymaps` and `getCommunityKeymap`.
   - Render filters, sorts, cards, and modal using real D1 data.
   - Shippable as read-only Browse.
3. Like/unlike.
   - Auth-required commands, viewer state, optimistic UI with query refresh.
   - Shippable positive signal feature.
4. Adopt as variant.
   - Auth-required adoption command plus local SQLocal fork/save-point write.
   - Shippable core user value: shared map becomes editable local variant.
5. Publish.
   - Auth-required publish from current local profile.
   - Moderation defaults: public or unlisted depending on sign-off.
   - Shippable creator loop.
6. Report/moderation.
   - Report modal and command.
   - Minimal maintainer D1 review path; admin UI later.
7. Compile verification.
   - Wire Wave 4b compile pipeline to update `compileStatus`.
   - Show verified badge only for real verified rows.

## Decisions For Sign-Off

1. Confirm D1 as the authoritative community catalog store, with Durable Objects reserved only for future high-contention coordination and R2 reserved for compile artifacts/logs.
2. Confirm auth policy: anonymous users can browse and preview; likes, adopts, publishes, and reports require a better-auth GitHub session.
3. Confirm author identity model: D1 `community_user` shadow rows keyed by better-auth `user.id`, rather than moving better-auth tables out of `AuthAgent`.
4. Confirm `compileVerified` meaning: true only after a real Wave 4b server compile succeeds; Wave 4a should not let users set it.
5. Confirm publish scope: publish only the current active local `DeviceProfile` with server-derived author/count/status fields; no imports, comments, or public revisions in Wave 4a.
6. Confirm moderation scope: one auth-required report per user/keymap, manual hide/review first, no automatic deletion.
7. Confirm adoption compatibility strictness: exact `catalogId` match preferred, with VID/PID and key-id shape checks before adopting into a connected device.
8. Confirm payload format: store full encoded `StoredDeviceProfile` in D1 for Wave 4a, not a custom compact keymap-only payload.
