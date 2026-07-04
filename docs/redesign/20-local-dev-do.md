# Wave 3-pre: Local Durable Object dev

Date: 2026-07-04

## Version check

- `vp install` completed before changing dependencies.
- Before `vp update wrangler`:
  - `node_modules/wrangler`: `4.107.0`
  - `vp exec wrangler --version`: `4.107.0`
  - bare `wrangler --version` on PATH: `4.87.0`
- After `vp update wrangler`:
  - `node_modules/wrangler`: `4.107.0`
  - `vp exec wrangler --version`: `4.107.0`
  - `vp outdated wrangler @sveltejs/adapter-cloudflare @cloudflare/workers-types` reported no newer versions.
- Checked current local package versions:
  - `@sveltejs/adapter-cloudflare`: `7.2.9`
  - `@cloudflare/workers-types`: `5.20260703.1`

The tracked dependency files did not change because Wrangler was already current. The important repair is that project tasks now call the local Wrangler through `vp exec`, avoiding the older bare PATH Wrangler.

## Current local-dev best practice

For this app, `vp build` plus `vp exec wrangler dev` is the reliable local path for AuthAgent and other Durable Objects.

Why:

- Cloudflare's Wrangler command docs describe `wrangler dev` as the local Worker test command, serving the Worker on localhost and running the local `workerd` runtime: https://developers.cloudflare.com/workers/wrangler/commands/workers/#dev
- Durable Object docs say local development sessions create a standalone local environment that mirrors production, and the DO getting-started guide tests a DO Worker with `wrangler dev`: https://developers.cloudflare.com/durable-objects/reference/environments/#local-development and https://developers.cloudflare.com/durable-objects/get-started/#6-develop-a-durable-object-worker-locally
- SvelteKit's Cloudflare adapter docs say `event.platform` is emulated in dev/preview by local bindings, but for testing the built Worker you should use Wrangler v4 and run `wrangler dev .svelte-kit/cloudflare/_worker.js` for Workers: https://svelte.dev/docs/kit/adapter-cloudflare#Runtime-APIs-Testing-locally
- Wrangler's `getPlatformProxy` docs say Durable Object bindings used through `getPlatformProxy` should always specify `script_name`; that means the Vite dev server path works for DOs implemented by a separate external Worker, not for this app's internal DO classes that are appended to the built SvelteKit Worker: https://developers.cloudflare.com/workers/wrangler/api/#supported-bindings
- Installed source matches the docs:
  - `node_modules/@sveltejs/adapter-cloudflare/index.js:181-185` calls `getPlatformProxy(options.platformProxy)` only from the adapter's `emulate()` hook.
  - `node_modules/wrangler/wrangler-dist/cli.js:369257-369267` warns that internal Durable Object bindings without `script_name` do not work in local development through that proxy path.
  - `node_modules/wrangler/wrangler-dist/cli.js:177147-177155` validates that local DO classes are exported by the Worker entrypoint when bundling for Wrangler.

Conclusion: plain `vp dev` should remain the fast UI/dev-server path, but it cannot exercise the internal `AuthAgent` DO. Auth and Agent work should use the built Worker under Wrangler.

## Commands

The repaired Vite+ task is:

```sh
vp run dev:worker
```

It now runs:

```sh
vp build && vp exec wrangler dev --ip 127.0.0.1 --port 8787
```

The direct command after an already-fresh build is:

```sh
vp exec wrangler dev --ip 127.0.0.1 --port 8787
```

The generated Worker was verified to export both Durable Object classes:

```txt
.svelte-kit/cloudflare/_worker.js:127 export { AuthAgent } from "../../src/agents/auth-agent";
.svelte-kit/cloudflare/_worker.js:128 export { UserWorkbenchAgent } from "../../src/agents/user-workbench";
```

## Local auth vars

Copy `.dev.vars.example` to `.dev.vars` and set:

```txt
BETTER_AUTH_SECRET="at-least-32-random-characters"
BETTER_AUTH_URL="http://127.0.0.1:8787"
GITHUB_CLIENT_ID="<github-oauth-app-client-id>"
GITHUB_CLIENT_SECRET="<github-oauth-app-client-secret>"
```

The local GitHub OAuth App should use:

```txt
Homepage URL: http://127.0.0.1:8787
Callback URL: http://127.0.0.1:8787/api/auth/callback/github
```

Dummy `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` values are enough to prove the better-auth sign-in route builds a GitHub authorize URL. A real GitHub callback requires real credentials and the exact callback URL above.

## Verification evidence

Verification process:

1. Ran `vp build`.
2. Started the built Worker with local Wrangler `4.107.0` on `127.0.0.1:8787`.
3. For the sign-in URL proof only, started Wrangler with dummy CLI vars:
   - `GITHUB_CLIENT_ID=dummy-local-client`
   - `GITHUB_CLIENT_SECRET=dummy-local-secret`
   - `BETTER_AUTH_URL=http://127.0.0.1:8787`
4. Stopped Wrangler/workerd afterward and confirmed ports `8787`, `5173`, `5174`, and `4173` were clear.

Relevant Wrangler startup output:

```txt
wrangler 4.107.0
env.UserWorkbenchAgent (UserWorkbenchAgent)        Durable Object            local
env.AuthAgent (AuthAgent)                          Durable Object            local
[wrangler:info] Ready on http://127.0.0.1:8787
```

AuthAgent route proof:

```txt
GET http://127.0.0.1:8787/api/auth/get-session
HTTP 200
body: null

[AuthAgent] onStart - ensuring tables + computing providers
[AuthAgent] >>> GET /api/auth/get-session
[AuthAgent] <<< GET /api/auth/get-session -> 200
[wrangler:info] GET /api/auth/get-session 200 OK
```

GitHub authorize URL proof with dummy credentials:

```txt
POST http://127.0.0.1:8787/api/auth/sign-in/social
body: {"provider":"github","callbackURL":"/","disableRedirect":true}
HTTP 200
response.url starts with:
https://github.com/login/oauth/authorize?response_type=code&client_id=dummy-local-client

response.url includes:
redirect_uri=http%3A%2F%2F127.0.0.1%3A8787%2Fapi%2Fauth%2Fcallback%2Fgithub

[AuthAgent] >>> POST /api/auth/sign-in/social
[AuthAgent] <<< POST /api/auth/sign-in/social -> 200
[wrangler:info] POST /api/auth/sign-in/social 200 OK
```
