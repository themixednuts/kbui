# Effect v4 Audit — 2026-07-17

Whole-`src` audit for true Effect v4 composition vs. ad-hoc Promise escape hatches.
Run as an 8-dimension multi-agent sweep (promise-orchestration, runtime-boundaries,
error-modeling, services-layers, schema-boundaries, time-cache-streams, svelte-interop,
config-env), every finding re-verified by a refute-biased second agent against the file
contents, plus a completeness critic. 116 findings survived verification:
**5 blockers, 73 majors, 38 minors**. Full per-finding detail (problem, fix sketch,
verifier note) is in [effect-v4-audit-findings.md](./effect-v4-audit-findings.md).

Verdict: the repo is **structurally Effect v4 at the edges and Promise-shaped in the
middle**. Layers, ManagedRuntime boundaries, Schema models, and most single-call
adapters are genuinely idiomatic. But a handful of systemic patterns — all invisible to
the current boundary lint — put Promise orchestration back inside Effect programs on the
core flows (persistence, connect/activate, flash, GitHub firmware, auth).

## The five blockers

1. **`src/lib/keyboard/local-store.ts:282` — the `getClient()` Promise round-trip.**
   Every DB operation is `Effect.tryPromise(async () => { const db = await getClient(); ... })`
   where `getClient()` is `localStoreRuntime.runPromise(...)` — a second runtime entered
   from inside the first, on the whole persistence path (~15 sites). Outer interruption
   never reaches the inner run; the layer's typed `LocalStoreUnavailable`/`PlatformError`
   flatten to untyped rejections. Fix: `const { db } = yield* LocalStore` inside
   `Effect.gen`, one foreign `db.sql`/`db.transaction` call per `tryPromise`, runtime
   entered once in `runLocalStoreEffect`.

2. **`src/lib/app/connect-flow.ts:328` — nested `runApp` inside an `appRuntime` fiber.**
   `activateProfileEffect` wraps store methods that are themselves `runApp` Promise
   facades over the *same* runtime, and `runConnectFlow` runs the whole thing through
   `runApp` again. 2–4 nested root fibers per device connection; store errors reach the
   shell as stringified `FiberFailure`s; inner persistence is uninterruptible. Fix:
   expose the stores' existing protected `*Effect` members and `yield*` them; one
   `runApp` at the outer boundary.

3. **`src/lib/components/flash/FlashOverlay.svelte:479` — flash validation failures are
   defects, not failures.** `selectUf2Artifact` throws plain `Error`s inside
   `Effect.sync`; the adjacent `Effect.catch` only sees the E channel, so a corrupt or
   family-mismatched UF2 bypasses `rejectUf2Artifact` and the user gets no error UI in
   the core flash flow. Fix: `Effect.try` → `platformError` (or a tagged
   `Uf2ValidationError`).

4. **`src/lib/keyboard/schema.ts:1215` — `decodeDeviceProfileFromStorageEffect` is a
   cast.** It touches only `origin` + `bindings` and returns `value as DeviceProfile`,
   while `routes/api/agent/snapshot/+server.ts` declares the profile as `Schema.Unknown`
   and persists the cast result to the DO — unvalidated untrusted input on a live
   persisted path, answering 400 "Invalid keyboard profile" as if it validated. The repo
   already does this right for `ChangeRecord` (`Schema.fromJsonString(ChangeRecordSchema)`,
   schema.ts:232). Fix: a real `StoredDeviceProfile` `Schema.Struct` +
   `Schema.decodeUnknownEffect`.

5. **`src/agents/auth-agent.ts:421` — `selfHeal` retry-forever + fabricated summary in
   firmware maintenance.** Per-row repairs are wrapped in unconditional unbounded retry
   (violating selfHeal's own doc), so permanent failures (expired refresh token) retry
   every ~5s inside a Cloudflare workflow step re-run up to 10,000×, and with
   concurrency 2 two permanently-failing users starve everyone else. The reported
   summary hard-codes `failed: 0`. Fix: transient/permanent tagged-error split, bounded
   `Effect.retry({ schedule, while })`, honest counting via `Effect.result` per row.

## Systemic patterns behind the 73 majors

**P1 — The Effect→Promise→Effect sandwich.** Modules expose only Promise facades
(`runApp`/`runWorkerEffect`/`runSync` wrappers) and other *Effect* code re-wraps those
facades in `tryPromise`, entering a second runtime. Confirmed sites beyond the two
blockers: `qmk-index-agent` → `qmk-target` Effects, `auth-agent` → `workflow-artifacts`,
live-sync coordinator → engines → `editor-store`, all four `/api/extension` endpoints →
`extension-api.ts` (triple runtime entry per request), monkeytype client/crypto →
monkeytype-plugin, `github-artifact-digest` → FlashOverlay, `firmware-build-workflow`
step callbacks. **Fix pattern:** export the `*Effect` variant next to every facade,
compose Effects directly, keep exactly one `run*` per entry point (Svelte handler, DO
RPC, endpoint, alarm).

**P2 — Plain-async workflow helpers wrapped once at the end.**
`github-firmware-app-plugin.ts` (1,916 lines, ~40 async helpers — the entire GitHub
firmware build/repair/token surface) is Promise-native and wrapped by a single
`tryPromise` in `runGitHubEndpoint`; the critic confirmed better-auth's endpoint
contract does **not** force this — sibling `monkeytype-plugin.ts` composes full
`Effect.gen` endpoints against the identical contract. Same shape: auth-agent's
token-refresh-and-rotate workflow (`:592`), local-store's legacy migration,
`server/keyboards/{qmk,zmk,via}` fetch helpers fusing fetch/status-branch/error-body/
json-decode into single tryPromises.

**P3 — Retry-policy dishonesty.** `selfHeal` (unbounded, no `while`) applied to
permanent-failure-capable or non-idempotent operations: the site-wide
`hooks.server.ts:88` session lookup (a persistent AuthAgent DO failure hangs every page
request in an infinite retry instead of degrading to signed-out), the auth proxy with a
consumed POST body stream, Monkeytype fetches, firmware maintenance (blocker #5).

**P4 — Defects where typed failures belong.** Plain `throw new Error` inside
`Effect.sync`/gen bodies (`connect-flow.ts:370/373`, community-agent's
`assertVisibleKeymap`, FlashOverlay blocker); `catch: (e) => new Error(String(e))`
flattening that erases `GitHubRestApiError` codes the code itself branches on; error
semantics carried in message strings (`markFirmwareMaintenanceFailure` persisting
`message.slice(0,180)`).

**P5 — Cast-not-decode at boundaries.** `hooks.server.ts:108` (session/user typed
`Schema.Unknown` then cast to `App.Locals` — the decode validates only "null or
object"), community-agent keymap payloads (`JSON.parse` + cast served as typed RPC
data), qmk-index persisted rows, plus blocker #4.

**P6 — Hand-rolled concurrency/lifecycle.** `via-live-sync`/`zmk-live-sync`: per-lane
`setTimeout` debounce maps, mutable pending/failed maps, class-field
`Semaphore.makeUnsafe`, untracked per-write `forkApp` fibers that `destroy()` cannot
interrupt, and `flush()` approximating drain with `sleep(debounceMs+10)`. This is the
Queue/`Stream.debounce`/FiberMap workload; `theme.ts` already shows the idiomatic shape.

**P7 — Config fragmentation (minor).** The same GitHub token secrets read via
`this.env` force-casts in one place and `$env/dynamic/private` in another; no shared
`Config`/`ConfigProvider.fromUnknown(this.env)` recipe.

## Why the lint didn't catch any of this

`effect-boundaries.test.ts` matches literal `Effect.runPromise(` and raw promise
combinators. Every pattern above dodges it: ManagedRuntime *method* calls
(`appRuntime.runPromise`, `localStoreRuntime.runPromise`, `Effect.runSync`), `await`
inside `tryPromise` bodies (the file imports `effect`, so the async-file check passes),
and typed-channel erasure is invisible to regex entirely.

## Remediation plan

- **Wave A — blockers (do first):** local-store `LocalStore`-service composition
  (kills `getClient`); connect-flow direct Effect composition; FlashOverlay
  `Effect.try`; `StoredDeviceProfile` schema + snapshot-endpoint decode; auth-agent
  maintenance retry/summary honesty; bound the `hooks.server.ts` session lookup
  (major, but request-path critical).
- **Wave B — kill the sandwiches (P1):** export `*Effect` variants across
  editor/workbench stores, live-sync engines, `extension-api`, `workflow-artifacts`,
  `qmk-target`, monkeytype client; re-audit that each `run*` site is a genuine entry
  point.
- **Wave C — port the promise-native workflow surface (P2):** an Effect-native
  `GitHubRest` service with `GitHubRestApiError` in the channel; port
  `github-firmware-app-plugin.ts` helpers and auth-agent token workflow to
  `Effect.gen` (monkeytype-plugin is the template); decompose `server/keyboards`
  fetch helpers.
- **Wave D — error taxonomy + retry honesty (P3/P4):** tagged transient/permanent
  errors feeding `retryTransient`; replace remaining bare-Error throws/flattens;
  audit every `selfHeal` call against its "every failure is transient" contract.
- **Wave E — lifecycle + streams (P6), config (P7), minors.**
- **Lint hardening (parallel):** extend `effect-boundaries.test.ts` to flag
  `.runPromise(`/`.runSync(`/`.runFork(` method calls and `Effect.runSync(` outside an
  allowlist (`app/runtime.ts`, `effect/worker-runtime.ts`, declared facade modules),
  and `await` appearing more than once inside a single `tryPromise` body — so Waves
  A–C can't regress.

## What is already good (verified, not just absent from findings)

- `runApp`/`forkApp`/`startScopedApp` (app/runtime.ts) and `runWorkerEffect`
  (worker-runtime.ts) are sound boundary facades: cause-observed, span-wrapped.
- community-, typing-runs-, and user-workbench agents compose `Effect.gen`,
  `Effect.all`, and Schema decoding correctly at DO RPC boundaries.
- monkeytype-plugin.ts is the house exemplar for Effect-native better-auth endpoints.
- Layer wiring in app/runtime.ts memoizes correctly (the Preferences merge/provide
  double-instantiation suspicion was refuted by the verifier).
- No file imports `effect` as lint decoration; small boundary files are honestly small.
