# Rebuild Plan — Clean-Break UI Refactor

Branch: `rebuild/ui-clean-break` (baseline `770ac81` on `main` is the rollback point).

## Locked decisions

| Decision | Choice | Source |
| --- | --- | --- |
| Refactor scope | Rebuild UI/presentation layer from the new design; **keep + modernize the engine** (`lib/keyboard/*`, LiveStore, better-auth, Cloudflare Agents). | user |
| Port method | **Direct JSX→Svelte 5 by hand**; htmlswap DC grammar + design token conventions as reference only. htmlswap compile pipeline rejected by pilot (`resources/pilot/REPORT.md`). | pilot |
| Compat shims | **None.** Repo is **strictly Effect v4**. (Vite+ `vite`/`vitest` aliases are toolchain, not shims — kept.) | user |
| Data/sync layer | **Remove LiveStore now** — it still peers Effect v3 (`0.4.0`/`0.4.0-dev.27` both `effect ^3.21.2`); no v4 build. Local persistence stays on SQLocal; cross-device sync returns when LiveStore ships Effect v4. | user |
| GitHub OAuth | Keep engine (AuthAgent DO + better-auth); re-wire new UI. **Real.** | user |
| Monkeytype | **Real.** Encrypted per-user ApeKey in AuthAgent DO + remote functions + server cache. | user |
| Browse community | **Real Cloudflare backend now** (authors, likes, adoptions, compile verification, reporting). | user |
| Flash | **Real firmware build/flash pipeline now.** | user |
| ZMK/BLE | **Build real ZMK Studio / Web Bluetooth transport now.** | user |

## Toolchain baseline (done, green)

Vite+ 0.2.2, Kit 2.69.1, Svelte 5.56.4, wrangler 4.107, workers-types v5, Tailwind 4.3.2, Storybook 10.4.6. Effect stays on **v4-beta**. LiveStore + `effect-v3` alias + all compat shims are removed in Wave 0a (LiveStore has no Effect v4 build). Green at commit `c34a606`.

## Waves

Each wave = one or more `codex exec` runs (orchestrated + reviewed here), gated by `vp check` + `vp run svelte:check` + `vp build` (+ `vp test` where domain code changes), then committed.

| Wave | Deliverable | Depends on | Notes |
| --- | --- | --- | --- |
| **0a** | **Remove LiveStore + strict Effect v4**: delete `@livestore/*`, `lib/livestore/*`, `agents/livestore-sync.ts`, `routes/api/livestore/*`, and all config bindings; strip every Effect compat shim (`lib/effect/compat.ts`, `lib/shims/*`, `effect/*` resolve aliases, `effect-v3`, wrangler alias block). Local persistence via SQLocal remains; cross-device sync deferred. | toolchain | Keep `effect` at v4-beta. Superseded the "align on v3" de-shim (`08-effect-deshim.md`). |
| **0b** | **Design tokens**: port `styles.css` → app theme (OKLCH palette, `--ink-*`, `--coral` accent + tweak mechanism, spacing/radii/typography) into `app.css` / Tailwind 4 theme. | toolchain | Foundation for all UI. |
| **0c** | **Reusable board renderer** extracted from `+layout.svelte` (`KbRender` equiv), backed by `DeviceProfile.keys`; `"r,c"`↔`KeyboardKey.id` adapter. | 0b | Unblocks Editor + Browse previews. |
| **0d** | **App shell**: left-rail nav (Connect/Editor/Browse/Library/Versions/Settings), appbar, profile popover, overlays; route restructure. | 0b | Replaces topbar shell in `+layout.svelte`. |
| **1** | **Editor**: keys lens → lighting lens (OKLCH model decision) → split layout. | 0c, 0d | Core workflow. Reuse `components/keymap/*` + `keyboard/*`. |
| **2** | **Library · Versions · Settings**: Library (macros/combos/tap-dances + place/use); Versions changes + save-point timeline (engine ext); Settings nav screen. | 0d, 1 | Save-point entities are new engine model. |
| **3-pre** | Update **wrangler** to latest + get the AuthAgent (better-auth) **Durable Object running under local dev** (workerd local DO support has improved). Read latest wrangler docs/source. | 2 | Prereq so Wave 3 auth is locally testable. |
| **3** | **Auth/Profile + Monkeytype** (both real). | 0d, 3-pre | GitHub via the **better-auth client** into the profile popover. Monkeytype = a **custom better-auth plugin** (ApeKey **data-sync, NOT OAuth**): connect/validate/encrypt-store/disconnect/status/refresh + `authClient.monkeytype.*`. Public stats need only username; per-run results need the ApeKey. |
| **4a** | **Browse** — real Cloudflare community-keymap backend + UI + adopt-as-variant. | 0c, 1 | New D1/DO data model, API, moderation surface. Own design pass. |
| **4b** | **Flash** — real QMK/ZMK build + flash pipeline behind the overlay. | 1 | Own design pass; hardware/infra dependent. |
| **4c** | **ZMK/BLE** — real ZMK Studio / Web Bluetooth transport. | 1 | Own design pass; extends `transport.ts`. |
| **5** | **kbgui Chrome extension** — tag Monkeytype runs with the active keyboard+layout; capture run data from the MT page and post to a kbgui ingest endpoint using the existing better-auth session (pairing-token fallback), correlated with synced results. | 3 | New: extension + ingest endpoint + correlation. Account-linked, transparent sign-in (no separate login). |

Waves 4a/4b/4c and 5 each get a dedicated research/design run before implementation.

## Open product `VERIFY`s (resolve at their wave)

- Monkeytype: which PB mode counts as "pb" (e.g. `time/60`); Monkeytype username source (GitHub login ≠ MT username). (Wave 3)
- Lighting: OKLCH swatch model vs current HSB `KeyLighting`; drag-select ergonomics; paint scope (key/row/all). (Wave 1)
