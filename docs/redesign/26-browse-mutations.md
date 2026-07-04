# Wave 4a-ii Browse Mutations

Date: 2026-07-04

Scope: implementation handoff for Browse like/unlike, adopt-as-variant, and report. This wave keeps the community catalog inside `CommunityAgent` with Drizzle over DO SQLite. It does not implement publish or the real compile pipeline.

## CommunityAgent Mutations

`src/agents/community-agent.ts` now exposes these RPC mutation methods:

- `like(keymapId, user)` inserts one `community_keymap_like` row for `(keymapId, userId)`.
- `unlike(keymapId, user)` deletes the matching like row.
- `adopt({ keymapId, localForkId }, user)` records one `community_keymap_adoption` per `(keymapId, userId)` and returns the full `CommunityKeymapDetail`.
- `report({ keymapId, reason, detail }, user)` records one `community_keymap_report` per `(keymapId, reporterUserId)` and marks the keymap `review_pending`.

Each method validates the caller and keymap id, verifies the keymap is visible, and upserts the `community_user` shadow row from the signed-in Better Auth user. Counts are maintained transactionally from actual row changes:

- Like count increments only when a like row is inserted.
- Like count decrements only when a like row is deleted, clamped at zero.
- Adoption count increments only on the first adoption for a user/keymap pair. Re-adopting updates `localForkId`, `adoptedTitle`, and `updatedAt` without count inflation.
- Report count increments only on the first report for a user/keymap pair. A repeat report updates the report content/status timestamp without count inflation.

Reads now pass the optional viewer id through `listKeymaps` and `getKeymap`, so cards and detail DTOs populate `likedByViewer` and `adoptedByViewer` from the unique like/adoption rows.

## Remote Commands

`src/routes/(app)/browse/community.remote.ts` adds SvelteKit remote commands:

- `likeCommunityKeymap`
- `unlikeCommunityKeymap`
- `adoptCommunityKeymap`
- `reportCommunityKeymap`

All commands require `event.locals.user`. Anonymous callers receive:

```txt
401 Sign in with GitHub to use community likes, adoptions, and reports.
```

The command layer checks for the `CommunityAgent` binding before invoking the service. When the app is running in the static/read-only fallback path, mutations return:

```txt
503 Community mutations require the worker dev server and a signed-in GitHub session. Run `vp run dev:worker`, sign in, then retry.
```

The read path remains tolerant of a missing binding and continues to serve the seeded fallback catalog.

## Adopt As Variant

Browse adoption is wired through the existing workbench store without changing the `(workbench)` route group:

1. The UI creates `localForkId = crypto.randomUUID()`.
2. `adoptCommunityKeymap({ keymapId, localForkId })` records the remote adoption and returns the full stored profile plus `payloadHash`.
3. The client decodes the returned `StoredDeviceProfile`.
4. `workbench.adoptCommunityVariant(...)` creates a local `WorkspaceFork`, creates the first save point with message `Adopted "<title>"`, switches the active variant, updates the working profile, closes the modal, and navigates to `/editor`.

The new fork provenance is additive on `WorkspaceFork.source`:

```ts
{
  kind: "community",
  communityKeymapId,
  title,
  authorUserId,
  authorHandle,
  adoptedAt,
  payloadHash,
}
```

Existing forks without `source` continue to load unchanged.

## Browse UI

The previously disabled Browse affordances are active:

- Like toggles from `likedByViewer`, applies an optimistic count/state update, then refreshes the selected detail and list query.
- Adopt uses the coral primary action in the preview modal.
- Report opens a small modal with the supported reason enum and optional detail, then shows success/error feedback.
- Anonymous Like, Adopt, and Report actions open the existing shell auth/profile affordance with a sign-in prompt instead of failing silently.

## Tests

Added focused unit coverage in `src/lib/community/mutations.test.ts` for:

- first versus repeat like/adopt/report count behavior
- unique like/adoption/report semantics
- anonymous rejection and missing worker binding errors
- adopt provenance plus local fork/save-point shaping

## Verification

Required Vite+ checks passed:

- `vp check`: all 142 formatted files were correct; 221 files had 0 warnings, lint errors, or type errors.
- `vp run svelte:check`: 0 errors and 0 warnings.
- `vp build`: completed successfully with `@sveltejs/adapter-cloudflare:agents`; only plugin timing warnings were emitted.
- `vp test`: 23 test files passed, 118 tests passed.

Runtime proof used `vp run dev:worker` on `http://127.0.0.1:8787`. The worker started with the `CommunityAgent` binding. Because the app only exposes GitHub OAuth for sign-in, the authenticated proof used a local Wrangler-state Better Auth session for `runtime-proof-user` and a signed local cookie.

Anonymous mutation proof:

```json
{
  "command": "likeCommunityKeymap",
  "httpStatus": 200,
  "body": {
    "type": "error",
    "status": 401,
    "message": "Sign in with GitHub to use community likes, adoptions, and reports."
  }
}
```

Authenticated like/adopt proof against seeded keymap `cm1`:

```json
{
  "baseline": {
    "id": "cm1",
    "likesCount": 1284,
    "adoptionsCount": 412,
    "likedByViewer": false,
    "adoptedByViewer": false
  },
  "likeCommand": {
    "httpStatus": 200,
    "bodyType": "result"
  },
  "afterLike": {
    "id": "cm1",
    "likesCount": 1285,
    "adoptionsCount": 412,
    "likedByViewer": true,
    "adoptedByViewer": false
  },
  "adoptCommand": {
    "httpStatus": 200,
    "bodyType": "result",
    "detail": {
      "id": "cm1",
      "payloadFormat": "stored-device-profile-v1",
      "payloadHash": "fnv1a:a3f4f9b6",
      "profileId": "community-cm1",
      "adoptionsCount": 413,
      "adoptedByViewer": true,
      "localForkId": "runtime-proof-fork-a547abc5-216a-449b-a63e-ea381f1992df"
    }
  },
  "afterAdopt": {
    "id": "cm1",
    "likesCount": 1285,
    "adoptionsCount": 413,
    "likedByViewer": true,
    "adoptedByViewer": true
  }
}
```

The worker process tree was stopped after the proof. A follow-up probe to `http://127.0.0.1:8787/browse` timed out, confirming the local listener was no longer serving.
