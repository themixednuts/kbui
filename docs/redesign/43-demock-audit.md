# Demock Audit

Read-only audit for the de-mock / full-hookup consolidation phase. Scope was shipping code under `src/**` and `extension/**`, excluding `*.test.ts`, `*.spec.ts`, `tests/**`, and helpers only imported by tests.

Method: bounded `rg` sweep for mock/demo/sample/seed/stub/placeholder/TODO/not-implemented/fake/simulated/timing/random terms, followed by surrounding-code reads and reachability checks through routes, components, agents, and extension entrypoints. No builds, tests, captures, commits, or code changes were run.

## Summary Counts

40 findings: WIRE 17, LABEL 10, GATE 4, TEST-ONLY 3, REMOVE 6.

## Findings

| # | Location | What it is | Reachable? | Recommended disposition | Justification |
|---:|---|---|---|---|---|
| 1 | `src/routes/(app)/connect/+page.svelte:24` | The shipping Connect route imports mock VIA/ZMK transports and exposes them via demo buttons at `:364` and `:379`. | yes | GATE | Mock connection paths are reachable from the normal Connect UI; keep only behind dev/env/feature gating. |
| 2 | `src/lib/keyboard/transport-mock.ts:76` | Mock VIA Workbench 65 profile is cloned from `sampleKeyboard` and returned by `createMockViaTransport` at `:322`. | yes | TEST-ONLY | This is a full fake transport and device profile currently imported by a shipping route. |
| 3 | `src/lib/keyboard/transport-mock-zmk.ts:30` | Mock ZMK Studio device info/profile/connection is exported and returned by `createMockZmkStudioTransport` at `:361`. | yes | TEST-ONLY | This is a fake hardware/RPC stack reachable from the Connect route. |
| 4 | `src/lib/keyboard/mock-device.ts:261` | Mock keyboard capture/event helper remains under `src/lib/keyboard`. | no | TEST-ONLY | It is not imported by a normal route, but it is a mock helper in the shipping source tree and should live with tests/dev tooling. |
| 5 | `src/routes/(app)/connect/+page.svelte:431` | Disabled "Trace from photo" option is rendered as "Soon". | yes | REMOVE | User-facing coming-soon affordance is not a real flow and should not ship as part of full-hookup. |
| 6 | `src/routes/(app)/connect/+page.svelte:422` | "Continue without a device" starts local editing from the Workbench 65 starter profile. | yes | LABEL | Local-only editing can be legitimate, but the starter profile must remain visibly Demo/Sample/Starter everywhere it is treated as data. |
| 7 | `src/lib/app/connect-flow.ts:201` | Real ZMK Studio connection builds its profile by cloning `sampleKeyboard` before overlaying detected ZMK data. | yes | WIRE | Construct the profile from ZMK Studio physical layout/layers/device info and real defaults, not from the sample profile. |
| 8 | `src/lib/app/connect-flow.ts:292` | Real VIA activation falls back to `cloneDevice(sampleKeyboard)` when no base/catalog/default profile resolves. | yes | WIRE | A connected real device should resolve a real VIA definition/catalog profile or stop for user input, not silently become Workbench 65. |
| 9 | `src/lib/app/connect-flow.ts:396` | `continueWithoutDevice` defaults its base profile to `sampleKeyboard`. | yes | LABEL | If no-device editing remains, it should create an explicitly labeled sample/starter profile rather than an unlabeled normal profile. |
| 10 | `src/lib/app/editor-store.svelte.ts:221` | Editor state initializes `baseProfile`, `profile`, active layer, and selection from `defaultSampleKeyboard`. | yes | WIRE | The default editor/workbench state should hydrate a real local draft, connected/imported profile, or an explicit new-profile flow. |
| 11 | `src/lib/app/workbench-store.svelte.ts:139` | `WorkbenchStore` constructor falls back to `sampleBoards[boardId]`. | yes | WIRE | App-wide workbench state uses sample board data as the normal default. |
| 12 | `src/lib/app/workbench-store.svelte.ts:155` | `switchSampleBoard` replaces the active profile with a sample board. | yes | GATE | This is a demo-board switcher used by the editor route and should not be available to normal users. |
| 13 | `src/routes/(app)/editor/+page.svelte:36` | Editor reads `?board=` as a sample-board selector and renders a "Temporary editor board selector" at `:161`. | yes | GATE | Temporary demo selection is reachable in the real editor route. |
| 14 | `src/lib/keyboard/sample-boards.ts:12` | `defaultSampleKeyboard` is exported as a reusable starter/default board. | yes | LABEL | If retained for no-device/new-profile use, it must carry explicit sample/starter labeling through the UI and persistence model. |
| 15 | `src/lib/keyboard/sample-boards.ts:46` | `splitDemoKeyboard` creates a Corney Split 34 demo profile with canned layout/settings. | yes | GATE | Split demo data is reachable through the editor sample-board selector. |
| 16 | `src/lib/keyboard/schema.ts:879` | `sampleKeyboard` defines fake Workbench 65 identity, IDs, macros, combos, lighting, and settings. | yes | LABEL | It is useful as seed/starter data only if every user-facing usage is labeled as such. |
| 17 | `src/lib/community/service.ts:23` | Browse reads fall back to `listSeedCommunityKeymaps` when `CommunityAgent` is absent. | yes | LABEL | Seed catalog data can appear as normal Browse results without a visible global seed/demo state. |
| 18 | `src/agents/community-agent.ts:321` | `CommunityAgent` always seeds authors/keymaps into the Durable Object on startup. | yes | LABEL | Seeded content is persisted into the real community tables and needs visible seed/sample provenance. |
| 19 | `src/lib/community/seed-maps.ts:88` | Prototype community maps contain canned titles, handles, likes/adoptions, and dates. | yes | LABEL | These are fabricated community metrics shown in Browse. |
| 20 | `src/lib/community/seed-maps.ts:282` | Seed keymaps are marked compile-verified against `demo-seed-wave-4a`. | yes | LABEL | Demo compile verification can read as a real build result unless visibly labeled. |
| 21 | `src/lib/components/browse/CommunityKeymapCard.svelte:58` | Seed/verified indicators use hidden titles "Official seed map" / "Demo compile verified" but visible labels are "Official" / "compiles". | yes | LABEL | The card does not visibly tell users that the item and compile state are seed/demo data. |
| 22 | `src/lib/components/browse/CommunityPreviewModal.svelte:141` | Preview modal repeats "Official" / "Compiles" labels while seed/demo wording is only in titles. | yes | LABEL | Modal details can present seed/demo entries as ordinary community entries. |
| 23 | `src/routes/(app)/browse/+page.svelte:324` | `randomUuid()` falls back to `Math.random()` for local fork/save-point IDs. | yes | WIRE | User-visible/persisted adoption artifacts should use a real UUID/ID source or fail clearly if unavailable. |
| 24 | `src/routes/(app)/versions/+page.svelte:27` | Save-point message input is prefilled with "Tweak home-row timing". | yes | REMOVE | This creates fake user intent in the real versioning UI. |
| 25 | `src/routes/(app)/versions/+page.svelte:28` | Branch-name input is prefilled with "experiment-thumbcluster". | yes | REMOVE | This creates fake user branch data in the real versioning UI. |
| 26 | `src/lib/app/workbench-store.svelte.ts:268` | `flashSavePoint` records a `status: "stubbed"` flash intent instead of flashing. | yes | WIRE | Versioning flash action should call the real flash flow/build artifact path or be removed until wired. |
| 27 | `src/routes/(app)/versions/+page.svelte:380` | "Flash this" button calls the stub and shows "No device write runs in this wave" at `:386`. | yes | WIRE | The user-facing action is present but does not execute a real device write. |
| 28 | `src/lib/app/workbench-store.svelte.ts:334` | Save-point/fork IDs fall back to `Math.random()` when `crypto.randomUUID` is absent. | yes | WIRE | Persisted workspace IDs should come from a robust UUID/ID source. |
| 29 | `src/lib/app/editor-store.svelte.ts:585` | New macro creation uses canned name plus sequence `KC_LCTL`, `KC_LSFT`, `KC_P`. | yes | REMOVE | A newly created library item should start blank/explicitly unassigned, not as a fake shortcut. |
| 30 | `src/lib/app/editor-store.svelte.ts:648` | New combo creation auto-selects the first two keys and binds `KC_NO`. | yes | REMOVE | This creates a fake combo structure that can be mistaken for user-authored logic. |
| 31 | `src/lib/app/editor-store.svelte.ts:726` | New tap dance creates `KC_NO` tap/hold/doubleTap on selected or first key. | yes | REMOVE | This should be an explicit unassigned draft state, not a real-looking logic entry. |
| 32 | `src/lib/app/editor-store.svelte.ts:909` | Change IDs fall back to `Date.now()` plus `Math.random()`. | yes | WIRE | Persisted change records should use a real stable ID source or reject unsupported runtimes. |
| 33 | `src/lib/keyboard/firmware-source.ts:477` | QMK source export emits placeholder build command/layout macro when metadata is missing. | yes | WIRE | Firmware source should require/resolution-wire real board metadata instead of emitting placeholders for build-critical fields. |
| 34 | `src/lib/keyboard/firmware-source.ts:638` | QMK source export emits TODOs for combo layer scope, split transport, and lighting config. | yes | WIRE | Generated source still contains board-specific TODOs in user-downloadable firmware output. |
| 35 | `src/lib/keyboard/firmware-source.ts:872` | ZMK source export emits placeholder board/shield identities when metadata is missing. | yes | WIRE | Build identity must come from real board/shield metadata or block generation. |
| 36 | `src/lib/keyboard/firmware-source.ts:1159` | Unknown ZMK keycodes emit `&none /* UNSUPPORTED */`. | yes | WIRE | Unsupported key mappings silently degrade generated behavior rather than resolving or blocking. |
| 37 | `src/lib/keyboard/firmware-source.ts:1204` | ZMK `.conf` generation emits TODOs for serial split and behavior-specific tapping terms. | yes | WIRE | User firmware output contains incomplete board/behavior mappings. |
| 38 | `src/lib/keyboard/via-live.ts:315` | Generic VIA lighting writes are classified as "not implemented". | yes | WIRE | Lighting edits are local/source-only for VIA instead of writing through a real board-specific path. |
| 39 | `src/lib/keyboard/zmk-live.ts:219` | Unknown ZMK behaviors and unsupported codec bindings are preserved but not live-edited. | yes | WIRE | ZMK live sync only covers the first binding-codec slice; unsupported real edits remain local/source-only. |
| 40 | `src/lib/keyboard/zmk-live.ts:339` | ZMK lighting writes are outside the first live-edit slice. | yes | WIRE | Lighting edits do not reach real ZMK Studio hardware. |

## Already Real / Correctly Wired

- Auth/session is real-gated rather than faked: `src/hooks.server.ts:7` initializes null locals, `src/hooks.server.ts:12` asks `AuthAgent` for `/get-session`, and `src/routes/api/auth/[...all]/+server.ts:11` / `:17` return explicit 503s when the worker binding is unavailable. `src/agents/auth-agent.ts:93` wires `betterAuth`; GitHub is only configured from real env credentials at `:118`.
- Monkeytype sync uses the real API and encrypted ApeKey storage: `src/lib/server/monkeytype/client.ts:3` points at `https://api.monkeytype.com`, `src/lib/server/auth/monkeytype-plugin.ts:144` constructs the real client, and `:429` / `:439` fetch personal bests/results. Stale summaries only reuse previously stored real data.
- Typing-run ingest is real worker-backed: `src/lib/typing-runs/service.ts:78` calls `TypingRunsAgent.ingestRun`, `:109` throws if the binding is missing, and `src/agents/typing-runs-agent.ts:231` persists ingested runs. Pairing tokens use crypto randomness at `src/agents/typing-runs-agent.ts:652`.
- Extension capture/upload is real: `extension/src/monkeytype/capture.ts:55` reads Monkeytype DOM metrics, `extension/entrypoints/background.ts:202` posts parsed runs, and queued retries use Chrome storage rather than canned run data.
- Local workspace persistence is real: `src/lib/keyboard/local-store.ts:3` uses SQLocal, `:145` saves devices, `:200` saves drafts, and `src/lib/keyboard/save-points.ts:28` builds save points from actual profile diffs.
- Community mutations require real auth and worker binding: `src/routes/(app)/browse/community.remote.ts:25` requires a session for likes, `:42` for adoption, and `:64` errors when the `CommunityAgent` binding is absent. The read side still has seed findings above.
- VIA connection uses browser hardware APIs: `src/routes/(app)/connect/+page.svelte:156` uses `createWebHidViaTransport`, `src/lib/keyboard/transport.ts:581` creates the real transport, and `:622` / `:645` request WebUSB/WebHID devices.
- ZMK connection uses real browser APIs: `src/lib/keyboard/transport-zmk-ble.ts:180` requests a Bluetooth device and `src/lib/keyboard/transport-zmk-serial.ts:106` requests a serial port.
- UF2 flash copy is real/honest: `src/lib/keyboard/uf2-flash.ts:535` detects File System Access support, and `src/lib/components/flash/FlashOverlay.svelte:369` consumes real copy progress callbacks.

## Hardware-Dependent

- VIA WebHID/WebUSB cannot be real without a physical keyboard and browser HID/USB support. With no device, the real path goes through the browser chooser and errors/cancels from the browser/device layer. The current fallback is the reachable demo VIA option, which is labeled as demo/mock but still ships in the Connect UI and is covered by findings 1-2.
- ZMK Studio BLE/serial cannot be real without a compatible unlocked ZMK Studio board and browser Bluetooth/Serial support. The UI honestly labels these as hardware-unverified at `src/routes/(app)/connect/+page.svelte:335` and `:353`; transport errors are explicit in `src/lib/keyboard/transport-zmk-ble.ts:64` and `src/lib/keyboard/transport-zmk-serial.ts:45`. The mock ZMK fallback is separately reachable and covered by findings 1 and 3.
- ZMK Studio writes are partly real and partly incomplete. Encodable key binding writes are wired, but unknown behaviors, unsupported bindings, and lighting are source-only/incomplete per findings 39-40.
- UF2 flashing is real file-copy logic but hardware-unverified. The app says so directly in `src/lib/components/flash/FlashOverlay.svelte:875`, and `src/lib/keyboard/uf2-flash.ts:473` marks real mass-storage reboot semantics as unverified. Manual "Copied manually" is an explicit user acknowledgement, not fake success.
- Flashing while a mock target is active is warned against by `src/lib/keyboard/flash-validation.ts:74`; once mock targets are gated/test-only, this warning should become dev/test-only as well.

## Known Already-Handled Firmware Builder Gap

- Browser firmware build is explicit unavailable behavior, not fake success: `src/lib/components/flash/FlashOverlay.svelte:519` returns `null` from `experimentalBrowserBuildManifest`, and `src/lib/keyboard/firmware-build/builder.ts:45` / `:50` return `unavailableResult`. This is the already-known firmware builder gap; it is not counted as a separate finding above.

## Non-Findings From The Sweep

- `setTimeout`/timing hits were debounces, retry scheduling, DOM-settle polling, copy-notice reset, or object URL cleanup; no fake connect/save/flash progress was found outside the mock transports.
- Ordinary input placeholders such as search boxes, pairing code, and keycode input hints were not counted because they do not present fake saved data as real.
- `src/agents/user-workbench.ts:27` starts its internal state as `anonymous`, but `src/routes/api/agent/snapshot/+server.ts:18` requires `locals.user` and derives the Durable Object name from the authenticated user at `:32`; this is not a fake logged-in state.
