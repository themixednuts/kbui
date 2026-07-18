# GitHub Actions Firmware Builds

Status: design started; first implementation slice in progress.

Date: 2026-07-06.

## Goal

Let a signed-in kbui user connect GitHub, create or adopt a user-owned firmware repo, have kbui maintain generated QMK/ZMK source there, trigger GitHub Actions builds, and show build feedback/artifacts in the app.

This is the server-backed alternative to full in-browser compilation. It is especially important for ZMK, where the normal user path is a GitHub config repo plus Actions build.

## Current Repo Context

- Existing GitHub sign-in is a Better Auth OAuth provider inside `AuthAgent`.
- Better Auth stores GitHub account rows in the Durable Object SQLite `account` table.
- Generated QMK/ZMK source already exists through `src/lib/keyboard/firmware-source.ts`.
- Browser WASM build scaffolding exists, but real ARM-capable in-browser builds are still unavailable.
- This feature should not be hidden inside the current GitHub login silently; repo/workflow permissions need an explicit connect/install step.

## Current Docs Findings

- GitHub recommends GitHub Apps over OAuth Apps for long-lived integrations because Apps support fine-grained permissions, repository selection, short-lived installation tokens, centralized webhooks, and app/bot identity.
- OAuth `workflow` is special: classic OAuth/PAT tokens need `workflow` to add or update files under `.github/workflows`.
- The repository contents API can create/update files, but file mutations must be serialized when touching related paths.
- `workflow_dispatch` can manually trigger an Actions workflow. Fine-grained tokens need repository `Actions: write`.
- Listing workflow runs and run artifacts needs repository `Actions: read` for fine-grained tokens; private repos need auth.
- QMK officially supports External Userspace and GitHub Actions builds for user keymaps.
- ZMK's user setup flow creates a GitHub config repo containing `build.yaml`, keymap/config files, and Actions workflow.

## Authentication Decision

Use a GitHub App for repo/build automation.

Keep the existing Better Auth GitHub OAuth login for app identity while adding a separate "Install kbui GitHub App" action for firmware repo automation. Do not broaden the normal login to `repo workflow` by default.

Why:

- OAuth App `repo + workflow` is broad and grants access to all private repos the user can access.
- A GitHub App can be installed only on the kbui-managed firmware repo or selected repos.
- Installation access tokens are short-lived and can be generated server-side from Worker secrets.
- Centralized webhooks give us build feedback without per-repo webhook setup.

Open detail:

- Creating a brand-new personal repository is best done with a GitHub App user access token that has `Administration: write`, or by generating from a template where the token supports that endpoint. After the repo exists and the app is installed on it, normal maintenance should use the installation token.
- GitHub App user access tokens expire after 8 hours by default and include a refresh token that expires after 6 months. Kbui should keep encrypted user-token material only for user-scoped setup actions: create repo, create-from-template, adopt repo, and selected-installation repair. It should not use user tokens for steady-state branch sync/build feedback.
- Installation access tokens are generated on demand from `GITHUB_APP_ID` + `GITHUB_APP_PRIVATE_KEY`, can be narrowed to a repository and permission set, and expire after 1 hour. Do not store them.
- If GitHub App user-token support is too awkward with Better Auth, a temporary MVP can use the existing OAuth provider with explicit additional scopes `repo workflow`, but that should be gated behind a separate "GitHub build repos" consent screen and called out as broad access.

## GitHub App Permissions

Recommended repository permissions:

- `Administration: write`: create from template, initialize settings/topics, and manage repo-level Actions settings when needed.
- `Contents: write`: commit generated source files.
- `Workflows: write`: create/update `.github/workflows/*.yml`.
- `Actions: write`: dispatch workflows.
- `Actions: read`: list runs, jobs, logs, and artifacts.
- `Metadata: read`: always available, used for repo identity.

Recommended account/user access:

- User identity email/profile remains via existing Better Auth GitHub login.
- GitHub App user access token should be requested only during the firmware repo setup flow if we need to create the repo under the user's account.

Recommended webhooks:

- `workflow_run`: update build status and artifact availability.
- `installation`, `installation_repositories`: detect install/removal and repo access changes.
- `github_app_authorization`: clear stored user-token material if the user revokes the GitHub App authorization.

## Repository Strategy

One kbui-managed repo per user/account by default:

- Name: `kbui-userspace`.
- Visibility: private by default.
- Default branch: `main`.
- Kbui variants/forks are Git branches inside the managed repo, not GitHub repository forks.
- Branch names are scoped by keyboard profile and variant, for example `kbui/workbench-65/main` and `kbui/workbench-65/gaming`.
- QMK and ZMK source can coexist in the same repository. The active branch contains the generated source and workflow files for the keyboard/variant being built.
- Kbui-owned file namespace where possible, but keep each firmware ecosystem's expected root files.
- Private repos are allowed. GitHub Actions can run in private repositories, but GitHub-hosted runner minutes and artifact/cache storage count against the repository owner's private Actions quota.

QMK:

- Prefer official `qmk/qmk_userspace` style.
- Maintain:
  - `qmk.json`
  - `keyboards/<keyboard>/keymaps/<keymap>/keymap.c`
  - `keyboards/<keyboard>/keymaps/<keymap>/config.h`
  - `keyboards/<keyboard>/keymaps/<keymap>/rules.mk`
  - `.github/workflows/build-qmk.yml`
- Build target comes from profile firmware metadata: QMK keyboard path, layout/keymap name, and output format.

ZMK:

- Prefer official `zmkfirmware/unified-zmk-config-template` style.
- Maintain:
  - `build.yaml`
  - `config/<shield>.keymap`
  - `config/<shield>.conf`
  - `config/west.yml` when pinning ZMK or modules.
  - `.github/workflows/build-zmk.yml`
- Build target comes from profile firmware metadata: board, shield, optional artifact naming, and split halves.

## Server Architecture

Add a firmware GitHub layer with three levels:

1. Pure planner module:
   - Converts `FirmwareSourceBundle` and selected provider into repo file upserts.
   - Identifies workflow files and whether `Workflows: write` is required.
   - Produces commit messages, branch names, and workflow dispatch inputs.
   - Maps GitHub run statuses/conclusions into kbui build states.

2. GitHub REST client:
   - `createRepoForUser` or `createRepoFromTemplate`.
   - `adoptRepo` for users who already keep QMK/ZMK repos.
   - `getRepo`, `getRef`, `createRef`, `createTree`, `createCommit`, `updateRef`.
   - `dispatchWorkflow`.
   - `listWorkflowRuns`, filtered by `head_sha` or workflow file.
   - `listRunArtifacts`, `downloadArtifact`.
   - Source sync uses Git database API writes (`tree` -> `commit` -> non-forced `ref` update) so a QMK/ZMK source refresh lands as one atomic commit.

3. AuthAgent plugin/endpoints:
   - `GET /api/auth/firmware/github/status`
   - `POST /api/auth/firmware/github/connect`
   - `POST /api/auth/firmware/github/sync`
   - `POST /api/auth/firmware/github/build`
   - later: `GET /api/auth/firmware/github/runs/:id`
   - later: `GET /api/auth/firmware/github/runs/:id/artifact`

The AuthAgent already owns the user identity and OAuth account storage, so it is the right home for GitHub firmware repo linkage. If webhook processing grows high-volume, split it into a separate Agent later.

## Durable Data Model

Add tables in AuthAgent storage:

- `github_firmware_repository`
  - `id`
  - `user_id`
  - `provider`: `github`
  - `repository_kind`: active firmware layout marker, `qmk-userspace` or `zmk-config`
  - `owner`
  - `repo`
  - `repo_id`
  - `default_branch`
  - `installation_id`
  - `private`
  - `relationship`: `managed` or `adopted`
  - `workflow_path`
  - `last_source_hash`
  - `last_commit_sha`
  - `last_run_id`
- `github_firmware_branch`
  - `repository_id`
  - `variant_id`
  - `variant_name`
  - `branch_name`
  - `source_save_point_id`
  - `last_source_hash`
  - `last_commit_sha`
  - `last_run_id`
  - `last_status`
  - `last_status`
  - `created_at`
  - `updated_at`

- `github_firmware_run`
  - `id`
  - `connection_id`
  - `request_id`
  - `run_id`
  - `head_sha`
  - `status`
  - `conclusion`
  - `artifact_name`
  - `artifact_id`
  - `log_url`
  - `html_url`
  - `started_at`
  - `completed_at`
  - `created_at`
  - `updated_at`

Do not store installation access tokens. Generate them on demand.

## Client UX

Settings:

- Add a GitHub firmware builds card.
- States:
  - GitHub signed out.
  - Signed in but app not installed.
  - App installed but no repo selected/created.
  - Repo connected and source clean.
  - Source changed, ready to sync.
  - Build queued/in progress/succeeded/failed.
- Actions:
  - Install GitHub App.
  - Create kbui firmware repo.
  - Sync source.
  - Build firmware.
  - Download artifact.
  - Open run on GitHub.

Flash overlay:

- If generated source is build-ready and browser build is unavailable, show `Build with GitHub Actions`.
- Build action first syncs source if needed, then dispatches workflow.
- Surface diagnostics, workflow run logs, and artifacts in the same modal path as browser builds.

## Build Feedback

- The GitHub App webhook receives signed `workflow_run` events, persists the run, and sends the terminal event to the matching Cloudflare Workflow instance.
- The Workflow durably waits with `step.waitForEvent`; it owns timeout/retry behavior and does not need a Queue in front of the same event path.
- The FirmwareBuildAgent broadcasts persisted status over WebSocket. The UI reconnects automatically and falls back to bounded status refresh only when a socket cannot be maintained.
- Persisted run state lets refresh/reopen resume without redispatching or manually chasing a GitHub run.

## Security Constraints

- User source and firmware files are committed to the user's repo; UI must label this clearly.
- Default repos should be private.
- Never request broad `repo workflow` on ordinary app login.
- Verify GitHub webhook signatures.
- Use least-privilege app permissions; if a workflow update requires new permissions, block with an explicit setup error.
- Serialize content mutations to avoid GitHub contents API conflicts.
- Pin workflow actions and upstream firmware refs where practical.
- Redact tokens and private repo URLs from logs.

## Implementation Phases

Phase 0: pure planning layer.

- Add `src/lib/keyboard/firmware-github/`.
- Add provider/repo/run/file-plan types.
- Add tests for QMK/ZMK path planning, workflow permission detection, content upsert plans, and run-state mapping.

Phase 1: GitHub REST client.

- Add injectable fetch client with unit tests.
- No UI yet.
- Support create repo, create-from-template, get content SHA, upsert file, dispatch workflow, list runs, list artifacts.

Phase 2: AuthAgent persistence and status endpoints.

- Add schema/tables.
- Add Better Auth plugin or AuthAgent-routed endpoints.
- Use current OAuth token only for read identity unless explicit GitHub App/user-token flow has been added.

Phase 3: setup UI.

- Settings card for installation/repo creation/status.
- Explicit permission and repo visibility copy.

Phase 4: build UI. (delivered)

- Flash overlay GitHub Actions build path.
- WebSocket status, automatic fallback, artifact download, GitHub run link.

Phase 5: webhooks and durable completion. (delivered)

- GitHub App webhook endpoint with signature verification.
- Persist run updates, signal the waiting Workflow instance, and broadcast the result.

## Deferred

- Automatically migrating arbitrary existing user repos.
- Organization-owned repo setup beyond selected installations.
- Full ZMK module management UI.
- Full QMK keyboard metadata discovery.
- Replacing GitHub Actions with in-browser or hosted builds.

## Live UI E2E — 2026-07-15

Tested through the running kbui UI with the signed-in `themixednuts` GitHub account and the connected `Charybdis (4x6) Splinky` WebHID/QMK profile. The test used kbui's own `Versions -> Sync branch` control; the repository was not created manually on GitHub.

### What worked

- Kbui created `themixednuts/kbui-userspace` as a private repository.
- The GitHub App bot created a firmware branch and atomically committed seven generated/support files.
- The branch contained the expected broad structure: `.github/workflows`, `.kbui`, `keymaps/charybdis_4x6_splinky`, and `qmk.json`.
- GitHub accepted and ran the generated QMK reusable workflow.
- The QMK reusable build job completed, proving the repo, permissions, checkout, and upstream reusable-workflow wiring were operational.

### Confirmed blockers and friction

#### P0 — Sync silently triggers a build that the UI says has not been dispatched

The generated QMK workflow uses `on: [push, workflow_dispatch]`. Clicking `Sync branch` therefore started Actions run `29402681146`, while kbui continued to show `RUN not dispatched`, `ARTIFACT waiting`, and a disabled separate `Build firmware` button.

This breaks the intended two-step model and consumes Actions quota when the user only asked to sync source. It also means invalid/incomplete generated source is run despite the build-readiness guard.

Acceptance criteria:

- Source sync alone does not start a firmware build.
- `Build firmware` is the only UI action that dispatches a manual build.
- Kbui's displayed run state always agrees with GitHub.
- If push-triggered validation remains desirable, it is a separately named validation workflow and its status is represented separately.

#### P0 — Connected QMK profiles produce an empty build target

The generated `qmk.json` contained:

```json
{
  "userspace_version": "1.1",
  "build_targets": []
}
```

The QMK build job consequently produced no `.bin`, `.hex`, or `.uf2`. The publish job then failed because the expected `Firmware` artifact did not exist.

The immediate cause is that `qmkUserspaceManifestFile()` only emits a target when `repository.pathLayout.keyboardPath` exists. The connected `DeviceProfile` has no typed QMK keyboard/layout metadata, so `deriveFirmwareGitHubRepository()` cannot populate it.

Acceptance criteria:

- `DeviceProfile` has firmware-family-specific build metadata: QMK keyboard path, layout macro, keymap/output details; ZMK board, shield, split halves, and optional artifact name.
- A WebHID/VIA connection either resolves that metadata from the board definition/catalog or asks the user to select it before a build can be dispatched.
- `qmk.json.build_targets` contains the exact keyboard/keymap pair for every build-ready QMK profile.
- Sync may preserve incomplete work, but no workflow is dispatched while blocking diagnostics exist.
- Add a regression test that asserts the generated `qmk.json` contents, not only the file list.

#### P0 — Build failure is invisible in kbui

After GitHub completed the push-triggered run with `failure`, clicking `Build status` left kbui at `RUN not dispatched` and `ARTIFACT waiting`. The status path only follows persisted `workflow_dispatch` requests, so it cannot discover the build that sync triggered via `push`.

Acceptance criteria:

- Every run kbui can trigger is persisted and discoverable by commit SHA, branch, workflow, and event.
- Refresh surfaces terminal failure, the failing job/annotation, and an `Open run on GitHub` action.
- A missing artifact is shown as a build failure, not indefinite `waiting`.

#### P1 — Variant scoping happens twice

Before sync, the UI planned `kbui/keyboard-a8f8-1833-charybdis-4x6-splinky/main`. The server actually created:

`kbui/keyboard-a8f8-1833-charybdis-4x6-splinky/keyboard-a8f8-1833-charybdis-4x6-splinky-main`

The client calls `firmwareGithubVariantInput()`, which already scopes the active variant by profile. `syncFirmwareSourceBranch()` and run-status lookup then call `firmwareGitHubVariantForProfile()` again.

Acceptance criteria:

- Profile scoping has one owner (client or server, preferably server).
- The previewed branch equals the persisted and created branch.
- Reopening Versions displays the actual branch from server state.
- Add a client-to-endpoint regression test for a `main` variant; unit tests of the pure helper alone do not catch double scoping.

#### P1 — Manual dispatch inputs do not match the generated workflow contract

The server sends `source_hash` and `variant_id` as `workflow_dispatch` inputs, but the generated QMK and ZMK workflows use shorthand triggers and declare no inputs. A live manual dispatch could not be reached in this run because build readiness was blocked, but the caller/callee mismatch is deterministic.

Acceptance criteria:

- Generated workflows explicitly declare every dispatched input with types/defaults, or the server sends no inputs.
- QMK and ZMK workflow-generation tests parse the YAML and assert the dispatch contract.

#### P1 — Build readiness has no actionable UI

`Build firmware` was disabled because generated firmware had blocking diagnostics. Versions did not display the diagnostics or explain the disabled control. The guarded handler contains a useful error message, but a disabled button cannot invoke it. The delivery cards also showed four zero counts, including `FIX FIRST 0`, which contradicted the actual missing QMK keyboard/layout metadata.

Acceptance criteria:

- The build button's disabled state has adjacent explanatory copy.
- Blocking diagnostics are listed with their exact metadata paths and a direct route/action to resolve each one.
- Delivery lane counts derive from the same diagnostics used by `buildReady`.
- `Status ready/synced` is not used as a proxy for build readiness.

#### P1 — Repository creation is not disclosed at action time

The first-run action was labeled only `Sync branch`, but it created a new private GitHub repository, a branch, a workflow, and seven files. The target account, repository name, visibility, branch, and file count were not previewed next to the button.

Acceptance criteria:

- First-run copy says `Create private repo & sync` (or equivalent).
- A confirmation preview names the GitHub account, repository, visibility, branch, and files/workflows to be written.
- Subsequent syncs can return to the shorter `Sync branch` label once the managed repo exists.

### Regression loop

The live pass/fail loop for the next implementation should be:

1. Connect a QMK fixture/profile with explicit `keyboard`, `layout`, and `keymap` metadata.
2. Click `Sync branch`; assert the repo/branch/files exist and no Actions build starts.
3. Assert `qmk.json.build_targets` contains the target pair.
4. Click `Build firmware`; assert one `workflow_dispatch` run is created and kbui records it.
5. Poll through kbui until terminal; assert a firmware artifact is shown and downloadable.
6. Repeat with a ZMK/BLE profile and assert all configured halves are present in `build.yaml` and artifacts.

## Live UI E2E follow-up — 2026-07-15

The implementation was retested through the same signed-in browser session and connected Charybdis profile after addressing the blockers above. The UI now keeps sync and dispatch separate, preserves the real branch name, requires complete firmware metadata, and can rediscover a terminal run plus its artifact.

### Successful end-to-end result

- Firmware target: `bastardkb/charybdis/4x6`, layout `LAYOUT`, keymap `kbui`.
- Upstream QMK fork/ref: `bastardkb/bastardkb-qmk` at `bkb-master`.
- Managed branch: `kbui/keyboard-a8f8-1833-charybdis-4x6-splinky/main`.
- The generated workflow received the upstream repository and ref explicitly.
- Run 3 reached the real QMK compiler and exposed a portability bug: VIA-style combined modifier aliases such as `LCS(KC_1)` are not defined by this QMK fork.
- The source generator now emits portable nested QMK macros such as `LCTL(LSFT(KC_1))` and generic multi-mod tap forms such as `MT(MOD_LCTL | MOD_LSFT, KC_A)` while retaining canonical aliases in QMK JSON.
- Run 4 completed the QMK build, binary upload, and publish jobs successfully: `https://github.com/themixednuts/kbui-userspace/actions/runs/29423732070`.
- The resulting `Firmware` artifact is 47,145 bytes. The Versions UI resolves it as `Firmware · 46.0 KB` and shows the run as `Succeeded`.

### Friction found and corrected

- SQLocal's earlier OPFS reload issue was worked around with its main-thread localStorage VFS, but that backend made SQLite probe OPFS on the wrong thread and emitted a fallback warning. The store now uses SQLocal's worker-backed OPFS VFS, verifies that persistence did not silently fall back to memory, and migrates any existing `kvvfs-local-*` database once before removing the legacy pages.
- Firmware target persistence had no completion feedback. The Settings form now awaits the persistence flush and exposes `Saving…`, success, and error states.
- Auto-reconnect previously redirected every app route back to Editor. Route navigation is now left to explicit connect actions, so Settings and Versions survive reconnect/hydration.
- A connected base profile could overwrite locally saved firmware metadata. Connected-profile activation now merges matching draft firmware/settings and flushes the resulting base profile.
- Direct reload while another tab still held the HID device exposed one-shot reconnect friction. The useful recovery path was Settings -> Versions within the hydrated SPA; this should remain in the browser regression suite.
- A transient Worker outbound error (`Network connection lost`) made `Build status` return a hard 503. Status reads now retry transient GitHub/token/run/artifact requests. If all retries fail, the endpoint returns the last persisted run state with a retry message instead of breaking the Versions UI. Artifact lookup can also fail independently without discarding the current run result.
- Browser refresh after a form POST can retry the POST and confuse the local Miniflare cache. E2E reload checks should use an explicit GET navigation.
- Stale Wrangler bundles filled the E: drive during repeated rebuilds. Only generated `.wrangler/tmp` and `.svelte-kit` outputs were cleared; persisted `.wrangler/state` data was retained.
- Exact local `workflow_run` webhook testing now uses `vp run dev:webhook`. It starts Wrangler's current Quick Tunnel command by default and prints the GitHub App webhook URL; `KBGUI_TUNNEL_NAME` plus `KBGUI_PUBLIC_ORIGIN` switch the same task to a stable named tunnel.

### Regression coverage added

- Connected-profile activation preserves and persists draft firmware metadata.
- QMK source generation covers portable combined modifiers and mod-taps.
- GitHub firmware status retries a transient workflow-run read and returns a 200 with the last persisted terminal state when GitHub remains temporarily unreachable.
- The live browser pass confirms the status endpoint updates the persisted run, branch, repository, and artifact records from GitHub after a successful build.
