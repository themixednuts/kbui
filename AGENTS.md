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
