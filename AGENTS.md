<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ is installed locally through `vite-plus`, and the `vite` package is aliased to the Vite+ core package.

Project convention: use the Vite+ `vp` CLI directly for this app. Run `vp install`, `vp dev`, `vp check`, `vp build`, and `vp preview`; do not use `vite dev`, `vite build`, `vite preview`, or package-manager aliases such as `bun run` for project commands. Custom project tasks are defined in `vite.config.ts` and run with `vp run <task>`.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp run svelte:check` for Svelte/TypeScript validation.
- [ ] Run `vp build` before handing off Cloudflare Agent or worker changes.

<!--VITE PLUS END-->

## Cursor Cloud specific instructions

The package manager is Bun (`bun@1.3.9`); `vp` resolves from `node_modules/.bin`
after `bun install`. Cloud Agent setup lives in `.cursor/environment.json`:
`install` runs `.cursor/cloud-install.sh` (installs Bun `1.3.9` if missing,
deps, a throwaway `.dev.vars` if missing, and Matt Pocock's promoted skills
into `~/.cursor/skills`). `start` is the Worker on port 8787.

Do not vendor Matt Pocock skills in this repo. Cloud Agents load them from
`~/.cursor/skills` after install. The kbgui-specific `verify` skill stays at
`.claude/skills/verify`.

The `FLAGS` Flagship binding in `wrangler.jsonc` has no local emulator, so a
plain `vp run dev:worker` tries to open a remote Cloudflare proxy session and
fails in non-interactive environments without Cloudflare credentials
(`No credentials found, and the environment is non-interactive`). When no
`CLOUDFLARE_API_TOKEN` is available, start the Worker with remote bindings
disabled:

```sh
vp run dev:worker -- --local
```

Anonymous flows work fully in `--local` mode: `/editor` renders (61 keycaps,
`crossOriginIsolated === true`), and the extension/auth APIs behave as the
`verify` skill expects (`GET /api/extension/session` → 200,
`GET /api/extension/keyboards` → 401, malformed `POST /api/extension/pair` →
400, `OPTIONS /api/extension/pair` → 204, `GET /api/auth/get-session` → 200
`null`). `vp run dev:worker` reads `BETTER_AUTH_URL` from `.dev.vars`
(gitignored; copy from `.dev.vars.example`); `better-auth` falls back to a
local secret when `BETTER_AUTH_SECRET` is unset, so no real credentials are
needed for anonymous verification.
